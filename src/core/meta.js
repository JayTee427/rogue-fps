export const UNLOCKS = {
  blade: { id: "blade", name: "Shadow Blade", desc: "A swift melee weapon.", kind: "weapon", requires: { kills: 40 } },
  pulse: { id: "pulse", name: "Pulse Rifle", desc: "Fires energy bursts.", kind: "weapon", requires: { score: 500 } },
  shield: { id: "shield", name: "Energy Shield", desc: "Absorbs incoming damage.", kind: "item", requires: { extractions: 1 } },
  cloak: { id: "cloak", name: "Stealth Cloak", desc: "Grants temporary invisibility.", kind: "item", requires: { bossesKilled: 1 } },
  boots: { id: "boots", name: "Phase Boots", desc: "Move faster through corridors.", kind: "modifier", requires: { deepestFloor: 3 } },
  helm: { id: "helm", name: "Helm of Insight", desc: "Reveals hidden paths.", kind: "cosmetic", requires: { roomsCleared: 50 } },
  gauntlet: { id: "gauntlet", name: "Thunder Gauntlet", desc: "Charged melee strike.", kind: "weapon", requires: { kills: 500 } },
  amulet: { id: "amulet", name: "Amulet of Vitality", desc: "Increases max health.", kind: "modifier", requires: { bestScore: 5000 } },
  rune: { id: "rune", name: "Rune of Power", desc: "Boosts weapon damage.", kind: "modifier", requires: { runs: 10 } },
  skin: { id: "skin", name: "Obsidian Skin", desc: "Dark armor appearance.", kind: "cosmetic", requires: { extractions: 3 } },
  grenade: { id: "grenade", name: "Frag Grenade", desc: "Explodes on impact.", kind: "item", requires: { bossesKilled: 3 } },
  visor: { id: "visor", name: "Tactical Visor", desc: "Highlights enemies.", kind: "cosmetic", requires: { kills: 250 } }
};

export function newProfile() {
  return {
    version: 1,
    unlocked: [],
    totals: {
      runs: 0,
      kills: 0,
      bestScore: 0,
      deepestFloor: 0,
      roomsCleared: 0,
      bossesKilled: 0,
      extractions: 0,
      score: 0
    }
  };
}

function safeNum(v) {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

export function applyRun(profile, runSummary = {}) {
  const totals = { ...profile.totals };
  totals.runs = safeNum(totals.runs) + 1;
  totals.kills = safeNum(totals.kills) + safeNum(runSummary.kills);
  totals.bestScore = Math.max(safeNum(totals.bestScore), safeNum(runSummary.score));
  totals.deepestFloor = Math.max(safeNum(totals.deepestFloor), safeNum(runSummary.floorsCleared));
  totals.roomsCleared = safeNum(totals.roomsCleared) + safeNum(runSummary.roomsCleared);
  totals.bossesKilled = safeNum(totals.bossesKilled) + safeNum(runSummary.bossesKilled);
  totals.extractions = safeNum(totals.extractions) + (runSummary.extracted ? 1 : 0);
  totals.score = safeNum(totals.score) + safeNum(runSummary.score);

  const unlocked = [...new Set(profile.unlocked)];
  const newlyUnlocked = [];

  for (const id in UNLOCKS) {
    if (unlocked.includes(id)) continue;
    const req = UNLOCKS[id].requires;
    let satisfied = true;
    for (const key in req) {
      if (safeNum(totals[key]) < req[key]) {
        satisfied = false;
        break;
      }
    }
    if (satisfied) {
      newlyUnlocked.push(id);
      unlocked.push(id);
    }
  }

  const newProfile = {
    version: profile.version,
    unlocked,
    totals
  };

  return { profile: newProfile, newlyUnlocked };
}

export function isUnlocked(profile, id) {
  if (!profile || !Array.isArray(profile.unlocked)) return false;
  return profile.unlocked.includes(id);
}

export function serializeProfile(profile) {
  return JSON.stringify(profile);
}

export function deserializeProfile(text) {
  const fresh = newProfile();
  if (typeof text !== "string" || text.length === 0) return fresh;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fresh;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fresh;
  if (typeof parsed.version !== "number") return fresh;
  if (!Array.isArray(parsed.unlocked)) return fresh;
  if (typeof parsed.totals !== "object" || parsed.totals === null) return fresh;

  const totals = { ...fresh.totals };
  for (const key in totals) {
    totals[key] = safeNum(parsed.totals[key]);
  }

  const unlocked = parsed.unlocked.filter(id => typeof id === "string" && UNLOCKS[id]);

  return {
    version: parsed.version,
    unlocked,
    totals
  };
}

export function profileSummary(profile) {
  const unlockedCount = Array.isArray(profile.unlocked) ? profile.unlocked.length : 0;
  const totalCount = Object.keys(UNLOCKS).length;
  const text = `${unlockedCount}/${totalCount} unlocks earned.`;
  return { unlockedCount, totalCount, text };
}