// Flavour text, one line per item. Written by Laguna against the design bible's
// tone brief; coverage is enforced by tests/hidden/codex.test.js, which fails if an
// item is added without a line. Data only — no logic, no imports.

export const FLAVOUR = {
  "hot_rounds": "Incendiary rounds recovered from a burned-out corridor",
  "overclock": "Black-box firmware patched by a dead engineer",
  "crit_lens": "Sniper scope still warm from its final shot",
  "bottomless": "Magazine that shouldn't exist, according to physics",
  "plating": "Salvaged from a bulkhead that held too long",
  "kill_drip": "Bloodstained medkit labeled 'Property of Medbay'",
  "long_legs": "Boots worn thin by endless corridors",
  "lucky_coin": "Pressed into a palm during a final gamble",
  "bloodhound": "Tracker unit found barking at a wall",
  "second_wind": "Emergency beacon that never got the recall signal",
  "double_jump": "Thruster pack jury-rigged with bungee cables",
  "reroll_token": "Casino chip from the station's last working arcade",
  "vampiric": "Life-support cable spliced into a pulse rifle",
  "shrapnel": "Payload recovered from a suicide bomber's vest",
  "ignition": "Flamethrower nozzle clogged with ash",
  "regen_coil": "Medbay injector found humming in an empty ward",
  "air_brakes": "Parachute pack used once, then forgotten",
  "greed": "Gold tooth pulled from a corpse's jaw",
  "headhunter": "Targeting AI trained on officer-class uniforms",
  "glass_cannon": "Prototype railgun with a cracked containment field",
  "executioner": "Blade still slick from its last execution",
  "chain_reaction": "Detonator linked to a chain of dead men's switches",
  "wildfire": "Incendiary gel that spread beyond its test chamber",
  "magpie": "Deck of cards found in a hoarder's quarters",
  "bulwark": "Shield generator salvaged from a downed dropship",
  "bullet_time": "Reflex augment that slowed its user's heartbeat too",
  "first_blood": "Chambered round that started a riot",
  "last_round": "Final cartridge in a gun that jammed on purpose",
  "twin_link": "Dual-wield harness bolted to a ribcage",
  "static_charge": "Tesla coil wired into a combat glove",
  "frostbite": "Cryo-rounds that froze their own launcher",
  "punch_through": "Armor-piercing slug that punched through six men",
  "ricochet_plate": "Deflector shield that bounced a sniper round back",
  "big_iron": "Revolver too heavy for its owner's shaking hands",
  "overshield": "Energy barrier that flickered out at the worst moment",
  "thorns": "Spiked armor that killed more friendlies than foes",
  "blink_dash": "Phase-shift module that left its user behind",
  "dash_reset": "Motion sensor that triggered on every kill",
  "momentum": "Gyro stabilizer that spun out of control",
  "slide": "Knee pads worn smooth by panic-diving",
  "feather": "Parachute silk torn by shrapnel and time",
  "cartographer": "Map tablet that updated itself after every death",
  "skeleton_key": "Master keycard still blinking 'ACCESS DENIED'",
  "deflector": "Energy shield that deflected a hug instead of a bullet",
  "the_loop": "Time-loop recorder found in a room full of corpses",
  "infinite_mag": "Ammo fabricator that printed its own requiem",
  "gunfu": "Martial arts manual annotated with bullet holes",
  "singularity": "Gravity well generator that swallowed its operator",
  "ghost": "Phase-cloak suit that phased out permanently",
  "duplicator": "Clone vat that made one too many copies",
  "berserker_pact": "Combat stim that came with a suicide note",
  "glass_legs": "Spring-loaded boots that snapped on the third jump",
  "hoarders_curse": "Coin purse that jingled with stolen credits",
  "blindfire": "Scope cracked by a ricochet that shouldn't have happened",
  "borrowed_time": "Life-support pack that ran on fumes and prayer",
  "spiked_shell": "Chest plate that impaled its wearer on impact",
  "adrenaline_rush": "Stim injector found in a medic's abandoned kit",
  "quickdraw": "Holster that drew faster than its owner could think",
  "reinforced_plating": "Armor patch welded by someone who knew it wouldn't hold",
  "phase_walk": "Invisibility cloak that blinked out mid-step",
  "loot_vision": "Scanner that highlighted corpses better than survivors",
  "quick_pockets": "Utility belt that emptied itself at the worst time",
  "storm_caller": "Lightning rod that attracted more than weather",
  "iron_skin": "Reactive armor that rusted from the inside out",
  "shadow_step": "Teleport module that left footprints in reverse",
  "treasure_hunter": "Metal detector that beeped for buried secrets",
  "voidheart": "Black-box core pulsing with something that wasn't human",
  "doombringer": "Scythe-blade that sang lullabies to the dying",
  "chronoshield": "Temporal dampener that aged its user by seconds",
  "abyssal_step": "Warp drive that tore holes in both space and sanity",
  "midas_touch": "Gold-plated gauntlet that turned skin to metal",
  "soulfire": "Plasma coil that burned hotter than its fuel cell",
  "curse_of_forgetfulness": "Memory wipe device that forgot to wipe itself",
  "haunted_metal": "Armor that whispered warnings its wearer ignored",
  "echo_chamber": "Sound amplifier that echoed screams back at the living",
  "wasteland_wanderer": "Oxygen recycler that ran on recycled regrets"
};

