import { ITEM_BY_ID } from "core/items.js";

export const HANDLED = [
  "chestLootBonus",
  "consumableEfficiency",
  "damageReduction",
  "dualWield",
  "enemyDetect",
  "enemyGoldDrop",
  "fallDamage",
  "fallDamageReduction",
  "friendlyFire",
  "goldFind",
  "headshotDamage",
  "healthDecay",
  "hpRegen",
  "infiniteAmmo",
  "itemCloneChance",
  "itemGlow",
  "mapReveal",
  "rareDropChance",
  "rerollCount",
  "slideDistance",
  "staminaDrain",
  "swapSpeed",
  "takeDamageOverTime",
  "weaponSize"
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

function sumAdd(held, key, def = 0) {
  if (!Array.isArray(held)) return def;
  let total = def;
  for (const id of held) {
    const eff = ITEM_BY_ID[id]?.effects?.[key];
    if (eff && typeof eff.add === "number") total += eff.add;
  }
  return total;
}

function sumMul(held, key, def = 1) {
  if (!Array.isArray(held)) return def;
  let total = def;
  for (const id of held) {
    const eff = ITEM_BY_ID[id]?.effects?.[key];
    if (eff && typeof eff.mul === "number") total *= eff.mul;
  }
  return total;
}

export function passiveMods(held) {
  const mods = {
    goldMult: 1,
    headshotMult: 1,
    damageReduction: 0,
    regenPerSec: 0,
    rareDropMult: 1,
    rerolls: 0,
    swapSpeedMult: 1,
    slideMult: 1,
    fallDamageMult: 1,
    consumableMult: 1,
    detectRange: 0,
    mapReveal: false,
    itemGlow: false,
    infiniteAmmo: false,
    dualWield: false,
    chestLootMult: 1,
    fallDamageReduction: 1,
    friendlyFire: false,
    healthDecay: 0,
    itemCloneChance: 0,
    staminaDrain: 0,
    takeDamageOverTime: 0,
    weaponSizeMult: 1
  };

  // goldFind -> goldMult
  mods.goldMult = sumMul(held, "goldFind", 1);

  // enemyGoldDrop -> goldMult (additive bonus)
  mods.goldMult += sumAdd(held, "enemyGoldDrop", 0);

  // headshotDamage -> headshotMult
  mods.headshotMult = sumMul(held, "headshotDamage", 1);

  // damageReduction with diminishing returns
  const drAdd = sumAdd(held, "damageReduction", 0);
  const drCount = has(held, "damageReduction");
  if (drCount > 0) {
    mods.damageReduction = 1 - Math.pow(1 - drAdd / drCount, drCount);
    if (mods.damageReduction >= 1) mods.damageReduction = 0.999;
  }

  // hpRegen -> regenPerSec
  mods.regenPerSec = sumAdd(held, "hpRegen", 0);

  // rareDropChance -> rareDropMult
  mods.rareDropMult = 1 + sumAdd(held, "rareDropChance", 0);

  // rerollCount -> rerolls
  mods.rerolls = sumAdd(held, "rerollCount", 0);

  // swapSpeed -> swapSpeedMult
  mods.swapSpeedMult = sumMul(held, "swapSpeed", 1);

  // slideDistance -> slideMult
  mods.slideMult = sumMul(held, "slideDistance", 1);

  // fallDamage -> fallDamageMult
  mods.fallDamageMult = sumMul(held, "fallDamage", 1);

  // consumableEfficiency -> consumableMult
  mods.consumableMult = sumMul(held, "consumableEfficiency", 1);

  // enemyDetect -> detectRange
  mods.detectRange = sumAdd(held, "enemyDetect", 0);

  // mapReveal
  if (has(held, "mapReveal") > 0) {
    mods.mapReveal = true;
  }

  // itemGlow
  if (has(held, "itemGlow") > 0) {
    mods.itemGlow = true;
  }

  // infiniteAmmo
  if (has(held, "infiniteAmmo") > 0) {
    mods.infiniteAmmo = true;
  }

  // dualWield
  if (has(held, "dualWield") > 0) {
    mods.dualWield = true;
  }

  // chestLootBonus -> chestLootMult
  mods.chestLootMult = sumMul(held, "chestLootBonus", 1);

  // fallDamageReduction -> fallDamageReduction
  mods.fallDamageReduction = sumMul(held, "fallDamageReduction", 1);

  // friendlyFire
  if (has(held, "friendlyFire") > 0) {
    mods.friendlyFire = true;
  }

  // healthDecay
  mods.healthDecay = sumAdd(held, "healthDecay", 0);

  // itemCloneChance
  mods.itemCloneChance = sumAdd(held, "itemCloneChance", 0);

  // staminaDrain
  mods.staminaDrain = sumAdd(held, "staminaDrain", 0);

  // takeDamageOverTime
  mods.takeDamageOverTime = sumAdd(held, "takeDamageOverTime", 0);

  // weaponSize -> weaponSizeMult
  mods.weaponSizeMult = sumMul(held, "weaponSize", 1);

  return mods;
}