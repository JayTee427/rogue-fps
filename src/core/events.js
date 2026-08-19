// src/core/events.js

const ITEMS = [
  "hot_rounds", "overclock", "crit_lens", "bottomless", "plating",
  "kill_drip", "long_legs", "lucky_coin", "bloodhound", "second_wind",
  "double_jump", "reroll_token", "vampiric", "shrapnel", "ignition",
  "regen_coil", "air_brakes", "greed", "headhunter", "glass_cannon",
  "executioner", "chain_reaction", "wildfire", "magpie", "bulwark",
  "bullet_time", "first_blood", "last_round", "twin_link", "static_charge",
  "frostbite", "punch_through", "ricochet_plate", "big_iron", "overshield",
  "thorns", "blink_dash", "dash_reset", "momentum", "slide"
];

export const ROOM_EVENTS = {
  salvage: {
    id: "salvage",
    name: "Derelict Cache",
    prompt: "A sealed cargo hold drifts silent, its hull scarred by micrometeorites. Something inside still hums.",
    minFloor: 1,
    choices: [
      { label: "Breach and loot", desc: "Force the door open. Risk of hull breach." },
      { label: "Scan for hazards", desc: "Use sensors to locate safe access points." }
    ]
  },
  reactor: {
    id: "reactor",
    name: "Unstable Core",
    prompt: "The reactor chamber pulses with erratic light. Containment is failing.",
    minFloor: 2,
    choices: [
      { label: "Stabilize manually", desc: "Risk radiation exposure to reset the core." },
      { label: "Vent and flee", desc: "Dump the core's energy and escape." }
    ]
  },
  medbay: {
    id: "medbay",
    name: "Abandoned Medbay",
    prompt: "Medical bays are dark, but auto-sutures still whir to life on motion.",
    minFloor: 1,
    choices: [
      { label: "Activate triage", desc: "Use emergency protocols to heal yourself." },
      { label: "Harvest supplies", desc: "Strip the bay for medkits and chems." }
    ]
  },
  armory: {
    id: "armory",
    name: "Locked Armory",
    prompt: "Weapons lockers line the walls, their biometric seals long dead.",
    minFloor: 3,
    choices: [
      { label: "Hack the terminal", desc: "Bypass security and claim a weapon." },
      { label: "Blow the door", desc: "Use explosives—might trigger an alarm." }
    ]
  },
  comms: {
    id: "comms",
    name: "Dead Comms Array",
    prompt: "The comms dish twitches with static. A signal is trying to get out.",
    minFloor: 2,
    choices: [
      { label: "Boost the array", desc: "Amplify the signal—could attract attention." },
      { label: "Scramble the feed", desc: "Send a false beacon to mislead hostiles." }
    ]
  },
  engine: {
    id: "engine",
    name: "Failing Engine Room",
    prompt: "The engine groans, its plasma conduits sparking. It won't last long.",
    minFloor: 4,
    choices: [
      { label: "Overclock the drive", desc: "Push the engine beyond limits for speed." },
      { label: "Shut it down", desc: "Cut power to prevent a catastrophic overload." }
    ]
  },
  cargo: {
    id: "cargo",
    name: "Shifting Cargo Bay",
    prompt: "Gravity fluctuates as containers shift and crash in the dark.",
    minFloor: 1,
    choices: [
      { label: "Ride a container", desc: "Use momentum to glide across the bay." },
      { label: "Secure the load", desc: "Lock down cargo to stabilize gravity." }
    ]
  },
  bridge: {
    id: "bridge",
    name: "Ghost Bridge",
    prompt: "The command deck flickers with phantom crew silhouettes.",
    minFloor: 5,
    choices: [
      { label: "Interface with AI", desc: "Access ship logs and tactical data." },
      { label: "Sabotage controls", desc: "Destroy the bridge to deny it to enemies." }
    ]
  }
};

