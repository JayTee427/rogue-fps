import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { BASE_STATS } from "core/stats.js";
import { timeToKill, effectiveDps, survivalSeconds, powerScore, simulateRun } from "core/balance.js";

const R = (s = 3) => rng(s);
const W = { archetype: "carbine", stats: { damage: 14, fireRate: 7, magSize: 28, reloadTime: 1.5, pellets: 1, spread: 0.02, range: 60 }, mods: [], rarity: "common" };
const S = (o = {}) => ({ ...BASE_STATS, ...o });

describe("effectiveDps", () => {
  it("is a positive finite number for a plain build", () => {
    const d = effectiveDps(S(), W);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(0);
  });

  it("rises with damage, fire rate and crit, and accounts for reloading", () => {
    const base = effectiveDps(S(), W);
    expect(effectiveDps(S({ damage: 2 }), W)).toBeGreaterThan(base);
    expect(effectiveDps(S({ fireRate: 2 }), W)).toBeGreaterThan(base);
    expect(effectiveDps(S({ critChance: 0.9, critMult: 3 }), W)).toBeGreaterThan(base);
    // a bigger magazine means less time reloading, so more damage per second
    const small = effectiveDps(S(), { ...W, stats: { ...W.stats, magSize: 4 } });
    const big = effectiveDps(S(), { ...W, stats: { ...W.stats, magSize: 60 } });
    expect(big).toBeGreaterThan(small);
  });

  it("never returns NaN or Infinity on degenerate weapons", () => {
    for (const st of [{ ...W.stats, fireRate: 0 }, { ...W.stats, magSize: 0 }, { ...W.stats, reloadTime: 0 }, { ...W.stats, damage: 0 }]) {
      const d = effectiveDps(S(), { ...W, stats: st });
      expect(Number.isFinite(d), JSON.stringify(st)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("timeToKill", () => {
  it("is positive and falls as damage rises", () => {
    const weak = timeToKill(S(), W, 500);
    const strong = timeToKill(S({ damage: 3 }), W, 500);
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeLessThan(weak);
  });

  it("scales with enemy health", () => {
    expect(timeToKill(S(), W, 2000)).toBeGreaterThan(timeToKill(S(), W, 200));
  });

  it("returns a finite number even for zero-dps builds rather than Infinity", () => {
    const t = timeToKill(S({ damage: 0 }), { ...W, stats: { ...W.stats, damage: 0 } }, 500);
    expect(Number.isFinite(t)).toBe(true);
  });
});

describe("survivalSeconds", () => {
  it("rises with health, armour and deflect", () => {
    const base = survivalSeconds(S(), 40);
    expect(survivalSeconds(S({ maxHp: 400 }), 40)).toBeGreaterThan(base);
    expect(survivalSeconds(S({ armor: 20 }), 40)).toBeGreaterThan(base);
    expect(survivalSeconds(S({ deflect: 0.5 }), 40)).toBeGreaterThan(base);
  });

  it("is finite and non-negative for any incoming damage, including zero", () => {
    for (const dps of [0, 1, 500, 1e6]) {
      const s = survivalSeconds(S(), dps);
      expect(Number.isFinite(s), `dps ${dps}`).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("powerScore", () => {
  it("summarises a build as one positive finite number", () => {
    const p = powerScore(S(), W);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(0);
  });

  it("a strictly better build always scores higher", () => {
    const base = powerScore(S(), W);
    expect(powerScore(S({ damage: 2, maxHp: 200, critChance: 0.5 }), W)).toBeGreaterThan(base);
  });

  it("rewards offence and defence both - a glass cannon and a tank both beat neither", () => {
    const neither = powerScore(S(), W);
    expect(powerScore(S({ damage: 2.5 }), W)).toBeGreaterThan(neither);
    expect(powerScore(S({ maxHp: 300, armor: 15 }), W)).toBeGreaterThan(neither);
  });

  it("never returns NaN for an empty or broken stat block", () => {
    expect(Number.isFinite(powerScore({}, W))).toBe(true);
    expect(Number.isFinite(powerScore(S(), { ...W, stats: {} }))).toBe(true);
  });
});

describe("simulateRun", () => {
  it("plays a whole run and reports where it ended", () => {
    const r = simulateRun(R(1), { maxFloors: 5 });
    expect(Number.isInteger(r.floorReached)).toBe(true);
    expect(r.floorReached).toBeGreaterThanOrEqual(1);
    expect(typeof r.died).toBe("boolean");
    expect(Array.isArray(r.powerCurve)).toBe(true);
    expect(r.powerCurve.length).toBeGreaterThan(0);
    for (const p of r.powerCurve) expect(Number.isFinite(p)).toBe(true);
    expect(Array.isArray(r.build)).toBe(true);
  });

  it("is deterministic per seed and varies across seeds", () => {
    expect(simulateRun(R(21), { maxFloors: 4 })).toEqual(simulateRun(R(21), { maxFloors: 4 }));
    const outs = new Set();
    for (let s = 0; s < 25; s++) outs.add(JSON.stringify(simulateRun(R(s), { maxFloors: 4 })));
    expect(outs.size).toBeGreaterThan(3);
  });

  it("power never collapses to zero mid-run - a build only grows", () => {
    for (let s = 0; s < 30; s++) {
      const c = simulateRun(R(s), { maxFloors: 6 }).powerCurve;
      for (let i = 0; i < c.length; i++) {
        expect(c[i], `seed ${s} step ${i}`).toBeGreaterThan(0);
        if (i > 0) expect(c[i], `seed ${s} power fell at ${i}`).toBeGreaterThanOrEqual(c[i - 1] * 0.75);
      }
    }
  });

  it("difficulty bites: across many seeds, not every run reaches the last floor", () => {
    let reachedEnd = 0;
    const N = 60;
    for (let s = 0; s < N; s++) if (!simulateRun(R(s), { maxFloors: 8 }).died) reachedEnd++;
    expect(reachedEnd, "every run survives - the game has no teeth").toBeLessThan(N);
    expect(reachedEnd, "no run survives - the game is unwinnable").toBeGreaterThan(0);
  });

  it("never throws and never returns a NaN floor for any seed", () => {
    for (let s = 0; s < 100; s++) {
      const r = simulateRun(R(s), { maxFloors: 10 });
      expect(Number.isFinite(r.floorReached), `seed ${s}`).toBe(true);
    }
  });
});
