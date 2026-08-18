// src/core/arenas.js

export const BIOMES = {
  cargo: {
    id: "cargo",
    name: "Cargo Hold",
    desc: "Stacked containers sweat rust in the dark.",
    minFloor: 1,
  },
  reactor: {
    id: "reactor",
    name: "Flooded Reactor",
    desc: "Coolant leaks glow faintly under broken grates.",
    minFloor: 3,
  },
  quarters: {
    id: "quarters",
    name: "Crew Quarters",
    desc: "Bunks still hold shapes that aren't quite human.",
    minFloor: 2,
  },
  hull: {
    id: "hull",
    name: "Exterior Hull Walk",
    desc: "Stars burn through the gaps in the plating.",
    minFloor: 4,
  },
  hydro: {
    id: "hydro",
    name: "Dead Hydroponics",
    desc: "Glass tubes crack, spilling silence.",
    minFloor: 5,
  },
};

const PALETTES = {
  cargo: {
    floor: 0x444444,
    wall: 0x222222,
    trim: 0x666666,
    fog: 0x111111,
    sky: 0x0a0a0a,
    accent: 0x888888,
    fogDensity: 0.25,
    lightIntensity: 0.6,
  },
  reactor: {
    floor: 0x1a1a2e,
    wall: 0x16213e,
    trim: 0x0f3460,
    fog: 0x0d1b2a,
    sky: 0x0a0f1a,
    accent: 0x533460,
    fogDensity: 0.35,
    lightIntensity: 0.4,
  },
  quarters: {
    floor: 0x3d2b1f,
    wall: 0x2c1e10,
    trim: 0x5d4b3f,
    fog: 0x1a1208,
    sky: 0x0f0a04,
    accent: 0x7d6b5f,
    fogDensity: 0.2,
    lightIntensity: 0.5,
  },
  hull: {
    floor: 0x333333,
    wall: 0x111111,
    trim: 0x555555,
    fog: 0x000000,
    sky: 0x000022,
    accent: 0x999999,
    fogDensity: 0.1,
    lightIntensity: 0.8,
  },
  hydro: {
    floor: 0x0a2a0a,
    wall: 0x051a05,
    trim: 0x1a4a1a,
    fog: 0x030803,
    sky: 0x020402,
    accent: 0x2a6a2a,
    fogDensity: 0.3,
    lightIntensity: 0.45,
  },
};

export function biomePalette(biomeId) {
  return PALETTES[biomeId] || PALETTES.cargo;
}

export function biomeLayout(rng, biomeId, floor) {
  const f = Math.max(1, Math.floor(floor) || 1);
  const base = BIOMES[biomeId] || BIOMES.cargo;

  let halfW, halfD, blockCount, ceiling;

  switch (base.id) {
    case "cargo":
      halfW = rng.int(10, 16);
      halfD = rng.int(10, 16);
      blockCount = rng.int(8, 14);
      ceiling = rng.int(4, 6);
      break;
    case "reactor":
      halfW = rng.int(14, 22);
      halfD = rng.int(14, 22);
      blockCount = rng.int(4, 8);
      ceiling = rng.int(6, 9);
      break;
    case "quarters":
      halfW = rng.int(12, 18);
      halfD = rng.int(12, 18);
      blockCount = rng.int(5, 10);
      ceiling = rng.int(5, 7);
      break;
    case "hull":
      halfW = rng.int(24, 30);
      halfD = rng.int(10, 14);
      blockCount = rng.int(2, 4);
      ceiling = rng.int(7, 10);
      break;
    case "hydro":
      halfW = rng.int(16, 24);
      halfD = rng.int(16, 24);
      blockCount = rng.int(3, 6);
      ceiling = rng.int(8, 12);
      break;
    default:
      halfW = rng.int(10, 30);
      halfD = rng.int(10, 30);
      blockCount = rng.int(2, 14);
      ceiling = rng.int(4, 10);
  }

  return {
    halfW: Math.min(30, Math.max(10, halfW)),
    halfD: Math.min(30, Math.max(10, halfD)),
    blockCount: Math.min(14, Math.max(2, blockCount)),
    ceiling: Math.max(4, ceiling),
  };
}

export function pickBiome(rng, floor) {
  const f = Math.max(1, Math.floor(floor) || 1);
  const eligible = Object.values(BIOMES).filter((b) => b.minFloor <= f);
  if (eligible.length === 0) return "cargo";
  return rng.pick(eligible).id;
}