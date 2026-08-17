import { describe, it, expect } from "vitest";
import { newRun, startFloor, enterRoom, clearRoom, takeReward, chooseDoor, beatBoss, extract, die, canExtract } from "core/run.js";
import { ITEM_BY_ID } from "core/items.js";

// Contract: every function returns a NEW run object; the input is never mutated.
// Illegal transitions throw. `run.phase` is one of:
//   "floor_start" | "room" | "reward" | "door" | "boss" | "extracted" | "dead"

const fresh = (opts = {}) => newRun(1234, opts);

describe("newRun", () => {
  it("creates a run at floor 1, phase floor_start, with a seed and empty inventory", () => {
    const r = fresh();
    expect(r.seed).toBe(1234);
    expect(r.floor).toBe(1);
    expect(r.phase).toBe("floor_start");
    expect(r.held).toEqual([]);
    expect(r.hp).toBe(r.maxHp);
    expect(r.maxHp).toBeGreaterThan(0);
    expect(r.banked).toBe(0);
    expect(r.kills).toBe(0);
    expect(r.cursesEnabled).toBe(false);
  });

  it("honours opts.cursesEnabled and opts.startingWeapon", () => {
    const r = fresh({ cursesEnabled: true, startingWeapon: "carbine" });
    expect(r.cursesEnabled).toBe(true);
    expect(r.weapon.archetype).toBe("carbine");
  });

  it("is deterministic: same seed, same run", () => {
    expect(JSON.stringify(newRun(77))).toBe(JSON.stringify(newRun(77)));
  });

  it("starts with a weapon (sidearm by default) that has stats", () => {
    const r = fresh();
    expect(r.weapon.archetype).toBe("sidearm");
    expect(typeof r.weapon.stats.damage).toBe("number");
  });
});

describe("the happy path through one floor", () => {
  it("floor_start -> room -> reward -> door -> ... -> boss -> floor_start(next)", () => {
    let r = fresh();
    r = startFloor(r);
    expect(r.phase).toBe("room");
    expect(r.roomIndex).toBe(0);
    expect(r.currentFloor.rooms).toHaveLength(5);

    for (let i = 0; i < 5; i++) {
      expect(r.phase).toBe("room");
      expect(r.roomIndex).toBe(i);
      r = clearRoom(r, { kills: 4 });
      expect(r.phase).toBe("reward");
      expect(r.draft.length).toBeGreaterThan(0);
      r = takeReward(r, 0);
      if (i < 4) {
        expect(r.phase).toBe("door");
        r = chooseDoor(r, 0);
        expect(r.phase).toBe("room");
      } else {
        expect(r.phase).toBe("boss");
      }
    }
    expect(r.kills).toBe(20);
    r = beatBoss(r);
    expect(r.phase).toBe("floor_start");
    expect(r.floor).toBe(2);
  });

  it("never mutates the input run at any step", () => {
    const r0 = fresh();
    const s0 = JSON.stringify(r0);
    const r1 = startFloor(r0);
    expect(JSON.stringify(r0)).toBe(s0);
    const s1 = JSON.stringify(r1);
    clearRoom(r1, { kills: 1 });
    expect(JSON.stringify(r1)).toBe(s1);
  });
});

describe("rewards", () => {
  it("takeReward adds the chosen item to held and recomputes stats", () => {
    let r = clearRoom(startFloor(fresh()), { kills: 1 });
    const pick = r.draft[0];
    const before = r.stats.damage;
    r = takeReward(r, 0);
    expect(r.held).toContain(pick.id);
    expect(r.draft).toEqual([]);
    if (pick.effects.damage?.mul) expect(r.stats.damage).toBeCloseTo(before * pick.effects.damage.mul);
  });

  it("takeReward with an out-of-range index throws", () => {
    const r = clearRoom(startFloor(fresh()), { kills: 1 });
    expect(() => takeReward(r, 99)).toThrow();
    expect(() => takeReward(r, -1)).toThrow();
  });

  it("skipReward via index null is allowed and takes nothing", () => {
    let r = clearRoom(startFloor(fresh()), { kills: 1 });
    const held = r.held.length;
    r = takeReward(r, null);
    expect(r.held.length).toBe(held);
    expect(r.phase).toBe("door");
  });

  it("taking a maxHp item raises maxHp AND current hp by the same amount", () => {
    // Search seeds and rooms for ANY draft offering a +maxHp item. Which item
    // rolls when is the draft's business, not this test's — the contract here is
    // only what takeReward does with a maxHp increase.
    let checked = false;
    outer:
    for (let s = 1; s < 60; s++) {
      let rr = startFloor(newRun(s));
      for (let room = 0; room < 5; room++) {
        rr = clearRoom(rr, { kills: 1 });
        const idx = rr.draft.findIndex(i => i.effects.maxHp && (i.effects.maxHp.add > 0 || i.effects.maxHp.mul > 1));
        if (idx >= 0) {
          const hp0 = rr.hp, max0 = rr.maxHp;
          const after = takeReward(rr, idx);
          const gained = after.maxHp - max0;
          expect(gained).toBeGreaterThan(0);
          expect(after.hp).toBe(Math.min(after.maxHp, hp0 + gained));
          checked = true;
          break outer;
        }
        rr = takeReward(rr, null);
        if (room < 4) rr = chooseDoor(rr, 0);
      }
    }
    expect(checked).toBe(true);
  });
});

