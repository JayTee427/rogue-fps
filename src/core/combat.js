import { RNG } from "core/rng.js";

export function resolveHit(shot, target, stats, rng) {
  const hp = target.hp;
  const maxHp = target.maxHp;
  const armor = target.armor ?? 0;
  const statuses = target.statuses ?? [];

  let dmg = stats.damage;

  if (shot.isFirstShot && stats.firstShotMult) {
    dmg *= (1 + stats.firstShotMult);
  }
  if (shot.isLastShot && stats.lastShotMult) {
    dmg *= (1 + stats.lastShotMult);
  }

  const crit = shot.isHeadshot || (rng.next() < stats.critChance);
  if (crit) {
    dmg *= stats.critMult ?? 2;
  }

  dmg = Math.max(1, dmg - armor);

  let hpAfter = Math.max(0, hp - dmg);

  let executed = false;
  if ((stats.executeBelow ?? 0) > 0 && hpAfter > 0 && hpAfter <= maxHp * stats.executeBelow) {
    executed = true;
    hpAfter = 0;
  }

  const killed = hpAfter <= 0;
  const heal = dmg * (stats.lifesteal ?? 0);

  const statusesAfter = statuses.map(s => ({ ...s }));

  if ((stats.onHitBurn ?? 0) > 0) {
    const burnIndex = statusesAfter.findIndex(s => s.kind === "burn");
    if (burnIndex >= 0) {
      statusesAfter[burnIndex].duration += stats.onHitBurn;
    } else {
      statusesAfter.push({ kind: "burn", duration: stats.onHitBurn, dps: 5 });
    }
  }

  if ((stats.onHitSlow ?? 0) > 0) {
    const slowIndex = statusesAfter.findIndex(s => s.kind === "slow");
    if (slowIndex >= 0) {
      statusesAfter[slowIndex].duration = 2;
      statusesAfter[slowIndex].amount = Math.max(statusesAfter[slowIndex].amount, stats.onHitSlow);
    } else {
      statusesAfter.push({ kind: "slow", duration: 2, amount: stats.onHitSlow });
    }
  }

  return {
    damage: dmg,
    crit,
    executed,
    killed,
    hpAfter,
    heal,
    statusesAfter
  };
}

export function tickStatuses(target, dt) {
  const hp = target.hp;
  const statuses = target.statuses ?? [];

  let totalDamage = 0;
  let speedMult = 1;

  const statusesAfter = [];

  for (const status of statuses) {
    const copy = { ...status };

    if (copy.kind === "burn") {
      const tickDmg = copy.dps * Math.min(dt, copy.duration);
      totalDamage += tickDmg;
    } else if (copy.kind === "slow") {
      speedMult = Math.min(speedMult, 1 - copy.amount);
    }

    copy.duration -= dt;

    if (copy.duration > 0) {
      statusesAfter.push(copy);
    }
  }

  const hpAfter = Math.max(0, hp - totalDamage);
  const killed = hpAfter <= 0 && totalDamage > 0;

  return {
    damage: totalDamage,
    speedMult,
    hpAfter,
    killed,
    statusesAfter
  };
}