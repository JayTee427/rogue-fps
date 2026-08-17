import { ITEMS } from "core/items.js";

export const ROOM_MODIFIERS = {
  low_gravity: { name: "Low Gravity", desc: "Jump higher, move slower" },
  darkness: { name: "Darkness", desc: "Vision is severely limited" },
  swarm: { name: "Swarm", desc: "More enemies spawn" },
  no_dash: { name: "No Dash", desc: "Dashing is disabled" },
  time_pressure: { name: "Time Pressure", desc: "Timer counts down" }
};

export const HAZARD_TAGS = ["lava_floor", "turrets", "mines", "acid_pools", "collapsing"];

export const BOSSES = {
  custodian: { name: "Custodian", hp: 120 },
  chorus: { name: "Chorus", hp: 100 },
  landlord: { name: "Landlord", hp: 140 }
};

const AFFIXES = ["armoured", "hasty", "regenerating", "explosive", "shielded"];

const REWARD_WEIGHTS = [
  { type: "item", weight: 5 },
  { type: "weapon", weight: 3 },
  { type: "heal", weight: 2 },
  { type: "shop", weight: 1 },
  { type: "curse", weight: 1 }
];

function weightedPick(rng, weightedList) {
  const total = weightedList.reduce((sum, w) => sum + w.weight, 0);
  let r = rng.next() * total;
  for (const entry of weightedList) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return weightedList[weightedList.length - 1].type;
}

function generateRoom(rng, floorIndex, roomIndex) {
  const d = Math.max(0, floorIndex - 1);
  const modifierChance = Math.min(0.15 + d * 0.07, 0.6);
  let modifier = null;
  if (rng.chance(modifierChance)) {
    const possibleModifiers = Object.keys(ROOM_MODIFIERS);
    modifier = rng.pick(possibleModifiers);
    if (roomIndex === 0 && (modifier === "no_dash" || modifier === "time_pressure")) {
      modifier = null;
    }
  }

  const hazardTag = rng.chance(0.3) ? rng.pick(HAZARD_TAGS) : null;

  let eliteCount = 0;
  if (floorIndex === 1) {
    eliteCount = rng.chance(0.5) ? 1 : 0;
  } else {
    const maxElites = Math.min(4, Math.floor(d / 2) + 1);
    eliteCount = rng.int(0, maxElites);
  }

  const rewardType = weightedPick(rng, REWARD_WEIGHTS);

  return {
    index: roomIndex,
    modifier,
    hazardTag,
    eliteCount,
    rewardType,
    doors: []
  };
}

export function generateFloor(rng, floorIndex, run) {
  const rooms = [];
  for (let i = 0; i < 5; i++) {
    rooms.push(generateRoom(rng, floorIndex, i));
  }

  for (let i = 0; i < 4; i++) {
    const nextRoom = rooms[i + 1];
    const doorCount = rng.int(2, 3);
    const doors = [];
    for (let j = 0; j < doorCount; j++) {
      doors.push({
        leadsTo: i + 1,
        preview: {
          rewardType: nextRoom.rewardType,
          hazardTag: nextRoom.hazardTag,
          hasElite: nextRoom.eliteCount > 0
        }
      });
    }
    rooms[i].doors = doors;
  }

  rooms[4].doors = [
    {
      leadsTo: "boss",
      preview: null
    }
  ];

  const d = Math.max(0, floorIndex - 1);
  const bossId = rng.pick(Object.keys(BOSSES));
  const boss = {
    id: bossId,
    name: BOSSES[bossId].name,
    affix: rng.pick(AFFIXES),
    hp: Math.round(BOSSES[bossId].hp * (1 + d * 0.35))
  };

  return {
    index: floorIndex,
    rooms,
    boss
  };
}