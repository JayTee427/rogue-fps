import { describe, it, expect } from "vitest";
import { ENEMY_ARCHETYPES, AFFIXES, scaleEnemy, rollAffix, rollRoster } from "core/enemies.js";
import { rng } from "core/rng.js";

const IDS = ["skitter", "sentinel", "brute", "popper", "warden", "wisp"];

describe("enemies — tables", () => {
  it("defines exactly the six archetypes", () => {
    expect(Object.keys(ENEMY_ARCHETYPES).sort()).toEqual([...IDS].sort());
  });

  it("each archetype has hp, speed, damage, role, and a tell", () => {
    for (const id of IDS) {
      const a = ENEMY_ARCHETYPES[id];
      expect(typeof a.name).toBe("string");
      expect(typeof a.hp).toBe("number");
      expect(typeof a.speed).toBe("number");
      expect(typeof a.damage).toBe("number");
      expect(["melee", "ranged", "suicide", "shield", "flyer"]).toContain(a.role);
      expect(typeof a.tell).toBe("string");
    }
  });

  it("archetype design intent holds: skitter is fastest and weakest, brute is slowest and toughest", () => {
    const hp = id => ENEMY_ARCHETYPES[id].hp, sp = id => ENEMY_ARCHETYPES[id].speed;
    expect(hp("skitter")).toBeLessThan(hp("brute"));
    expect(sp("skitter")).toBeGreaterThan(sp("brute"));
    expect(hp("brute")).toBe(Math.max(...IDS.map(hp)));
  });

  it("defines the seven affixes", () => {
    for (const a of ["armoured", "hasty", "regenerating", "explosive", "splitting", "shielded", "vampiric"]) {
      expect(AFFIXES[a], a).toBeDefined();
      expect(typeof AFFIXES[a].name).toBe("string");
    }
  });
});

describe("scaleEnemy", () => {
  it("returns a scaled copy with the archetype id and base fields", () => {
    const e = scaleEnemy("skitter", 1, 0);
    expect(e.archetype).toBe("skitter");
    expect(typeof e.hp).toBe("number");
    expect(typeof e.damage).toBe("number");
    expect(typeof e.speed).toBe("number");
    expect(e.hp).toBe(e.maxHp);
  });

  it("floor 1 room 0 equals the archetype base", () => {
    const e = scaleEnemy("brute", 1, 0);
    expect(e.hp).toBe(ENEMY_ARCHETYPES.brute.hp);
    expect(e.damage).toBe(ENEMY_ARCHETYPES.brute.damage);
  });

  it("hp and damage are non-decreasing in floor and in room index", () => {
    let prev = 0;
    for (let f = 1; f <= 10; f++) {
      const e = scaleEnemy("sentinel", f, 0);
      expect(e.hp).toBeGreaterThanOrEqual(prev);
      prev = e.hp;
    }
    prev = 0;
    for (let room = 0; room < 5; room++) {
      const e = scaleEnemy("sentinel", 3, room);
      expect(e.damage).toBeGreaterThanOrEqual(prev);
      prev = e.damage;
    }
  });

  it("floor 10 is meaningfully harder than floor 1 (hp at least 3x)", () => {
    expect(scaleEnemy("skitter", 10, 0).hp).toBeGreaterThanOrEqual(scaleEnemy("skitter", 1, 0).hp * 3);
  });

  it("speed does not scale (fairness: enemies get tougher, not faster)", () => {
    expect(scaleEnemy("skitter", 10, 4).speed).toBe(scaleEnemy("skitter", 1, 0).speed);
  });

  it("hp is a whole number", () => {
    for (let f = 1; f <= 8; f++) expect(Number.isInteger(scaleEnemy("brute", f, 2).hp)).toBe(true);
  });

  it("applies an affix when given: armoured adds armor, hasty raises speed", () => {
    const base = scaleEnemy("brute", 2, 1);
    const arm = scaleEnemy("brute", 2, 1, "armoured");
    const fast = scaleEnemy("brute", 2, 1, "hasty");
    expect(arm.armor).toBeGreaterThan(base.armor ?? 0);
    expect(fast.speed).toBeGreaterThan(base.speed);
    expect(arm.affix).toBe("armoured");
    expect(base.affix).toBeNull();
  });

  it("throws on unknown archetype", () => {
    expect(() => scaleEnemy("dragon", 1, 0)).toThrow();
  });
});

describe("rollAffix", () => {
  it("returns a key of AFFIXES", () => {
    for (let s = 0; s < 100; s++) expect(AFFIXES[rollAffix(rng(s), 5)]).toBeDefined();
  });

  it("is deterministic", () => {
    expect(rollAffix(rng(3), 4)).toBe(rollAffix(rng(3), 4));
  });

  it("splitting and vampiric only appear from floor 3 onward", () => {
    for (let s = 0; s < 300; s++) expect(["splitting", "vampiric"]).not.toContain(rollAffix(rng(s), 1));
    const deep = new Set(Array.from({ length: 400 }, (_, s) => rollAffix(rng(s), 6)));
    expect(deep.has("splitting") || deep.has("vampiric")).toBe(true);
  });
});

describe("rollRoster", () => {
  it("returns a non-empty array of enemy archetype ids", () => {
    const r = rollRoster(rng(1), 1, 0, { swarm: false });
    expect(r.length).toBeGreaterThan(0);
    for (const id of r) expect(ENEMY_ARCHETYPES[id]).toBeDefined();
  });

  it("is deterministic", () => {
    expect(rollRoster(rng(8), 2, 3, {})).toEqual(rollRoster(rng(8), 2, 3, {}));
  });

  it("floor 1 room 0 has between 3 and 6 enemies and no brute", () => {
    for (let s = 0; s < 100; s++) {
      const r = rollRoster(rng(s), 1, 0, {});
      expect(r.length).toBeGreaterThanOrEqual(3);
      expect(r.length).toBeLessThanOrEqual(6);
      expect(r).not.toContain("brute");
    }
  });

  it("deeper floors have more enemies on average", () => {
    const avg = f => Array.from({ length: 200 }, (_, s) => rollRoster(rng(s), f, 2, {}).length).reduce((a, b) => a + b, 0) / 200;
    expect(avg(7)).toBeGreaterThan(avg(1));
  });

  it("swarm modifier doubles the count", () => {
    for (let s = 0; s < 50; s++) {
      const n = rollRoster(rng(s), 3, 1, {}).length;
      const m = rollRoster(rng(s), 3, 1, { swarm: true }).length;
      expect(m).toBe(n * 2);
    }
  });

  it("wardens never appear before floor 2", () => {
    for (let s = 0; s < 200; s++) expect(rollRoster(rng(s), 1, 4, {})).not.toContain("warden");
  });
});
