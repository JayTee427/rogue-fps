import { describe, it, expect } from "vitest";
import { spawnHazards, stepHazards, HAZARD_DEFS } from "core/hazards.js";
import { rng } from "core/rng.js";

// Room hazards as pure state machines. The renderer draws whatever is in the
// returned list; damage/knockback come out as events. Tags match floor.js.

const arena = { halfW: 16, halfD: 20, blocks: [] };
const player = { x: 0, y: 1.7, z: 16, vx: 0, vz: 0 };

describe("HAZARD_DEFS", () => {
  it("defines the five tags floor.js can roll", () => {
    for (const t of ["lava_floor", "turrets", "mines", "acid_pools", "collapsing"]) {
      expect(HAZARD_DEFS[t], t).toBeDefined();
      expect(typeof HAZARD_DEFS[t].name).toBe("string");
    }
  });
});

describe("spawnHazards", () => {
  it("returns an empty list for a null tag", () => {
    expect(spawnHazards(rng(1), null, arena, 1)).toEqual([]);
  });

  it("every hazard has an id, kind, position, and radius", () => {
    for (const tag of Object.keys(HAZARD_DEFS)) {
      const hz = spawnHazards(rng(2), tag, arena, 1);
      expect(hz.length).toBeGreaterThan(0);
      for (const h of hz) {
        expect(typeof h.id).toBe("string");
        expect(h.kind).toBe(tag);
        expect(typeof h.x).toBe("number"); expect(typeof h.z).toBe("number");
        expect(h.radius).toBeGreaterThan(0);
        expect(Math.abs(h.x)).toBeLessThan(arena.halfW);
        expect(Math.abs(h.z)).toBeLessThan(arena.halfD);
      }
    }
  });

  it("never spawns within 5m of the player spawn (0, halfD-4)", () => {
    for (let s = 0; s < 40; s++) for (const tag of Object.keys(HAZARD_DEFS)) {
      for (const h of spawnHazards(rng(s), tag, arena, 1)) {
        expect(Math.hypot(h.x - 0, h.z - (arena.halfD - 4))).toBeGreaterThanOrEqual(5 - 1e-9);
      }
    }
  });

  it("is deterministic and floor-scaled (deeper => more hazards)", () => {
    expect(spawnHazards(rng(7), "mines", arena, 3)).toEqual(spawnHazards(rng(7), "mines", arena, 3));
    const shallow = spawnHazards(rng(7), "mines", arena, 1).length;
    const deep = spawnHazards(rng(7), "mines", arena, 8).length;
    expect(deep).toBeGreaterThanOrEqual(shallow);
  });

  it("turrets carry a fire cooldown and a range; mines carry an armed flag", () => {
    const t = spawnHazards(rng(1), "turrets", arena, 1)[0];
    expect(t.cd).toBeGreaterThan(0); expect(t.range).toBeGreaterThan(5);
    const m = spawnHazards(rng(1), "mines", arena, 1)[0];
    expect(m.armed).toBe(true);
  });
});

