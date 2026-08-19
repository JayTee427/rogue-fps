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
  // "Stacked containers sweat rust in the dark." Industrial steel, rust glow.
  cargo: {
    floor: 0x3a3a40, floorSeam: 0xff9a3c, wall: 0x4a4a52, panel: 0x5c5c66,
    block: 0x605e64, blockTop: 0x96928c, trim: 0xffb04a,
    fog: 0x241f1a, sky: 0x1a1712, accent: 0xff8c32, fogDensity: 0.25,
  },
  // "Coolant leaks glow faintly under broken grates." Toxic green.
  reactor: {
    floor: 0x28423a, floorSeam: 0x4affc0, wall: 0x35544a, panel: 0x42665a,
    block: 0x467060, blockTop: 0x74a894, trim: 0x3affaa,
    fog: 0x122820, sky: 0x0a1a16, accent: 0x2fffa0, fogDensity: 0.35,
  },
  // "Bunks still hold shapes that aren't quite human." Warm, domestic, wrong.
  quarters: {
    floor: 0x453a30, floorSeam: 0xffc06a, wall: 0x584a3c, panel: 0x6b5c4a,
    block: 0x70604e, blockTop: 0xa8927a, trim: 0xffaa55,
    fog: 0x251c14, sky: 0x1c1410, accent: 0xffb866, fogDensity: 0.2,
  },
  // "Stars burn through the gaps in the plating." Cold steel and starlight.
  hull: {
    floor: 0x323c4c, floorSeam: 0x7ad4ff, wall: 0x424e62, panel: 0x526078,
    block: 0x566480, blockTop: 0x8c9cb8, trim: 0x9ae0ff,
    fog: 0x0c1420, sky: 0x05070e, accent: 0x6ac8ff, fogDensity: 0.1,
  },
  // "Glass tubes crack, spilling silence." Pale growth gone to seed.
  hydro: {
    floor: 0x323f2c, floorSeam: 0xa8ff6a, wall: 0x42523a, panel: 0x526548,
    block: 0x566a4c, blockTop: 0x8ca878, trim: 0xc0ff7a,
    fog: 0x141e10, sky: 0x0e1608, accent: 0x9aff5a, fogDensity: 0.3,
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