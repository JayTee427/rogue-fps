// src/core/items.js

export const RARITIES = ["common", "uncommon", "rare", "legendary", "cursed"];

const ITEMS = [
  // --- Common ---
  { id: "hot_rounds", name: "Hot Rounds", rarity: "common", tags: ["offense"], requires: null, stacks: true, effects: { damage: { mul: 1.15 } }, desc: "Incendiary rounds that burn hotter." },
  { id: "overclock", name: "Overclock", rarity: "common", tags: ["offense"], requires: null, stacks: true, effects: { fireRate: { mul: 1.25 } }, desc: "Push your weapon past its limits." },
  { id: "crit_lens", name: "Crit Lens", rarity: "common", tags: ["offense"], requires: null, stacks: true, effects: { critChance: { add: 0.2 } }, desc: "Precision optics for lethal shots." },
  { id: "bottomless", name: "Bottomless", rarity: "common", tags: ["offense"], requires: null, stacks: true, effects: { freeShotChance: { add: 0.25 } }, desc: "Somehow never runs out of ammo." },
  { id: "plating", name: "Plating", rarity: "common", tags: ["defense"], requires: null, stacks: true, effects: { maxHp: { add: 25 } }, desc: "Reinforced armor plating." },
  { id: "kill_drip", name: "Kill Drip", rarity: "common", tags: ["offense"], requires: null, stacks: true, effects: { healOnKill: { add: 5 } }, desc: "Every kill restores a little health." },
  { id: "long_legs", name: "Long Legs", rarity: "common", tags: ["mobility"], requires: null, stacks: true, effects: { moveSpeed: { mul: 1.15 } }, desc: "Tall boots for long strides." },
  { id: "lucky_coin", name: "Lucky Coin", rarity: "common", tags: ["economy"], requires: null, stacks: true, effects: { luck: { add: 0.1 } }, desc: "A coin that brings good fortune." },
  { id: "bloodhound", name: "Bloodhound", rarity: "common", tags: ["offense"], requires: null, stacks: false, effects: { enemyDetect: { add: 5 } }, desc: "Tracks enemies through walls." },
  { id: "second_wind", name: "Second Wind", rarity: "common", tags: ["defense"], requires: null, stacks: false, effects: { reviveOnDeath: true }, desc: "One last chance to fight." },
  { id: "double_jump", name: "Double Jump", rarity: "common", tags: ["mobility"], requires: null, stacks: false, effects: { extraJump: true }, desc: "Jump again mid-air." },
  { id: "reroll_token", name: "Reroll Token", rarity: "common", tags: ["economy"], requires: null, stacks: true, effects: { rerollCount: { add: 1 } }, desc: "Use to refresh shop options." },
  { id: "vampiric", name: "Vampiric", rarity: "uncommon", tags: ["defense"], requires: null, stacks: true, effects: { lifesteal: { add: 0.05 } }, desc: "Drain life from your attacks." },
  { id: "shrapnel", name: "Shrapnel", rarity: "uncommon", tags: ["offense"], requires: null, stacks: false, effects: { onKillExplode: { add: 0.3 } }, desc: "Enemies explode on death." },
  { id: "ignition", name: "Ignition", rarity: "uncommon", tags: ["offense"], requires: null, stacks: true, effects: { onHitBurn: { add: 4 } }, desc: "Shots ignite targets." },
  { id: "regen_coil", name: "Regen Coil", rarity: "uncommon", tags: ["defense"], requires: null, stacks: false, effects: { hpRegen: { add: 2 } }, desc: "Gradual health regeneration." },
  { id: "air_brakes", name: "Air Brakes", rarity: "uncommon", tags: ["mobility"], requires: null, stacks: false, effects: { slowFall: true }, desc: "Fall gently from great heights." },
  { id: "greed", name: "Greed", rarity: "uncommon", tags: ["economy"], requires: null, stacks: false, effects: { goldFind: { mul: 1.2 } }, desc: "More gold drops from enemies." },
  { id: "headhunter", name: "Headhunter", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { headshotDamage: { mul: 1.5 } }, desc: "Headshots deal massive damage." },
  { id: "glass_cannon", name: "Glass Cannon", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { damage: { mul: 1.6 }, maxHp: { mul: 0.6 } }, desc: "Devastating power at great cost." },
  { id: "executioner", name: "Executioner", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { executeBelow: { add: 0.2 } }, desc: "Execute weakened foes instantly." },
  { id: "chain_reaction", name: "Chain Reaction", rarity: "rare", tags: ["offense"], requires: "shrapnel", stacks: false, effects: { explosionsChain: true }, desc: "Explosions trigger more explosions." },
  { id: "wildfire", name: "Wildfire", rarity: "rare", tags: ["offense"], requires: "ignition", stacks: false, effects: { burnSpreads: true }, desc: "Fire spreads to nearby enemies." },
  { id: "magpie", name: "Magpie", rarity: "rare", tags: ["economy"], requires: null, stacks: false, effects: { draftSize: { add: 1 } }, desc: "Draw extra cards in drafts." },
  { id: "bulwark", name: "Bulwark", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { armor: { add: 10 } }, desc: "Massive shield for heavy defense." },
  { id: "bullet_time", name: "Bullet Time", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { slowTimeOnHit: { add: 0.1 } }, desc: "Slow time when struck." },
  { id: "first_blood", name: "First Blood", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { firstShotCrit: true }, desc: "First shot of each fight crits." },
  { id: "last_round", name: "Last Round", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { finalShotBonus: { mul: 2 } }, desc: "Last bullet hits harder." },
  { id: "twin_link", name: "Twin Link", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { dualWield: true }, desc: "Wield two weapons at once." },
  { id: "static_charge", name: "Static Charge", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { shockOnHit: { add: 0.2 } }, desc: "Electrify your weapons." },
  { id: "frostbite", name: "Frostbite", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { slowOnHit: { add: 0.3 } }, desc: "Freeze enemies on hit." },
  { id: "punch_through", name: "Punch Through", rarity: "rare", tags: ["offense"], requires: null, stacks: true, effects: { pierce: { add: 1 } }, desc: "Shots go through multiple targets." },
  { id: "ricochet_plate", name: "Ricochet Plate", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { reflectBullets: { add: 0.25 } }, desc: "Reflect incoming fire." },
  { id: "big_iron", name: "Big Iron", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { weaponSize: { mul: 1.5 } }, desc: "Massive sidearm with huge impact." },
  { id: "overshield", name: "Overshield", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { tempShield: { add: 50 } }, desc: "Absorb damage with energy shields." },
  { id: "thorns", name: "Thorns", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { damageReflection: { add: 0.3 } }, desc: "Hurt attackers when hit." },
  { id: "blink_dash", name: "Blink Dash", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { shortTeleport: true }, desc: "Dash a short distance instantly." },
  { id: "dash_reset", name: "Dash Reset", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { dashRefreshOnKill: true }, desc: "Kills refresh your dash." },
  { id: "momentum", name: "Momentum", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { speedBoostOnMove: { add: 0.1 } }, desc: "Build speed while moving." },
  { id: "slide", name: "Slide", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { slideDistance: { mul: 1.5 } }, desc: "Slide further and faster." },
  { id: "feather", name: "Feather", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { fallDamageReduction: { mul: 0.5 } }, desc: "Light as a feather." },
  { id: "cartographer", name: "Cartographer", rarity: "rare", tags: ["economy"], requires: null, stacks: false, effects: { mapReveal: { add: 0.2 } }, desc: "Reveal more of the map." },
  { id: "skeleton_key", name: "Skeleton Key", rarity: "rare", tags: ["economy"], requires: null, stacks: false, effects: { chestLootBonus: { mul: 1.3 } }, desc: "Better treasure from chests." },
  { id: "deflector", name: "Deflector", rarity: "uncommon", tags: ["defense"], requires: null, stacks: true, effects: { projectileDeflect: { add: 0.15 } }, desc: "Chance to deflect projectiles." },
  { id: "the_loop", name: "The Loop", rarity: "legendary", tags: ["economy"], requires: null, stacks: false, effects: { floorRetry: true }, desc: "Retry the floor on death." },
  { id: "infinite_mag", name: "Infinite Mag", rarity: "legendary", tags: ["offense"], requires: null, stacks: false, effects: { infiniteAmmo: true }, desc: "Never run out of ammunition." },
  { id: "gunfu", name: "Gunfu", rarity: "legendary", tags: ["offense"], requires: null, stacks: false, effects: { meleeCounter: true }, desc: "Perfect timing turns defense into offense." },
  { id: "singularity", name: "Singularity", rarity: "legendary", tags: ["offense"], requires: null, stacks: false, effects: { gravityWell: { add: 1 } }, desc: "Pull enemies toward impact points." },
  { id: "ghost", name: "Ghost", rarity: "legendary", tags: ["mobility"], requires: null, stacks: false, effects: { phaseThroughWalls: true }, desc: "Walk through obstacles briefly." },
  { id: "duplicator", name: "Duplicator", rarity: "legendary", tags: ["economy"], requires: null, stacks: false, effects: { itemCloneChance: { add: 0.1 } }, desc: "Sometimes duplicate picked-up items." },
  { id: "berserker_pact", name: "Berserker Pact", rarity: "cursed", tags: ["offense"], requires: null, stacks: false, effects: { damage: { mul: 2 }, noHeal: true }, desc: "Double damage, but you cannot heal." },
  { id: "glass_legs", name: "Glass Legs", rarity: "cursed", tags: ["mobility"], requires: null, stacks: false, effects: { moveSpeed: { mul: 1.5 }, fallDamage: { mul: 5 } }, desc: "Fast but fragile." },
  { id: "hoarders_curse", name: "Hoarder's Curse", rarity: "cursed", tags: ["economy"], requires: null, stacks: false, effects: { goldLossOnHit: { add: 0.1 } }, desc: "Lose gold when struck." },
  { id: "blindfire", name: "Blindfire", rarity: "cursed", tags: ["offense"], requires: null, stacks: false, effects: { spread: { mul: 2.2 }, damage: { mul: 1.5 } }, desc: "Inaccurate but deadly." },
  { id: "borrowed_time", name: "Borrowed Time", rarity: "cursed", tags: ["defense"], requires: null, stacks: false, effects: { extraLife: true, healthDecay: { add: 1 } }, desc: "Live longer, but fade away." },
  { id: "spiked_shell", name: "Spiked Shell", rarity: "uncommon", tags: ["defense"], requires: null, stacks: false, effects: { damageOnMeleeHit: { add: 5 } }, desc: "Hurt melee attackers." },
  { id: "adrenaline_rush", name: "Adrenaline Rush", rarity: "uncommon", tags: ["offense"], requires: null, stacks: false, effects: { critChanceOnLowHealth: { add: 0.3 } }, desc: "Crit more when near death." },
  { id: "quickdraw", name: "Quickdraw", rarity: "uncommon", tags: ["offense"], requires: null, stacks: false, effects: { swapSpeed: { mul: 1.4 } }, desc: "Switch weapons faster." },
  { id: "reinforced_plating", name: "Reinforced Plating", rarity: "uncommon", tags: ["defense"], requires: null, stacks: true, effects: { armor: { add: 5 } }, desc: "Extra durable armor." },
  { id: "phase_walk", name: "Phase Walk", rarity: "uncommon", tags: ["mobility"], requires: null, stacks: false, effects: { briefInvulnerability: true }, desc: "Short burst of invincibility." },
  { id: "loot_vision", name: "Loot Vision", rarity: "uncommon", tags: ["economy"], requires: null, stacks: false, effects: { itemGlow: true }, desc: "See nearby items clearly." },
  { id: "quick_pockets", name: "Quick Pockets", rarity: "uncommon", tags: ["economy"], requires: null, stacks: false, effects: { consumableEfficiency: { mul: 1.3 } }, desc: "Consumables last longer." },
  { id: "storm_caller", name: "Storm Caller", rarity: "rare", tags: ["offense"], requires: null, stacks: false, effects: { lightningOnCrit: { add: 0.2 } }, desc: "Lightning strikes on critical hits." },
  { id: "iron_skin", name: "Iron Skin", rarity: "rare", tags: ["defense"], requires: null, stacks: false, effects: { damageReduction: { add: 0.1 } }, desc: "Reduce all incoming damage." },
  { id: "shadow_step", name: "Shadow Step", rarity: "rare", tags: ["mobility"], requires: null, stacks: false, effects: { teleportOnDodge: true }, desc: "Dodge and reappear behind foes." },
  { id: "treasure_hunter", name: "Treasure Hunter", rarity: "rare", tags: ["economy"], requires: null, stacks: false, effects: { rareDropChance: { add: 0.15 } }, desc: "Find rarer loot." },
  { id: "voidheart", name: "Voidheart", rarity: "legendary", tags: ["offense"], requires: null, stacks: false, effects: { voidDamage: { add: 10 }, lifesteal: { add: 0.1 } }, desc: "Channel the void itself." },
  { id: "doombringer", name: "Doombringer", rarity: "legendary", tags: ["offense"], requires: null, stacks: false, effects: { killHeal: { add: 20 }, executeBelow: { add: 0.3 } }, desc: "Reap souls to sustain yourself." },
  { id: "chronoshield", name: "Chronoshield", rarity: "legendary", tags: ["defense"], requires: null, stacks: false, effects: { timeSlowOnBlock: true, blockStun: { mul: 0.5 } }, desc: "Time bends to your defense." },
  { id: "abyssal_step", name: "Abyssal Step", rarity: "legendary", tags: ["mobility"], requires: null, stacks: false, effects: { teleportOnHit: { add: 0.1 }, moveSpeed: { mul: 1.3 } }, desc: "Tear reality with each strike." },
  { id: "midas_touch", name: "Midas Touch", rarity: "legendary", tags: ["economy"], requires: null, stacks: false, effects: { goldFind: { mul: 2 }, enemyGoldDrop: { add: 1 } }, desc: "Turn everything to gold." },
  { id: "soulfire", name: "Soulfire", rarity: "cursed", tags: ["offense"], requires: null, stacks: false, effects: { damage: { mul: 1.8 }, selfDamage: { add: 0.05 } }, desc: "Burn bright, burn fast." },
  { id: "curse_of_forgetfulness", name: "Curse of Forgetfulness", rarity: "cursed", tags: ["economy"], requires: null, stacks: false, effects: { loseRandomItem: true, luck: { add: 0.2 } }, desc: "Gain luck, lose possessions." },
  { id: "haunted_metal", name: "Haunted Metal", rarity: "cursed", tags: ["defense"], requires: null, stacks: false, effects: { armor: { add: 20 }, takeDamageOverTime: { add: 2 } }, desc: "Protected, but at a price." },
  { id: "echo_chamber", name: "Echo Chamber", rarity: "cursed", tags: ["offense"], requires: null, stacks: false, effects: { damage: { mul: 1.3 }, friendlyFire: true }, desc: "Your power affects allies too." },
  { id: "wasteland_wanderer", name: "Wasteland Wanderer", rarity: "cursed", tags: ["mobility"], requires: null, stacks: false, effects: { moveSpeed: { mul: 1.2 }, staminaDrain: { add: 1 } }, desc: "Endless motion, endless hunger." }
];

export { ITEMS };

export const ITEM_BY_ID = ITEMS.reduce((acc, item) => {
  acc[item.id] = item;
  return acc;
}, {});

export function queryItems({ rarity, tag, requiresMet, held = [] } = {}) {
  return ITEMS.filter(item => {
    if (rarity && item.rarity !== rarity) return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (requiresMet && item.requires && !held.includes(item.requires)) return false;
    return true;
  });
}