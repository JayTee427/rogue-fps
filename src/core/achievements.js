// src/core/achievements.js

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v) => !!v;

export const ACHIEVEMENTS = {
  floor5: {
    id: "floor5",
    name: "Deep Delver",
    desc: "Reach floor 5.",
    tier: "bronze",
    test: (s) => num(s.floorsCleared) >= 5,
  },
  floor9: {
    id: "floor9",
    name: "Bottom Dweller",
    desc: "Reach floor 9.",
    tier: "gold",
    test: (s) => num(s.floorsCleared) >= 9,
  },
  noDamage: {
    id: "noDamage",
    name: "Untouchable",
    desc: "Clear a floor without taking damage.",
    tier: "silver",
    test: (s) => num(s.damageTaken) === 0 && num(s.floorsCleared) >= 1,
  },
  headhunter: {
    id: "headhunter",
    name: "Headhunter",
    desc: "Land 100 headshots in a run.",
    tier: "silver",
    test: (s) => num(s.headshots) >= 100,
  },
  headshotMaster: {
    id: "headshotMaster",
    name: "Dead Eye",
    desc: "Land 500 headshots in a run.",
    tier: "gold",
    test: (s) => num(s.headshots) >= 500,
  },
  greedy: {
    id: "greedy",
    name: "Treasure Hoarder",
    desc: "Extract with 8 or more items held.",
    tier: "bronze",
    test: (s) => bool(s.extracted) && arr(s.itemsHeld).length >= 8,
  },
  cursed: {
    id: "cursed",
    name: "Hex Collector",
    desc: "Complete a run holding 3 curses.",
    tier: "silver",
    test: (s) => num(s.curses) >= 3,
  },
  synergyMaster: {
    id: "synergyMaster",
    name: "Synergist",
    desc: "Trigger 3 synergies at once.",
    tier: "silver",
    test: (s) => num(s.synergies) >= 3,
  },
  highScore: {
    id: "highScore",
    name: "Score Champion",
    desc: "Bank 10000 score.",
    tier: "bronze",
    test: (s) => num(s.score) >= 10000,
  },
  millionaire: {
    id: "millionaire",
    name: "Millionaire",
    desc: "Bank 500000 score.",
    tier: "gold",
    test: (s) => num(s.score) >= 500000,
  },
  bossRush: {
    id: "bossRush",
    name: "Boss Rush",
    desc: "Kill 5 bosses in a run.",
    tier: "silver",
    test: (s) => num(s.bossesKilled) >= 5,
  },
  slayer: {
    id: "slayer",
    name: "Slayer",
    desc: "Kill 100 enemies in a run.",
    tier: "silver",
    test: (s) => num(s.kills) >= 100,
  },
  roomRaider: {
    id: "roomRaider",
    name: "Room Raider",
    desc: "Clear 30 rooms in a run.",
    tier: "bronze",
    test: (s) => num(s.roomsCleared) >= 30,
  },
  speedDemon: {
    id: "speedDemon",
    name: "Speed Demon",
    desc: "Kill a boss every 10 seconds on average.",
    tier: "gold",
    test: (s) =>
      num(s.bossesKilled) >= 1 &&
      num(s.secs) / Math.max(1, num(s.bossesKilled)) <= 10,
  },
};

export function newAchievementState() {
  return { earned: [] };
}

export function checkAchievements(state, runSummary) {
  const earned = Array.from(state.earned);
  const newly = [];
  const summary = runSummary || {};
  for (const id in ACHIEVEMENTS) {
    if (earned.indexOf(id) === -1) {
      const ach = ACHIEVEMENTS[id];
      if (ach.test(summary)) {
        earned.push(id);
        newly.push(id);
      }
    }
  }
  return { state: { earned }, newly };
}

export function achievementProgress(state) {
  const earned = Array.isArray(state.earned) ? state.earned.length : 0;
  const total = Object.keys(ACHIEVEMENTS).length;
  const text = `${earned}/${total} achievements unlocked`;
  return { earned, total, text };
}