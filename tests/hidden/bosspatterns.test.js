import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { BOSS_PATTERNS, ATTACK_SHAPES, bossPhase, nextAttack, telegraphFor } from "core/bosspatterns.js";

const R = (s = 9) => rng(s);
const BOSSES = ["custodian", "chorus", "landlord"];

describe("ATTACK_SHAPES", () => {
  it("names at least 4 distinct shapes, each with a duration and a tell", () => {
    const keys = Object.keys(ATTACK_SHAPES);
    expect(keys.length).toBeGreaterThanOrEqual(4);
    for (const k of keys) {
      const s = ATTACK_SHAPES[k];
      expect(s.id, `${k} id`).toBe(k);
      expect(typeof s.telegraph).toBe("string");
      expect(s.telegraph.length).toBeGreaterThan(0);
      expect(s.windup).toBeGreaterThan(0);      // there is ALWAYS a readable wind-up
      expect(s.duration).toBeGreaterThan(0);
      expect(["ranged", "melee", "area", "summon"]).toContain(s.kind);
    }
  });
});

describe("BOSS_PATTERNS", () => {
  it("covers all three bosses with three phases each", () => {
    for (const b of BOSSES) {
      const p = BOSS_PATTERNS[b];
      expect(p, `missing pattern for ${b}`).toBeDefined();
      expect(Array.isArray(p.phases)).toBe(true);
      expect(p.phases.length).toBe(3);
      for (const ph of p.phases) {
        expect(Array.isArray(ph.attacks)).toBe(true);
        expect(ph.attacks.length).toBeGreaterThanOrEqual(2);
        for (const a of ph.attacks) expect(ATTACK_SHAPES[a], `${b}: unknown shape ${a}`).toBeDefined();
        expect(ph.cooldown).toBeGreaterThan(0);
      }
    }
  });

  it("each boss escalates: later phases attack at least as often", () => {
    for (const b of BOSSES) {
      const ph = BOSS_PATTERNS[b].phases;
      expect(ph[1].cooldown).toBeLessThanOrEqual(ph[0].cooldown);
      expect(ph[2].cooldown).toBeLessThanOrEqual(ph[1].cooldown);
      expect(ph[2].cooldown).toBeLessThan(ph[0].cooldown);
    }
  });

  it("the three bosses do not share an identical attack set", () => {
    const sets = BOSSES.map(b => JSON.stringify(BOSS_PATTERNS[b].phases.flatMap(p => [...p.attacks].sort())));
    expect(new Set(sets).size).toBe(3);
  });
});

describe("bossPhase", () => {
  it("maps hp fraction to 0, 1, 2 with full health in phase 0 and a sliver in phase 2", () => {
    expect(bossPhase(1)).toBe(0);
    expect(bossPhase(0.99)).toBe(0);
    expect(bossPhase(0.01)).toBe(2);
    expect(bossPhase(0)).toBe(2);
  });

  it("never leaves 0..2 and never goes backwards as hp drops", () => {
    let last = 0;
    for (let f = 1; f >= 0; f -= 0.01) {
      const p = bossPhase(f);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(2);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it("clamps nonsense input", () => {
    expect(bossPhase(5)).toBe(0);
    expect(bossPhase(-5)).toBe(2);
    expect([0, 1, 2]).toContain(bossPhase(NaN));
  });
});

describe("nextAttack", () => {
  it("returns a usable attack for every boss and phase", () => {
    for (const b of BOSSES) {
      for (const hpFrac of [1, 0.6, 0.2]) {
        const a = nextAttack(R(), b, hpFrac, null);
        expect(ATTACK_SHAPES[a.shape], `${b} @${hpFrac}: unknown shape ${a.shape}`).toBeDefined();
        expect(BOSS_PATTERNS[b].phases[bossPhase(hpFrac)].attacks).toContain(a.shape);
        expect(a.windup).toBeGreaterThan(0);
        expect(a.duration).toBeGreaterThan(0);
        expect(a.cooldown).toBeGreaterThan(0);
        expect(typeof a.telegraph).toBe("string");
        expect(a.phase).toBe(bossPhase(hpFrac));
      }
    }
  });

  it("is deterministic per seed", () => {
    expect(nextAttack(R(31), "chorus", 0.5, null)).toEqual(nextAttack(R(31), "chorus", 0.5, null));
  });

  it("does not repeat the previous attack when the phase offers an alternative", () => {
    for (const b of BOSSES) {
      for (let s = 0; s < 30; s++) {
        const prev = BOSS_PATTERNS[b].phases[1].attacks[0];
        const a = nextAttack(R(s), b, 0.5, prev);
        expect(a.shape, `${b} repeated ${prev}`).not.toBe(prev);
      }
    }
  });

  it("still returns something when the phase has only the previous attack available", () => {
    // Passing a prev that isn't in this phase must not wedge the selector.
    for (const b of BOSSES) {
      const a = nextAttack(R(2), b, 1, "not_a_real_shape");
      expect(ATTACK_SHAPES[a.shape]).toBeDefined();
    }
  });

  it("throws a clear error for an unknown boss", () => {
    expect(() => nextAttack(R(), "nobody", 1, null)).toThrow();
  });

  it("attacks get faster deeper into the fight", () => {
    const mean = (hpFrac) => {
      let t = 0;
      for (let s = 0; s < 30; s++) t += nextAttack(R(s), "custodian", hpFrac, null).cooldown;
      return t / 30;
    };
    expect(mean(0.2)).toBeLessThan(mean(1));
  });
});

describe("telegraphFor", () => {
  it("gives a short readable line for every shape", () => {
    for (const k of Object.keys(ATTACK_SHAPES)) {
      const t = telegraphFor(k);
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(40);
    }
  });

  it("returns a string for an unknown shape rather than throwing", () => {
    expect(typeof telegraphFor("nope")).toBe("string");
  });
});
