
export const ATTACK_SHAPES = {
  sweep_beam: {
    id: "sweep_beam",
    kind: "ranged",
    telegraph: "Laser sweep charges left to right",
    windup: 1.2,
    duration: 0.8
  },
  shockwave: {
    id: "shockwave",
    kind: "area",
    telegraph: "Ground glows before bursting outward",
    windup: 1.0,
    duration: 1.5
  },
  mortar_volley: {
    id: "mortar_volley",
    kind: "ranged",
    telegraph: "Red markers appear on the floor",
    windup: 1.5,
    duration: 2.0
  },
  summon_adds: {
    id: "summon_adds",
    kind: "summon",
    telegraph: "Rift opens and spawns minions",
    windup: 1.8,
    duration: 3.0
  },
  charge_slam: {
    id: "charge_slam",
    kind: "melee",
    telegraph: "Boss rears back and lunges forward",
    windup: 0.9,
    duration: 1.1
  },
  spore_cloud: {
    id: "spore_cloud",
    kind: "area",
    telegraph: "Toxic spores drift toward player",
    windup: 1.3,
    duration: 2.5
  }
};

export const BOSS_PATTERNS = {
  custodian: {
    phases: [
      { attacks: ["sweep_beam", "shockwave"], cooldown: 4.0 },
      { attacks: ["sweep_beam", "shockwave", "mortar_volley"], cooldown: 3.0 },
      { attacks: ["sweep_beam", "shockwave", "mortar_volley", "summon_adds"], cooldown: 2.0 }
    ]
  },
  chorus: {
    phases: [
      { attacks: ["charge_slam", "spore_cloud"], cooldown: 5.0 },
      { attacks: ["charge_slam", "spore_cloud", "shockwave"], cooldown: 3.5 },
      { attacks: ["charge_slam", "spore_cloud", "shockwave", "summon_adds"], cooldown: 2.0 }
    ]
  },
  landlord: {
    phases: [
      { attacks: ["mortar_volley", "charge_slam"], cooldown: 4.5 },
      { attacks: ["mortar_volley", "charge_slam", "sweep_beam"], cooldown: 3.0 },
      { attacks: ["mortar_volley", "charge_slam", "sweep_beam", "spore_cloud"], cooldown: 1.8 }
    ]
  }
};

export function bossPhase(hpFrac) {
  if (typeof hpFrac !== "number" || isNaN(hpFrac)) return 1;
  if (hpFrac >= 0.66) return 0;
  if (hpFrac >= 0.33) return 1;
  return 2;
}

export function nextAttack(rng, bossId, hpFrac, prevShape) {
  if (!Object.prototype.hasOwnProperty.call(BOSS_PATTERNS, bossId)) {
    throw new Error(`Unknown boss: ${bossId}`);
  }

  const phaseIndex = bossPhase(hpFrac);
  const phase = BOSS_PATTERNS[bossId].phases[phaseIndex];
  const available = phase.attacks.filter(id => id !== prevShape);
  const pool = available.length > 0 ? available : phase.attacks;
  const shapeId = rng.pick(pool);
  const shape = ATTACK_SHAPES[shapeId];
  const cooldown = phase.cooldown * (0.9 + rng.next() * 0.2);

  return {
    shape: shapeId,
    phase: phaseIndex,
    kind: shape.kind,
    telegraph: shape.telegraph,
    windup: shape.windup,
    duration: shape.duration,
    cooldown
  };
}

export function telegraphFor(shapeId) {
  const shape = ATTACK_SHAPES[shapeId];
  if (shape && typeof shape.telegraph === "string") {
    return shape.telegraph.slice(0, 40);
  }
  return "Something is about to happen";
}