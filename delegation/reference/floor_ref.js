// REFERENCE — never shown to the worker.
export const ROOM_MODIFIERS = {
  low_gravity:   { name: "Low Gravity",   desc: "gravity halved" },
  darkness:      { name: "Darkness",      desc: "you can only see what you light" },
  swarm:         { name: "Swarm",         desc: "double enemies, half health" },
  no_dash:       { name: "Grounded",      desc: "dash disabled" },
  time_pressure: { name: "Countdown",     desc: "clear it in 60 seconds" },
};
export const HAZARD_TAGS = ["lava_floor", "turrets", "mines", "acid_pools", "collapsing"];
export const BOSSES = {
  custodian: { name: "The Custodian", hp: 1200 },
  chorus:    { name: "Chorus",        hp: 900 },
  landlord:  { name: "The Landlord",  hp: 1500 },
};
const BOSS_AFFIXES = ["armoured", "hasty", "regenerating", "explosive", "shielded"];
const REWARDS = ["item", "weapon", "heal", "shop", "curse"];
const REWARD_W = [50, 18, 14, 10, 8];

function pickW(r, items, w) {
  const t = w.reduce((a, b) => a + b, 0);
  let x = r.next() * t;
  for (let i = 0; i < items.length; i++) { if ((x -= w[i]) < 0) return items[i]; }
  return items[items.length - 1];
}

export function generateFloor(r, floorIndex, run) {
  const d = Math.max(0, floorIndex - 1);
  const rooms = [];
  for (let i = 0; i < 5; i++) {
    const modChance = Math.min(0.15 + d * 0.07, 0.6);
    let modifier = r.chance(modChance) ? r.pick(Object.keys(ROOM_MODIFIERS)) : null;
    if (i === 0 && (modifier === "no_dash" || modifier === "time_pressure")) modifier = null;
    const hazardTag = r.chance(0.35 + d * 0.03) ? r.pick(HAZARD_TAGS) : null;
    const eliteMax = floorIndex === 1 ? 1 : Math.min(1 + Math.floor(d / 2), 4);
    const eliteCount = r.chance(0.3 + d * 0.08) ? r.int(1, eliteMax) : 0;
    rooms.push({ index: i, modifier, hazardTag, eliteCount, rewardType: pickW(r, REWARDS, REWARD_W), doors: [] });
  }
  for (let i = 0; i < 4; i++) {
    const next = rooms[i + 1];
    const n = r.int(2, 3);
    rooms[i].doors = Array.from({ length: n }, () => ({
      leadsTo: i + 1,
      preview: { rewardType: next.rewardType, hazardTag: next.hazardTag, hasElite: next.eliteCount > 0 },
    }));
  }
  rooms[4].doors = [{ leadsTo: "boss", preview: null }];
  const bossId = r.pick(Object.keys(BOSSES));
  const boss = { id: bossId, name: BOSSES[bossId].name, affix: r.pick(BOSS_AFFIXES), hp: Math.round(BOSSES[bossId].hp * (1 + d * 0.35)) };
  return { index: floorIndex, rooms, boss };
}
