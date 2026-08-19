
export const SYNERGIES = {
  fire_storm: {
    id: "fire_storm",
    name: "Fire Storm",
    desc: "Hot Rounds + Ignition + Shrapnel: incendiary cascade.",
    requires: ["hot_rounds", "ignition", "shrapnel"],
    effects: { onHitBurn: { add: 2 }, damage: { mul: 1.2 } }
  },
  crit_machine: {
    id: "crit_machine",
    name: "Crit Machine",
    desc: "Crit Lens + Headhunter + Glass Cannon: precision overkill.",
    requires: ["crit_lens", "headhunter", "glass_cannon"],
    effects: { critChance: { add: 0.15 }, critMult: { mul: 1.3 } }
  },
  bullet_hose: {
    id: "bullet_hose",
    name: "Bullet Hose",
    desc: "Overclock + Bottomless + Infinite Mag: never stop firing.",
    requires: ["overclock", "bottomless", "infinite_mag"],
    effects: { fireRate: { mul: 1.25 }, magazine: { add: 30 }, noReload: true }
  },
  tank: {
    id: "tank",
    name: "Tank",
    desc: "Plating + Vampiric + Bulwark: soak and strike back.",
    requires: ["plating", "vampiric", "bulwark"],
    effects: { armor: { add: 5 }, maxHp: { add: 20 }, lifesteal: { add: 0.05 } }
  },
  mobility_suite: {
    id: "mobility_suite",
    name: "Mobility Suite",
    desc: "Long Legs + Double Jump + Blink Dash: dance through fire.",
    requires: ["long_legs", "double_jump", "blink_dash"],
    effects: { moveSpeed: { mul: 1.2 }, deflect: { add: 0.1 } }
  },
  ricochet_kit: {
    id: "ricochet_kit",
    name: "Ricochet Kit",
    desc: "Ricochet Plate + Punch Through + Chain Reaction: bounce and break.",
    requires: ["ricochet_plate", "punch_through", "chain_reaction"],
    effects: { chainEveryN: { add: 3 }, pierce: { add: 2 }, onKillExplode: { add: 0.3 } }
  },
  economy_engine: {
    id: "economy_engine",
    name: "Economy Engine",
    desc: "Lucky Coin + Greed + Magpie: wealth magnet.",
    requires: ["lucky_coin", "greed", "magpie"],
    effects: { luck: { add: 0.2 }, draftSize: { add: 1 } }
  },
  execution_squad: {
    id: "execution_squad",
    name: "Execution Squad",
    desc: "Executioner + First Blood + Doombringer: reap the weak.",
    requires: ["executioner", "first_blood", "doombringer"],
    effects: { damage: { mul: 1.25 }, executeBelow: { add: 0.12 }, critMult: { add: 0.5 } }
  },
  salvage_ops: {
    id: "salvage_ops",
    name: "Salvage Ops",
    desc: "Cartographer + Skeleton Key + Treasure Hunter: find everything.",
    requires: ["cartographer", "skeleton_key", "treasure_hunter"],
    effects: { rarityShift: { add: 1 }, luck: { add: 0.15 } }
  },
  cursed_freedom: {
    id: "cursed_freedom",
    name: "Cursed Freedom",
    desc: "Berserker Pact + Soulfire + Echo Chamber: power at a price.",
    requires: ["berserker_pact", "soulfire", "echo_chamber"],
    effects: { damage: { mul: 1.3 }, fireRate: { mul: 1.2 }, deflect: { add: 0.1 } }
  }
};

export function activeSynergies(held) {
  if (!Array.isArray(held)) return [];
  const set = new Set(held.filter((id) => typeof id === "string"));
  return Object.values(SYNERGIES).filter((syn) =>
    syn.requires.every((id) => set.has(id))
  );
}

export function synergyEffects(held) {
  const active = activeSynergies(held);
  const result = {};
  for (const syn of active) {
    for (const [stat, mod] of Object.entries(syn.effects)) {
      if (mod === true) {
        result[stat] = true;
      } else if (mod && typeof mod === "object") {
        if (!(stat in result)) result[stat] = { add: 0, mul: 1 };
        if (mod.add != null) result[stat].add += mod.add;
        if (mod.mul != null) result[stat].mul *= mod.mul;
      }
    }
  }
  for (const [stat, mod] of Object.entries(result)) {
    if (mod && typeof mod === "object") {
      if (mod.add === 0) delete mod.add;
      if (mod.mul === 1) delete mod.mul;
      if (Object.keys(mod).length === 0) delete result[stat];
    }
  }
  return result;
}

export function describeSynergy(id) {
  const syn = SYNERGIES[id];
  if (!syn) return "Unknown synergy.";
  return `${syn.name}: ${syn.desc}`;
}