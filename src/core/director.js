export const DIFFICULTY_BANDS = [
  { name: "struggling", max: 0.3 },
  { name: "steady", max: 0.7 },
  { name: "dominant", max: 1 }
];

function bandFor(skill) {
  for (const b of DIFFICULTY_BANDS) {
    if (b.max >= skill) return b.name;
  }
  return DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1].name;
}

function splitWaves(rng, roster, skill, firstRoom) {
  const n = roster.length;
  if (n === 0) return [];
  if (n === 1) return [{ delay: 0, ids: [roster[0]] }];

  let waveCount;
  if (n >= 4) {
    waveCount = rng.int(2, Math.min(4, n));
  } else {
    waveCount = rng.chance(0.5) ? 1 : 2;
  }

  const shuffled = rng.shuffle(roster);
  const waves = [];
  const sizes = Array(waveCount).fill(0);
  for (let i = 0; i < n; i++) {
    sizes[i % waveCount]++;
  }

  let idx = 0;
  for (let i = 0; i < waveCount; i++) {
    const ids = shuffled.slice(idx, idx + sizes[i]);
    idx += sizes[i];
    waves.push({ delay: 0, ids });
  }

  if (firstRoom) {
    const cap = Math.ceil(n / 2);
    if (waves[0].ids.length > cap) {
      const overflow = waves[0].ids.splice(cap);
      waves[1].ids = overflow.concat(waves[1].ids);
    }
  }

  const baseGap = 4 + 2 * skill;
  const gapMult = 1.6 - 1.1 * skill;
  let delay = 0;
  for (let i = 1; i < waves.length; i++) {
    delay += baseGap * gapMult;
    waves[i].delay = delay;
  }

  return waves;
}

export function planEncounter(rng, { floor, roomIndex, roster, skill }) {
  const s = Number(skill);
  const clamped = Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : 0.5;
  const band = bandFor(clamped);
  const firstRoom = floor === 1 && roomIndex === 0;
  const waves = splitWaves(rng, roster, clamped, firstRoom);
  return { band, waves };
}

export function updateSkill(prev, perf) {
  const p = Number.isFinite(prev) ? Math.max(0, Math.min(1, prev)) : 0.5;

  const cleared = Number.isFinite(perf?.clearedSecs) ? perf.clearedSecs : 30;
  const damage = Number.isFinite(perf?.damageTaken) ? perf.damageTaken : 10;
  const acc = Number.isFinite(perf?.accuracy) ? perf.accuracy : 0.7;

  const clearScore = Math.max(0, Math.min(1, 1 - cleared / 60));
  const dmgScore = Math.max(0, Math.min(1, 1 - damage / 30));
  const accScore = Math.max(0, Math.min(1, acc));

  const roomScore = (clearScore + dmgScore + accScore) / 3;
  const delta = roomScore - p;
  const limited = Math.max(-0.25, Math.min(0.25, delta));
  return Math.max(0, Math.min(1, p + limited));
}