import { describe, it, expect } from "vitest";
import { ITEMS, ITEM_BY_ID, RARITIES, queryItems } from "core/items.js";

describe("items — the catalog", () => {
  it("has at least 55 items", () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(55);
  });

  it("every id is unique", () => {
    const ids = ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ids are snake_case slugs", () => {
    for (const i of ITEMS) expect(i.id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("every item has the required shape", () => {
    for (const i of ITEMS) {
      expect(typeof i.id).toBe("string");
      expect(typeof i.name).toBe("string");
      expect(i.name.length).toBeGreaterThan(0);
      expect(RARITIES).toContain(i.rarity);
      expect(Array.isArray(i.tags)).toBe(true);
      expect(typeof i.stacks).toBe("boolean");
      expect(i.effects && typeof i.effects).toBe("object");
      expect(Object.keys(i.effects).length).toBeGreaterThan(0);
      expect(i.requires === null || typeof i.requires === "string").toBe(true);
    }
  });

  it("RARITIES is exactly the five tiers in order", () => {
    expect(RARITIES).toEqual(["common", "uncommon", "rare", "legendary", "cursed"]);
  });

  it("every rarity tier is represented", () => {
    for (const r of RARITIES) expect(ITEMS.some(i => i.rarity === r)).toBe(true);
  });

  it("has at least 5 legendary and at least 5 cursed items", () => {
    expect(ITEMS.filter(i => i.rarity === "legendary").length).toBeGreaterThanOrEqual(5);
    expect(ITEMS.filter(i => i.rarity === "cursed").length).toBeGreaterThanOrEqual(5);
  });

  it("every `requires` refers to a real item id", () => {
    for (const i of ITEMS) if (i.requires) expect(ITEM_BY_ID[i.requires]).toBeDefined();
  });

  it("an item never requires itself", () => {
    for (const i of ITEMS) expect(i.requires).not.toBe(i.id);
  });

  it("ITEM_BY_ID indexes every item", () => {
    for (const i of ITEMS) expect(ITEM_BY_ID[i.id]).toBe(i);
    expect(Object.keys(ITEM_BY_ID).length).toBe(ITEMS.length);
  });

  it("effects use the {add} / {mul} / true shape only", () => {
    for (const i of ITEMS) {
      for (const [k, eff] of Object.entries(i.effects)) {
        const ok = eff === true ||
          (typeof eff === "object" && eff !== null &&
            ("add" in eff || "mul" in eff) &&
            Object.keys(eff).every(x => x === "add" || x === "mul"));
        expect(ok, `${i.id}.${k} has a bad effect shape`).toBe(true);
      }
    }
  });

  it("the headline items from the design exist with the promised numbers", () => {
    expect(ITEM_BY_ID.hot_rounds.effects.damage.mul).toBeCloseTo(1.15);
    expect(ITEM_BY_ID.hot_rounds.stacks).toBe(true);
    expect(ITEM_BY_ID.glass_cannon.effects.damage.mul).toBeCloseTo(1.6);
    expect(ITEM_BY_ID.glass_cannon.effects.maxHp.mul).toBeCloseTo(0.6);
    expect(ITEM_BY_ID.plating.effects.maxHp.add).toBe(25);
    expect(ITEM_BY_ID.chain_reaction.requires).toBe("shrapnel");
    expect(ITEM_BY_ID.wildfire.requires).toBe("ignition");
    expect(ITEM_BY_ID.the_loop.rarity).toBe("legendary");
    expect(ITEM_BY_ID.berserker_pact.rarity).toBe("cursed");
    expect(ITEM_BY_ID.magpie.effects.draftSize.add).toBe(1);
  });

  it("commons that the design calls 'Stacks' actually stack", () => {
    for (const id of ["hot_rounds", "overclock", "crit_lens", "bottomless", "plating", "kill_drip", "long_legs", "lucky_coin"]) {
      expect(ITEM_BY_ID[id].stacks, id).toBe(true);
    }
  });

  it("legendaries do not stack", () => {
    for (const i of ITEMS.filter(x => x.rarity === "legendary")) expect(i.stacks, i.id).toBe(false);
  });

  it("every item has at least one tag from the known set", () => {
    const known = new Set(["offense", "defense", "mobility", "economy"]);
    for (const i of ITEMS) {
      expect(i.tags.length).toBeGreaterThan(0);
      for (const t of i.tags) expect(known.has(t), `${i.id} tag ${t}`).toBe(true);
    }
  });

  describe("queryItems", () => {
    it("filters by rarity", () => {
      const rares = queryItems({ rarity: "rare" });
      expect(rares.length).toBeGreaterThan(0);
      for (const i of rares) expect(i.rarity).toBe("rare");
    });

    it("filters by tag", () => {
      const mob = queryItems({ tag: "mobility" });
      expect(mob.length).toBeGreaterThan(0);
      for (const i of mob) expect(i.tags).toContain("mobility");
    });

    it("requiresMet excludes items whose prerequisite is not held", () => {
      const without = queryItems({ requiresMet: true, held: [] });
      expect(without.some(i => i.id === "chain_reaction")).toBe(false);
      const withIt = queryItems({ requiresMet: true, held: ["shrapnel"] });
      expect(withIt.some(i => i.id === "chain_reaction")).toBe(true);
    });

    it("no filter returns everything", () => {
      expect(queryItems({}).length).toBe(ITEMS.length);
      expect(queryItems().length).toBe(ITEMS.length);
    });
  });
});
