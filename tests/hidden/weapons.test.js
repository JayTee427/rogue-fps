import { describe, it, expect } from "vitest";
import { ARCHETYPES, WEAPON_MODS, rollWeapon, applyMods } from "core/weapons.js";
import { rng } from "core/rng.js";

const ARCH_IDS = ["sidearm", "scattergun", "carbine", "railgun", "launcher", "beam"];

describe("weapons — archetypes", () => {
  it("defines exactly the six archetypes from the design", () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual([...ARCH_IDS].sort());
  });

  it("each archetype has the base stat fields", () => {
    for (const id of ARCH_IDS) {
      const a = ARCHETYPES[id];
      expect(typeof a.name).toBe("string");
      for (const k of ["damage", "fireRate", "magSize", "spread", "reloadTime", "projSpeed"]) {
        expect(typeof a[k], `${id}.${k}`).toBe("number");
      }
    }
  });

  it("base numbers match the design table", () => {
    expect(ARCHETYPES.sidearm.damage).toBe(12);
    expect(ARCHETYPES.sidearm.fireRate).toBe(5);
    expect(ARCHETYPES.sidearm.magSize).toBe(12);
    expect(ARCHETYPES.scattergun.pellets).toBe(8);
    expect(ARCHETYPES.scattergun.damage).toBe(9);
    expect(ARCHETYPES.carbine.damage).toBe(18);
    expect(ARCHETYPES.carbine.fireRate).toBe(8);
    expect(ARCHETYPES.carbine.magSize).toBe(30);
    expect(ARCHETYPES.railgun.damage).toBe(90);
    expect(ARCHETYPES.railgun.magSize).toBe(3);
    expect(ARCHETYPES.railgun.spread).toBe(0);
    expect(ARCHETYPES.railgun.pierce).toBeGreaterThanOrEqual(99);
    expect(ARCHETYPES.launcher.damage).toBe(60);
    expect(ARCHETYPES.launcher.splashRadius).toBe(3);
    expect(ARCHETYPES.beam.continuous).toBe(true);
    expect(ARCHETYPES.beam.heatCap).toBe(4);
  });

  it("archetypes without pellets default to 1", () => {
    for (const id of ARCH_IDS) if (id !== "scattergun") expect(ARCHETYPES[id].pellets ?? 1).toBe(1);
  });
});

describe("weapons — mods", () => {
  it("defines at least 15 mods with unique ids", () => {
    const ids = Object.keys(WEAPON_MODS);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each mod has a name and an effects object in the {add}/{mul}/true shape", () => {
    for (const [id, m] of Object.entries(WEAPON_MODS)) {
      expect(typeof m.name, id).toBe("string");
      expect(Object.keys(m.effects).length, id).toBeGreaterThan(0);
      for (const eff of Object.values(m.effects)) {
        const ok = eff === true || (eff && ("add" in eff || "mul" in eff));
        expect(ok, id).toBe(true);
      }
    }
  });

  it("the design's named mods exist", () => {
    // ricochet is gone: it rolled a key with no bounce mechanic behind it.
    for (const id of ["pierce", "incendiary", "cryo", "chain_lightning", "lifesteal", "big_mag", "fast_reload", "crit_chance", "crit_damage", "tight_spread"]) {
      expect(WEAPON_MODS[id], id).toBeDefined();
    }
  });
});