describe("illegal transitions throw", () => {
  it("clearRoom outside phase room", () => {
    expect(() => clearRoom(fresh(), { kills: 1 })).toThrow();
  });
  it("takeReward outside phase reward", () => {
    expect(() => takeReward(startFloor(fresh()), 0)).toThrow();
  });
  it("chooseDoor outside phase door", () => {
    expect(() => chooseDoor(startFloor(fresh()), 0)).toThrow();
  });
  it("beatBoss outside phase boss", () => {
    expect(() => beatBoss(startFloor(fresh()))).toThrow();
  });
  it("startFloor outside phase floor_start", () => {
    expect(() => startFloor(startFloor(fresh()))).toThrow();
  });
  it("chooseDoor with a bad index throws", () => {
    const r = takeReward(clearRoom(startFloor(fresh()), { kills: 1 }), 0);
    expect(() => chooseDoor(r, 99)).toThrow();
  });
});

describe("extract and die", () => {
  it("canExtract is false mid-floor and true at floor_start after floor 1", () => {
    expect(canExtract(fresh())).toBe(false);          // nothing to bank yet
    let r = startFloor(fresh());
    expect(canExtract(r)).toBe(false);
    for (let i = 0; i < 5; i++) {
      r = takeReward(clearRoom(r, { kills: 2 }), null);
      if (i < 4) r = chooseDoor(r, 0);
    }
    r = beatBoss(r);
    expect(canExtract(r)).toBe(true);
  });

  it("extract banks the run's score and ends it", () => {
    let r = startFloor(fresh());
    for (let i = 0; i < 5; i++) { r = takeReward(clearRoom(r, { kills: 3 }), null); if (i < 4) r = chooseDoor(r, 0); }
    r = beatBoss(r);
    const e = extract(r);
    expect(e.phase).toBe("extracted");
    expect(e.banked).toBeGreaterThan(0);
    expect(e.finalScore).toBe(e.banked);
  });

  it("going deeper instead of extracting multiplies the eventual score", () => {
    let r = startFloor(fresh());
    for (let i = 0; i < 5; i++) { r = takeReward(clearRoom(r, { kills: 3 }), null); if (i < 4) r = chooseDoor(r, 0); }
    r = beatBoss(r);
    const shallow = extract(r).finalScore;
    let deeper = startFloor(r);
    for (let i = 0; i < 5; i++) { deeper = takeReward(clearRoom(deeper, { kills: 3 }), null); if (i < 4) deeper = chooseDoor(deeper, 0); }
    deeper = beatBoss(deeper);
    expect(extract(deeper).finalScore).toBeGreaterThan(shallow * 1.5);
  });

  it("die ends the run with banked 0 (nothing is kept) but records the score reached", () => {
    let r = clearRoom(startFloor(fresh()), { kills: 5 });
    const d = die(r);
    expect(d.phase).toBe("dead");
    expect(d.banked).toBe(0);
    expect(d.finalScore).toBeGreaterThanOrEqual(0);
  });

  it("no transitions are possible after extracted or dead", () => {
    const d = die(startFloor(fresh()));
    expect(() => startFloor(d)).toThrow();
    expect(() => clearRoom(d, { kills: 1 })).toThrow();
  });
});

describe("Second Wind and The Loop", () => {
  it("die() on a run holding second_wind (unused this floor) survives at 1 hp instead", () => {
    let r = startFloor(fresh());
    r = { ...r, held: [...r.held, "second_wind"], stats: { ...r.stats, secondWind: true }, hp: 0 };
    const d = die(r);
    expect(d.phase).toBe("room");
    expect(d.hp).toBe(1);
    expect(d.secondWindUsedFloor).toBe(d.floor);
  });

  it("second_wind only works once per floor", () => {
    let r = startFloor(fresh());
    r = { ...r, held: [...r.held, "second_wind"], stats: { ...r.stats, secondWind: true }, hp: 0, secondWindUsedFloor: r.floor };
    expect(die(r).phase).toBe("dead");
  });

  it("die() on a run holding the_loop restarts the current floor with items intact, once per run", () => {
    let r = startFloor(fresh());
    r = takeReward(clearRoom(r, { kills: 2 }), 0);
    r = chooseDoor(r, 0);
    const heldBefore = r.held.slice();
    r = { ...r, held: [...r.held, "the_loop"], stats: { ...r.stats, floorRetry: true } };
    const d = die(r);
    expect(d.phase).toBe("floor_start");
    expect(d.floor).toBe(r.floor);
    expect(d.held).toEqual([...heldBefore, "the_loop"]);
    expect(d.loopUsed).toBe(true);
    // second death: really dead
    const dd = die(startFloor(d));
    expect(dd.phase).toBe("dead");
  });
});
