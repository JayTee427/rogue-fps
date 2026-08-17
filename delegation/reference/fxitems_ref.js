// REFERENCE — never shown to the worker.
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export function chainTargets(enemies, originId, count, range) {
  const origin = enemies.find(e => e.id === originId);
  if (!origin || count <= 0) return [];
  const used = new Set([originId]);
  const out = [];
  let from = origin;
  while (out.length < count) {
    let best = null, bd = Infinity;
    for (const e of enemies) {
      if (used.has(e.id)) continue;
      const d = len(sub(e, from));
      if (d <= range && d < bd) { best = e; bd = d; }
    }
    if (!best) break;
    used.add(best.id); out.push(best); from = best;
  }
  return out;
}

export function singularityPull(center, pos, radius, strength, dt) {
  const d = sub(center, pos);
  const dist = len(d);
  if (dist > radius || dist === 0) return { x: 0, y: 0, z: 0 };
  const falloff = Math.min(4, 1 / Math.max(0.25, dist / radius));      // capped inverse
  const s = strength * falloff * dt;
  const n = norm(d);
  return { x: n.x * s, y: n.y * s, z: n.z * s };
}

export function ricochetDir(dir, normal) {
  const d = norm(dir), n = norm(normal);
  const k = 2 * dot(d, n);
  return norm({ x: d.x - k * n.x, y: d.y - k * n.y, z: d.z - k * n.z });
}

export function explosionVictims(center, radius, enemies, excludeId = null) {
  const out = [];
  for (const e of enemies) {
    if (e.id === excludeId) continue;
    const d = len(sub(e, center));
    if (d <= radius) out.push({ id: e.id, dist: d, falloff: 1 - d / (radius + 1e-9) * 0.75 });
  }
  return out;
}

export function homingSteer(dir, pos, target, maxTurn) {
  const d = norm(dir);
  if (maxTurn <= 0) return d;
  const want = norm(sub(target, pos));
  const c = Math.max(-1, Math.min(1, dot(d, want)));
  const ang = Math.acos(c);
  if (ang <= maxTurn) return want;
  // rotate d toward want by maxTurn in the plane they span
  const t = maxTurn / ang;
  const s1 = Math.sin((1 - t) * ang) / Math.sin(ang), s2 = Math.sin(t * ang) / Math.sin(ang);
  return norm({ x: d.x * s1 + want.x * s2, y: d.y * s1 + want.y * s2, z: d.z * s1 + want.z * s2 });
}
