// REFERENCE — never shown to the worker.
export const ENEMY_ARCHETYPES = {
  skitter:  { name: "Skitter",  hp: 30,  speed: 9,   damage: 8,  role: "melee",   tell: "chittering, red eyes" },
  sentinel: { name: "Sentinel", hp: 60,  speed: 4,   damage: 12, role: "ranged",  tell: "laser sight before firing" },
  brute:    { name: "Brute",    hp: 220, speed: 3,   damage: 35, role: "melee",   tell: "roars and glows before charging" },
  popper:   { name: "Popper",   hp: 25,  speed: 8,   damage: 40, role: "suicide", tell: "beeping that accelerates" },
  warden:   { name: "Warden",   hp: 140, speed: 3.5, damage: 18, role: "shield",  tell: "shield hum" },
  wisp:     { name: "Wisp",     hp: 40,  speed: 7,   damage: 15, role: "flyer",   tell: "high whine" },
};
export const AFFIXES = {
  armoured:     { name: "Armoured",     minFloor: 1 },
  hasty:        { name: "Hasty",        minFloor: 1 },
  regenerating: { name: "Regenerating", minFloor: 1 },
  explosive:    { name: "Explosive",    minFloor: 2 },
  shielded:     { name: "Shielded",     minFloor: 2 },
  splitting:    { name: "Splitting",    minFloor: 3 },
  vampiric:     { name: "Vampiric",     minFloor: 3 },
};

export function scaleEnemy(archetype, floor, roomIndex, affix = null) {
  const a = ENEMY_ARCHETYPES[archetype];
  if (!a) throw new Error(`unknown enemy ${archetype}`);
  const d = Math.max(0, floor - 1), room = Math.max(0, roomIndex);
  const hpMul = 1 + d * 0.32 + room * 0.04;
  const dmgMul = 1 + d * 0.15 + room * 0.03;
  const e = {
    archetype, name: a.name, role: a.role, tell: a.tell,
    hp: Math.round(a.hp * hpMul), damage: Math.round(a.damage * dmgMul * 100) / 100,
    speed: a.speed, armor: 0, affix: null,
  };
  e.maxHp = e.hp;
  if (affix) {
    if (!AFFIXES[affix]) throw new Error(`unknown affix ${affix}`);
    e.affix = affix;
    if (affix === "armoured") e.armor = 4 + d;
    if (affix === "hasty") e.speed = a.speed * 1.4;
    if (affix === "regenerating") e.regen = Math.max(1, Math.round(e.maxHp * 0.02));
    if (affix === "shielded") e.shield = Math.round(e.maxHp * 0.5);
  }
  return e;
}

export function rollAffix(r, floor) {
  const pool = Object.keys(AFFIXES).filter(k => AFFIXES[k].minFloor <= floor);
  return r.pick(pool);
}

export function rollRoster(r, floor, roomIndex, mods = {}) {
  const d = Math.max(0, floor - 1);
  const n = r.int(3 + Math.floor(d * 0.6), 6 + Math.floor(d * 0.9));
  const pool = ["skitter", "skitter", "sentinel", "popper", "wisp"];
  if (floor >= 2) pool.push("warden", "brute", "sentinel");
  if (floor >= 4) pool.push("brute");
  let out = Array.from({ length: n }, () => r.pick(pool));
  if (mods.swarm) out = out.concat(out);
  return out;
}
