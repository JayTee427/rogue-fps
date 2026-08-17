import { describe, it, expect } from "vitest";
import { draftRewards, RARITY_WEIGHTS } from "core/draft.js";
import { rng } from "core/rng.js";
import { ITEMS, ITEM_BY_ID } from "core/items.js";

// A run holds: held item ids, floor index, whether curses are enabled, and its
// resolved stats (draftSize, luck, rarityShift). draft.js reads only these.
const run = (over = {}) => ({
  held: [], floor: 1, cursesEnabled: false,
  stats: { draftSize: 3, luck: 0, rarityShift: 0 },
  ...over,
});

const many = (fn, n = 300) => Array.from({ length: n }, (_, i) => fn(rng(1000 + i)));

describe("draftRewards — the reward draft", () => {
  it("returns exactly n items when n is given", () => {
    expect(draftRewards(rng(1), run(), 3)).toHaveLength(3);
    expect(draftRewards(rng(1), run(), 4)).toHaveLength(4);
  });

  it("defaults n to the run's draftSize stat", () => {
    expect(draftRewards(rng(1), run({ stats: { draftSize: 4, luck: 0, rarityShift: 0 } }))).toHaveLength(4);
  });

  it("returns real item objects from the catalog", () => {
    for (const it of draftRewards(rng(2), run(), 3)) expect(ITEM_BY_ID[it.id]).toBe(it);
  });

  it("is deterministic for the same seed and run", () => {
    const a = draftRewards(rng(77), run(), 3).map(i => i.id);
    const b = draftRewards(rng(77), run(), 3).map(i => i.id);
    expect(a).toEqual(b);
  });

  it("never offers the same item twice in one draft", () => {
    for (const draft of many(r => draftRewards(r, run(), 3))) {
      const ids = draft.map(i => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("never offers a non-stacking item the player already holds", () => {
    const held = ["glass_cannon", "executioner", "second_wind"];
    for (const draft of many(r => draftRewards(r, run({ held }), 3))) {
      for (const it of draft) expect(held).not.toContain(it.id);
    }
  });

  it("MAY offer a stacking item the player already holds", () => {
    const held = ["hot_rounds"];
    const seen = many(r => draftRewards(r, run({ held }), 3)).some(d => d.some(i => i.id === "hot_rounds"));
    expect(seen).toBe(true);
  });

  it("never offers an item whose prerequisite is not held", () => {
    for (const draft of many(r => draftRewards(r, run(), 3))) {
      for (const it of draft) if (it.requires) expect(run().held).toContain(it.requires);
    }
  });

  it("offers a prerequisite-gated item once the prerequisite is held", () => {
    const seen = many(r => draftRewards(r, run({ held: ["shrapnel"] }), 3), 600)
      .some(d => d.some(i => i.id === "chain_reaction"));
    expect(seen).toBe(true);
  });

  it("never offers cursed items unless curses are enabled", () => {
    for (const draft of many(r => draftRewards(r, run(), 3))) {
      for (const it of draft) expect(it.rarity).not.toBe("cursed");
    }
  });

  it("offers cursed items when curses are enabled", () => {
    const seen = many(r => draftRewards(r, run({ cursesEnabled: true }), 3), 600)
      .some(d => d.some(i => i.rarity === "cursed"));
    expect(seen).toBe(true);
  });

  it("commons are the most frequent rarity on floor 1 with no luck", () => {
    const counts = {};
    for (const d of many(r => draftRewards(r, run(), 3), 500)) for (const i of d) counts[i.rarity] = (counts[i.rarity] ?? 0) + 1;
    expect(counts.common).toBeGreaterThan(counts.uncommon ?? 0);
    expect(counts.uncommon ?? 0).toBeGreaterThan(counts.rare ?? 0);
    expect(counts.rare ?? 0).toBeGreaterThan(counts.legendary ?? 0);
  });

  it("legendaries do appear, but rarely, on floor 1", () => {
    let leg = 0, total = 0;
    for (const d of many(r => draftRewards(r, run(), 3), 800)) for (const i of d) { total++; if (i.rarity === "legendary") leg++; }
    expect(leg).toBeGreaterThan(0);
    expect(leg / total).toBeLessThan(0.08);
  });

  it("deeper floors shift the distribution toward rarer items", () => {
    const rareOrBetter = d => d.filter(i => ["rare", "legendary"].includes(i.rarity)).length;
    const shallow = many(r => draftRewards(r, run({ floor: 1 }), 3), 500).reduce((a, d) => a + rareOrBetter(d), 0);
    const deep = many(r => draftRewards(r, run({ floor: 8 }), 3), 500).reduce((a, d) => a + rareOrBetter(d), 0);
    expect(deep).toBeGreaterThan(shallow);
  });

  it("luck shifts the distribution toward rarer items", () => {
    const rareOrBetter = d => d.filter(i => ["rare", "legendary"].includes(i.rarity)).length;
    const base = many(r => draftRewards(r, run(), 3), 500).reduce((a, d) => a + rareOrBetter(d), 0);
    const lucky = many(r => draftRewards(r, run({ stats: { draftSize: 3, luck: 0.5, rarityShift: 0 } }), 3), 500).reduce((a, d) => a + rareOrBetter(d), 0);
    expect(lucky).toBeGreaterThan(base);
  });

  it("rarityShift +1 (Greed) means commons are never offered", () => {
    for (const d of many(r => draftRewards(r, run({ stats: { draftSize: 3, luck: 0, rarityShift: 1 } }), 3))) {
      for (const i of d) expect(i.rarity).not.toBe("common");
    }
  });

  it("RARITY_WEIGHTS covers the four non-cursed tiers and is decreasing", () => {
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.uncommon);
    expect(RARITY_WEIGHTS.uncommon).toBeGreaterThan(RARITY_WEIGHTS.rare);
    expect(RARITY_WEIGHTS.rare).toBeGreaterThan(RARITY_WEIGHTS.legendary);
  });

  it("does not consume the run's rng if given its own — same result with fresh rng", () => {
    // draft must draw only from the rng passed in; run object is not mutated
    const r0 = run();
    const before = JSON.stringify(r0);
    draftRewards(rng(5), r0, 3);
    expect(JSON.stringify(r0)).toBe(before);
  });

  it("returns fewer than n only when the eligible pool is smaller than n", () => {
    // hold every non-stacking item: only stacking ones remain eligible
    const held = ITEMS.filter(i => !i.stacks && i.rarity !== "cursed").map(i => i.id);
    const d = draftRewards(rng(9), run({ held }), 3);
    expect(d.length).toBeGreaterThan(0);
    for (const i of d) expect(i.stacks).toBe(true);
  });
});
