import { describe, it, expect } from "vitest";
import { GAITS, gaitPose, windupPose, flinchPose, deathPose } from "core/anim.js";

const ARCH = ["skitter", "sentinel", "brute", "popper", "warden", "wisp"];
const finite = (p) => Object.values(p).every((v) => typeof v === "number" && Number.isFinite(v));

describe("GAITS", () => {
  it("describes a gait for every archetype", () => {
    for (const a of ARCH) {
      const g = GAITS[a];
      expect(g, `no gait for ${a}`).toBeDefined();
      expect(g.id).toBe(a);
      expect(g.period).toBeGreaterThan(0);
      expect(g.bobHeight).toBeGreaterThanOrEqual(0);
      expect(typeof g.grounded).toBe("boolean");
    }
  });
});

describe("gaitPose", () => {
  it("returns a complete finite pose for every archetype and speed", () => {
    for (const a of ARCH) {
      for (const spd of [0, 0.5, 3, 12]) {
        const p = gaitPose(a, 1.234, spd);
        for (const k of ["bodyY", "pitch", "roll", "lean", "scaleY", "scaleXZ", "phase"]) {
          expect(typeof p[k], `${a}@${spd} missing ${k}`).toBe("number");
          expect(Number.isFinite(p[k]), `${a}@${spd} ${k} = ${p[k]}`).toBe(true);
        }
        expect(p.scaleY).toBeGreaterThan(0);
        expect(p.scaleXZ).toBeGreaterThan(0);
      }
    }
  });

  it("stays inside sane bounds - animation must never fling a mesh across the room", () => {
    for (const a of ARCH) {
      for (let t = 0; t < 40; t += 0.037) {
        const p = gaitPose(a, t, 8);
        expect(Math.abs(p.bodyY), `${a} bodyY`).toBeLessThanOrEqual(1.2);
        expect(Math.abs(p.pitch), `${a} pitch`).toBeLessThanOrEqual(0.8);
        expect(Math.abs(p.roll), `${a} roll`).toBeLessThanOrEqual(0.8);
        expect(Math.abs(p.lean), `${a} lean`).toBeLessThanOrEqual(0.8);
        expect(p.scaleY).toBeGreaterThan(0.5);
        expect(p.scaleY).toBeLessThan(1.8);
        expect(p.scaleXZ).toBeGreaterThan(0.5);
        expect(p.scaleXZ).toBeLessThan(1.8);
      }
    }
  });

  it("is continuous - no visible pop between adjacent frames", () => {
    for (const a of ARCH) {
      let prev = gaitPose(a, 0, 6);
      for (let t = 0.016; t < 12; t += 0.016) {
        const p = gaitPose(a, t, 6);
        expect(Math.abs(p.bodyY - prev.bodyY), `${a} bodyY jumped at t=${t}`).toBeLessThan(0.25);
        expect(Math.abs(p.scaleY - prev.scaleY), `${a} scaleY jumped at t=${t}`).toBeLessThan(0.25);
        prev = p;
      }
    }
  });

  it("is deterministic - the same time and speed give the same pose", () => {
    for (const a of ARCH) expect(gaitPose(a, 3.7, 5)).toEqual(gaitPose(a, 3.7, 5));
  });

  it("moves more when moving faster", () => {
    const swing = (a, spd) => {
      let lo = Infinity, hi = -Infinity;
      for (let t = 0; t < 20; t += 0.01) { const y = gaitPose(a, t, spd).bodyY; lo = Math.min(lo, y); hi = Math.max(hi, y); }
      return hi - lo;
    };
    for (const a of ARCH) expect(swing(a, 10), `${a} does not animate harder at speed`).toBeGreaterThan(swing(a, 0.2));
  });

  it("still breathes when standing still - a frozen enemy reads as a bug", () => {
    for (const a of ARCH) {
      let lo = Infinity, hi = -Infinity;
      for (let t = 0; t < 20; t += 0.02) { const p = gaitPose(a, t, 0); const v = p.bodyY + p.scaleY; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      expect(hi - lo, `${a} is frozen at rest`).toBeGreaterThan(0.005);
    }
  });

  it("falls back to a valid pose for an unknown archetype instead of throwing", () => {
    expect(() => gaitPose("nope", 1, 3)).not.toThrow();
    expect(finite(gaitPose("nope", 1, 3))).toBe(true);
  });

  it("survives junk time and speed", () => {
    for (const [t, s] of [[NaN, 3], [1, NaN], [-5, -5], [1e9, 1e9]]) {
      const p = gaitPose("brute", t, s);
      expect(finite(p), `t=${t} s=${s}`).toBe(true);
      expect(p.scaleY).toBeGreaterThan(0);
    }
  });
});

describe("windupPose", () => {
  it("anticipates: it pulls back before it strikes", () => {
    const start = windupPose(0), mid = windupPose(0.5), end = windupPose(1);
    for (const p of [start, mid, end]) expect(finite(p)).toBe(true);
    expect(Math.abs(start.lean)).toBeLessThan(Math.abs(end.lean));
  });

  it("is bounded and finite across the whole wind-up, including out of range", () => {
    for (let x = -0.5; x <= 1.5; x += 0.01) {
      const p = windupPose(x);
      expect(finite(p), `progress ${x}`).toBe(true);
      expect(Math.abs(p.lean)).toBeLessThanOrEqual(1);
      expect(p.scale).toBeGreaterThan(0.4);
      expect(p.scale).toBeLessThan(2);
    }
  });
});

describe("flinchPose", () => {
  it("is strongest at the moment of impact and decays to nothing", () => {
    const hit = flinchPose(0), later = flinchPose(0.3);
    expect(Math.abs(hit.offset)).toBeGreaterThan(Math.abs(later.offset));
    const gone = flinchPose(5);
    expect(Math.abs(gone.offset)).toBeLessThan(0.01);
    expect(Math.abs(gone.scale - 1)).toBeLessThan(0.01);
  });

  it("is finite for any age", () => {
    for (const t of [-1, 0, 0.05, 1, 100, NaN]) expect(finite(flinchPose(t))).toBe(true);
  });
});

describe("deathPose", () => {
  it("collapses over its lifetime and reports when it is done", () => {
    const a = deathPose(0), b = deathPose(0.5), c = deathPose(1);
    expect(a.scale).toBeGreaterThan(c.scale);
    expect(c.done).toBe(true);
    expect(a.done).toBe(false);
    for (const p of [a, b]) { expect(Number.isFinite(p.scale)).toBe(true); expect(p.scale).toBeGreaterThanOrEqual(0); }
  });

  it("never returns a negative scale or a NaN", () => {
    for (let t = -1; t < 3; t += 0.01) {
      const p = deathPose(t);
      expect(Number.isFinite(p.scale), `t=${t}`).toBe(true);
      expect(p.scale).toBeGreaterThanOrEqual(0);
    }
  });
});
