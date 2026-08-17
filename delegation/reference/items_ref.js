// REFERENCE — proves the hidden tests are satisfiable. Never shown to the worker.
// The catalog is data; the worker will re-derive it from DESIGN.md's list.

export const RARITIES = ["common", "uncommon", "rare", "legendary", "cursed"];

// effects: { stat: {add, mul} } | {flag: true} | {proc: {...}}
const I = (id, name, rarity, effects, opts = {}) => ({
  id, name, rarity, effects,
  tags: opts.tags ?? [],
  requires: opts.requires ?? null,
  stacks: opts.stacks ?? false,
  desc: opts.desc ?? "",
});

export const ITEMS = [
  // offense
  I("hot_rounds", "Hot Rounds", "common", { damage: { mul: 1.15 } }, { stacks: true, tags: ["offense"] }),
  I("glass_cannon", "Glass Cannon", "rare", { damage: { mul: 1.6 }, maxHp: { mul: 0.6 } }, { tags: ["offense"] }),
  I("overclock", "Overclock", "common", { fireRate: { mul: 1.25 } }, { stacks: true, tags: ["offense"] }),
  I("executioner", "Executioner", "rare", { executeBelow: { add: 0.2 } }, { tags: ["offense"] }),
  I("bloodhound", "Bloodhound Rounds", "uncommon", { homing: { add: 0.15 } }, { tags: ["offense"] }),
  I("shrapnel", "Shrapnel", "uncommon", { onKillExplode: { add: 0.3 } }, { tags: ["offense"] }),
  I("chain_reaction", "Chain Reaction", "rare", { explosionsChain: true }, { requires: "shrapnel", tags: ["offense"] }),
  I("crit_lens", "Crit Lens", "common", { critChance: { add: 0.2 } }, { stacks: true, tags: ["offense"] }),
  I("headhunter", "Headhunter", "rare", { critMult: { add: 1.0 } }, { tags: ["offense"] }),
  I("first_blood", "First Blood", "uncommon", { firstShotMult: { add: 1.5 } }, { tags: ["offense"] }),
  I("last_round", "Last Round", "uncommon", { lastShotMult: { add: 3.0 } }, { tags: ["offense"] }),
  I("bottomless", "Bottomless", "common", { freeShotChance: { add: 0.25 } }, { stacks: true, tags: ["offense"] }),
  I("twin_link", "Twin Link", "rare", { everyNthDouble: { add: 3 } }, { tags: ["offense"] }),
  I("static_charge", "Static Charge", "uncommon", { chainEveryN: { add: 8 } }, { tags: ["offense"] }),
  I("frostbite", "Frostbite", "uncommon", { onHitSlow: { add: 0.3 } }, { tags: ["offense"] }),
  I("ignition", "Ignition", "uncommon", { onHitBurn: { add: 4 } }, { stacks: true, tags: ["offense"] }),
  I("wildfire", "Wildfire", "rare", { burnSpreads: true }, { requires: "ignition", tags: ["offense"] }),
  I("punch_through", "Punch Through", "uncommon", { pierce: { add: 1 } }, { stacks: true, tags: ["offense"] }),
  I("ricochet_plate", "Ricochet Plate", "uncommon", { bounces: { add: 1 } }, { tags: ["offense"] }),
  I("big_iron", "Big Iron", "uncommon", { projSize: { mul: 2 }, projSpeed: { mul: 0.8 } }, { tags: ["offense"] }),
  // defense
  I("plating", "Plating", "common", { maxHp: { add: 25 } }, { stacks: true, tags: ["defense"] }),
  I("second_wind", "Second Wind", "rare", { secondWind: true }, { tags: ["defense"] }),
  I("vampiric", "Vampiric Rounds", "uncommon", { lifesteal: { add: 0.02 } }, { stacks: true, tags: ["defense"] }),
  I("kill_drip", "Kill Drip", "common", { healOnKill: { add: 5 } }, { stacks: true, tags: ["defense"] }),
  I("regen_coil", "Regen Coil", "common", { regen: { add: 1 } }, { tags: ["defense"] }),
  I("bulwark", "Bulwark", "uncommon", { stillDamageTaken: { mul: 0.8 } }, { tags: ["defense"] }),
  I("bullet_time", "Bullet Time Sense", "rare", { bulletTime: true }, { tags: ["defense"] }),
  I("deflector", "Deflector", "uncommon", { deflect: { add: 0.15 } }, { stacks: true, tags: ["defense"] }),
  I("overshield", "Overshield", "uncommon", { roomShield: { add: 30 } }, { tags: ["defense"] }),
  I("thorns", "Thorns", "common", { thorns: { add: 20 } }, { tags: ["defense"] }),
  // mobility
  I("long_legs", "Long Legs", "common", { moveSpeed: { mul: 1.15 } }, { stacks: true, tags: ["mobility"] }),
  I("double_jump", "Double Jump", "uncommon", { jumps: { add: 1 } }, { tags: ["mobility"] }),
  I("air_brakes", "Air Brakes", "uncommon", { airControl: { add: 1 } }, { tags: ["mobility"] }),
  I("blink_dash", "Blink Dash", "rare", { dashPhases: true }, { tags: ["mobility"] }),
  I("dash_reset", "Dash Reset", "uncommon", { dashOnKill: true }, { tags: ["mobility"] }),
  I("momentum", "Momentum", "rare", { momentumDmg: { add: 0.02 } }, { tags: ["mobility"] }),
  I("slide", "Slide", "rare", { slide: true }, { tags: ["mobility"] }),
  I("feather", "Feather", "uncommon", { gravity: { mul: 0.5 } }, { tags: ["mobility"] }),
  // economy
  I("magpie", "Magpie", "rare", { draftSize: { add: 1 } }, { tags: ["economy"] }),
  I("reroll_token", "Reroll Token", "uncommon", { rerollsPerFloor: { add: 1 } }, { tags: ["economy"] }),
  I("greed", "Greed", "rare", { rarityShift: { add: 1 }, enemyHp: { mul: 1.3 } }, { tags: ["economy"] }),
  I("cartographer", "Cartographer", "uncommon", { doorLookahead: { add: 1 } }, { tags: ["economy"] }),
  I("skeleton_key", "Skeleton Key", "uncommon", { keysPerFloor: { add: 1 } }, { tags: ["economy"] }),
  I("duplicator", "Duplicator", "legendary", { duplicateNext: true }, { tags: ["economy"] }),
  I("lucky_coin", "Lucky Coin", "common", { luck: { add: 0.1 } }, { stacks: true, tags: ["economy"] }),
  // legendary
  I("infinite_mag", "Infinite Mag", "legendary", { noReload: true, fireRate: { mul: 0.75 } }, { tags: ["offense"] }),
  I("gunfu", "Gunfu", "legendary", { reloadBurst: true }, { tags: ["offense"] }),
  I("singularity", "Singularity Rounds", "legendary", { blackHoleEveryN: { add: 10 } }, { tags: ["offense"] }),
  I("ghost", "Ghost", "legendary", { ghostOnKill: { add: 2 } }, { tags: ["defense"] }),
  I("the_loop", "The Loop", "legendary", { floorRetry: true }, { tags: ["economy"] }),
  // cursed
  I("berserker_pact", "Berserker Pact", "cursed", { damage: { mul: 2 }, noHeal: true }, { tags: ["offense"] }),
  I("glass_legs", "Glass Legs", "cursed", { moveSpeed: { mul: 1.4 }, fallDamage: true }, { tags: ["mobility"] }),
  I("hoarders_curse", "Hoarder's Curse", "cursed", { draftSize: { add: 2 }, mustTake: true }, { tags: ["economy"] }),
  I("blindfire", "Blindfire", "cursed", { fireRate: { mul: 1.5 }, spread: { mul: 2 } }, { tags: ["offense"] }),
  I("borrowed_time", "Borrowed Time", "cursed", { damage: { mul: 1.5 }, fireRate: { mul: 1.5 }, moveSpeed: { mul: 1.5 }, runTimerSec: { add: 360 } }, { tags: ["economy"] }),
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export function queryItems({ rarity, tag, requiresMet, held = [] } = {}) {
  return ITEMS.filter(i => {
    if (rarity && i.rarity !== rarity) return false;
    if (tag && !i.tags.includes(tag)) return false;
    if (requiresMet && i.requires && !held.includes(i.requires)) return false;
    return true;
  });
}
