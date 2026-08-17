// REFERENCE — never shown to the worker.
import { rng } from "./rng.js";
import { ITEM_BY_ID } from "./items.js";
import { computeStats, BASE_STATS } from "./stats.js";
import { draftRewards } from "./draft.js";
import { generateFloor } from "./floor.js";
import { rollWeapon } from "./weapons.js";
import { scoreRun } from "./score.js";

const PHASES = ["floor_start", "room", "reward", "door", "boss", "extracted", "dead"];
const need = (run, phase) => { if (run.phase !== phase) throw new Error(`illegal in phase ${run.phase}: need ${phase}`); };
const ended = (run) => run.phase === "dead" || run.phase === "extracted";

function withStats(run) {
  const items = run.held.map(id => ITEM_BY_ID[id]).filter(Boolean);
  const stats = computeStats(BASE_STATS, items);
  return { ...run, stats, maxHp: stats.maxHp };
}

export function newRun(seed, opts = {}) {
  const r = rng(seed);
  const weapon = rollWeapon(r.fork("weapon"), opts.startingWeapon ?? "sidearm", 1);
  const base = {
    seed, floor: 1, phase: "floor_start", roomIndex: 0, held: [], weapon,
    cursesEnabled: !!opts.cursesEnabled, kills: 0, roomsCleared: 0, banked: 0,
    finalScore: 0, currentFloor: null, draft: [], secondWindUsedFloor: 0, loopUsed: false,
    depthReached: 1,
  };
  const s = withStats(base);
  return { ...s, hp: s.maxHp };
}

export function startFloor(run) {
  if (ended(run)) throw new Error("run is over");
  need(run, "floor_start");
  const r = rng(run.seed).fork(`floor${run.floor}`);
  const currentFloor = generateFloor(r, run.floor, run);
  return { ...run, phase: "room", roomIndex: 0, currentFloor, depthReached: Math.max(run.depthReached, run.floor) };
}

export function enterRoom(run) { return run; }

export function clearRoom(run, { kills = 0 } = {}) {
  if (ended(run)) throw new Error("run is over");
  need(run, "room");
  const r = rng(run.seed).fork(`draft${run.floor}-${run.roomIndex}`);
  const draft = draftRewards(r, run);
  return { ...run, phase: "reward", kills: run.kills + kills, roomsCleared: run.roomsCleared + 1, draft };
}

export function takeReward(run, index) {
  if (ended(run)) throw new Error("run is over");
  need(run, "reward");
  let next = { ...run, draft: [] };
  if (index !== null && index !== undefined) {
    if (!Number.isInteger(index) || index < 0 || index >= run.draft.length) throw new Error("bad reward index");
    const item = run.draft[index];
    const held = [...run.held, item.id];
    const maxBefore = run.maxHp;
    next = withStats({ ...next, held });
    next.hp = Math.min(next.maxHp, run.hp + Math.max(0, next.maxHp - maxBefore));
  }
  next.phase = run.roomIndex >= 4 ? "boss" : "door";
  return next;
}

export function chooseDoor(run, index) {
  if (ended(run)) throw new Error("run is over");
  need(run, "door");
  const doors = run.currentFloor.rooms[run.roomIndex].doors;
  if (!Number.isInteger(index) || index < 0 || index >= doors.length) throw new Error("bad door index");
  return { ...run, phase: "room", roomIndex: run.roomIndex + 1 };
}

export function beatBoss(run) {
  if (ended(run)) throw new Error("run is over");
  need(run, "boss");
  return { ...run, phase: "floor_start", floor: run.floor + 1, roomIndex: 0, currentFloor: null };
}

export function canExtract(run) {
  return run.phase === "floor_start" && run.floor > 1;
}

export function extract(run) {
  if (!canExtract(run)) throw new Error("cannot extract now");
  const score = scoreRun(run).total;
  return { ...run, phase: "extracted", banked: score, finalScore: score };
}

export function die(run) {
  if (ended(run)) throw new Error("run is over");
  if (run.stats?.secondWind && run.secondWindUsedFloor !== run.floor) {
    return { ...run, hp: 1, secondWindUsedFloor: run.floor, phase: run.phase === "floor_start" ? "floor_start" : "room" };
  }
  if (run.stats?.floorRetry && !run.loopUsed) {
    const base = { ...run, phase: "floor_start", roomIndex: 0, currentFloor: null, draft: [], loopUsed: true };
    return { ...base, hp: base.maxHp };
  }
  return { ...run, phase: "dead", banked: 0, finalScore: scoreRun(run).total };
}
