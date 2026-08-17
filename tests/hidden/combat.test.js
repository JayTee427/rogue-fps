import { describe, it, expect } from "vitest";
import { resolveHit, tickStatuses } from "core/combat.js";
import { rng } from "core/rng.js";

// stats: the resolved player/weapon stats from computeStats/applyMods.
const S = (over = {}) => ({
  damage: 10, critChance: 0, critMult: 2, executeBelow: 0, onHitBurn: 0, onHitSlow: 0,
  lifesteal: 0, pierce: 0, ...over,
});
const T = (over = {}) => ({ hp: 100, maxHp: 100, statuses: [], armor: 0, ...over });
const shot = (over = {}) => ({ isHeadshot: false, isFirstShot: false, isLastShot: false, ...over });

describe("resolveHit — damage", () => {
  it("base hit deals stats.damage", () => {
    const r = resolveHit(shot(), T(), S(), rng(1));
    expect(r.damage).toBe(10);
    expect(r.crit).toBe(false);
  });

  it("returns the target's new hp without mutating the input", () => {
    const t = T();
    const r = resolveHit(shot(), t, S(), rng(1));
    expect(r.hpAfter).toBe(90);
    expect(t.hp).toBe(100);
  });

  it("crit multiplies by critMult", () => {
    const r = resolveHit(shot(), T(), S({ critChance: 1, critMult: 2 }), rng(1));
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(20);
  });

  it("critChance 0 never crits; critChance 1 always crits", () => {
    for (let s = 0; s < 100; s++) {
      expect(resolveHit(shot(), T(), S({ critChance: 0 }), rng(s)).crit).toBe(false);
      expect(resolveHit(shot(), T(), S({ critChance: 1 }), rng(s)).crit).toBe(true);
    }
  });

  it("critChance 0.5 crits roughly half the time", () => {
    let c = 0;
    for (let s = 0; s < 2000; s++) if (resolveHit(shot(), T(), S({ critChance: 0.5 }), rng(s)).crit) c++;
    expect(c).toBeGreaterThan(850);
    expect(c).toBeLessThan(1150);
  });

  it("headshots always crit", () => {
    const r = resolveHit(shot({ isHeadshot: true }), T(), S({ critChance: 0 }), rng(1));
    expect(r.crit).toBe(true);
    expect(r.damage).toBe(20);
  });

  it("firstShotMult applies on the first shot after reload", () => {
    const r = resolveHit(shot({ isFirstShot: true }), T(), S({ firstShotMult: 1.5 }), rng(1));
    expect(r.damage).toBeCloseTo(25);      // 10 * (1 + 1.5)
  });

  it("lastShotMult applies on the last round in the mag", () => {
    const r = resolveHit(shot({ isLastShot: true }), T(), S({ lastShotMult: 3 }), rng(1));
    expect(r.damage).toBeCloseTo(40);      // 10 * (1 + 3)
  });

  it("armor reduces damage by a flat amount but never below 1", () => {
    expect(resolveHit(shot(), T({ armor: 4 }), S(), rng(1)).damage).toBe(6);
    expect(resolveHit(shot(), T({ armor: 50 }), S(), rng(1)).damage).toBe(1);
  });

  it("Executioner: a target at or below the threshold after the hit is killed outright", () => {
    const t = T({ hp: 25 });
    const r = resolveHit(shot(), t, S({ executeBelow: 0.2 }), rng(1));
    // 25 - 10 = 15 = 15% of max <= 20% -> executed
    expect(r.executed).toBe(true);
    expect(r.hpAfter).toBe(0);
    expect(r.killed).toBe(true);
  });

  it("Executioner does not trigger above the threshold", () => {
    const r = resolveHit(shot(), T({ hp: 60 }), S({ executeBelow: 0.2 }), rng(1));
    expect(r.executed).toBe(false);
    expect(r.hpAfter).toBe(50);
  });

  it("killed is true when hp reaches 0 by ordinary damage", () => {
    const r = resolveHit(shot(), T({ hp: 8 }), S(), rng(1));
    expect(r.killed).toBe(true);
    expect(r.hpAfter).toBe(0);
  });

  it("hpAfter never goes negative", () => {
    expect(resolveHit(shot(), T({ hp: 3 }), S({ damage: 999 }), rng(1)).hpAfter).toBe(0);
  });

  it("lifesteal reports heal = damage * lifesteal", () => {
    const r = resolveHit(shot(), T(), S({ lifesteal: 0.1 }), rng(1));
    expect(r.heal).toBeCloseTo(1);
  });

  it("no lifesteal reports heal 0", () => {
    expect(resolveHit(shot(), T(), S(), rng(1)).heal).toBe(0);
  });
});

