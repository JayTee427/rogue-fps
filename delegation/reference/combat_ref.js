// REFERENCE — never shown to the worker.
const BURN_DPS = 5;
const SLOW_DURATION = 2;

export function resolveHit(shot, target, stats, r) {
  let dmg = stats.damage;
  if (shot.isFirstShot && stats.firstShotMult) dmg *= 1 + stats.firstShotMult;
  if (shot.isLastShot && stats.lastShotMult) dmg *= 1 + stats.lastShotMult;
  const crit = shot.isHeadshot || (stats.critChance > 0 && r.next() < stats.critChance);
  if (crit) dmg *= stats.critMult ?? 2;
  dmg = Math.max(1, dmg - (target.armor ?? 0));

  let hpAfter = Math.max(0, target.hp - dmg);
  let executed = false;
  if (stats.executeBelow > 0 && hpAfter > 0 && hpAfter <= target.maxHp * stats.executeBelow) {
    executed = true; hpAfter = 0;
  }

  const statuses = target.statuses.map(s => ({ ...s }));
  if (stats.onHitBurn > 0) {
    const b = statuses.find(s => s.kind === "burn");
    if (b) b.duration += stats.onHitBurn; else statuses.push({ kind: "burn", duration: stats.onHitBurn, dps: BURN_DPS });
  }
  if (stats.onHitSlow > 0) {
    const s = statuses.find(x => x.kind === "slow");
    if (s) { s.duration = SLOW_DURATION; s.amount = Math.max(s.amount, stats.onHitSlow); }
    else statuses.push({ kind: "slow", duration: SLOW_DURATION, amount: stats.onHitSlow });
  }

  return {
    damage: dmg, crit, executed, killed: hpAfter <= 0, hpAfter,
    heal: dmg * (stats.lifesteal ?? 0), statusesAfter: statuses,
  };
}

export function tickStatuses(target, dt) {
  let damage = 0, speedMult = 1;
  const after = [];
  for (const s0 of target.statuses) {
    const s = { ...s0 };
    if (s.kind === "burn") damage += s.dps * Math.min(dt, s.duration);
    if (s.kind === "slow") speedMult = Math.min(speedMult, 1 - s.amount);
    s.duration -= dt;
    if (s.duration > 1e-9) after.push(s);
  }
  const hpAfter = Math.max(0, target.hp - damage);
  return { damage, speedMult, hpAfter, killed: hpAfter <= 0 && damage > 0, statusesAfter: after };
}
