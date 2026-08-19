import { describe, it, expect } from "vitest";
import { ITEMS } from "core/items.js";
import { passiveMods, HANDLED } from "core/effects.js";

const allEffectKeys = new Set(ITEMS.flatMap((i) => Object.keys(i.effects ?? {})));

describe("HANDLED", () => {
  it("names the effect keys this module implements, and they are all real item keys", () => {
    expect(Array.isArray(HANDLED)).toBe(true);
    expect(HANDLED.length).toBeGreaterThanOrEqual(18);
    for (const k of HANDLED) {
      expect(allEffectKeys.has(k), `HANDLED lists "${k}", which no item actually uses`).toBe(true);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(HANDLED).size).toBe(HANDLED.length);
  });
});

describe("every handled effect actually changes something", () => {
  // The whole point: an item whose effect key is listed as handled but which
  // produces identical output whether or not you hold it is still a dead item.
  const owners = {};
  for (const it of ITEMS) for (const k of Object.keys(it.effects ?? {})) (owners[k] ??= []).push(it.id);

  const probe = (held) => JSON.stringify(passiveMods(held));

  it("holding an item with a handled effect changes at least one output", () => {
    const baseline = probe([]);
    const inert = [];
    for (const key of HANDLED) {
      for (const id of owners[key] ?? []) {
        if (probe([id]) === baseline) inert.push(`${id} (${key})`);
      }
    }
    expect([...new Set(inert)], `these items produce identical output to holding nothing`).toEqual([]);
  });
});

describe("passiveMods", () => {
  it("returns finite numeric multipliers with sane defaults for an empty inventory", () => {
    const m = passiveMods([]);
    for (const [k, v] of Object.entries(m)) {
      expect(Number.isFinite(v) || typeof v === "boolean", `${k} = ${v}`).toBe(true);
    }
    expect(m.goldMult).toBe(1);
    expect(m.headshotMult).toBe(1);
    expect(m.damageReduction).toBe(0);
    expect(m.regenPerSec).toBe(0);
  });

  it("greed and midas both increase gold, and together more than either alone", () => {
    const one = passiveMods(["greed"]).goldMult;
    const two = passiveMods(["greed", "midas_touch"]).goldMult;
    expect(one).toBeGreaterThan(1);
    expect(two).toBeGreaterThan(one);
  });

  it("headhunter increases headshot damage", () => {
    expect(passiveMods(["headhunter"]).headshotMult).toBeGreaterThan(1);
  });

  it("iron_skin reduces damage, and reduction never reaches or exceeds 1", () => {
    expect(passiveMods(["iron_skin"]).damageReduction).toBeGreaterThan(0);
    const stacked = passiveMods(Array(30).fill("iron_skin")).damageReduction;
    expect(stacked).toBeLessThan(1);
    expect(stacked).toBeGreaterThanOrEqual(0);
  });

  it("regen_coil regenerates health over time", () => {
    expect(passiveMods(["regen_coil"]).regenPerSec).toBeGreaterThan(0);
  });

  it("ignores unknown ids and junk input instead of throwing", () => {
    for (const junk of [null, undefined, "nope", ["no_such_item"], [null, 5]]) {
      expect(() => passiveMods(junk), String(junk)).not.toThrow();
      expect(Number.isFinite(passiveMods(junk).goldMult)).toBe(true);
    }
  });

  it("never mutates the held array", () => {
    const held = ["greed", "iron_skin"];
    const copy = [...held];
    passiveMods(held);
    expect(held).toEqual(copy);
  });
});

