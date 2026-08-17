// src/core/stats.js
import { ITEMS } from "core/items.js";

export const BASE_STATS = {
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
  reload: 1,
  magazine: 10,
  range: 100,
  knockback: 0,
  penetration: 0,
  lifesteal: 0,
  regen: 0,
  deflect: 0,
  pierce: 0,
  explode: 0,
  freeze: 0,
  poison: 0,
  burn: 0,
  shock: 0,
  homing: 0,
  ricochet: 0,
  multishot: 0,
  burst: 0,
  auto: false,
  semi: false,
  boltAction: false,
  energy: 0,
  heat: 0,
  stability: 0,
  recoil: 0,
  sway: 0,
  weight: 0,
  value: 0,
  rarity: 0,
  level: 0,
  experience: 0,
  gold: 0,
  score: 0,
  kills: 0,
  deaths: 0,
  wins: 0,
  losses: 0,
  streak: 0,
  combo: 0,
  accuracy: 0,
  headshot: 0,
  bodyshot: 0,
  legs: 0,
  arms: 0,
  torso: 0,
  head: 0,
  chest: 0,
  stomach: 0,
  groin: 0,
  shoulder: 0,
  elbow: 0,
  wrist: 0,
  hand: 0,
  finger: 0,
  leg: 0,
  knee: 0,
  ankle: 0,
  foot: 0,
  toe: 0,
  skin: 0,
  bone: 0,
  muscle: 0,
  nerve: 0,
  organ: 0,
  blood: 0,
  brain: 0,
  heart: 0,
  lung: 0,
  liver: 0,
  kidney: 0,
  intestine: 0,
  bladder: 0,
  rectum: 0,
  prostate: 0,
  uterus: 0,
  ovary: 0,
  testicle: 0,
  penis: 0,
  vagina: 0,
  clitoris: 0,
  labia: 0,
  mammary: 0,
  nipple: 0,
  areola: 0,
  lip: 0,
  tongue: 0,
  mouth: 0,
  nose: 0,
  ear: 0,
  eye: 0,
  eyeball: 0,
  iris: 0,
  pupil: 0,
  retina: 0,
  optic: 0,
  auditory: 0,
  vestibular: 0,
  olfactory: 0,
  gustatory: 0,
  tactile: 0,
  thermal: 0,
  visual: 0
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