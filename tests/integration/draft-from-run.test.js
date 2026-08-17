import { describe, it, expect } from "vitest";
import { newRun, startFloor, clearRoom } from "core/run.js";
import { RARITIES } from "core/items.js";

// Cross-module contract: a REAL run object (from newRun) fed through the real
// draft must produce a sane rarity curve. Each module passed its own suite while
// this was broken — draft.js multiplied `run.stats.luck` (undefined) into every
// weight, and 59 consecutive floor-1 drafts contained nothing but legendaries.

describe("draft rarity through a real run", () => {
  it("floor-1 first-room drafts are mostly common, with every non-cursed tier present", () => {
    const counts = Object.fromEntries(RARITIES.map(r => [r, 0]));
    let total = 0;
    for (let s = 1; s <= 150; s++) {
      const r = clearRoom(startFloor(newRun(s)), { kills: 1 });
      for (const it of r.draft) { counts[it.rarity]++; total++; }
    }
    expect(total).toBeGreaterThan(0);
    expect(counts.common).toBeGreaterThan(counts.uncommon);
    expect(counts.uncommon).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.legendary);
    expect(counts.legendary / total).toBeLessThan(0.08);
    expect(counts.cursed).toBe(0);
  });

  it("a fresh run's stats carry the fields draft depends on, as numbers", () => {
    const r = newRun(1);
    for (const k of ["draftSize", "luck", "rarityShift"]) {
      expect(typeof r.stats[k], k).toBe("number");
      expect(Number.isNaN(r.stats[k]), k).toBe(false);
    }
  });

  it("first-room drafts vary across seeds (not the same handful of items)", () => {
    const seen = new Set();
    for (let s = 1; s <= 60; s++) for (const it of clearRoom(startFloor(newRun(s)), { kills: 1 }).draft) seen.add(it.id);
    expect(seen.size).toBeGreaterThan(20);
  });
});
