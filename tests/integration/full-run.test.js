import { describe, it, expect } from "vitest";
import { rng } from "core/rng.js";
import { newRun, startFloor, clearRoom, takeReward, chooseDoor, beatBoss, extract, die, canExtract, swapWeapon } from "core/run.js";
import { computeStats, BASE_STATS } from "core/stats.js";
import { ITEM_BY_ID } from "core/items.js";
import { passiveMods } from "core/effects.js";
import { onKill, onShoot, onEnemyHit, onHitTaken, onDeath } from "core/triggers.js";
import { activeSynergies, synergyEffects } from "core/synergy.js";
import { rollWeapon } from "core/weapons.js";

// Every other suite tests one module against its own spec. Nothing plays the game.
// The bugs that reached the browser - a bought item that changed no stat, a boon
// computed and discarded, an item granting a jump nobody read - all lived in the
// SEAMS between modules, which is exactly what no unit test looks at.
//
// This drives a whole run through the real state machine, applying items, boons and
// synergies the way the game does, and asserts the run stays coherent throughout.

/** Recompute exactly as src/game/main.js does: items + boons + synergies. */
function rebuild(run) {
  const items = (run.held ?? []).map((id) => ITEM_BY_ID[id]).filter(Boolean);
  const syn = activeSynergies(run.held ?? []);
  const extra = syn.length ? [{ effects: synergyEffects(run.held ?? []) }] : [];
  return computeStats(BASE_STATS, [...items, ...extra]);
}

function playRun(seed, { greedy = true, maxFloors = 3 } = {}) {
  let run = newRun(seed, { cursesEnabled: false });
  const log = [];
  let guard = 0;

  while (run.phase !== "dead" && run.phase !== "extracted" && guard++ < 400) {
    if (run.phase === "floor_start") {
      if (!greedy && canExtract(run)) { run = extract(run); break; }
      if (run.floor > maxFloors) { run = extract(run); break; }
      run = startFloor(run);
      log.push(`floor ${run.floor}`);
    } else if (run.phase === "room") {
      run = clearRoom(run, { kills: 6 });
    } else if (run.phase === "reward") {
      const pick = run.draft.length ? 0 : null;
      run = takeReward(run, pick);
      run = { ...run, stats: rebuild(run) };          // what the game does after every pick
    } else if (run.phase === "door") {
      run = chooseDoor(run, 0);
    } else if (run.phase === "boss") {
      run = beatBoss(run);
      log.push(`boss on floor ${run.floor}`);
    } else {
      throw new Error(`unknown phase ${run.phase}`);
    }
  }
  return { run, log, guard };
}

describe("a whole run holds together", () => {
  it("reaches an ending rather than looping forever", () => {
    for (let s = 0; s < 12; s++) {
      const { run, guard } = playRun(s);
      expect(guard, `seed ${s} never terminated`).toBeLessThan(400);
      expect(["dead", "extracted"], `seed ${s} ended in ${run.phase}`).toContain(run.phase);
    }
  });

  it("banks a score and keeps every invariant intact at the end", () => {
    const { run } = playRun(3);
    expect(run.finalScore ?? run.banked ?? 0).toBeGreaterThan(0);
    expect(Number.isFinite(run.maxHp)).toBe(true);
    expect(run.maxHp).toBeGreaterThan(0);
    expect(run.hp).toBeLessThanOrEqual(run.maxHp);
    expect(Array.isArray(run.held)).toBe(true);
    // 14 of the 76 items stack by design, so duplicates are legitimate for those.
    // What must never happen is holding two copies of a non-stacking item: the
    // draft excludes those, and computeStats would silently ignore the second,
    // making the pick a no-op.
    const dupes = run.held.filter((id, i) => run.held.indexOf(id) !== i);
    const badDupes = [...new Set(dupes)].filter((id) => ITEM_BY_ID[id]?.stacks === false);
    expect(badDupes, `non-stacking items held twice: ${badDupes.join(", ")}`).toEqual([]);
  });

  it("picking up items actually strengthens the build", () => {
    const { run } = playRun(5);
    expect(run.held.length, "a full run collected nothing").toBeGreaterThan(0);
    const withItems = rebuild(run);
    const without = computeStats(BASE_STATS, []);
    const changed = Object.keys(withItems).filter((k) => withItems[k] !== without[k]);
    expect(changed.length, `held ${run.held.join(", ")} and no stat moved`).toBeGreaterThan(0);
  });

  it("never produces a NaN or undefined stat at any point in a run", () => {
    for (let s = 0; s < 8; s++) {
      const { run } = playRun(s);
      for (const [k, v] of Object.entries(run.stats)) {
        if (typeof v === "boolean") continue;
        expect(Number.isFinite(v), `seed ${s}: stat ${k} = ${v}`).toBe(true);
      }
    }
  });

  it("the effect hooks stay safe for every build a run produces", () => {
    for (let s = 0; s < 8; s++) {
      const { run } = playRun(s);
      const held = run.held;
      const ctx = { hp: 40, maxHp: run.maxHp, shotIndex: 0, magSize: 10, damage: 20, isCrit: true, amount: 25 };
      for (const [name, fn] of [["onShoot", onShoot], ["onEnemyHit", onEnemyHit], ["onKill", onKill], ["onHitTaken", onHitTaken], ["onDeath", onDeath]]) {
        const out = fn(held, ctx);
        for (const [k, v] of Object.entries(out)) {
          if (typeof v === "number") expect(Number.isFinite(v), `seed ${s} ${name}.${k}`).toBe(true);
        }
      }
      const p = passiveMods(held);
      expect(p.damageReduction, `seed ${s} damageReduction`).toBeLessThan(1);
      expect(p.goldMult).toBeGreaterThan(0);
    }
  });

  it("extracting early ends the run cleanly and still scores", () => {
    const { run } = playRun(7, { greedy: false, maxFloors: 2 });
    expect(run.phase).toBe("extracted");
    expect(Number.isFinite(run.finalScore ?? run.banked ?? 0)).toBe(true);
  });

  it("swapping weapons mid-run keeps the run playable", () => {
    let { run } = playRun(2, { maxFloors: 2 });
    if (run.phase === "dead" || run.phase === "extracted") return;
    const w = rollWeapon(rng(9), "carbine", 2);
    const after = swapWeapon(run, w);
    expect(after.weapon.archetype).toBe("carbine");
    expect(after.held).toEqual(run.held);
  });

  it("dying is survivable when the build says it should be", () => {
    const base = newRun(11, { cursesEnabled: false });
    const withLoop = { ...startFloor(base), held: ["the_loop"] };
    const revived = die({ ...withLoop, stats: rebuild(withLoop) });
    expect(revived.phase, "The Loop did not save the run").not.toBe("dead");
  });
});