export function rollEvent(rng, floor, exclude = []) {
  const candidates = Object.values(ROOM_EVENTS).filter(
    (e) => e.minFloor <= floor && !exclude.includes(e.id)
  );
  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

export function resolveEvent(rng, eventId, choiceIndex, run) {
  const event = ROOM_EVENTS[eventId];
  const base = { text: "Nothing of note happens." };

  if (!event || choiceIndex == null || choiceIndex < 0 || choiceIndex >= event.choices.length) {
    return base;
  }


  switch (eventId) {
    case "salvage":
      if (choiceIndex === 0) {
        if (rng.chance(0.6)) {
          return {
            text: "You breach the cache and find valuable tech.",
            grantItem: rng.pick(ITEMS),
            gold: rng.int(20, 50)
          };
        } else {
          return {
            text: "The breach triggers a hull rupture!",
            damage: rng.int(10, 25)
          };
        }
      } else {
        return {
          text: "Sensors reveal a safe path. You collect salvage carefully.",
          gold: rng.int(15, 35),
          heal: rng.int(5, 15)
        };
      }
    case "reactor":
      if (choiceIndex === 0) {
        if (rng.chance(0.5)) {
          return {
            text: "You stabilize the core, gaining energy reserves.",
            maxHp: rng.int(5, 10),
            heal: rng.int(10, 20)
          };
        } else {
          return {
            text: "Radiation burns sear your flesh.",
            damage: rng.int(15, 30)
          };
        }
      } else {
        return {
          text: "You vent the core safely, avoiding disaster.",
          gold: rng.int(10, 25)
        };
      }
    case "medbay":
      if (choiceIndex === 0) {
        return {
          text: "Auto-sutures knit your wounds.",
          heal: rng.int(20, 40)
        };
      } else {
        return {
          text: "You strip the bay for supplies.",
          grantItem: rng.pick(ITEMS),
          gold: rng.int(10, 20)
        };
      }
    case "armory":
      if (choiceIndex === 0) {
        return {
          text: "You hack the terminal and claim a weapon.",
          grantItem: rng.pick(ITEMS)
        };
      } else {
        if (rng.chance(0.7)) {
          return {
            text: "Explosives blow the door—alarm blares!",
            spawnEnemies: rng.int(1, 3),
            gold: rng.int(20, 40)
          };
        } else {
          return {
            text: "The blast yields loot and a new gun.",
            grantItem: rng.pick(ITEMS),
            gold: rng.int(15, 30)
          };
        }
      }
    case "comms":
      if (choiceIndex === 0) {
        if (rng.chance(0.6)) {
          return {
            text: "The signal draws a rescue drone.",
            grantItem: rng.pick(ITEMS)
          };
        } else {
          return {
            text: "Hostiles intercept the signal!",
            spawnEnemies: rng.int(2, 4),
            damage: rng.int(10, 20)
          };
        }
      } else {
        return {
          text: "You send a false beacon. Enemies move elsewhere.",
          spawnEnemies: 0,
          gold: rng.int(15, 30)
        };
      }
    case "engine":
      if (choiceIndex === 0) {
        if (rng.chance(0.5)) {
          return {
            text: "Overclocking grants a burst of speed.",
            grantItem: "dash_reset"
          };
        } else {
          return {
            text: "The engine overloads!",
            damage: rng.int(20, 35),
            spawnEnemies: rng.int(1, 2)
          };
        }
      } else {
        return {
          text: "You shut down the engine safely.",
          heal: rng.int(10, 20),
          maxHp: rng.int(3, 8)
        };
      }
    case "cargo":
      if (choiceIndex === 0) {
        return {
          text: "You ride a container to safety.",
          heal: rng.int(5, 15),
          gold: rng.int(10, 20)
        };
      } else {
        return {
          text: "You stabilize gravity and secure the cargo.",
          grantItem: rng.pick(ITEMS),
          maxHp: rng.int(2, 6)
        };
      }
    case "bridge":
      if (choiceIndex === 0) {
        return {
          text: "The AI grants you tactical data.",
          grantItem: rng.pick(ITEMS),
          gold: rng.int(25, 50)
        };
      } else {
        return {
          text: "You sabotage the bridge, crippling enemy systems.",
          spawnEnemies: rng.int(1, 2),
          gold: rng.int(30, 60)
        };
      }
    default:
      return base;
  }
}

export function eventDanger(eventId) {
  const dangerMap = {
    salvage: 0.4,
    reactor: 0.7,
    medbay: 0.2,
    armory: 0.5,
    comms: 0.6,
    engine: 0.8,
    cargo: 0.3,
    bridge: 0.9
  };
  return dangerMap[eventId] ?? 0.5;
}