import { describe, it, expect } from "vitest";
import { chainTargets, singularityPull, ricochetDir, explosionVictims, homingSteer } from "core/fxitems.js";

// The geometry behind the flashy items. Pure vector maths; the shell only draws.
const v = (x, y, z) => ({ x, y, z });
const len = (a) => Math.hypot(a.x, a.y, a.z);

describe("chainTargets — Static Charge / chain lightning", () => {
  const enemies = [
    { id: "a", x: 0, y: 1, z: 0 }, { id: "b", x: 3, y: 1, z: 0 }, { id: "c", x: 6, y: 1, z: 0 },
    { id: "d", x: 30, y: 1, z: 0 }, { id: "e", x: 3, y: 1, z: 40 },
  ];
  it("returns up to `count` enemies, nearest-first, chaining from the last hit", () => {
    const chain = chainTargets(enemies, "a", 3, 8);
    expect(chain.map(e => e.id)).toEqual(["b", "c"]);       // d and e are beyond 8m of the previous link
  });
  it("never includes the origin or repeats", () => {
    const chain = chainTargets(enemies, "a", 10, 100);
    const ids = chain.map(e => e.id);
    expect(ids).not.toContain("a");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("respects the range between consecutive links, not from the origin", () => {
    // a->b (3), b->c (3), c->d (24): with range 5, chain stops after c
    expect(chainTargets(enemies, "a", 5, 5).map(e => e.id)).toEqual(["b", "c"]);
  });
  it("returns [] when the origin id is unknown or count is 0", () => {
    expect(chainTargets(enemies, "zzz", 3, 8)).toEqual([]);
    expect(chainTargets(enemies, "a", 0, 8)).toEqual([]);
  });
});

describe("singularityPull — Singularity Rounds", () => {
  it("returns a velocity delta toward the centre for enemies inside the radius, zero outside", () => {
    const d = singularityPull(v(0, 0, 0), v(4, 0, 0), 6, 10, 0.1);
    expect(d.x).toBeLessThan(0); expect(Math.abs(d.z)).toBeLessThan(1e-9);
    const far = singularityPull(v(0, 0, 0), v(20, 0, 0), 6, 10, 0.1);
    expect(far).toEqual(v(0, 0, 0));
  });
  it("pull is stronger closer to the centre (inverse-ish falloff), but capped so it never explodes", () => {
    const near = len(singularityPull(v(0, 0, 0), v(1, 0, 0), 6, 10, 0.1));
    const mid = len(singularityPull(v(0, 0, 0), v(4, 0, 0), 6, 10, 0.1));
    expect(near).toBeGreaterThan(mid);
    const touching = len(singularityPull(v(0, 0, 0), v(0.001, 0, 0), 6, 10, 0.1));
    expect(Number.isFinite(touching)).toBe(true);
    expect(touching).toBeLessThan(10 * 0.1 * 5);
  });
  it("scales with dt", () => {
    const a = len(singularityPull(v(0, 0, 0), v(3, 0, 0), 6, 10, 0.1));
    const b = len(singularityPull(v(0, 0, 0), v(3, 0, 0), 6, 10, 0.2));
    expect(b).toBeCloseTo(a * 2);
  });
});

describe("ricochetDir — Ricochet Plate", () => {
  it("reflects a direction about a wall normal (angle of incidence = reflection)", () => {
    const r = ricochetDir(v(1, 0, 1), v(0, 0, -1));       // heading into a wall facing -z
    const n = { x: r.x / len(r), y: r.y / len(r), z: r.z / len(r) };
    expect(n.x).toBeCloseTo(Math.SQRT1_2); expect(n.z).toBeCloseTo(-Math.SQRT1_2);
  });
  it("returns a unit vector even for a non-unit input", () => {
    expect(len(ricochetDir(v(5, 0, 5), v(-1, 0, 0)))).toBeCloseTo(1);
  });
  it("hitting a wall head-on sends it straight back", () => {
    const r = ricochetDir(v(0, 0, -1), v(0, 0, 1));
    expect(r.z).toBeCloseTo(1); expect(r.x).toBeCloseTo(0);
  });
});

describe("explosionVictims — Shrapnel / launcher splash", () => {
  const enemies = [{ id: "a", x: 0, y: 0, z: 0 }, { id: "b", x: 2, y: 0, z: 0 }, { id: "c", x: 5, y: 0, z: 0 }];
  it("returns each enemy within radius with a falloff factor in (0,1], centre = 1", () => {
    const hits = explosionVictims(v(0, 0, 0), 3, enemies);
    const ids = hits.map(h => h.id);
    expect(ids).toEqual(["a", "b"]);
    expect(hits[0].falloff).toBeCloseTo(1);
    expect(hits[1].falloff).toBeGreaterThan(0); expect(hits[1].falloff).toBeLessThan(1);
  });
  it("falloff is monotone in distance", () => {
    const hits = explosionVictims(v(0, 0, 0), 10, [{ id: "n", x: 1, y: 0, z: 0 }, { id: "f", x: 8, y: 0, z: 0 }]);
    expect(hits.find(h => h.id === "n").falloff).toBeGreaterThan(hits.find(h => h.id === "f").falloff);
  });
  it("can exclude one id (the enemy that exploded should not hit itself)", () => {
    expect(explosionVictims(v(0, 0, 0), 3, enemies, "a").map(h => h.id)).toEqual(["b"]);
  });
});

describe("homingSteer — Bloodhound Rounds", () => {
  it("bends a projectile direction toward the target by at most `maxTurn` radians", () => {
    const d = homingSteer(v(0, 0, -1), v(0, 0, -10), v(5, 0, -10), 0.2);
    expect(len(d)).toBeCloseTo(1);
    expect(d.x).toBeGreaterThan(0);
    // angle changed by exactly maxTurn when the target is far off-axis
    const ang = Math.acos(Math.max(-1, Math.min(1, -d.z)));
    expect(ang).toBeCloseTo(0.2, 2);
  });
  it("snaps onto the target when it is within maxTurn", () => {
    const d = homingSteer(v(0, 0, -1), v(0, 0, 0), v(0.05, 0, -10), 0.5);
    const tDir = { x: 0.05, y: 0, z: -10 }; const tl = len(tDir);
    expect(d.x).toBeCloseTo(tDir.x / tl, 4); expect(d.z).toBeCloseTo(tDir.z / tl, 4);
  });
  it("maxTurn 0 leaves the direction unchanged", () => {
    expect(homingSteer(v(0, 0, -1), v(0, 0, 0), v(5, 0, -5), 0)).toEqual(v(0, 0, -1));
  });
});
