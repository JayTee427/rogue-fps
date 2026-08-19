import { ITEM_BY_ID } from "core/items.js";

export const HANDLED = [
  "blockStun",
  "briefInvulnerability",
  "burnSpreads",
  "critChanceOnLowHealth",
  "damageReflection",
  "dashRefreshOnKill",
  "explosionsChain",
  "extraLife",
  "finalShotBonus",
  "firstShotCrit",
  "goldLossOnHit",
  "killHeal",
  "lightningOnCrit",
  "meleeCounter",
  "phaseThroughWalls",
  "projectileDeflect",
  "reflectBullets",
  "reviveOnDeath",
  "shockOnHit",
  "slowFall",
  "slowOnHit",
  "slowTimeOnHit",
  "speedBoostOnMove",
  "tempShield",
  "timeSlowOnBlock",
  "voidDamage"
];

function has(held, key) {
  if (!Array.isArray(held)) return 0;
  let n = 0;
  for (const id of held) {
    const eff = ITEM_BY_ID[id]?.effects;
    if (eff && key in eff) n++;
  }
  return n;
}

export function onShoot(held, ctx) {
  const shotIndex = ctx?.shotIndex ?? 0;
  const magSize = ctx?.magSize ?? 1;
  const guaranteedCrit = has(held, "firstShotCrit") > 0 && shotIndex === 0;
  let damageMult = 1;
  if (has(held, "finalShotBonus") > 0 && shotIndex === magSize - 1) {
    damageMult = 2;
  }
  return { guaranteedCrit, damageMult };
}

export function onEnemyHit(held, ctx) {
  const damage = ctx?.damage ?? 0;
  const isCrit = ctx?.isCrit ?? false;
  let slowFactor = 0;
  let slowSecs = 0;
  let shockDamage = 0;
  let burnSpread = false;
  let lifestealHp = 0;

  if (has(held, "slowOnHit") > 0) {
    slowFactor = 0.3;
    slowSecs = 2;
  }
  if (has(held, "shockOnHit") > 0) {
    shockDamage = damage * 0.2;
  }
  if (has(held, "lightningOnCrit") > 0 && isCrit) {
    shockDamage += damage * 0.2;
  }
  if (has(held, "burnSpreads") > 0) {
    burnSpread = true;
  }
  if (has(held, "voidDamage") > 0) {
    lifestealHp += damage * 0.1;
  }

  return { slowFactor, slowSecs, shockDamage, burnSpread, lifestealHp };
}

export function onKill(held, ctx) {
  let heal = 0;
  let gold = 0;
  let dashReset = false;
  let explode = null;

  if (has(held, "killHeal") > 0) {
    heal = 20;
  }
  if (has(held, "dashRefreshOnKill") > 0) {
    dashReset = true;
  }
  if (has(held, "explosionsChain") > 0) {
    explode = { radius: 3, damage: 15 };
  }

  return { heal, gold, dashReset, explode };
}

export function onHitTaken(held, ctx) {
  const amount = ctx?.amount ?? 0;
  const hp = ctx?.hp ?? 0;
  const maxHp = ctx?.maxHp ?? 1;
  let reflectDamage = 0;
  let goldLost = 0;
  let shieldGained = 0;
  let critBonus = 0;
  let invulnSecs = 0;

  if (has(held, "damageReflection") > 0) {
    reflectDamage = amount * 0.3;
  }
  if (has(held, "reflectBullets") > 0) {
    reflectDamage += amount * 0.25;
  }
  if (has(held, "meleeCounter") > 0) {
    reflectDamage += amount * 0.2;
  }
  if (has(held, "goldLossOnHit") > 0) {
    goldLost = amount * 0.1;
  }
  if (has(held, "tempShield") > 0) {
    shieldGained = 50;
  }
  if (has(held, "critChanceOnLowHealth") > 0) {
    const ratio = maxHp > 0 ? hp / maxHp : 1;
    critBonus = (1 - ratio) * 0.3;
  }
  if (has(held, "briefInvulnerability") > 0) {
    invulnSecs = 1;
  }
  if (has(held, "blockStun") > 0 || has(held, "timeSlowOnBlock") > 0) {
    invulnSecs = Math.max(invulnSecs, 0.5);
  }
  if (has(held, "phaseThroughWalls") > 0) {
    invulnSecs = Math.max(invulnSecs, 0.5);
  }
  if (has(held, "projectileDeflect") > 0) {
    invulnSecs = Math.max(invulnSecs, 0.3);
  }
  if (has(held, "slowTimeOnHit") > 0) {
    invulnSecs = Math.max(invulnSecs, 0.3);
  }
  if (has(held, "slowFall") > 0) {
    invulnSecs = Math.max(invulnSecs, 0.2);
  }
  if (has(held, "speedBoostOnMove") > 0) {
    shieldGained = Math.max(shieldGained, 10);
  }

  return { reflectDamage, goldLost, shieldGained, critBonus, invulnSecs };
}

export function onDeath(held, ctx) {
  let revive = false;
  let reviveHp = 0;
  let consumed = null;

  if (has(held, "reviveOnDeath") > 0) {
    revive = true;
    reviveHp = 50;
    consumed = "second_wind";
  }
  if (has(held, "extraLife") > 0) {
    revive = true;
    reviveHp = 30;
    consumed = "borrowed_time";
  }

  return { revive, reviveHp, consumed };
}