describe("resolveHit — statuses applied", () => {
  it("onHitBurn adds a burn status with that duration", () => {
    const r = resolveHit(shot(), T(), S({ onHitBurn: 4 }), rng(1));
    const burn = r.statusesAfter.find(s => s.kind === "burn");
    expect(burn).toBeDefined();
    expect(burn.duration).toBe(4);
    expect(burn.dps).toBeGreaterThan(0);
  });

  it("onHitSlow adds a slow status", () => {
    const r = resolveHit(shot(), T(), S({ onHitSlow: 0.3 }), rng(1));
    const slow = r.statusesAfter.find(s => s.kind === "slow");
    expect(slow.amount).toBeCloseTo(0.3);
    expect(slow.duration).toBe(2);
  });

  it("burn on an already-burning target EXTENDS duration (stacks duration), single entry", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 3, dps: 5 }] });
    const r = resolveHit(shot(), t, S({ onHitBurn: 4 }), rng(1));
    const burns = r.statusesAfter.filter(s => s.kind === "burn");
    expect(burns).toHaveLength(1);
    expect(burns[0].duration).toBe(7);
  });

  it("slow on an already-slowed target REFRESHES duration and keeps the stronger amount", () => {
    const t = T({ statuses: [{ kind: "slow", duration: 0.5, amount: 0.5 }] });
    const r = resolveHit(shot(), t, S({ onHitSlow: 0.3 }), rng(1));
    const slows = r.statusesAfter.filter(s => s.kind === "slow");
    expect(slows).toHaveLength(1);
    expect(slows[0].duration).toBe(2);
    expect(slows[0].amount).toBeCloseTo(0.5);
  });

  it("no status stats means statusesAfter equals the input statuses", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 1, dps: 5 }] });
    expect(resolveHit(shot(), t, S(), rng(1)).statusesAfter).toEqual(t.statuses);
  });
});

describe("tickStatuses", () => {
  it("burn deals dps * dt and counts down", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 2, dps: 5 }] });
    const r = tickStatuses(t, 0.5);
    expect(r.damage).toBeCloseTo(2.5);
    expect(r.hpAfter).toBeCloseTo(97.5);
    expect(r.statusesAfter[0].duration).toBeCloseTo(1.5);
  });

  it("expired statuses are removed", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 0.2, dps: 5 }, { kind: "slow", duration: 5, amount: 0.3 }] });
    const r = tickStatuses(t, 0.5);
    expect(r.statusesAfter.map(s => s.kind)).toEqual(["slow"]);
  });

  it("burn damage in the final partial tick is capped to remaining duration", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 0.2, dps: 10 }] });
    expect(tickStatuses(t, 1).damage).toBeCloseTo(2);   // 10 dps * 0.2s, not * 1s
  });

  it("slow does no damage; reports the strongest active slow as speedMult", () => {
    const t = T({ statuses: [{ kind: "slow", duration: 2, amount: 0.3 }, { kind: "slow", duration: 2, amount: 0.5 }] });
    const r = tickStatuses(t, 0.1);
    expect(r.damage).toBe(0);
    expect(r.speedMult).toBeCloseTo(0.5);
  });

  it("no statuses: damage 0, speedMult 1, hp unchanged", () => {
    const r = tickStatuses(T(), 1);
    expect(r.damage).toBe(0);
    expect(r.speedMult).toBe(1);
    expect(r.hpAfter).toBe(100);
  });

  it("does not mutate the target", () => {
    const t = T({ statuses: [{ kind: "burn", duration: 2, dps: 5 }] });
    const before = JSON.stringify(t);
    tickStatuses(t, 0.5);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("killed is true when burn finishes the target", () => {
    const t = T({ hp: 1, statuses: [{ kind: "burn", duration: 2, dps: 5 }] });
    const r = tickStatuses(t, 1);
    expect(r.hpAfter).toBe(0);
    expect(r.killed).toBe(true);
  });
});
