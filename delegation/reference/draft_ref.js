// REFERENCE — never shown to the worker.
import { ITEMS } from "./items_ref.js";

export const RARITY_WEIGHTS = { common: 60, uncommon: 28, rare: 10, legendary: 2 };
const TIERS = ["common", "uncommon", "rare", "legendary"];

function weightsFor(run) {
  const depth = Math.max(0, (run.floor ?? 1) - 1);
  const luck = run.stats?.luck ?? 0;
  const shift = run.stats?.rarityShift ?? 0;
  const w = {};
  for (const t of TIERS) {
    const idx = TIERS.indexOf(t);
    // deeper floors and luck move weight up the ladder
    let v = RARITY_WEIGHTS[t] * (1 + idx * (depth * 0.15 + luck * 1.5));
    if (idx < shift) v = 0;            // Greed: drop tiers below the shift
    w[t] = v;
  }
  if (run.cursesEnabled) w.cursed = 8;
  return w;
}

function pickTier(r, w) {
  const entries = Object.entries(w).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let x = r.next() * total;
  for (const [t, v] of entries) { if ((x -= v) < 0) return t; }
  return entries[entries.length - 1][0];
}

export function draftRewards(r, run, n) {
  const count = n ?? run.stats?.draftSize ?? 3;
  const held = run.held ?? [];
  const eligible = ITEMS.filter(i =>
    (i.stacks || !held.includes(i.id)) &&
    (!i.requires || held.includes(i.requires)) &&
    (i.rarity !== "cursed" || run.cursesEnabled)
  );
  const w = weightsFor(run);
  const out = [];
  const taken = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 500) {
    const tier = pickTier(r, w);
    const pool = eligible.filter(i => i.rarity === tier && !taken.has(i.id));
    if (!pool.length) {
      // fall back to any tier still with candidates
      const any = eligible.filter(i => !taken.has(i.id) && w[i.rarity] > 0);
      if (!any.length) break;
      const it = r.pick(any); taken.add(it.id); out.push(it); continue;
    }
    const it = r.pick(pool); taken.add(it.id); out.push(it);
  }
  return out;
}
