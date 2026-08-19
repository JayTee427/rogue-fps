function distanceXZ(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function rejectNearPlayer(x, z, halfW, halfD, rng) {
  const px = 0;
  const pz = halfD - 4;
  let attempts = 0;
  while (attempts < 100) {
    const dist = Math.sqrt((x - px) ** 2 + (z - pz) ** 2);
    if (dist > 5) return { x, z };
    x = rng.int(-halfW + 2, halfW - 2);
    z = rng.int(-halfD + 2, halfD - 2);
    attempts++;
  }
  return { x, z };
}

export const HAZARD_DEFS = {
  lava_floor: { name: "Lava Floor", desc: "Burns anything that steps in it." },
  turrets: { name: "Turrets", desc: "Automated gun turrets that shoot intruders." },
  mines: { name: "Mines", desc: "Proximity mines that explode on contact." },
  acid_pools: { name: "Acid Pools", desc: "Pools of corrosive acid that slow and damage." },
  collapsing: { name: "Collapsing Floor", desc: "Unstable floor that collapses underfoot." }
};

export function spawnHazards(rng, tag, arena, floor) {
  if (!tag || !HAZARD_DEFS[tag]) return [];
  const { halfW, halfD } = arena;
  const d = Math.max(0, floor - 1);
  let count;
  if (tag === "lava_floor") count = rng.int(3, 5);
  else if (tag === "turrets") count = rng.int(2, 3);
  else if (tag === "mines") count = rng.int(5, 8);
  else if (tag === "acid_pools") count = rng.int(3, 4);
  else if (tag === "collapsing") count = rng.int(6, 9);
  count += Math.floor(d / 2);

  const hazards = [];
  for (let i = 0; i < count; i++) {
    let x = rng.int(-halfW + 2, halfW - 2);
    let z = rng.int(-halfD + 2, halfD - 2);
    const pos = rejectNearPlayer(x, z, halfW, halfD, rng);
    x = pos.x;
    z = pos.z;
    const id = `${tag}-${i}`;
    let h;
    if (tag === "lava_floor") {
      h = { id, kind: tag, x, z, radius: rng.int(20, 35) / 10, dps: 12 + 3 * d };
    } else if (tag === "acid_pools") {
      h = { id, kind: tag, x, z, radius: rng.int(20, 30) / 10, dps: 8 + 2 * d, slow: 0.4 };
    } else if (tag === "turrets") {
      h = { id, kind: tag, x, z, radius: 0.7, range: 16, cd: 1.5, cdMax: 1.6, damage: 10 + 2 * d, y: 1.2 };
    } else if (tag === "mines") {
      h = { id, kind: tag, x, z, radius: 1.4, armed: true, damage: 35 + 5 * d, blast: 3.5 };
    } else if (tag === "collapsing") {
      h = { id, kind: tag, x, z, radius: 1.8, state: "solid", timer: 1.2, dps: 20 };
    }
    // Hazards were placed without regard for cover, so a mine could sit inside a
    // block: invisible until you walked round the corner onto it. Skip any that
    // land in one rather than teaching the player that corners are lethal.
    const buried = (arena.blocks ?? []).some(
      (b) => Math.abs(x - b.x) < b.w / 2 + 0.6 && Math.abs(z - b.z) < b.d / 2 + 0.6
    );
    if (!buried) hazards.push(h);
  }
  return hazards;
}

export function stepHazards(hazards, dt, player, rng) {
  const events = [];
  const updated = [];

  for (const h of hazards) {
    const dist = distanceXZ(h, player);
    const inside = dist <= h.radius;

    if (h.kind === "lava_floor") {
      if (inside) {
        events.push({ type: "damage", amount: h.dps * dt, source: h.id });
      }
      updated.push(h);
    } else if (h.kind === "acid_pools") {
      if (inside) {
        events.push({ type: "damage", amount: h.dps * dt, source: h.id });
        events.push({ type: "slow", amount: h.slow, source: h.id });
      }
      updated.push(h);
    } else if (h.kind === "turrets") {
      const u = { ...h, cd: h.cd - dt };
      if (dist <= h.range && u.cd <= 0) {
        // 3-D aim: turrets sit at h.y and shoot at the player's eye height, so a
        // 2-D {x,z} direction would send every shot along the floor.
        const dx = player.x - h.x;
        const dy = (player.y ?? 1.7) - (h.y ?? 0);
        const dz = player.z - h.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const dir = len > 0 ? { x: dx / len, y: dy / len, z: dz / len } : { x: 0, y: 0, z: 1 };
        events.push({
          type: "shoot",
          x: h.x,
          y: h.y,
          z: h.z,
          dir,
          damage: h.damage,
          speed: 22,
          source: h.id
        });
        u.cd = h.cdMax;
      }
      updated.push(u);
    } else if (h.kind === "mines") {
      if (h.armed && inside) {
        events.push({
          type: "explode",
          x: h.x,
          z: h.z,
          radius: h.blast,
          damage: h.damage,
          source: h.id
        });
      } else {
        updated.push(h);
      }
    } else if (h.kind === "collapsing") {
      const u = { ...h };
      if (u.state === "solid" && inside) {
        u.state = "cracking";
      }
      if (u.state === "cracking") {
        u.timer -= dt;
        if (u.timer <= 0) {
          u.state = "hole";
        }
      }
      if (u.state === "hole" && inside) {
        events.push({ type: "damage", amount: h.dps * dt, source: h.id });
      }
      updated.push(u);
    }
  }

  return { hazards: updated, events };
}