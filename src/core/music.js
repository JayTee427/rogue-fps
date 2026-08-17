
export const SCALES = {
  minorPent: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

export function noteHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createScore(rng) {
  const scaleName = rng.pick(Object.keys(SCALES));
  const scale = SCALES[scaleName];
  const motif = [];
  for (let i = 0; i < 8; i++) {
    motif.push(rng.int(0, scale.length - 1));
  }
  return {
    root: rng.int(36, 48),
    scaleName,
    bpm: rng.int(100, 150),
    intensity: 0,
    bar: 0,
    boss: false,
    motif,
    seed: rng.int(0, 9999),
  };
}

export function setIntensity(score, v) {
  score.intensity = clamp(v, 0, 1);
}

function degreeToMidi(root, scale, degree, octave) {
  const len = scale.length;
  const idx = ((degree % len) + len) % len;
  return root + scale[idx] + 12 * octave;
}

function makeEvent(voice, t, dur, gain, midi) {
  const e = { voice, t, dur, gain };
  if (midi !== undefined) e.midi = midi;
  return e;
}

export function nextBar(score, rng) {
  const { root, scaleName, bpm, intensity, bar, boss, motif } = score;
  const scale = SCALES[scaleName];
  const events = [];
  const beatSec = 60 / bpm;
  const barIndex = bar;
  score.bar += 1;

  const i = barIndex;
  const m = motif[i % motif.length];

  if (intensity < 0.5) {
    // Pad + sparse bass only
    const padMidi = degreeToMidi(root, scale, 0, 1);
    events.push(makeEvent("pad", 0, 4, 0.6, padMidi));
    if (rng.chance(0.3)) {
      const bassMidi = degreeToMidi(root, scale, m, 0);
      events.push(makeEvent("bass", 0, 2, 0.5, bassMidi));
    }
    return { events, barIndex, beatSec };
  }

  // Kick at t=0 every bar when intensity >= 0.5
  events.push(makeEvent("kick", 0, 0.5, 0.8));

  // Hats
  const hatDur = boss ? 0.25 : 0.5;
  const hatStep = boss ? 0.25 : 0.5;
  for (let t = 0; t < 4; t += hatStep) {
    events.push(makeEvent("hat", t, hatDur, 0.4));
  }

  if (intensity < 1) {
    // Bass line
    const bassOctave = 0;
    const bassMidi = degreeToMidi(root, scale, m, bassOctave);
    events.push(makeEvent("bass", 0, 1, 0.6, bassMidi));
    if (rng.chance(0.5)) {
      const bassMidi2 = degreeToMidi(root, scale, (m + 2) % scale.length, bassOctave);
      events.push(makeEvent("bass", 2, 1, 0.5, bassMidi2));
    }
    return { events, barIndex, beatSec };
  }

  // Intensity 1: lead + bass + kick + hat
  const bassOctave = 0;
  const leadOctave = 2;
  const bassMidi = degreeToMidi(root, scale, m, bassOctave);
  events.push(makeEvent("bass", 0, 1, 0.6, bassMidi));

  const leadDegree = (m + i) % scale.length;
  const leadMidi = degreeToMidi(root, scale, leadDegree, leadOctave);
  const leadT = (i % 4) * 0.5;
  if (rng.chance(0.8)) {
    events.push(makeEvent("lead", leadT, 0.5, 0.7, leadMidi));
  }

  if (rng.chance(0.4)) {
    const bassMidi2 = degreeToMidi(root, scale, (m + 3) % scale.length, bassOctave);
    events.push(makeEvent("bass", 2, 1, 0.5, bassMidi2));
  }

  if (boss) {
    const lowPad = degreeToMidi(root, scale, 0, -1);
    events.push(makeEvent("pad", 0, 4, 0.5, lowPad));
  }

  return { events, barIndex, beatSec };
}