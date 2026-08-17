import { describe, it, expect } from "vitest";
import { generateFloor, ROOM_MODIFIERS, HAZARD_TAGS, BOSSES } from "core/floor.js";
import { rng } from "core/rng.js";

const run = (over = {}) => ({ held: [], stats: { doorLookahead: 0 }, ...over });

describe("floor — content tables", () => {
  it("defines the five room modifiers from the design", () => {
    for (const id of ["low_gravity", "darkness", "swarm", "no_dash", "time_pressure"]) {
      expect(ROOM_MODIFIERS[id], id).toBeDefined();
      expect(typeof ROOM_MODIFIERS[id].name).toBe("string");
    }
  });

  it("defines hazard tags", () => {
    expect(HAZARD_TAGS.length).toBeGreaterThanOrEqual(4);
    for (const t of HAZARD_TAGS) expect(typeof t).toBe("string");
  });

  it("defines the three bosses", () => {
    expect(Object.keys(BOSSES).sort()).toEqual(["chorus", "custodian", "landlord"]);
    for (const b of Object.values(BOSSES)) {
      expect(typeof b.name).toBe("string");
      expect(typeof b.hp).toBe("number");
    }
  });
});

describe("generateFloor", () => {
  it("returns 5 rooms and a boss", () => {
    const f = generateFloor(rng(1), 1, run());
    expect(f.rooms).toHaveLength(5);
    expect(f.boss).toBeDefined();
    expect(f.index).toBe(1);
  });

  it("is deterministic", () => {
    expect(generateFloor(rng(9), 2, run())).toEqual(generateFloor(rng(9), 2, run()));
  });

  it("different seeds give different floors", () => {
    const a = JSON.stringify(generateFloor(rng(1), 1, run()));
    const b = JSON.stringify(generateFloor(rng(2), 1, run()));
    expect(a).not.toBe(b);
  });

  it("each room has the required shape", () => {
    const f = generateFloor(rng(3), 1, run());
    f.rooms.forEach((r, i) => {
      expect(r.index).toBe(i);
      expect(r.modifier === null || ROOM_MODIFIERS[r.modifier]).toBeTruthy();
      expect(r.hazardTag === null || HAZARD_TAGS.includes(r.hazardTag)).toBe(true);
      expect(Number.isInteger(r.eliteCount)).toBe(true);
      expect(r.eliteCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(r.doors)).toBe(true);
      expect(typeof r.rewardType).toBe("string");
    });
  });

  it("every room except the last offers 2 or 3 doors; the last leads to the boss", () => {
    const f = generateFloor(rng(4), 1, run());
    for (let i = 0; i < 4; i++) {
      expect(f.rooms[i].doors.length).toBeGreaterThanOrEqual(2);
      expect(f.rooms[i].doors.length).toBeLessThanOrEqual(3);
    }
    expect(f.rooms[4].doors).toHaveLength(1);
    expect(f.rooms[4].doors[0].leadsTo).toBe("boss");
  });

  it("door previews are truthful: each door's preview matches the room it leads to", () => {
    for (let s = 0; s < 40; s++) {
      const f = generateFloor(rng(s), 2, run());
      for (let i = 0; i < 4; i++) {
        for (const d of f.rooms[i].doors) {
          expect(d.leadsTo).toBe(i + 1);
          const next = f.rooms[i + 1];
          expect(d.preview.rewardType).toBe(next.rewardType);
          expect(d.preview.hazardTag).toBe(next.hazardTag);
          expect(d.preview.hasElite).toBe(next.eliteCount > 0);
        }
      }
    }
  });

  it("boss has a name from BOSSES, an affix, and hp that scales with floor", () => {
    const f1 = generateFloor(rng(5), 1, run());
    const f6 = generateFloor(rng(5), 6, run());
    expect(BOSSES[f1.boss.id]).toBeDefined();
    expect(typeof f1.boss.affix).toBe("string");
    expect(f6.boss.hp).toBeGreaterThan(f1.boss.hp);
  });

  it("modifiers are not on every room and are more common deeper", () => {
    const rate = fl => {
      let n = 0, t = 0;
      for (let s = 0; s < 200; s++) for (const r of generateFloor(rng(s), fl, run()).rooms) { t++; if (r.modifier) n++; }
      return n / t;
    };
    const shallow = rate(1), deep = rate(7);
    expect(shallow).toBeGreaterThan(0);
    expect(shallow).toBeLessThan(0.6);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("elite count is 0 or 1 on floor 1 and larger deeper", () => {
    let maxShallow = 0, sumDeep = 0, sumShallow = 0;
    for (let s = 0; s < 200; s++) {
      for (const r of generateFloor(rng(s), 1, run()).rooms) { maxShallow = Math.max(maxShallow, r.eliteCount); sumShallow += r.eliteCount; }
      for (const r of generateFloor(rng(s), 8, run()).rooms) sumDeep += r.eliteCount;
    }
    expect(maxShallow).toBeLessThanOrEqual(1);
    expect(sumDeep).toBeGreaterThan(sumShallow);
  });

  it("no_dash and time_pressure never appear on the same floor's first room", () => {
    // first room is the safe-ish landing; keep it out of the nastiest modifiers
    for (let s = 0; s < 300; s++) {
      const m = generateFloor(rng(s), 5, run()).rooms[0].modifier;
      expect(["no_dash", "time_pressure"]).not.toContain(m);
    }
  });

  it("rewardType is one of the known reward kinds", () => {
    const kinds = new Set(["item", "weapon", "heal", "shop", "curse"]);
    for (let s = 0; s < 50; s++) for (const r of generateFloor(rng(s), 3, run()).rooms) expect(kinds.has(r.rewardType), r.rewardType).toBe(true);
  });

  it("does not mutate the run", () => {
    const r0 = run();
    const before = JSON.stringify(r0);
    generateFloor(rng(1), 1, r0);
    expect(JSON.stringify(r0)).toBe(before);
  });
});
