// src/core/weapons.js

export const ARCHETYPES = {
  sidearm: {
    name: "Sidearm",
    damage: 12,
    fireRate: 5,
    magSize: 12,
    spread: 1,
    reloadTime: 1.5,
    projSpeed: 80,
    pellets: 1
  },
  scattergun: {
    name: "Scattergun",
    damage: 9,
    fireRate: 1.2,
    magSize: 6,
    spread: 8,
    reloadTime: 2.0,
    projSpeed: 60,
    pellets: 8
  },
  carbine: {
    name: "Carbine",
    damage: 18,
    fireRate: 8,
    magSize: 30,
    spread: 2,
    reloadTime: 2.2,
    projSpeed: 90,
    pellets: 1
  },
  railgun: {
    name: "Railgun",
    damage: 90,
    fireRate: 0.7,
    magSize: 3,
    spread: 0,
    reloadTime: 2.5,
    projSpeed: 200,
    pellets: 1,
    pierce: 99,
    critMult: 3
  },
  launcher: {
    name: "Launcher",
    damage: 60,
    fireRate: 1,
    magSize: 4,
    spread: 0,
    reloadTime: 3.0,
    projSpeed: 40,
    pellets: 1,
    splashRadius: 3,
    selfDamage: 0.5,
    arcs: true
  },
  beam: {
    name: "Beam",
    damage: 30,
    fireRate: 10,
    magSize: 1,
    spread: 0,
    reloadTime: 1.0,
    projSpeed: 0,
    pellets: 1,
    continuous: true,
    rampTo: 90,
    rampTime: 2,
    heatCap: 4
  }
};

export const WEAPON_MODS = {
  ricochet: { name: "Ricochet", effects: { ricochet: true } },
  pierce: { name: "Pierce", effects: { pierce: { add: 1 } } },
  incendiary: { name: "Incendiary", effects: { fireDamage: { add: 5 }, ignite: true } },
  cryo: { name: "Cryo", effects: { iceDamage: { add: 5 }, slow: { add: 0.3 } } },
  chain_lightning: { name: "Chain Lightning", effects: { shockDamage: { add: 8 }, chain: { add: 2 } } },
  lifesteal: { name: "Lifesteal", effects: { lifesteal: { add: 0.1 } } },
  big_mag: { name: "Big Mag", effects: { magSize: { mul: 1.5 } } },
  fast_reload: { name: "Fast Reload", effects: { reloadTime: { mul: 0.6 } } },
  crit_chance: { name: "Critical Chance", effects: { critChance: { add: 0.15 } } },
  crit_damage: { name: "Critical Damage", effects: { critMult: { add: 0.5 } } },
  tight_spread: { name: "Tight Spread", effects: { spread: { mul: 0.5 } } },
  hollow_point: { name: "Hollow Point", effects: { damage: { mul: 1.2 }, magSize: { mul: 0.8 } } },
  stabilizer: { name: "Stabilizer", effects: { recoil: { mul: 0.7 }, spread: { mul: 0.8 } } },
  extended_barrel: { name: "Extended Barrel", effects: { projSpeed: { mul: 1.3 }, damage: { add: 3 } } },
  quickdraw: { name: "Quickdraw", effects: { fireRate: { mul: 1.15 }, reloadTime: { mul: 0.85 } } },
  armor_piercing: { name: "Armor Piercing", effects: { pierce: { add: 2 }, damage: { mul: 1.1 } } },
  volatile: { name: "Volatile", effects: { splashRadius: { add: 1 }, selfDamage: { mul: 1.5 } } }
};

export function applyMods(stats, modIds) {
  if (!Array.isArray(modIds) || modIds.length === 0) {
    return { ...stats };
  }

  const result = { ...stats };

  for (const id of modIds) {
    const mod = WEAPON_MODS[id];
    if (!mod) {
      throw new Error(`Unknown weapon mod id: ${id}`);
    }

    for (const [key, effect] of Object.entries(mod.effects)) {
      if (effect === true) {
        result[key] = true;
      } else if (typeof effect === 'object' && effect !== null) {
        if (effect.add !== undefined) {
          if (typeof result[key] === 'number') {
            result[key] += effect.add;
          } else {
            result[key] = effect.add;
          }
        }
        if (effect.mul !== undefined) {
          if (typeof result[key] === 'number') {
            result[key] *= effect.mul;
          } else {
            result[key] = effect.mul;
          }
        }
      }
    }
  }

  if (typeof result.magSize === 'number') {
    result.magSize = Math.max(1, Math.round(result.magSize));
  }

  return result;
}

export function rollWeapon(rng, archetype, floor) {
  if (!ARCHETYPES[archetype]) {
    throw new Error(`Unknown weapon archetype: ${archetype}`);
  }

  const d = Math.max(0, floor - 1);
  const rarities = ['common', 'uncommon', 'rare', 'legendary'];
  const weights = [60, 28 + d * 4, 10 + d * 3, 2 + d];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const roll = rng.next() * totalWeight;

  let cumulative = 0;
  let rarity = 'common';
  for (let i = 0; i < rarities.length; i++) {
    cumulative += weights[i];
    if (roll < cumulative) {
      rarity = rarities[i];
      break;
    }
  }

  const baseArchetype = ARCHETYPES[archetype];
  const baseStats = {};

  for (const [key, value] of Object.entries(baseArchetype)) {
    if (key === 'name') continue;
    if (typeof value === 'number' && value !== 0) {
      const jitter = 0.9 + rng.next() * 0.2;
      baseStats[key] = value * jitter;
    } else {
      baseStats[key] = value;
    }
  }

  if (typeof baseStats.magSize === 'number') {
    baseStats.magSize = Math.max(1, Math.round(baseStats.magSize));
  }

  let modCount;
  switch (rarity) {
    case 'common':
      modCount = 1;
      break;
    case 'uncommon':
      modCount = rng.int(1, 2);
      break;
    case 'rare':
      modCount = rng.int(2, 3);
      break;
    case 'legendary':
      modCount = 3;
      break;
    default:
      modCount = 1;
  }

  const modKeys = Object.keys(WEAPON_MODS);
  const shuffled = rng.shuffle(modKeys);
  const mods = shuffled.slice(0, modCount);

  const stats = applyMods(baseStats, mods);

  return {
    archetype,
    rarity,
    mods,
    baseStats,
    stats
  };
}