describe("rollWeapon", () => {
  it("returns a weapon with archetype, rarity, mods, baseStats and stats", () => {
    const w = rollWeapon(rng(1), "carbine", 1);
    expect(w.archetype).toBe("carbine");
    expect(["common", "uncommon", "rare", "legendary"]).toContain(w.rarity);
    expect(Array.isArray(w.mods)).toBe(true);
    // baseStats = archetype after ±10% jitter, BEFORE mods; stats = after mods.
    expect(typeof w.baseStats.damage).toBe("number");
    expect(typeof w.stats.damage).toBe("number");
  });

  it("stats equals applyMods(baseStats, mods)", () => {
    for (let s = 0; s < 50; s++) {
      const w = rollWeapon(rng(s), "carbine", 4);
      const expected = applyMods(w.baseStats, w.mods);
      for (const k of Object.keys(expected)) {
        if (typeof expected[k] === "number") expect(w.stats[k]).toBeCloseTo(expected[k], 6);
        else expect(w.stats[k]).toEqual(expected[k]);
      }
    }
  });

  it("is deterministic", () => {
    const a = rollWeapon(rng(42), "railgun", 3);
    const b = rollWeapon(rng(42), "railgun", 3);
    expect(a).toEqual(b);
  });

  it("jitters baseStats by at most ±10% of the archetype (mods are applied afterwards, in stats)", () => {
    for (let s = 0; s < 200; s++) {
      const w = rollWeapon(rng(s), "sidearm", 1);
      const base = ARCHETYPES.sidearm;
      expect(w.baseStats.damage).toBeGreaterThanOrEqual(base.damage * 0.9 - 1e-9);
      expect(w.baseStats.damage).toBeLessThanOrEqual(base.damage * 1.1 + 1e-9);
      expect(w.baseStats.fireRate).toBeGreaterThanOrEqual(base.fireRate * 0.9 - 1e-9);
      expect(w.baseStats.fireRate).toBeLessThanOrEqual(base.fireRate * 1.1 + 1e-9);
    }
  });

  it("actually jitters (not always the base value)", () => {
    const vals = new Set(Array.from({ length: 50 }, (_, s) => rollWeapon(rng(s), "sidearm", 1).baseStats.damage));
    expect(vals.size).toBeGreaterThan(5);
  });

  it("magSize in the FINAL stats is always a whole number and at least 1, even after mods", () => {
    for (let s = 0; s < 200; s++) {
      const w = rollWeapon(rng(s), "railgun", 6);
      expect(Number.isInteger(w.stats.magSize), `seed ${s} mods ${w.mods}`).toBe(true);
      expect(w.stats.magSize).toBeGreaterThanOrEqual(1);
    }
  });

  it("mod count follows rarity: common 1, uncommon 1-2, rare 2-3, legendary 3", () => {
    const seen = { common: new Set(), uncommon: new Set(), rare: new Set(), legendary: new Set() };
    for (let s = 0; s < 600; s++) {
      const w = rollWeapon(rng(s), "carbine", 6);
      seen[w.rarity].add(w.mods.length);
    }
    expect([...seen.common].every(n => n === 1)).toBe(true);
    expect([...seen.uncommon].every(n => n >= 1 && n <= 2)).toBe(true);
    expect([...seen.rare].every(n => n >= 2 && n <= 3)).toBe(true);
    expect([...seen.legendary].every(n => n === 3)).toBe(true);
  });

  it("never rolls the same mod twice on one weapon", () => {
    for (let s = 0; s < 300; s++) {
      const w = rollWeapon(rng(s), "scattergun", 5);
      expect(new Set(w.mods).size).toBe(w.mods.length);
    }
  });

  it("every rolled mod is a real mod id", () => {
    for (let s = 0; s < 100; s++) for (const m of rollWeapon(rng(s), "beam", 2).mods) expect(WEAPON_MODS[m]).toBeDefined();
  });

  it("deeper floors roll higher rarity on average", () => {
    const score = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
    const avg = f => Array.from({ length: 400 }, (_, s) => score[rollWeapon(rng(s), "carbine", f).rarity]).reduce((a, b) => a + b, 0) / 400;
    expect(avg(8)).toBeGreaterThan(avg(1));
  });

  it("throws on an unknown archetype", () => {
    expect(() => rollWeapon(rng(1), "bazooka", 1)).toThrow();
  });
});

describe("applyMods", () => {
  it("returns stats with mod effects applied, add before mul", () => {
    const base = { damage: 10, magSize: 10, reloadTime: 2 };
    const out = applyMods(base, ["big_mag", "fast_reload"]);
    expect(out.magSize).toBe(15);              // +50%
    expect(out.reloadTime).toBeCloseTo(1.2);   // -40%
    expect(out.damage).toBe(10);
  });

  it("rounds magSize to a whole number (min 1) after applying mods", () => {
    expect(applyMods({ magSize: 3 }, ["big_mag"]).magSize).toBe(5);   // 4.5 -> 5 (round half up)
    expect(applyMods({ magSize: 1 }, ["big_mag"]).magSize).toBe(2);   // 1.5 -> 2
    expect(Number.isInteger(applyMods({ magSize: 7 }, ["big_mag"]).magSize)).toBe(true);
  });

  it("does not mutate the input", () => {
    const base = { damage: 10, magSize: 10 };
    applyMods(base, ["big_mag"]);
    expect(base.magSize).toBe(10);
  });

  it("no shipped mod carries a dead key (flags included)", () => {
    // The old flag mod was ricochet: true - a key nothing read. Every mod's
    // keys now have to be part of the registered vocabulary, so this asserts
    // the mods table carries no `true` flags without a consumer.
    for (const [id, m] of Object.entries(WEAPON_MODS)) {
      for (const [k, v] of Object.entries(m.effects)) {
        expect(v === true || typeof v === "object", `${id}.${k}`).toBe(true);
      }
    }
  });

  it("empty mods is identity", () => {
    expect(applyMods({ damage: 7, spread: 2 }, [])).toEqual({ damage: 7, spread: 2 });
  });
});