describe("stepHazards", () => {
  it("returns { hazards, events } and never mutates the input list", () => {
    const hz = spawnHazards(rng(1), "lava_floor", arena, 1);
    const before = JSON.stringify(hz);
    const r = stepHazards(hz, 0.016, player, rng(1));
    expect(Array.isArray(r.hazards)).toBe(true);
    expect(Array.isArray(r.events)).toBe(true);
    expect(JSON.stringify(hz)).toBe(before);
  });

  it("lava: standing on a pool emits damage-over-time events; off it, none", () => {
    const hz = spawnHazards(rng(1), "lava_floor", arena, 1);
    const pool = hz[0];
    const on = stepHazards(hz, 0.5, { ...player, x: pool.x, z: pool.z }, rng(1)).events;
    const off = stepHazards(hz, 0.5, { ...player, x: pool.x + pool.radius + 3, z: pool.z + pool.radius + 3 }, rng(1)).events;
    expect(on.some(e => e.type === "damage" && e.amount > 0)).toBe(true);
    expect(off.filter(e => e.type === "damage")).toHaveLength(0);
  });

  it("lava damage scales with dt (it is per second)", () => {
    const hz = spawnHazards(rng(1), "lava_floor", arena, 1); const p = hz[0];
    const a = stepHazards(hz, 0.1, { ...player, x: p.x, z: p.z }, rng(1)).events.find(e => e.type === "damage").amount;
    const b = stepHazards(hz, 0.2, { ...player, x: p.x, z: p.z }, rng(1)).events.find(e => e.type === "damage").amount;
    expect(b).toBeCloseTo(a * 2);
  });

  it("acid: like lava but also emits a slow event", () => {
    const hz = spawnHazards(rng(1), "acid_pools", arena, 1); const p = hz[0];
    const ev = stepHazards(hz, 0.5, { ...player, x: p.x, z: p.z }, rng(1)).events;
    expect(ev.some(e => e.type === "damage")).toBe(true);
    expect(ev.some(e => e.type === "slow" && e.amount > 0 && e.amount < 1)).toBe(true);
  });

  it("mines: entering the trigger radius explodes once (damage + knockback), then the mine is gone", () => {
    let hz = spawnHazards(rng(1), "mines", arena, 1); const m = hz[0];
    const r1 = stepHazards(hz, 0.016, { ...player, x: m.x, z: m.z }, rng(1));
    const boom = r1.events.find(e => e.type === "explode");
    expect(boom).toBeDefined();
    expect(boom.damage).toBeGreaterThan(0);
    expect(boom.radius).toBeGreaterThan(0);
    expect(boom.x).toBe(m.x); expect(boom.z).toBe(m.z);
    expect(r1.hazards.find(h => h.id === m.id)).toBeUndefined();
    const r2 = stepHazards(r1.hazards, 0.016, { ...player, x: m.x, z: m.z }, rng(1));
    expect(r2.events.filter(e => e.type === "explode")).toHaveLength(0);
  });

  it("turrets: fire a projectile event at the player when in range and off cooldown, then cool down", () => {
    let hz = spawnHazards(rng(1), "turrets", arena, 1); const t = hz[0];
    const near = { ...player, x: t.x + 3, z: t.z + 3 };
    // burn down the initial cooldown
    let r = { hazards: hz, events: [] };
    let shots = 0;
    for (let i = 0; i < 400; i++) { r = stepHazards(r.hazards, 0.05, near, rng(i)); shots += r.events.filter(e => e.type === "shoot").length; }
    expect(shots).toBeGreaterThan(3);
    expect(shots).toBeLessThan(40);                    // it has a cooldown, it's not a hose
    const s = r.events.find(e => e.type === "shoot") || null;
    // a shoot event carries origin and a unit direction toward the player
    let any = null;
    for (let i = 0; i < 100 && !any; i++) { r = stepHazards(r.hazards, 0.05, near, rng(i)); any = r.events.find(e => e.type === "shoot"); }
    expect(any).toBeDefined();
    expect(Math.hypot(any.dir.x, any.dir.y, any.dir.z)).toBeCloseTo(1, 3);
    expect(any.damage).toBeGreaterThan(0);
  });

  it("turrets: do NOT fire when the player is out of range", () => {
    let hz = spawnHazards(rng(1), "turrets", arena, 1); const t = hz[0];
    const far = { ...player, x: t.x + t.range + 20, z: t.z + t.range + 20 };
    let r = { hazards: hz, events: [] }, shots = 0;
    for (let i = 0; i < 200; i++) { r = stepHazards(r.hazards, 0.05, far, rng(i)); shots += r.events.filter(e => e.type === "shoot").length; }
    expect(shots).toBe(0);
  });

  it("collapsing: tiles have a timer; standing on one starts it; when it expires the tile becomes a hole that damages", () => {
    let hz = spawnHazards(rng(1), "collapsing", arena, 1); const tile = hz[0];
    expect(tile.state).toBe("solid");
    let r = stepHazards(hz, 0.016, { ...player, x: tile.x, z: tile.z }, rng(1));
    const t2 = r.hazards.find(h => h.id === tile.id);
    expect(t2.state).toBe("cracking");
    for (let i = 0; i < 300 && r.hazards.find(h => h.id === tile.id).state !== "hole"; i++) r = stepHazards(r.hazards, 0.05, { ...player, x: tile.x, z: tile.z }, rng(i));
    const t3 = r.hazards.find(h => h.id === tile.id);
    expect(t3.state).toBe("hole");
    const ev = stepHazards(r.hazards, 0.5, { ...player, x: tile.x, z: tile.z }, rng(1)).events;
    expect(ev.some(e => e.type === "damage")).toBe(true);
  });

  it("collapsing: a cracking tile the player has LEFT still finishes collapsing (it does not reset)", () => {
    let hz = spawnHazards(rng(1), "collapsing", arena, 1); const tile = hz[0];
    let r = stepHazards(hz, 0.016, { ...player, x: tile.x, z: tile.z }, rng(1));
    const away = { ...player, x: tile.x + 10, z: tile.z + 10 };
    for (let i = 0; i < 300 && r.hazards.find(h => h.id === tile.id).state !== "hole"; i++) r = stepHazards(r.hazards, 0.05, away, rng(i));
    expect(r.hazards.find(h => h.id === tile.id).state).toBe("hole");
  });
});