/** The line for an item id, or an empty string. Never throws. */
export function flavourFor(id) {
  return (id && FLAVOUR[id]) || "";
}

// ---------------------------------------------------------------------------
// Voice for the places, the bosses, and the ways a run ends. Same rules as the
// item lines: one sentence, cold, station-gothic, no exclamation marks.

export const BIOME_LORE = {
  cargo: "The manifest promises supplies for forty thousand souls. The manifest lies.",
  reactor: "The coolant still cycles. Nobody ever told it to stop.",
  quarters: "Every bunk is made. Whoever made them was very thorough, and very alone.",
  hull: "One sheet of plating between you and everything the station fell out of.",
  hydro: "The crops kept growing after the growers stopped. They are not crops anymore.",
};

export const BOSS_LORE = {
  custodian: "It kept the station spotless for nine years after the last crew died. You are the mess.",
  chorus: "Fifty distress calls, one voice. It has been answering itself for a long time.",
  landlord: "It collects what the station is owed. The station is owed everything.",
  gardener: "It tended the crops until the crops learned to tend themselves. It has not stopped tending.",
};

// The line the report screen shows for how you died, keyed by the damage-why
// string. Melee deaths resolve by archetype; everything else by source.
export const DEATH_LINES = {
  skitter: "Something small got close, and then closer.",
  sentinel: "You watched it charge, and you were still there when it finished.",
  brute: "It only needed to land one.",
  popper: "It only wanted a hug.",
  warden: "You kept shooting the shield. The shield won.",
  wisp: "The mine was patient. You weren't.",
  lurker: "It circled. You didn't.",
  sniper: "You saw the line. The line saw you first.",
  shaman: "Its congregation outlasted you.",
  swarm: "One bite at a time, on schedule.",
  projectile: "Somewhere out there, a very patient gun.",
  beam: "The sweep only goes one way. You went the other.",
  mine: "Somebody left it there for exactly this reason.",
  popperBlast: "Chain reactions rarely consult you first.",
  boss: "It was doing its job. You were the job.",
  selfDamage: "Burn bright, burn fast. You read the label.",
  hazard: "The station kills without ever noticing you.",
};

/** A line for a damage-why string like "melee:skitter" or "beam". */
export function deathLineFor(why) {
  if (!why) return "The station keeps its secrets.";
  const key = String(why).startsWith("melee:") ? String(why).slice(6) : String(why);
  return DEATH_LINES[key] ?? "The station keeps its secrets.";
}
