function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function chainTargets(enemies, originId, count, range) {
  if (count <= 0) return [];
  const origin = enemies.find(e => e.id === originId);
  if (!origin) return [];

  const used = new Set([originId]);
  const chain = [];
  let prev = origin;

  for (let i = 0; i < count; i++) {
    let best = null;
    let bestDist = Infinity;

    for (const e of enemies) {
      if (used.has(e.id)) continue;
      const dx = e.x - prev.x;
      const dy = e.y - prev.y;
      const dz = e.z - prev.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist <= range && dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }

    if (!best) break;
    used.add(best.id);
    chain.push(best);
    prev = best;
  }

  return chain;
}

export function singularityPull(center, pos, radius, strength, dt) {
  const dx = center.x - pos.x;
  const dy = center.y - pos.y;
  const dz = center.z - pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist === 0 || dist > radius) return { x: 0, y: 0, z: 0 };

  const falloff = Math.min(4, 1 / Math.max(0.25, dist / radius));
  const mag = strength * falloff * dt;
  return {
    x: (dx / dist) * mag,
    y: (dy / dist) * mag,
    z: (dz / dist) * mag
  };
}

export function ricochetDir(dir, normal) {
  const d = normalize(dir);
  const n = normalize(normal);
  const dDotN = dot(d, n);
  return {
    x: d.x - 2 * dDotN * n.x,
    y: d.y - 2 * dDotN * n.y,
    z: d.z - 2 * dDotN * n.z
  };
}

export function explosionVictims(center, radius, enemies, excludeId = null) {
  const result = [];

  for (const e of enemies) {
    if (e.id === excludeId) continue;
    const dx = e.x - center.x;
    const dy = e.y - center.y;
    const dz = e.z - center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist <= radius) {
      const falloff = 1 - (dist / radius) * 0.75;
      result.push({ id: e.id, dist, falloff });
    }
  }

  return result;
}

export function homingSteer(dir, pos, target, maxTurn) {
  const d = normalize(dir);
  if (maxTurn <= 0) return d;

  const want = normalize(subtract(target, pos));
  const cosAng = Math.min(1, Math.max(-1, dot(d, want)));
  const ang = Math.acos(cosAng);

  if (ang <= maxTurn) return want;

  const t = maxTurn / ang;
  const sinAng = Math.sin(ang);
  const sinT = Math.sin(t * ang);
  const sinOneMinusT = Math.sin((1 - t) * ang);

  return normalize({
    x: (sinOneMinusT * d.x + sinT * want.x) / sinAng,
    y: (sinOneMinusT * d.y + sinT * want.y) / sinAng,
    z: (sinOneMinusT * d.z + sinT * want.z) / sinAng
  });
}