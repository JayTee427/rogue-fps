import { ENEMY_ARCHETYPES } from "core/enemies.js";

const EXTRA_FOES = {
  lurker: {
    id: "lurker",
    name: "Lurker",
    hp: 50,
    damage: 7,
    speed: 5.4,
    minFloor: 1,
    role: "melee",
    tell: "emerges from shadow"
  },
  sniper: {
    id: "sniper",
    name: "Sniper",
    hp: 45,
    damage: 20,
    speed: 5,
    minFloor: 3,
    role: "ranged",
    tell: "takes careful aim"
  },
  shaman: {
    id: "shaman",
    name: "Shaman",
    hp: 70,
    damage: 12,
    speed: 4,
    minFloor: 5,
    role: "support",
    tell: "chants dark words"
  },
  swarm: {
    id: "swarm",
    name: "Swarm",
    hp: 20,
    damage: 6,
    speed: 10,
    minFloor: 2,
    role: "swarm",
    tell: "buzzes in numbers"
  }
};

function sanitizeFloor(floor) {
  if (typeof floor !== "number" || !Number.isFinite(floor) || floor < 1) {
    return 1;
  }
  return Math.floor(floor);
}

function sanitizeRoomIndex(roomIndex) {
  if (typeof roomIndex !== "number" || !Number.isFinite(roomIndex) || roomIndex < 0) {
    return 0;
  }
  return Math.floor(roomIndex);
}

export function scaleFoe(id, floor, roomIndex) {
  const foe = EXTRA_FOES[id] || ENEMY_ARCHETYPES[id];
  if (!foe) {
    throw new Error(`Unknown foe id: ${id}`);
  }

  const safeFloor = sanitizeFloor(floor);
  const safeRoom = sanitizeRoomIndex(roomIndex);

  const hp = Math.max(1, Math.round(foe.hp * (1 + safeFloor * 0.1 + safeRoom * 0.05)));
  const damage = Math.max(1, Math.round(foe.damage * (1 + safeFloor * 0.1)));
  const speed = foe.speed;

  return {
    archetype: id,
    name: foe.name,
    hp,
    maxHp: hp,
    damage,
    speed,
    role: foe.role,
    tell: foe.tell
  };
}

export function foeRoster(rng, floor, roomIndex) {
  const safeFloor = sanitizeFloor(floor);
  const safeRoom = sanitizeRoomIndex(roomIndex);

  const allFoes = { ...ENEMY_ARCHETYPES, ...EXTRA_FOES };
  const eligible = Object.values(allFoes).filter(f => f.minFloor <= safeFloor);

  if (eligible.length === 0) {
    return ["skitter"];
  }

  const count = 2 + safeRoom % 3;
  const selected = [];

  for (let i = 0; i < count; i++) {
    const foe = rng.pick(eligible);
    selected.push(foe.id);
  }

  return selected;
}

export { EXTRA_FOES };