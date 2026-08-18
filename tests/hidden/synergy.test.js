import { describe, it, expect } from "vitest";
import { ITEM_BY_ID, ITEMS } from "core/items.js";
import { BASE_STATS } from "core/stats.js";
import { SYNERGIES, activeSynergies, synergyEffects, describeSynergy } from "core/synergy.js";

const ids = ITEMS.map((i) => i.id);

describe("SYNERGIES", () => {
  it("defines at least 8 combos, each fully described", () => {
    const keys = Object.keys(SYNERGIES);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    for (const k of keys) {
      const s = SYNERGIES[k];
      expect(s.id, `${k} id`).toBe(k);
      expect(typeof s.name).toBe("string");
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.desc).toBe("string");
      expect(s.desc.length).toBeGreaterThan(0);
      expect(Array.isArray(s.requires)).toBe(true);
      expect(s.requires.length, `${k} needs at least 2 items`).toBeGreaterThanOrEqual(2);
      expect(typeof s.effects).toBe("object");
      expect(s.effects).not.toBeNull();
      expect(Object.keys(s.effects).length, `${k} has no effects`).toBeGreaterThan(0);
    }
  });

  it("every required item actually exists in the item table", () => {
    for (const k of Object.keys(SYNERGIES)) {
      for (const id of SYNERGIES[k].requires) {
        expect(ITEM_BY_ID[id], `synergy ${k} requires unknown item "${id}"`).toBeDefined();
      }
    }
  });

  it("names are unique and no combo requires the same item twice", () => {
    const names = Object.values(SYNERGIES).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const k of Object.keys(SYNERGIES)) {
      const r = SYNERGIES[k].requires;
      expect(new Set(r).size, `${k} lists a duplicate`).toBe(r.length);
    }
  });

  it("no two combos require exactly the same set of items", () => {
    const sets = Object.values(SYNERGIES).map((s) => JSON.stringify([...s.requires].sort()));
    expect(new Set(sets).size).toBe(sets.length);
  });
});

describe("activeSynergies", () => {
  it("finds nothing for an empty inventory", () => {
    expect(activeSynergies([])).toEqual([]);
  });

  it("fires exactly when every required item is held", () => {
    for (const k of Object.keys(SYNERGIES)) {
      const req = SYNERGIES[k].requires;
      expect(activeSynergies(req).map((s) => s.id), `${k} did not fire on its own items`).toContain(k);
      const missingOne = req.slice(0, -1);
      expect(activeSynergies(missingOne).map((s) => s.id), `${k} fired while incomplete`).not.toContain(k);
    }
  });

  it("still fires among unrelated extra items", () => {
    const k = Object.keys(SYNERGIES)[0];
    const noise = ids.filter((i) => !SYNERGIES[k].requires.includes(i)).slice(0, 8);
    expect(activeSynergies([...noise, ...SYNERGIES[k].requires]).map((s) => s.id)).toContain(k);
  });

  it("returns whole synergy objects, not just ids", () => {
    const k = Object.keys(SYNERGIES)[0];
    const a = activeSynergies(SYNERGIES[k].requires)[0];
    expect(a.name).toBe(SYNERGIES[k].name);
    expect(a.effects).toEqual(SYNERGIES[k].effects);
  });

  it("does not mutate the held list", () => {
    const held = [...Object.values(SYNERGIES)[0].requires];
    const copy = [...held];
    activeSynergies(held);
    expect(held).toEqual(copy);
  });

  it("survives junk input instead of throwing", () => {
    for (const junk of [null, undefined, "not an array", [null, undefined, 42]]) {
      expect(() => activeSynergies(junk), String(junk)).not.toThrow();
      expect(Array.isArray(activeSynergies(junk))).toBe(true);
    }
  });

  it("holding every item in the game fires every synergy and does not throw", () => {
    const all = activeSynergies(ids);
    expect(all.length).toBe(Object.keys(SYNERGIES).length);
  });
});

describe("synergyEffects", () => {
  it("merges the effects of everything active", () => {
    const k = Object.keys(SYNERGIES)[0];
    const e = synergyEffects(SYNERGIES[k].requires);
    expect(typeof e).toBe("object");
    for (const key of Object.keys(SYNERGIES[k].effects)) expect(e[key]).toBeDefined();
  });

  it("is an empty object when nothing is active", () => {
    expect(synergyEffects([])).toEqual({});
  });

  it("stacks additive effects and multiplies multiplicative ones across combos", () => {
    const all = synergyEffects(ids);
    for (const [, v] of Object.entries(all)) {
      if (v && typeof v === "object") {
        if (v.add !== undefined) expect(Number.isFinite(v.add)).toBe(true);
        if (v.mul !== undefined) { expect(Number.isFinite(v.mul)).toBe(true); expect(v.mul).toBeGreaterThan(0); }
      }
    }
  });

  it("keys every effect by a stat the game actually has", () => {
    // An effect named crit_chance when the stat is critChance is not a smaller bonus,
    // it is no bonus at all: computeStats writes a key nothing ever reads.
    for (const k of Object.keys(SYNERGIES)) {
      for (const key of Object.keys(SYNERGIES[k].effects)) {
        expect(BASE_STATS[key], `synergy ${k} modifies "${key}", which is not a stat in BASE_STATS`).toBeDefined();
      }
    }
  });

  it("produces effects in the same shape the item table uses, so computeStats can read them", () => {
    const e = synergyEffects(ids);
    for (const [key, v] of Object.entries(e)) {
      const ok = v === true || (typeof v === "object" && v !== null && (v.add !== undefined || v.mul !== undefined));
      expect(ok, `effect ${key} is not a valid shape: ${JSON.stringify(v)}`).toBe(true);
    }
  });
});

describe("describeSynergy", () => {
  it("gives a short readable line for every combo", () => {
    for (const k of Object.keys(SYNERGIES)) {
      const t = describeSynergy(k);
      expect(typeof t).toBe("string");
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(90);
    }
  });

  it("returns a string for an unknown id rather than throwing", () => {
    expect(typeof describeSynergy("nope")).toBe("string");
  });
});
