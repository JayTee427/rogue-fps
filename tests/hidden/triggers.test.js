import { describe, it, expect } from "vitest";
import { ITEMS, ITEM_BY_ID } from "core/items.js";
import { onKill, onShoot, onEnemyHit, onHitTaken, onDeath, HANDLED } from "core/triggers.js";

const ctx = (o = {}) => ({ hp: 100, maxHp: 100, shotIndex: 0, magSize: 10, damage: 20, isHeadshot: false, isCrit: false, floor: 2, ...o });
const allEffectKeys = new Set(ITEMS.flatMap((i) => Object.keys(i.effects ?? {})));

describe("HANDLED", () => {
  it("names real item effect keys and has no duplicates", () => {
    expect(HANDLED.length).toBeGreaterThanOrEqual(14);
    for (const k of HANDLED) expect(allEffectKeys.has(k), `HANDLED lists "${k}", which no item uses`).toBe(true);
    expect(new Set(HANDLED).size).toBe(HANDLED.length);
  });
});

describe("every handled trigger actually changes something", () => {
  const owners = {};
  for (const it of ITEMS) for (const k of Object.keys(it.effects ?? {})) (owners[k] ??= []).push(it.id);
  const probe = (held) => JSON.stringify([
    onShoot(held, ctx({ shotIndex: 0 })), onShoot(held, ctx({ shotIndex: 9, magSize: 10 })),
    onEnemyHit(held, ctx({ isCrit: true })), onKill(held, ctx({ enemyHp: 50 })),
    onHitTaken(held, ctx({ hp: 15, amount: 30 })), onDeath(held, ctx()),
  ]);
  it("holding an item with a handled effect changes at least one output", () => {
    const baseline = probe([]);
    const inert = [];
    for (const key of HANDLED) for (const id of owners[key] ?? []) if (probe([id]) === baseline) inert.push(`${id} (${key})`);
    expect([...new Set(inert)], "these items produce identical output to holding nothing").toEqual([]);
  });
});

describe("onShoot", () => {
  it("first_blood guarantees a crit on the first shot of a magazine but not mid-magazine", () => {
    expect(onShoot(["first_blood"], ctx({ shotIndex: 0 })).guaranteedCrit).toBe(true);
    expect(onShoot(["first_blood"], ctx({ shotIndex: 4 })).guaranteedCrit).toBe(false);
  });

  it("last_round boosts the final shot of a magazine only", () => {
    const last = onShoot(["last_round"], ctx({ shotIndex: 9, magSize: 10 })).damageMult;
    const mid = onShoot(["last_round"], ctx({ shotIndex: 3, magSize: 10 })).damageMult;
    expect(last).toBeGreaterThan(mid);
  });

  it("returns a neutral multiplier of 1 for an empty inventory", () => {
    expect(onShoot([], ctx()).damageMult).toBe(1);
    expect(onShoot([], ctx()).guaranteedCrit).toBe(false);
  });
});

describe("onEnemyHit", () => {
  it("frostbite slows the target", () => {
    const r = onEnemyHit(["frostbite"], ctx());
    expect(r.slowFactor).toBeGreaterThan(0);
    expect(r.slowFactor).toBeLessThan(1);
    expect(r.slowSecs).toBeGreaterThan(0);
  });

  it("static_charge deals shock damage", () => {
    expect(onEnemyHit(["static_charge"], ctx()).shockDamage).toBeGreaterThan(0);
  });

  it("storm_caller only fires on a crit", () => {
    expect(onEnemyHit(["storm_caller"], ctx({ isCrit: true })).shockDamage)
      .toBeGreaterThan(onEnemyHit(["storm_caller"], ctx({ isCrit: false })).shockDamage);
  });

  it("is all-zero for an empty inventory and never NaN", () => {
    const r = onEnemyHit([], ctx());
    for (const v of Object.values(r)) expect(Number.isFinite(v) || typeof v === "boolean").toBe(true);
    expect(r.slowFactor).toBe(0);
  });
});

describe("onKill", () => {
  it("returns a zeroed result for an empty inventory", () => {
    const r = onKill([], ctx());
    expect(r.heal).toBe(0);
    expect(r.gold).toBe(0);
    expect(r.dashReset).toBe(false);
    expect(r.explode).toBeFalsy();
  });

  it("dash_reset refreshes the dash on a kill", () => {
    expect(onKill(["dash_reset"], ctx()).dashReset).toBe(true);
  });

  it("doombringer heals on a kill", () => {
    expect(onKill(["doombringer"], ctx()).heal).toBeGreaterThan(0);
  });

  it("chain_reaction produces an explosion with a positive radius and damage", () => {
    const e = onKill(["chain_reaction"], ctx({ damage: 40 })).explode;
    expect(e).toBeTruthy();
    expect(e.radius).toBeGreaterThan(0);
    expect(e.damage).toBeGreaterThan(0);
  });

  it("never returns NaN for any single item in the table", () => {
    for (const it of ITEMS) {
      const r = onKill([it.id], ctx());
      expect(Number.isFinite(r.heal), `${it.id} heal`).toBe(true);
      expect(Number.isFinite(r.gold), `${it.id} gold`).toBe(true);
    }
  });
});

describe("onHitTaken", () => {
  it("thorns reflects damage back at the attacker", () => {
    expect(onHitTaken(["thorns"], ctx({ amount: 40 })).reflectDamage).toBeGreaterThan(0);
  });

  it("adrenaline_rush only grants crit chance at low health", () => {
    const low = onHitTaken(["adrenaline_rush"], ctx({ hp: 10, maxHp: 100 })).critBonus;
    const high = onHitTaken(["adrenaline_rush"], ctx({ hp: 95, maxHp: 100 })).critBonus;
    expect(low).toBeGreaterThan(high);
  });

  it("hoarders_curse costs gold when you are hit", () => {
    expect(onHitTaken(["hoarders_curse"], ctx({ amount: 20 })).goldLost).toBeGreaterThan(0);
  });

  it("is harmless and finite for an empty inventory", () => {
    const r = onHitTaken([], ctx({ amount: 25 }));
    expect(r.reflectDamage).toBe(0);
    expect(r.goldLost).toBe(0);
  });
});

describe("onDeath", () => {
  it("second_wind revives you once with health", () => {
    const r = onDeath(["second_wind"], ctx());
    expect(r.revive).toBe(true);
    expect(r.reviveHp).toBeGreaterThan(0);
  });

  it("borrowed_time also grants an extra life", () => {
    expect(onDeath(["borrowed_time"], ctx()).revive).toBe(true);
  });

  it("does not revive an empty inventory", () => {
    expect(onDeath([], ctx()).revive).toBe(false);
  });

  it("reports which item did the reviving so the game can consume it", () => {
    expect(onDeath(["second_wind"], ctx()).consumed).toBe("second_wind");
  });
});
