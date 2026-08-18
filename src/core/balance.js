import { BASE_STATS, computeStats } from "core/stats.js";
import { ITEMS, ITEM_BY_ID } from "core/items.js";

function num(v, d) {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

export function effectiveDps(stats, weapon) {
  const w = weapon && weapon.stats ? weapon.stats : {};
  const wDamage = num(w.damage, 10);
  const wFireRate = num(w.fireRate, 5);
  const pellets = num(w.pellets, 1);
  const magSize = num(w.magSize, 1);
  const reloadTime = num(w.reloadTime, 1);

  const damage = wDamage * num(stats.damage, 1);
  const fireRate = wFireRate * num(stats.fireRate, 1);
  const critChance = num(stats.critChance, 0);
  const critMult = num(stats.critMult, 1);

  const critMultiplier = 1 + critChance * (critMult - 1);
  const shot = damage * pellets * critMultiplier;
  const mag = Math.max(1, magSize);
  const fireTime = mag / Math.max(0.001, fireRate);
  const cycle = fireTime + Math.max(0, reloadTime);
  const dps = (shot * mag) / Math.max(0.001, cycle);
  return dps;
}

export function timeToKill(stats, weapon, enemyHp) {
  const dps = effectiveDps(stats, weapon);
  if (dps <= 0) return 9999;
  const hp = num(enemyHp, 0);
  if (hp <= 0) return 0.001;
  return hp / dps;
}

export function survivalSeconds(stats, incomingDps) {
  const maxHp = num(stats.maxHp, BASE_STATS.maxHp);
  const armor = num(stats.armor, 0);
  const deflect = num(stats.deflect, 0);
  const inDps = num(incomingDps, 0);
  if (inDps <= 0) return 9999;
  const reduction = Math.min(0.95, (armor + deflect) / (armor + deflect + 100));
  const effectiveHp = maxHp / Math.max(0.001, 1 - reduction);
  return effectiveHp / inDps;
}

export function powerScore(stats, weapon) {
  const dps = effectiveDps(stats, weapon);
  const maxHp = num(stats.maxHp, BASE_STATS.maxHp);
  const armor = num(stats.armor, 0);
  const deflect = num(stats.deflect, 0);
  const reduction = Math.min(0.95, (armor + deflect) / (armor + deflect + 100));
  const effectiveHealth = maxHp / Math.max(0.001, 1 - reduction);
  const score = Math.sqrt(Math.max(0.001, dps) * Math.max(0.001, effectiveHealth));
  return score;
}

export function simulateRun(rng, opts = {}) {
  const maxFloors = num(opts.maxFloors, 8);
  const curses = !!opts.curses;
  const difficulty = num(opts.difficulty, 1);
  const diff = Math.max(0.01, difficulty);

  let held = [];
  let stats = computeStats(BASE_STATS, []);
  let weapon = { archetype: "basic", rarity: "common", mods: [], stats: { damage: 10, fireRate: 5, magSize: 10, reloadTime: 1.5, pellets: 1, spread: 0, range: 100 } };

  const powerCurve = [];
  const build = [];

  for (let floor = 1; floor <= maxFloors; floor++) {
    const available = ITEMS.filter(item => {
      if (item.rarity === "cursed" && !curses) return false;
      if (held.includes(item.id)) return false;
      return true;
    });

    const draft = [];
    const pool = available.slice();
    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = rng.int(0, pool.length - 1);
      draft.push(pool[idx]);
      pool.splice(idx, 1);
    }

    let bestItem = null;
    let bestScore = powerScore(stats, weapon);
    for (const item of draft) {
      const trialHeld = held.concat([item.id]);
      const trialStats = computeStats(BASE_STATS, trialHeld.map(id => ITEM_BY_ID[id]));
      const trialScore = powerScore(trialStats, weapon);
      if (trialScore > bestScore) {
        bestScore = trialScore;
        bestItem = item;
      }
    }

    if (bestItem) {
      held = held.concat([bestItem.id]);
      build.push(bestItem.id);
      stats = computeStats(BASE_STATS, held.map(id => ITEM_BY_ID[id]));
    }

    const score = powerScore(stats, weapon);
    if (powerCurve.length > 0) {
      const prev = powerCurve[powerCurve.length - 1];
      powerCurve.push(Math.max(score, prev * 0.75));
    } else {
      powerCurve.push(score);
    }

    const enemyHp = 50 * Math.pow(1.3, floor * diff);
    const enemyDps = 10 * Math.pow(1.2, floor * diff);
    const ttk = timeToKill(stats, weapon, enemyHp);
    const surv = survivalSeconds(stats, enemyDps);

    if (ttk > surv) {
      return { floorReached: floor, died: true, powerCurve, build };
    }
  }

  return { floorReached: maxFloors, died: false, powerCurve, build };
}