import { describe, it, expect } from "vitest";
import { computeStats, BASE_STATS } from "core/stats.js";

// A minimal item shape — the same shape items.js produces. Tests build items
// inline so this suite does not depend on the catalog unit.
const item = (id, effects, stacks = false) => ({ id, effects, stacks, rarity: "common", tags: [], requires: null });

describe("computeStats — item stacking maths", () => {
  it("with no items returns the base stats unchanged", () => {
    const s = computeStats(BASE_STATS, []);
    for (const k of Object.keys(BASE_STATS)) expect(s[k]).toBe(BASE_STATS[k]);
  });

  it("does not mutate the base object", () => {
    const base = { ...BASE_STATS };
    computeStats(base, [item("a", { damage: { mul: 2 } })]);
    expect(base).toEqual(BASE_STATS);
  });

  it("BASE_STATS has the fields the game depends on", () => {
    for (const k of ["maxHp", "damage", "fireRate", "moveSpeed", "critChance", "critMult", "spread"]) {
      expect(BASE_STATS).toHaveProperty(k);
    }
    expect(BASE_STATS.critMult).toBe(2);
  });

  it("add effects sum", () => {
    const s = computeStats({ maxHp: 100 }, [
      item("p1", { maxHp: { add: 25 } }),
      item("p2", { maxHp: { add: 25 } }),
    ]);
    expect(s.maxHp).toBe(150);
  });

  it("mul effects multiply", () => {
    const s = computeStats({ damage: 10 }, [
      item("h1", { damage: { mul: 1.5 } }),
      item("h2", { damage: { mul: 2 } }),
    ]);
    expect(s.damage).toBeCloseTo(30);
  });

  it("add is applied before mul: (base + adds) * muls", () => {
    const s = computeStats({ maxHp: 100 }, [
      item("a", { maxHp: { add: 50 } }),
      item("m", { maxHp: { mul: 2 } }),
    ]);
    expect(s.maxHp).toBe(300);          // (100 + 50) * 2, not 100*2 + 50
  });

  it("order of items does not matter", () => {
    const a = item("a", { damage: { add: 5 } });
    const b = item("b", { damage: { mul: 1.5 } });
    const c = item("c", { damage: { add: 3 }, fireRate: { mul: 1.25 } });
    const s1 = computeStats({ damage: 10, fireRate: 5 }, [a, b, c]);
    const s2 = computeStats({ damage: 10, fireRate: 5 }, [c, b, a]);
    expect(s1).toEqual(s2);
  });

  it("a stacking item held N times applies N times", () => {
    const hot = item("hot", { damage: { mul: 1.15 } }, true);
    const s = computeStats({ damage: 100 }, [hot, hot, hot]);
    expect(s.damage).toBeCloseTo(100 * 1.15 ** 3);
  });

  it("a NON-stacking item held twice applies only once", () => {
    const gc = item("gc", { damage: { mul: 1.6 } }, false);
    const s = computeStats({ damage: 100 }, [gc, gc]);
    expect(s.damage).toBeCloseTo(160);
  });

  it("boolean flag effects surface as true on the result", () => {
    const s = computeStats(BASE_STATS, [item("sw", { secondWind: true })]);
    expect(s.secondWind).toBe(true);
  });

  it("flags absent from every item are false or undefined, never truthy", () => {
    const s = computeStats(BASE_STATS, []);
    expect(s.secondWind).toBeFalsy();
  });

  it("stats not present in base but added by an item appear on the result", () => {
    const s = computeStats({ damage: 10 }, [item("pt", { pierce: { add: 1 } })]);
    expect(s.pierce).toBe(1);
  });

  it("critChance is capped at 1", () => {
    const lens = item("lens", { critChance: { add: 0.2 } }, true);
    const s = computeStats({ critChance: 0.05 }, new Array(10).fill(lens));
    expect(s.critChance).toBe(1);
  });

  it("deflect chance uses diminishing stacking and never reaches 1", () => {
    const d = item("d", { deflect: { add: 0.15 } }, true);
    const one = computeStats({}, [d]).deflect;
    const many = computeStats({}, new Array(20).fill(d)).deflect;
    expect(one).toBeCloseTo(0.15);
    expect(many).toBeGreaterThan(one);
    expect(many).toBeLessThan(1);
  });

  it("maxHp never drops below 1 no matter the multipliers", () => {
    const s = computeStats({ maxHp: 100 }, [item("x", { maxHp: { mul: 0 } })]);
    expect(s.maxHp).toBeGreaterThanOrEqual(1);
  });

  it("moveSpeed and fireRate multipliers compound across different items", () => {
    const s = computeStats({ moveSpeed: 10, fireRate: 4 }, [
      item("ll", { moveSpeed: { mul: 1.15 } }),
      item("gl", { moveSpeed: { mul: 1.4 } }),
      item("oc", { fireRate: { mul: 1.25 } }),
      item("im", { fireRate: { mul: 0.75 } }),
    ]);
    expect(s.moveSpeed).toBeCloseTo(10 * 1.15 * 1.4);
    expect(s.fireRate).toBeCloseTo(4 * 1.25 * 0.75);
  });
});
