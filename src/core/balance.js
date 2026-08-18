import { BASE_STATS } from "core/stats.js";

function num(v, d) {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

export function effectiveDps(stats, weapon) {
  const s = stats || {};
  const w = (weapon && weapon.stats) || {};

  const wDamage   = num(w.damage, 10);
  const wFireRate = num(w.fireRate, 5);
  const magSize   = num(w.magSize, 30);
  const reloadTime = num(w.reloadTime, 1.5);
  const pellets   = num(w.pellets, 1);

  const damageMult = num(s.damage, 1);
  const fireRateMult = num(s.fireRate, 1);
  const critChance = num(s.critChance, 0);
  const critMult = num(s.critMult, 1.5);

  const weaponDamage = wDamage * damageMult;
  const fireRate = wFireRate * fireRateMult;

  const critMultiplier = 1 + Math.max(0, critChance) * Math.max(0, critMult - 1);
  const shot = weaponDamage * pellets * critMultiplier;

  const mag = Math.max(1, magSize);
  const fireTime = mag / Math.max(0.001, fireRate);
  const cycle = fireTime + Math.max(0, reloadTime);
  const dps = (shot * mag) / Math.max(0.001, cycle);

  return Math.max(0, dps);
}

export function timeToKill(stats, weapon, enemyHp) {
  const dps = effectiveDps(stats, weapon);
  const hp = Math.max(0, num(enemyHp, 0));
  if (dps <= 0) return 9999;
  return hp / dps;
}

export function survivalSeconds(stats, incomingDps) {
  const s = stats || {};
  const maxHp = num(s.maxHp, BASE_STATS.maxHp);
  const armor = num(s.armor, BASE_STATS.armor);
  const deflect = num(s.deflect, BASE_STATS.deflect);

  const effectiveHp = maxHp * (1 + Math.max(0, armor) * 0.05) * (1 + Math.max(0, deflect) * 0.02);
  const dps = Math.max(0, num(incomingDps, 0));

  if (dps <= 0) return 99999;
  return effectiveHp / dps;
}

export function powerScore(stats, weapon) {
  const s = stats || {};
  const w = (weapon && weapon.stats) || {};

  const dps = effectiveDps(s, weapon);
  const maxHp = num(s.maxHp, BASE_STATS.maxHp);
  const armor = num(s.armor, BASE_STATS.armor);
  const deflect = num(s.deflect, BASE_STATS.deflect);

  const effectiveHealth = maxHp * (1 + Math.max(0, armor) * 0.05) * (1 + Math.max(0, deflect) * 0.02);
  const score = Math.sqrt(Math.max(0, dps) * Math.max(0, effectiveHealth));

  return Math.max(1, score);
}

export function simulateRun(rng, opts) {
  const maxFloors = num(opts && opts.maxFloors, 8);
  const stats = { ...BASE_STATS };
  const weapon = {
    archetype: "basic",
    rarity: "common",
    mods: [],
    stats: { damage: 10, fireRate: 5, magSize: 30, reloadTime: 1.5, pellets: 1, spread: 0, range: 50 }
  };

  const powerCurve = [];
  const build = [];
  let floor = 1;
  let died = false;

  const baseEnemyHp = 100;
  const baseEnemyDps = 10;

  while (floor <= maxFloors) {
    const scale = 1 + (floor - 1) * 0.25;
    const enemyHp = baseEnemyHp * scale;
    const enemyDps = baseEnemyDps * scale;

    const ttk = timeToKill(stats, weapon, enemyHp);
    const surv = survivalSeconds(stats, enemyDps);

    if (ttk > surv) {
      died = true;
      break;
    }

    const ps = powerScore(stats, weapon);
    powerCurve.push(ps);

    const upgrade = rng.pick(["damage", "fireRate", "maxHp", "armor", "critChance", "critMult", "deflect"]);
    const factor = 1 + rng.next() * 0.2;

    if (upgrade === "damage") {
      stats.damage = num(stats.damage, 1) * factor;
    } else if (upgrade === "fireRate") {
      stats.fireRate = num(stats.fireRate, 1) * factor;
    } else if (upgrade === "maxHp") {
      stats.maxHp = num(stats.maxHp, BASE_STATS.maxHp) * factor;
    } else if (upgrade === "armor") {
      stats.armor = num(stats.armor, BASE_STATS.armor) + rng.next() * 2;
    } else if (upgrade === "critChance") {
      stats.critChance = num(stats.critChance, 0) + rng.next() * 0.05;
    } else if (upgrade === "critMult") {
      stats.critMult = num(stats.critMult, 1.5) * factor;
    } else if (upgrade === "deflect") {
      stats.deflect = num(stats.deflect, BASE_STATS.deflect) + rng.next() * 2;
    }

    build.push({ floor, upgrade, factor });
    floor++;
  }

  if (!died && powerCurve.length === 0) {
    powerCurve.push(powerScore(stats, weapon));
  }

  return {
    floorReached: Math.max(1, floor - (died ? 0 : 0)),
    died,
    powerCurve,
    build
  };
}