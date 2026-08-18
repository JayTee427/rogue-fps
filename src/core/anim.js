// src/core/anim.js
// Procedural animation curves for enemy gaits and poses. Pure math only.

const DEFAULT_GAIT = {
  id: "sentinel",
  period: 1.4,
  bobHeight: 0.18,
  grounded: true,
};

export const GAITS = {
  skitter: { id: "skitter", period: 0.45, bobHeight: 0.08, grounded: true },
  sentinel: { id: "sentinel", period: 1.4, bobHeight: 0.18, grounded: true },
  brute: { id: "brute", period: 2.2, bobHeight: 0.42, grounded: true },
  popper: { id: "popper", period: 0.9, bobHeight: 0.28, grounded: true },
  warden: { id: "warden", period: 1.7, bobHeight: 0.22, grounded: true },
  wisp: { id: "wisp", period: 3.0, bobHeight: 0.12, grounded: false },
};

function sanitizeNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function safeSpeed(speed) {
  const s = sanitizeNumber(speed, 0);
  return clamp(s, 0, 20);
}

function safeTime(t) {
  return sanitizeNumber(t, 0);
}

export function gaitPose(archetype, t, speed) {
  const gait = (archetype && GAITS[archetype]) || DEFAULT_GAIT;
  const time = safeTime(t);
  const spd = safeSpeed(speed);

  const period = Math.max(0.05, gait.period);
  const bob = Math.max(0, gait.bobHeight);
  const grounded = gait.grounded;

  // Idle breathing even at zero speed.
  const idleAmp = 0.02;
  const idleFreq = 1.7;

  // Speed-driven amplitude (clearly larger at high speed).
  const moveAmp = bob * 0.5;
  const speedFactor = spd / 20; // 0..1
  const amp = idleAmp + moveAmp * speedFactor;

  const phase = (time / period) * Math.PI * 2;
  const base = Math.sin(phase);

  // Vertical offset: bob up/down.
  let bodyY = base * amp;

  // Pitch: nose up/down with stride.
  let pitch = base * 0.15 * (grounded ? 1 : 0.5);

  // Roll: side-to-side lean per step.
  let roll = Math.cos(phase) * 0.1 * (grounded ? 1 : 0.4);

  // Forward lean scales with speed.
  let lean = spd * 0.02;
  lean = clamp(lean, -0.8, 0.8);

  // Squash and stretch: drop => widen.
  const squash = 1 - base * 0.1;
  const stretch = 1 + base * 0.15;
  let scaleY = clamp(squash, 0.55, 1.75);
  let scaleXZ = clamp(stretch, 0.55, 1.75);

  // Wisp floats: extra drift.
  if (!grounded) {
    bodyY += Math.sin(time * 0.7) * 0.05;
    pitch *= 0.3;
    roll *= 0.3;
  }

  // Hard bounds enforcement.
  bodyY = clamp(bodyY, -1.2, 1.2);
  pitch = clamp(pitch, -0.8, 0.8);
  roll = clamp(roll, -0.8, 0.8);

  return {
    bodyY,
    pitch,
    roll,
    lean,
    scaleY,
    scaleXZ,
    phase,
  };
}

export function windupPose(progress) {
  const p = clamp(sanitizeNumber(progress, 0), 0, 1);
  // Anticipate: lean grows toward strike.
  const lean = p * p * 0.9;
  // Scale pulses: slight shrink then grow.
  const scale = 0.85 + 0.3 * Math.sin(p * Math.PI);
  return {
    lean: clamp(lean, -1, 1),
    scale: clamp(scale, 0.45, 1.95),
  };
}

export function flinchPose(age) {
  const a = sanitizeNumber(age, 0);
  const decay = Math.exp(-a * 2.5);
  const offset = 0.18 * decay;
  const scale = 1 + 0.15 * decay;
  return {
    offset: clamp(offset, -0.5, 0.5),
    scale: clamp(scale, 0.55, 1.75),
  };
}

export function deathPose(t) {
  const time = sanitizeNumber(t, 0);
  const p = clamp(time, 0, 1);
  // Shrink over lifetime.
  const scale = 1 - p * 0.85;
  const done = p >= 1;
  return {
    scale: Math.max(0.05, scale),
    done,
  };
}