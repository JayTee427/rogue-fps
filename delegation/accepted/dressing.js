// src/core/dressing.js

export const PROP_KINDS = {
  crate: { id: "crate", mount: "floor", w: 0.8, h: 0.8, d: 0.8, emissive: false, maxPerRoom: 8 },
  barrel: { id: "barrel", mount: "floor", w: 0.6, h: 1.0, d: 0.6, emissive: false, maxPerRoom: 6 },
  pipe_run: { id: "pipe_run", mount: "floor", w: 2.0, h: 0.4, d: 0.4, emissive: false, maxPerRoom: 5 },
  wall_terminal: { id: "wall_terminal", mount: "wall", w: 0.6, h: 1.2, d: 0.2, emissive: true, maxPerRoom: 4 },
  strip_light: { id: "strip_light", mount: "ceiling", w: 1.0, h: 0.1, d: 0.1, emissive: true, maxPerRoom: 6 },
  hanging_cable: { id: "hanging_cable", mount: "ceiling", w: 0.1, h: 3.0, d: 0.1, emissive: false, maxPerRoom: 5 },
  floor_grate: { id: "floor_grate", mount: "floor", w: 1.0, h: 0.1, d: 1.0, emissive: false, maxPerRoom: 4 },
  debris_pile: { id: "debris_pile", mount: "floor", w: 1.2, h: 0.5, d: 1.2, emissive: false, maxPerRoom: 3 }
};

const SPAWN_R = 2.5;
const MAX_ATTEMPTS = 12;

function inBlock(x, z, blocks) {
  for (const b of blocks) {
    if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) return true;
  }
  return false;
}

function nearSpawn(x, z, halfD) {
  const sz = halfD - 4;
  return Math.hypot(x, z - sz) < SPAWN_R;
}

function placeFloor(rng, kind, arena) {
  const { halfW, halfD, blocks } = arena;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const x = rng.int(-halfW * 100, halfW * 100) / 100;
    const z = rng.int(-halfD * 100, halfD * 100) / 100;
    if (inBlock(x, z, blocks)) continue;
    if (nearSpawn(x, z, halfD)) continue;
    return { kind: kind.id, x, y: kind.h / 2, z, rotY: 0, scale: 1 };
  }
  return null;
}

function placeWall(rng, kind, arena) {
  const { halfW, halfD } = arena;
  const side = rng.pick(["x+", "x-", "z+", "z-"]);
  let x, z, rotY;
  if (side === "x+") { x = halfW; z = rng.int(-halfD * 100, halfD * 100) / 100; rotY = Math.PI; }
  else if (side === "x-") { x = -halfW; z = rng.int(-halfD * 100, halfD * 100) / 100; rotY = 0; }
  else if (side === "z+") { z = halfD; x = rng.int(-halfW * 100, halfW * 100) / 100; rotY = Math.PI * 1.5; }
  else { z = -halfD; x = rng.int(-halfW * 100, halfW * 100) / 100; rotY = Math.PI * 0.5; }
  return { kind: kind.id, x, y: 1.0, z, rotY, scale: 1 };
}

function placeCeiling(rng, kind, arena) {
  const { halfW, halfD } = arena;
  const x = rng.int(-halfW * 100, halfW * 100) / 100;
  const z = rng.int(-halfD * 100, halfD * 100) / 100;
  return { kind: kind.id, x, y: 3.5, z, rotY: 0, scale: 1 };
}

export function layoutDressing(rng, arena, floor = 1) {
  const placed = [];
  const counts = {};
  const kinds = Object.values(PROP_KINDS);
  const floorKinds = kinds.filter(k => k.mount === "floor");
  const wallKinds = kinds.filter(k => k.mount === "wall");
  const ceilKinds = kinds.filter(k => k.mount === "ceiling");

  const target = Math.max(6, Math.min(80, 10 + floor * 2));
  const attempts = target * 3;

  for (let i = 0; i < attempts && placed.length < target; i++) {
    const kind = rng.pick(kinds);
    if ((counts[kind.id] || 0) >= kind.maxPerRoom) continue;

    let prop = null;
    if (kind.mount === "floor") prop = placeFloor(rng, kind, arena);
    else if (kind.mount === "wall") prop = placeWall(rng, kind, arena);
    else prop = placeCeiling(rng, kind, arena);

    if (prop) {
      placed.push(prop);
      counts[kind.id] = (counts[kind.id] || 0) + 1;
    }
  }

  if (placed.length < 6) {
    for (let i = placed.length; i < 6; i++) {
      const kind = rng.pick(floorKinds);
      const prop = placeFloor(rng, kind, arena);
      if (prop) {
        placed.push(prop);
        counts[kind.id] = (counts[kind.id] || 0) + 1;
      }
    }
  }

  return placed;
}