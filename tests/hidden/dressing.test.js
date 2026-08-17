import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { PROP_KINDS, layoutDressing } from "core/dressing.js";

const R = (s = 3) => rng(s);
const arena = { halfW: 16, halfD: 20, blocks: [{ x: 0, z: 0, w: 4, d: 4 }, { x: 8, z: -6, w: 3, d: 5 }] };

describe("PROP_KINDS", () => {
  it("describes at least 6 kinds of set dressing", () => {
    const keys = Object.keys(PROP_KINDS);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) {
      const p = PROP_KINDS[k];
      expect(p.id, `${k} id`).toBe(k);
      expect(["floor", "wall", "ceiling"]).toContain(p.mount);
      expect(p.w).toBeGreaterThan(0);
      expect(p.h).toBeGreaterThan(0);
      expect(p.d).toBeGreaterThan(0);
      expect(typeof p.emissive).toBe("boolean");
      expect(p.maxPerRoom).toBeGreaterThan(0);
    }
  });
});

describe("layoutDressing", () => {
  it("returns props that all name a real kind", () => {
    for (const p of layoutDressing(R(), arena, 2)) expect(PROP_KINDS[p.kind], `unknown kind ${p.kind}`).toBeDefined();
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(layoutDressing(R(8), arena, 3)).toEqual(layoutDressing(R(8), arena, 3));
    const a = JSON.stringify(layoutDressing(R(1), arena, 3));
    const b = JSON.stringify(layoutDressing(R(77), arena, 3));
    expect(a).not.toBe(b);
  });

  it("never mutates the arena it reads", () => {
    const copy = JSON.parse(JSON.stringify(arena));
    layoutDressing(R(4), arena, 2);
    expect(arena).toEqual(copy);
  });

  it("places a useful amount of dressing — never zero, never a swarm", () => {
    for (let s = 0; s < 25; s++) {
      const props = layoutDressing(R(s), arena, 1 + (s % 5));
      expect(props.length, `seed ${s}`).toBeGreaterThanOrEqual(6);
      expect(props.length, `seed ${s}`).toBeLessThanOrEqual(80);
    }
  });

  it("respects each kind's maxPerRoom", () => {
    for (let s = 0; s < 20; s++) {
      const counts = {};
      for (const p of layoutDressing(R(s), arena, 3)) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      for (const [kind, n] of Object.entries(counts)) expect(n, `${kind} on seed ${s}`).toBeLessThanOrEqual(PROP_KINDS[kind].maxPerRoom);
    }
  });

  it("every prop carries a full transform", () => {
    for (const p of layoutDressing(R(6), arena, 2)) {
      for (const f of ["x", "y", "z", "rotY", "scale"]) {
        expect(Number.isFinite(p[f]), `${p.kind}.${f} = ${p[f]}`).toBe(true);
      }
      expect(p.scale).toBeGreaterThan(0);
    }
  });

  it("keeps floor props inside the arena", () => {
    for (let s = 0; s < 20; s++) {
      for (const p of layoutDressing(R(s), arena, 3)) {
        if (PROP_KINDS[p.kind].mount !== "floor") continue;
        expect(Math.abs(p.x), `seed ${s} ${p.kind}`).toBeLessThanOrEqual(arena.halfW);
        expect(Math.abs(p.z), `seed ${s} ${p.kind}`).toBeLessThanOrEqual(arena.halfD);
      }
    }
  });

  it("does not bury floor props inside cover blocks — you must be able to walk", () => {
    for (let s = 0; s < 25; s++) {
      for (const p of layoutDressing(R(s), arena, 3)) {
        if (PROP_KINDS[p.kind].mount !== "floor") continue;
        for (const b of arena.blocks) {
          const inside = Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2;
          expect(inside, `seed ${s}: ${p.kind} at ${p.x},${p.z} is inside a block`).toBe(false);
        }
      }
    }
  });

  it("leaves the spawn point clear so you never open a room face-first into a crate", () => {
    for (let s = 0; s < 25; s++) {
      for (const p of layoutDressing(R(s), arena, 3)) {
        if (PROP_KINDS[p.kind].mount !== "floor") continue;
        const d = Math.hypot(p.x - 0, p.z - (arena.halfD - 4));
        expect(d, `seed ${s}: ${p.kind} on the spawn`).toBeGreaterThan(2.5);
      }
    }
  });

  it("wall props sit near a wall, not floating in the middle of the room", () => {
    for (let s = 0; s < 20; s++) {
      for (const p of layoutDressing(R(s), arena, 3)) {
        if (PROP_KINDS[p.kind].mount !== "wall") continue;
        const nearW = Math.abs(Math.abs(p.x) - arena.halfW) < 1.5;
        const nearD = Math.abs(Math.abs(p.z) - arena.halfD) < 1.5;
        expect(nearW || nearD, `seed ${s}: ${p.kind} at ${p.x},${p.z}`).toBe(true);
      }
    }
  });

  it("deeper floors are not less dressed than shallow ones", () => {
    const n = (floor) => {
      let t = 0;
      for (let s = 0; s < 20; s++) t += layoutDressing(R(s), arena, floor).length;
      return t;
    };
    expect(n(5)).toBeGreaterThanOrEqual(n(1) * 0.8);
  });

  it("handles a tiny arena with no blocks instead of looping forever", () => {
    const small = { halfW: 6, halfD: 6, blocks: [] };
    const props = layoutDressing(R(2), small, 1);
    expect(Array.isArray(props)).toBe(true);
    expect(props.length).toBeGreaterThan(0);
  });
});
