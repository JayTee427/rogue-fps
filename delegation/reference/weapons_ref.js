// REFERENCE — never shown to the worker.
export const ARCHETYPES = {
  sidearm:    { name: "Sidearm",    damage: 12, fireRate: 5,   magSize: 12, spread: 1, reloadTime: 1.2, projSpeed: 60, pellets: 1 },
  scattergun: { name: "Scattergun", damage: 9,  fireRate: 1.2, magSize: 6,  spread: 8, reloadTime: 2.0, projSpeed: 50, pellets: 8 },
  carbine:    { name: "Carbine",    damage: 18, fireRate: 8,   magSize: 30, spread: 2, reloadTime: 1.8, projSpeed: 70, pellets: 1 },
  railgun:    { name: "Railgun",    damage: 90, fireRate: 0.7, magSize: 3,  spread: 0, reloadTime: 2.5, projSpeed: 400, pellets: 1, pierce: 99, critMult: 3 },
  launcher:   { name: "Launcher",   damage: 60, fireRate: 1,   magSize: 4,  spread: 1, reloadTime: 2.2, projSpeed: 25, pellets: 1, splashRadius: 3, selfDamage: 0.5, arcs: true },
  beam:       { name: "Beam",       damage: 30, fireRate: 10,  magSize: 1,  spread: 0, reloadTime: 0,   projSpeed: 1000, pellets: 1, continuous: true, rampTo: 90, rampTime: 2, heatCap: 4 },
};

export const WEAPON_MODS = {
  ricochet:        { name: "Ricochet",          effects: { ricochet: true } },
  pierce:          { name: "Piercing",          effects: { pierce: { add: 1 } } },
  homing:          { name: "Seeker",            effects: { homing: { add: 0.1 } } },
  incendiary:      { name: "Incendiary",        effects: { onHitBurn: { add: 3 } } },
  cryo:            { name: "Cryo",              effects: { onHitSlow: { add: 0.25 } } },
  chain_lightning: { name: "Arc",               effects: { chainEveryN: { add: 6 } } },
  lifesteal:       { name: "Leech",             effects: { lifesteal: { add: 0.03 } } },
  big_mag:         { name: "Extended Mag",      effects: { magSize: { mul: 1.5 } } },
  fast_reload:     { name: "Quick Hands",       effects: { reloadTime: { mul: 0.6 } } },
  crit_chance:     { name: "Scoped",            effects: { critChance: { add: 0.15 } } },
  crit_damage:     { name: "Hollow Point",      effects: { critMult: { add: 0.5 } } },
  tight_spread:    { name: "Choke",             effects: { spread: { mul: 0.5 } } },
  wild_spread:     { name: "Sawn-off",          effects: { spread: { mul: 2 }, damage: { mul: 1.4 } } },
  fourth_free:     { name: "Economical",        effects: { everyNthFree: { add: 4 } } },
  floor_bounce:    { name: "Skip Rounds",       effects: { floorBounce: true } },
  big_bullets:     { name: "Slugs",             effects: { projSize: { mul: 1.8 } } },
  slow_heavy:      { name: "Heavy Rounds",      effects: { projSpeed: { mul: 0.7 }, damage: { mul: 1.3 } } },
  ads_tight:       { name: "Stabilizer",        effects: { adsSpread: { mul: 0.5 } } },
};

const RAR = ["common", "uncommon", "rare", "legendary"];
const MOD_COUNT = { common: [1, 1], uncommon: [1, 2], rare: [2, 3], legendary: [3, 3] };
const JITTER = ["damage", "fireRate", "magSize", "spread", "reloadTime", "projSpeed"];

function pickRarity(r, floor) {
  const d = Math.max(0, floor - 1);
  const w = [60, 28 + d * 4, 10 + d * 3, 2 + d * 1];
  const t = w.reduce((a, b) => a + b, 0);
  let x = r.next() * t;
  for (let i = 0; i < 4; i++) { if ((x -= w[i]) < 0) return RAR[i]; }
  return "legendary";
}

export function applyMods(stats, mods) {
  const out = { ...stats };
  const adds = {}, muls = {};
  for (const id of mods) {
    const m = WEAPON_MODS[id];
    if (!m) throw new Error(`unknown mod ${id}`);
    for (const [k, eff] of Object.entries(m.effects)) {
      if (eff === true) { out[k] = true; continue; }
      if (eff.add != null) adds[k] = (adds[k] ?? 0) + eff.add;
      if (eff.mul != null) muls[k] = (muls[k] ?? 1) * eff.mul;
    }
  }
  for (const k of new Set([...Object.keys(adds), ...Object.keys(muls)])) out[k] = ((out[k] ?? 0) + (adds[k] ?? 0)) * (muls[k] ?? 1);
  if (typeof out.magSize === "number") out.magSize = Math.max(1, Math.round(out.magSize));
  return out;
}

export function rollWeapon(r, archetype, floor) {
  const base = ARCHETYPES[archetype];
  if (!base) throw new Error(`unknown archetype ${archetype}`);
  const rarity = pickRarity(r, floor);
  const stats = { ...base };
  delete stats.name;
  for (const k of JITTER) {
    if (typeof stats[k] !== "number" || stats[k] === 0) continue;
    stats[k] = stats[k] * (0.9 + r.next() * 0.2);
  }
  stats.magSize = Math.max(1, Math.round(stats.magSize));
  const [lo, hi] = MOD_COUNT[rarity];
  const n = r.int(lo, hi);
  const mods = r.shuffle(Object.keys(WEAPON_MODS)).slice(0, n);
  return { archetype, rarity, mods, baseStats: stats, stats: applyMods(stats, mods) };
}
