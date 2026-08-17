import { ITEMS } from "core/items.js";

export const RARITY_WEIGHTS = { common: 60, uncommon: 28, rare: 10, legendary: 2 };

const TIERS = ["common", "uncommon", "rare", "legendary"];

function getEligibleItems(run) {
  const heldSet = new Set(run.held);
  return ITEMS.filter((item) => {
    if (!item.stacks && heldSet.has(item.id)) return false;
    if (item.requires && !heldSet.has(item.requires)) return false;
    if (item.rarity === "cursed" && !run.cursesEnabled) return false;
    return true;
  });
}

function getTierWeights(rng, run) {
  const floorFactor = (run.floor - 1) * 0.15;
  const luckFactor = run.stats.luck * 1.5;
  const shift = run.stats.rarityShift || 0;

  const weights = {};
  for (let i = 0; i < TIERS.length; i++) {
    if (i < shift) continue;
    const base = RARITY_WEIGHTS[TIERS[i]] || 0;
    const multiplier = 1 + i * (floorFactor + luckFactor);
    weights[TIERS[i]] = base * multiplier;
  }

  if (run.cursesEnabled) {
    weights["cursed"] = 8;
  }

  return weights;
}

function pickTier(rng, weights) {
  const keys = Object.keys(weights);
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  let r = rng.next() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

export function draftRewards(rng, run, n) {
  if (n == null) {
    n = (run.stats && run.stats.draftSize) || 3;
  }

  const eligible = getEligibleItems(run);
  const result = [];
  const used = new Set();

  for (let i = 0; i < n; i++) {
    const weights = getTierWeights(rng, run);
    const tier = pickTier(rng, weights);

    let pool = eligible.filter(
      (item) => item.rarity === tier && !used.has(item.id)
    );

    if (pool.length === 0) {
      const availableTiers = Object.keys(weights).filter((t) =>
        eligible.some((item) => item.rarity === t && !used.has(item.id))
      );
      if (availableTiers.length === 0) break;
      const fallbackTier = rng.pick(availableTiers);
      pool = eligible.filter(
        (item) => item.rarity === fallbackTier && !used.has(item.id)
      );
    }

    if (pool.length === 0) break;

    const chosen = rng.pick(pool);
    used.add(chosen.id);
    result.push(chosen);
  }

  return result;
}