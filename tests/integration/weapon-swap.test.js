import { describe, it, expect } from "vitest";
import { newRun, startFloor, clearRoom, swapWeapon } from "core/run.js";
import { rollWeapon, ARCHETYPES } from "core/weapons.js";
import { rng } from "core/rng.js";

// A "weapon" reward room offers a rolled weapon instead of an item. The player
// may take it (swap) or decline (keep). Contract lives in run.js so the UI has
// nothing to get wrong.

const atReward = (seed = 1) => clearRoom(startFloor(newRun(seed)), { kills: 1 });

describe("swapWeapon", () => {
  it("replaces the run's weapon and returns a new run", () => {
    const r = atReward();
    const w = rollWeapon(rng(99), "carbine", 1);
    const after = swapWeapon(r, w);
    expect(after.weapon).toEqual(w);
    expect(after.weapon.archetype).toBe("carbine");
    expect(r.weapon).not.toEqual(w);            // input untouched
  });

  it("keeps every other part of the run intact", () => {
    const r = atReward(3);
    const after = swapWeapon(r, rollWeapon(rng(5), "railgun", 2));
    expect(after.held).toEqual(r.held);
    expect(after.hp).toBe(r.hp);
    expect(after.floor).toBe(r.floor);
    expect(after.roomIndex).toBe(r.roomIndex);
    expect(after.phase).toBe(r.phase);          // swapping does not advance the phase
    expect(after.kills).toBe(r.kills);
  });

  it("throws on a malformed weapon", () => {
    const r = atReward();
    expect(() => swapWeapon(r, null)).toThrow();
    expect(() => swapWeapon(r, { archetype: "nope" })).toThrow();
    expect(() => swapWeapon(r, { archetype: "carbine" })).toThrow();   // no stats
  });

  it("throws on an ended run", () => {
    const r = { ...atReward(), phase: "dead" };
    expect(() => swapWeapon(r, rollWeapon(rng(1), "sidearm", 1))).toThrow();
  });

  it("the swapped weapon is a real archetype with usable stats", () => {
    for (const a of Object.keys(ARCHETYPES)) {
      const w = rollWeapon(rng(4), a, 3);
      const after = swapWeapon(atReward(), w);
      expect(after.weapon.stats.damage).toBeGreaterThan(0);
      expect(after.weapon.stats.magSize).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(after.weapon.mods)).toBe(true);
    }
  });
});
