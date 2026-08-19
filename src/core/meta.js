export const UNLOCKS = {
  // Weapons: a licence to start with something other than the sidearm.
  carbine_licence: {
    id: "carbine_licence", name: "Carbine Licence", kind: "weapon",
    desc: "Start runs with a carbine instead of the sidearm.",
    requires: { kills: 40 }, grants: { weapon: "carbine" },
  },
  scatter_licence: {
    id: "scatter_licence", name: "Scattergun Licence", kind: "weapon",
    desc: "Start runs with a scattergun.",
    requires: { bestScore: 800 }, grants: { weapon: "scattergun" },
  },
  rail_licence: {
    id: "rail_licence", name: "Railgun Licence", kind: "weapon",
    desc: "Start runs with a railgun.",
    requires: { kills: 400 }, grants: { weapon: "railgun" },
  },
  beam_licence: {
    id: "beam_licence", name: "Beam Licence", kind: "weapon",
    desc: "Start runs with a beam emitter.",
    requires: { bossesKilled: 3 }, grants: { weapon: "beam" },
  },

  // Salvage rights: a piece of kit already installed when you drop in.
  plating_rights: {
    id: "plating_rights", name: "Salvage Rights: Plating", kind: "item",
    desc: "Begin every run already carrying Reinforced Plating.",
    requires: { runs: 5 }, grants: { item: "reinforced_plating" },
  },
  optics_rights: {
    id: "optics_rights", name: "Salvage Rights: Optics", kind: "item",
    desc: "Begin every run already carrying a Crit Lens.",
    requires: { roomsCleared: 40 }, grants: { item: "crit_lens" },
  },
  coil_rights: {
    id: "coil_rights", name: "Salvage Rights: Coil", kind: "item",
    desc: "Begin every run already carrying a Regen Coil.",
    requires: { extractions: 2 }, grants: { item: "regen_coil" },
  },

  // Clearance: standing concessions from a company that no longer exists.
  hazard_pay: {
    id: "hazard_pay", name: "Hazard Pay", kind: "modifier",
    desc: "Start each run with 150 salvage.",
    requires: { runs: 3 }, grants: { gold: 150 },
  },
  requisition: {
    id: "requisition", name: "Requisition Order", kind: "modifier",
    desc: "Reward drafts offer a fourth choice.",
    requires: { bestScore: 4000 }, grants: { draftSize: 1 },
  },
  reinforced_hull: {
    id: "reinforced_hull", name: "Reinforced Hull", kind: "modifier",
    desc: "Start each run with 20 more maximum health.",
    requires: { deepestFloor: 3 }, grants: { maxHp: 20 },
  },
  black_box: {
    id: "black_box", name: "Black Box Access", kind: "modifier",
    desc: "Start each run with one reroll banked.",
    requires: { extractions: 4 }, grants: { rerolls: 1 },
  },

  // Cosmetic: proof you were here, and nothing else.
  deep_salvor: {
    id: "deep_salvor", name: "Deep Salvor", kind: "cosmetic",
    desc: "Recognition for reaching floor five.",
    requires: { deepestFloor: 5 }, grants: {},
  },
};

/** Everything a profile's unlocks hand the next run. */
export function grantsFor(profile) {
  const owned = Array.isArray(profile?.unlocked) ? profile.unlocked : [];
  const out = { weapons: [], items: [], gold: 0, maxHp: 0, draftSize: 0, rerolls: 0 };
  for (const id of owned) {
    const g = UNLOCKS[id]?.grants;
    if (!g) continue;
    if (g.weapon) out.weapons.push(g.weapon);
    if (g.item) out.items.push(g.item);
    for (const k of ["gold", "maxHp", "draftSize", "rerolls"]) {
      if (Number.isFinite(g[k])) out[k] += g[k];
    }
  }
  return out;
}

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