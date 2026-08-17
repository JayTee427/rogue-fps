// src/core/assist.js
// Touch aim assist — pure vector maths.

const EPS = 1e-9;

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v) {
  return Math.sqrt(dot(v, v));
}

function normalize(v) {
  const len = length(v);
  if (len < EPS) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function copy(v) {
  return { x: v.x, y: v.y, z: v.z };
}

export function aimAssist(aimDir, targets, strength, opts = {}) {
  if (strength <= 0 || !targets || targets.length === 0) {
    return copy(aimDir);
  }

  const coneDeg = opts.coneDeg != null ? opts.coneDeg : 8;
  const coneRad = (coneDeg * Math.PI) / 180;

  let bestAngle = Infinity;
  let bestDir = null;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const dir = normalize(t);
    const d = dot(aimDir, dir);

    if (d <= 0) {
      continue;
    }

    const angle = Math.acos(d);
    if (angle > coneRad) {
      continue;
    }

    if (angle < bestAngle) {
      bestAngle = angle;
      bestDir = dir;
    }
  }

  if (bestDir === null) {
    return copy(aimDir);
  }

  const s = Math.min(1, strength);
  const blended = add(aimDir, scale(subtract(bestDir, aimDir), s));
  return normalize(blended);
}