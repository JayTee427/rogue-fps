// src/core/shake.js

export function createShake(opts = {}) {
  return {
    trauma: 0,
    t: 0,
    decay: opts.decay ?? 1.2,
    maxOffset: opts.maxOffset ?? 0.12,
    maxRoll: opts.maxRoll ?? 0.06,
    freq: opts.freq ?? 18
  };
}

export function addTrauma(s, amount) {
  if (amount > 0) {
    s.trauma = Math.min(1, s.trauma + amount);
  }
}

export function stepShake(s, dt) {
  s.t += dt;
  s.trauma = Math.max(0, s.trauma - s.decay * dt);
}

export function sampleShake(s, rng) {
  if (s.trauma <= 0) {
    return { x: 0, y: 0, roll: 0 };
  }

  const m = s.trauma * s.trauma;
  const t = s.t * s.freq;

  // Smooth noise using sum of sines with incommensurate frequencies and
  // per-axis phase offsets derived from rng (deterministic per instance).
  const p0 = rng.next() * Math.PI * 2;
  const p1 = rng.next() * Math.PI * 2;
  const p2 = rng.next() * Math.PI * 2;

  const noise0 = (Math.sin(t * 1.0 + p0) + Math.sin(t * 1.7 + p0) + Math.sin(t * 2.3 + p0)) / 3;
  const noise1 = (Math.sin(t * 1.3 + p1) + Math.sin(t * 2.1 + p1) + Math.sin(t * 2.9 + p1)) / 3;
  const noise2 = (Math.sin(t * 1.1 + p2) + Math.sin(t * 1.9 + p2) + Math.sin(t * 2.7 + p2)) / 3;

  return {
    x: noise0 * m * s.maxOffset,
    y: noise1 * m * s.maxOffset,
    roll: noise2 * m * s.maxRoll
  };
}