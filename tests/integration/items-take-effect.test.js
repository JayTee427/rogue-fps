import { describe, it, expect } from "vitest";
import { newRun, startFloor, clearRoom, takeReward, chooseDoor } from "core/run.js";
import { ITEM_BY_ID } from "core/items.js";

// The run's stats must actually change when an item is taken. This was silently
// broken once: run.js indexed the ITEMS array by id, got undefined for every
// item, and every effect in the game vanished while all transition tests passed.

function firstDraftContaining(pred) {
  for (let s = 1; s <= 80; s++) {
    let r = startFloor(newRun(s));
    for (let room = 0; room < 5; room++) {
      r = clearRoom(r, { kills: 1 });
      const idx = r.draft.findIndex(pred);
      if (idx >= 0) return { run: r, idx, item: r.draft[idx] };
      r = takeReward(r, null);
      if (room < 4) r = chooseDoor(r, 0);
    }
  }
  return null;
}

describe("items take effect through the run", () => {
  it("a damage-multiplying item raises stats.damage", () => {
    const f = firstDraftContaining(i => i.effects.damage?.mul > 1);
    expect(f).not.toBeNull();
    const before = f.run.stats.damage;
    const after = takeReward(f.run, f.idx);
    expect(after.stats.damage).toBeCloseTo(before * f.item.effects.damage.mul);
    expect(after.held).toContain(f.item.id);
  });

  it("a flag item surfaces on stats", () => {
    const f = firstDraftContaining(i => Object.values(i.effects).some(v => v === true));
    expect(f).not.toBeNull();
    const flag = Object.entries(f.item.effects).find(([, v]) => v === true)[0];
    expect(takeReward(f.run, f.idx).stats[flag]).toBe(true);
  });

  it("every held id resolves to a real catalog item after taking rewards", () => {
    let r = startFloor(newRun(3));
    for (let room = 0; room < 3; room++) {
      r = clearRoom(r, { kills: 1 });
      r = takeReward(r, r.draft.length ? 0 : null);
      r = chooseDoor(r, 0);
    }
    expect(r.held.length).toBeGreaterThan(0);
    for (const id of r.held) expect(ITEM_BY_ID[id], id).toBeDefined();
  });
});
