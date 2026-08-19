// src/core/rng.js

const fnv1a32 = (str) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
};


export function rng(seed) {
  const s = Number(seed) >>> 0;
  let state = s;

  const next = () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (lo, hi) => {
    return lo + Math.floor(next() * (hi - lo + 1));
  };

  const pick = (arr) => {
    return arr[int(0, arr.length - 1)];
  };

  const chance = (p) => {
    return next() < p;
  };

  const shuffle = (arr) => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  };

  const fork = (label) => {
    const derivedSeed = s ^ fnv1a32(String(label));
    return rng(derivedSeed);
  };

  return {
    next,
    int,
    pick,
    chance,
    shuffle,
    fork,
  };
}