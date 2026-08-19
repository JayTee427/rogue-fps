// src/core/stats.js

export const BASE_STATS = {
  // NOTE: this table was once 113 entries long, the tail of it an anatomical
  // word list no code ever read. It crept back once already, because the guard
  // matched bare words and comments contain words. The guard now requires a
  // dotted read (`stats.key` style) outside the producer files, and
  // core/registry.js requires every key an item/weapon/synergy/pact declares
  // to appear here or in a HANDLED list. Add a key only with its consumer.

  // -- combat core --------------------------------------------------------
  maxHp: 100,
  damage: 1,             // multiplier on the weapon's damage
  fireRate: 1,
  critChance: 0.05,
  critMult: 2,
  spread: 1,
  pierce: 0,
  lifesteal: 0,          // fraction of damage dealt returned as health
  magazine: 0,           // bonus rounds on top of the weapon's magSize
  reloadMult: 1,
  noReload: false,
  freeShotChance: 0,
  firstShotMult: 0,
  lastShotMult: 0,
  everyNthDouble: 0,
  chainEveryN: 0,        // every Nth hit chains lightning
  blackHoleEveryN: 0,    // every Nth shot opens a singularity
  selfDamage: 0,         // fraction of damage dealt taken as burn (soulfire)
  teleportOnHit: 0,      // chance per hit to tear the target elsewhere

  // -- on-hit statuses (consumed by combat.resolveHit) --------------------
  onHitBurn: 0,
  onHitSlow: 0,
  executeBelow: 0,

  // -- defence ------------------------------------------------------------
  armor: 0,
  deflect: 0,
  thorns: 0,
  regen: 0,
  roomShield: 0,
  damageOnMeleeHit: 0,
  stillDamageTaken: 0,   // multiplier on damage taken while standing still
  noHeal: false,
  secondWind: false,
  floorRetry: false,

  // -- movement (read through the player-stats adapter in main.js) --------
  moveSpeed: 8,
  jumps: 1,
  extraJump: false,
  gravity: 1,
  airControl: false,
  slide: false,
  dashCooldown: 1.4,
  dashPhases: false,
  shortTeleport: 0,
  teleportOnDodge: 0,
  dashOnKill: false,

  // -- kills and economy --------------------------------------------------
  healOnKill: 0,
  onKillExplode: 0,
  gravityWell: 0,
  draftSize: 3,          // must default here: absent -> NaN rarity weights
  luck: 0,
  rarityShift: 0,
};

export function computeStats(base, held) {
  const result = { ...base };
  const seen = new Set();
  const adds = {};
  const muls = {};
  const trues = {};
  const deflects = [];

  for (const item of held) {
    const id = item.id;
    const stacks = item.stacks !== false;
    if (!stacks && seen.has(id)) continue;
    seen.add(id);

    const effects = item.effects || {};
    for (const key in effects) {
      const eff = effects[key];
      if (eff === true) {
        trues[key] = true;
      } else if (typeof eff === "object" && eff !== null) {
        if (eff.add !== undefined) {
          adds[key] = (adds[key] || 0) + eff.add;
        }
        if (eff.mul !== undefined) {
          muls[key] = (muls[key] || 1) * eff.mul;
        }
        if (key === "deflect" && stacks && eff.add !== undefined) {
          deflects.push(eff.add);
        }
      }
    }
  }

  for (const key in adds) {
    const baseVal = typeof result[key] === "number" ? result[key] : 0;
    result[key] = (baseVal + adds[key]) * (muls[key] || 1);
  }

  for (const key in muls) {
    if (!(key in adds)) {
      const baseVal = typeof result[key] === "number" ? result[key] : 0;
      result[key] = baseVal * muls[key];
    }
  }

  for (const key in trues) {
    result[key] = true;
  }

  if (result.critChance > 1) result.critChance = 1;
  if (result.maxHp < 1) result.maxHp = 1;

  if (deflects.length > 0) {
    let p = 0;
    for (const d of deflects) {
      p = 1 - (1 - p) * (1 - d);
    }
    result.deflect = p;
  }

  return result;
}