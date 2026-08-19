import { rng } from "core/rng.js";
import { ITEM_BY_ID } from "core/items.js";
import { BOONS } from "core/pact.js";
import { computeStats, BASE_STATS } from "core/stats.js";
import { draftRewards } from "core/draft.js";
import { generateFloor } from "core/floor.js";
import { rollWeapon, ARCHETYPES } from "core/weapons.js";
import { scoreRun } from "core/score.js";

export function newRun(seed, opts = {}) {
  const weapon = rollWeapon(rng(seed).fork("weapon"), opts.startingWeapon ?? "sidearm", 1);
  const stats = computeStats(BASE_STATS, []);
  return {
    seed,
    floor: 1,
    phase: "floor_start",
    roomIndex: 0,
    held: [],
    weapon,
    stats,
    maxHp: stats.maxHp,
    hp: stats.maxHp,
    cursesEnabled: !!opts.cursesEnabled,
    kills: 0,
    roomsCleared: 0,
    banked: 0,
    finalScore: 0,
    currentFloor: null,
    draft: [],
    secondWindUsedFloor: 0,
    loopUsed: false,
    depthReached: 1,
  };
}

export function startFloor(run) {
  if (run.phase !== "floor_start") throw new Error("startFloor: not in floor_start phase");
  const floorRng = rng(run.seed).fork(`floor${run.floor}`);
  const currentFloor = generateFloor(floorRng, run.floor, run);
  return {
    ...run,
    currentFloor,
    phase: "room",
    roomIndex: 0,
    depthReached: Math.max(run.depthReached, run.floor),
  };
}

export function enterRoom(run) {
  return run;
}

export function clearRoom(run, { kills = 0 } = {}) {
  if (run.phase !== "room") throw new Error("clearRoom: not in room phase");
  const draftRng = rng(run.seed).fork(`draft${run.floor}-${run.roomIndex}`);
  const draft = draftRewards(draftRng, run);
  return {
    ...run,
    kills: run.kills + kills,
    roomsCleared: run.roomsCleared + 1,
    draft,
    phase: "reward",
  };
}

export function takeReward(run, index) {
  if (run.phase !== "reward") throw new Error("takeReward: not in reward phase");
  if (index == null) {
    return { ...run, draft: [], phase: run.roomIndex >= 4 ? "boss" : "door" };
  }
  if (!Number.isInteger(index) || index < 0 || index >= run.draft.length) {
    throw new Error("takeReward: invalid index");
  }
  const item = run.draft[index];
  let held = [...run.held, item.id];
  // Curse of Forgetfulness: taking it costs a random possession. Seeded off
  // the run so the same draft forgets the same item on the same seed.
  let forgotten = null;
  if (item.effects?.loseRandomItem && run.held.length > 0) {
    const forget = rng(run.seed).fork(`forget${run.floor}-${run.roomIndex}`);
    forgotten = run.held[forget.int(0, run.held.length - 1)];
    const keep = [...run.held];
    keep.splice(keep.indexOf(forgotten), 1);
    held = [...keep, item.id];
  }
  // ITEMS is an array; indexing it by id silently yields undefined for every
  // item and every effect vanishes. The map is ITEM_BY_ID.
  const itemObjs = held.map((id) => ITEM_BY_ID[id]).filter(Boolean);
  // Pact boons live on run.boons and must survive a core-side recompute, or
  // taking any item would silently strip every bargain already made.
  const boonObjs = (run.boons ?? []).map((id) => BOONS[id]).filter(Boolean).map((b) => ({ effects: b.effects }));
  const newStats = computeStats(BASE_STATS, [...itemObjs, ...boonObjs]);
  const oldMax = run.maxHp;
  const newMax = newStats.maxHp;
  const hp = Math.min(newMax, run.hp + (newMax - oldMax));
  return {
    ...run,
    held,
    stats: newStats,
    maxHp: newMax,
    hp,
    draft: [],
    lastForgotten: forgotten,     // for the shell to announce, then clear
    phase: run.roomIndex >= 4 ? "boss" : "door",
  };
}

export function chooseDoor(run, index) {
  if (run.phase !== "door") throw new Error("chooseDoor: not in door phase");
  const room = run.currentFloor.rooms[run.roomIndex];
  if (!room || !Array.isArray(room.doors) || index < 0 || index >= room.doors.length) {
    throw new Error("chooseDoor: invalid door index");
  }
  return {
    ...run,
    roomIndex: run.roomIndex + 1,
    phase: "room",
  };
}

export function beatBoss(run) {
  if (run.phase !== "boss") throw new Error("beatBoss: not in boss phase");
  return {
    ...run,
    floor: run.floor + 1,
    roomIndex: 0,
    currentFloor: null,
    phase: "floor_start",
  };
}

export function canExtract(run) {
  return run.phase === "floor_start" && run.floor > 1;
}

export function extract(run) {
  if (!canExtract(run)) throw new Error("extract: cannot extract");
  const score = scoreRun(run).total;
  return {
    ...run,
    phase: "extracted",
    banked: score,
    finalScore: score,
  };
}

export function die(run) {
  if (run.phase === "dead" || run.phase === "extracted") {
    throw new Error("die: run already ended");
  }
  if (run.stats.secondWind && run.secondWindUsedFloor !== run.floor) {
    return {
      ...run,
      hp: 1,
      secondWindUsedFloor: run.floor,
      phase: run.phase === "floor_start" ? "floor_start" : "room",
    };
  }
  if (run.stats.floorRetry && !run.loopUsed) {
    return {
      ...run,
      phase: "floor_start",
      roomIndex: 0,
      currentFloor: null,
      draft: [],
      loopUsed: true,
      hp: run.maxHp,
    };
  }
  const score = scoreRun(run).total;
  return {
    ...run,
    phase: "dead",
    banked: 0,
    finalScore: score,
  };
}
/**
 * Swap the run's weapon for a rolled one (a "weapon" reward room). Returns a
 * NEW run; the phase is untouched so the caller still resolves the reward
 * normally afterwards. Validates the weapon so a malformed roll can never leave
 * the player holding something the viewmodel cannot draw.
 */
export function swapWeapon(run, weapon) {
  if (run.phase === "dead" || run.phase === "extracted") throw new Error("run is over");
  if (!weapon || !ARCHETYPES[weapon.archetype]) throw new Error("swapWeapon: unknown archetype");
  if (!weapon.stats || typeof weapon.stats.damage !== "number") throw new Error("swapWeapon: weapon has no stats");
  return { ...run, weapon };
}
