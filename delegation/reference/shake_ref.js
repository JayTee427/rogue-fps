// REFERENCE — never shown to the worker.
export function createShake(opts = {}) {
  return { trauma: 0, t: 0, decay: opts.decay ?? 1.2, maxOffset: opts.maxOffset ?? 0.12, maxRoll: opts.maxRoll ?? 0.06, freq: opts.freq ?? 18, seed: opts.seed ?? 0 };
}
export function addTrauma(s, amount) { if (amount > 0) s.trauma = Math.min(1, s.trauma + amount); }
export function stepShake(s, dt) { s.t += dt; s.trauma = Math.max(0, s.trauma - s.decay * dt); }

// cheap smooth 1-D noise: sum of incommensurate sines, in [-1,1]
function smooth(t, k) {
  return (Math.sin(t * 1.0 + k * 1.7) * 0.5 + Math.sin(t * 2.3 + k * 3.1) * 0.3 + Math.sin(t * 4.1 + k * 0.7) * 0.2);
}
export function sampleShake(s, r) {
  if (s.trauma <= 0) return { x: 0, y: 0, roll: 0 };
  const m = s.trauma * s.trauma;
  const t = s.t * s.freq;
  return {
    x: smooth(t, 0.0) * m * s.maxOffset,
    y: smooth(t, 5.0) * m * s.maxOffset,
    roll: smooth(t, 9.0) * m * s.maxRoll,
  };
}
