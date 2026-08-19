import { ITEMS } from "core/items.js";

const CURSED = ITEMS.filter((i) => i.rarity === "cursed");

export const BOONS = {
  fury: {
    id: "fury",
    name: "Fury",
    desc: "Strike harder with every blow.",
    effects: { damage: { mul: 1.3 } },
  },
  iron: {
    id: "iron",
    name: "Ironhide",
    desc: "Your skin turns to steel.",
    effects: { armor: { add: 8 } },
  },
  vigor: {
    id: "vigor",
    name: "Vigor",
    desc: "A surge of vitality courses through you.",
    effects: { maxHp: { add: 30 } },
  },
  swift: {
    id: "swift",
    name: "Swiftness",
    desc: "Move like the wind.",
    effects: { moveSpeed: { mul: 1.25 } },
  },
  overcharge: {
    id: "overcharge",
    name: "Overcharge",
    desc: "Your weapon cycles past its rated limit.",
    effects: { fireRate: { mul: 1.2 } },
  },
};

export function rollPact(rng, run) {
  const available = CURSED.filter((i) => !run.held.includes(i.id));
  if (available.length === 0) return null;
  const curse = rng.pick(available);
  const boonKeys = Object.keys(BOONS);
  const boon = rng.pick(boonKeys);
  const text = `Take ${curse.name} and gain ${BOONS[boon].name}?`;
  return { curse: curse.id, boon, text };
}

export function acceptPact(run, pact) {
  if (!pact) {
    throw new Error("Cannot accept a null pact");
  }
  const held = run.held.includes(pact.curse)
    ? run.held
    : [...run.held, pact.curse];
  return {
    ...run,
    held,
    // Onto the list recomputeStats actually reads. The old shape stored
    // `boon`/`effects`, which nothing consumed: every pact in the game
    // collected its curse and paid out nothing.
    boons: [...(run.boons ?? []), pact.boon],
  };
}

export function refusePact(run) {
  return { ...run };
}