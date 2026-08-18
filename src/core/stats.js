// src/core/stats.js
import { ITEMS } from "core/items.js";

export const BASE_STATS = {
  // NOTE: this table was once 113 entries long, the tail of it an anatomical
  // word list with no relationship to the game - a generation that ran on and
  // was never read by anything. Keep it to stats the code actually consumes;
  // tests/integration/stats-hygiene.test.js fails if unused keys creep back in.
  maxHp: 100,
  damage: 1,
  fireRate: 1,
  moveSpeed: 8,
  critChance: 0.05,
  critMult: 2,
  spread: 1,
  // Read by draft.js on every reward roll. They MUST default here: an absent
  // stat arrives as undefined, `undefined * x` is NaN, and every rarity weight
  // going NaN collapsed floor-1 drafts to legendaries only. (Integration test
  // tests/integration/draft-from-run.test.js pins this.)
  draftSize: 3,
  luck: 0,
  rarityShift: 0,
  armor: 0,
  magazine: 0,        // bonus rounds added to the weapon's magazine
  reload: 1,
  range: 100,
  lifesteal: 0,
  regen: 0,
  deflect: 0,
  pierce: 0,
  explode: 0,
  burn: 0,
  ricochet: 0,
  burst: 0,
  auto: false,
  energy: 0,
  heat: 0,
  recoil: 0,
  sway: 0,
  weight: 0,
  value: 0,
  rarity: 0,
  level: 0,
  gold: 0,
  score: 0,
  kills: 0,
  combo: 0,
  accuracy: 0,
  headshot: 0,
  head: 0,
  hand: 0,
  foot: 0,
  skin: 0,
  nose: 0,
  eye: 0,
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