export const ENEMY_ARCHETYPES = {
  skitter: { name: "Skitter", hp: 30, speed: 9, damage: 8, role: "melee", tell: "darts quickly" },
  sentinel: { name: "Sentinel", hp: 60, speed: 4, damage: 12, role: "ranged", tell: "holds position" },
  brute: { name: "Brute", hp: 220, speed: 3, damage: 35, role: "melee", tell: "heavy stomps" },
  popper: { name: "Popper", hp: 25, speed: 8, damage: 40, role: "suicide", tell: "explodes on sight" },
  warden: { name: "Warden", hp: 140, speed: 3.5, damage: 18, role: "shield", tell: "raises a barrier" },
  wisp: { name: "Wisp", hp: 40, speed: 7, damage: 15, role: "flyer", tell: "floats erratically" }
};

export const AFFIXES = {
  armoured: { name: "Armoured", minFloor: 1 },
  hasty: { name: "Hasty", minFloor: 1 },
  regenerating: { name: "Regenerating", minFloor: 1 },
  explosive: { name: "Explosive", minFloor: 2 },
  shielded: { name: "Shielded", minFloor: 2 },
  splitting: { name: "Splitting", minFloor: 3 },
  vampiric: { name: "Vampiric", minFloor: 3 }
};

export function scaleEnemy(archetype, floor, roomIndex, affix = null) {
  const base = ENEMY_ARCHETYPES[archetype];
  if (!base) throw new Error(`Unknown archetype: ${archetype}`);

  const d = Math.max(0, floor - 1);
  const room = Math.max(0, roomIndex);

  const hp = Math.round(base.hp * (1 + d * 0.32 + room * 0.04));
  const damage = base.damage * (1 + d * 0.15 + room * 0.03);
  const speed = base.speed;

  const result = {
    archetype,
    name: base.name,
    role: base.role,
    tell: base.tell,
    hp,
    maxHp: hp,
    damage,
    speed,
    armor: 0,
    affix
  };

  if (affix) {
    const aff = AFFIXES[affix];
    if (!aff) throw new Error(`Unknown affix: ${affix}`);

    if (affix === "armoured") {
      result.armor = 4 + d;
    } else if (affix === "hasty") {
      result.speed = base.speed * 1.4;
    } else if (affix === "regenerating") {
      result.regen = 1 + d * 0.2;
    } else if (affix === "shielded") {
      result.shield = 20 + d * 5;
    }
  }

  return result;
}

export function rollAffix(rng, floor) {
  const available = Object.keys(AFFIXES).filter(key => AFFIXES[key].minFloor <= floor);
  return rng.pick(available);
}

export function rollRoster(rng, floor, roomIndex, mods = {}) {
  const d = Math.max(0, floor - 1);
  const n = rng.int(3 + Math.floor(d * 0.6), 6 + Math.floor(d * 0.9));

  let pool;
  if (floor === 1) {
    pool = ["skitter", "sentinel", "popper", "wisp"];
  } else {
    pool = ["skitter", "sentinel", "brute", "popper", "warden", "wisp"];
  }

  const roster = [];
  for (let i = 0; i < n; i++) {
    roster.push(rng.pick(pool));
  }

  if (mods.swarm) {
    return roster.concat(roster);
  }

  return roster;
}