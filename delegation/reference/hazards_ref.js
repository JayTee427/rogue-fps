// REFERENCE — never shown to the worker.
export const HAZARD_DEFS = {
  lava_floor: { name: "Lava Floor",  desc: "glowing pools; standing in one burns" },
  turrets:    { name: "Turrets",     desc: "fixed guns that fire when you are in range" },
  mines:      { name: "Mines",       desc: "proximity mines; step near and they blow" },
  acid_pools: { name: "Acid Pools",  desc: "pools that burn and slow" },
  collapsing: { name: "Collapsing",  desc: "floor tiles that crack under you and fall away" },
};
const SPAWN = { x: 0, zOff: 4 };
const COUNT = { lava_floor: [3, 5], turrets: [2, 3], mines: [5, 8], acid_pools: [3, 4], collapsing: [6, 9] };

export function spawnHazards(r, tag, arena, floor) {
  if (!tag || !HAZARD_DEFS[tag]) return [];
  const d = Math.max(0, floor - 1);
  const [lo, hi] = COUNT[tag];
  const n = r.int(lo, hi) + Math.floor(d / 2);
  const out = [];
  const spawnZ = arena.halfD - SPAWN.zOff;
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const x = r.int(-arena.halfW + 2, arena.halfW - 2), z = r.int(-arena.halfD + 2, arena.halfD - 2);
    if (Math.hypot(x - SPAWN.x, z - spawnZ) < 5) continue;
    const id = `${tag}-${out.length}`;
    if (tag === "lava_floor") out.push({ id, kind: tag, x, z, radius: 2 + r.next() * 1.5, dps: 12 + d * 3 });
    else if (tag === "acid_pools") out.push({ id, kind: tag, x, z, radius: 2 + r.next(), dps: 8 + d * 2, slow: 0.4 });
    else if (tag === "turrets") out.push({ id, kind: tag, x, z, radius: 0.7, range: 16, cd: 1.5, cdMax: 1.6, damage: 10 + d * 2, y: 1.2 });
    else if (tag === "mines") out.push({ id, kind: tag, x, z, radius: 1.4, armed: true, damage: 35 + d * 5, blast: 3.5 });
    else if (tag === "collapsing") out.push({ id, kind: tag, x, z, radius: 1.8, state: "solid", timer: 1.2, dps: 20 });
  }
  return out;
}

export function stepHazards(hazards, dt, player, r) {
  const events = [];
  const out = [];
  for (const h0 of hazards) {
    const h = { ...h0 };
    const dist = Math.hypot(player.x - h.x, player.z - h.z);
    const inside = dist <= h.radius;
    switch (h.kind) {
      case "lava_floor": if (inside) events.push({ type: "damage", amount: h.dps * dt, source: h.id }); out.push(h); break;
      case "acid_pools": if (inside) { events.push({ type: "damage", amount: h.dps * dt, source: h.id }); events.push({ type: "slow", amount: h.slow, source: h.id }); } out.push(h); break;
      case "mines":
        if (h.armed && inside) { events.push({ type: "explode", x: h.x, z: h.z, radius: h.blast, damage: h.damage, source: h.id }); /* removed */ }
        else out.push(h);
        break;
      case "turrets": {
        h.cd -= dt;
        if (dist <= h.range && h.cd <= 0) {
          const dx = player.x - h.x, dy = player.y - h.y, dz = player.z - h.z, l = Math.hypot(dx, dy, dz) || 1;
          events.push({ type: "shoot", x: h.x, y: h.y, z: h.z, dir: { x: dx / l, y: dy / l, z: dz / l }, damage: h.damage, speed: 22, source: h.id });
          h.cd = h.cdMax;
        }
        out.push(h); break;
      }
      case "collapsing":
        if (h.state === "solid" && inside) h.state = "cracking";
        if (h.state === "cracking") { h.timer -= dt; if (h.timer <= 0) h.state = "hole"; }
        if (h.state === "hole" && inside) events.push({ type: "damage", amount: h.dps * dt, source: h.id });
        out.push(h); break;
      default: out.push(h);
    }
  }
  return { hazards: out, events };
}
