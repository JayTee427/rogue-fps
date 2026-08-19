
export const ATTACK_SHAPES = {
  sweep_beam: {
    id: "sweep_beam",
    kind: "ranged",
    telegraph: "Laser sweep — cross behind it or jump it",
    windup: 1.2,
    duration: 0.8,
    // The sweep's whole geometry, so the shell only draws what this declares.
    sweep: { arcDeg: 150, range: 22, height: 1.15 },
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
  // Area denial: it doesn't chase you, it makes everywhere you want to stand
  // wrong. Spores and mortars own the ground; the beam arrives late to punish
  // whoever learned to stand still.
  gardener: {
    phases: [
      { attacks: ["spore_cloud", "mortar_volley"], cooldown: 4.5 },
      { attacks: ["spore_cloud", "mortar_volley", "summon_adds"], cooldown: 3.2 },
      { attacks: ["spore_cloud", "mortar_volley", "summon_adds", "sweep_beam"], cooldown: 2.2 }
    ]
  },
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
/** Normalize an angle to (-PI, PI]. */
export function normAngle(a) {
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * Did a sweep moving from angle `prev` to angle `cur` pass over `target`?
 * All angles absolute radians; handles wrap-around. The crossing moment is the
 * only moment the beam can hit, which is what makes the sweep dodgeable: being
 * somewhere the beam has already been is safe by construction.
 */
export function angleCrossed(prev, cur, target) {
  const step = normAngle(cur - prev);
  const toTarget = normAngle(target - prev);
  if (step >= 0) return toTarget >= 0 && toTarget <= step;
  return toTarget <= 0 && toTarget >= step;
}
