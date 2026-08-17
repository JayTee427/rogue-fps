// REFERENCE — never shown to the worker.
export const SCALES = { minorPent: [0, 3, 5, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
export const noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export function createScore(r) {
  const names = Object.keys(SCALES);
  return { root: r.int(36, 48), scaleName: r.pick(names), bpm: r.int(100, 150), intensity: 0, bar: 0, boss: false, motif: Array.from({ length: 8 }, () => r.int(0, 4)) };
}
export function setIntensity(s, v) { s.intensity = Math.max(0, Math.min(1, v)); }

const inScale = (s, degree, octave) => { const sc = SCALES[s.scaleName]; const d = ((degree % sc.length) + sc.length) % sc.length; const o = octave + Math.floor(degree / sc.length); return s.root + sc[d] + o * 12; };

export function nextBar(s, r) {
  const i = s.intensity, ev = [], bar = s.bar++;
  const g = (v) => Math.max(0.05, Math.min(1, v));
  // pad: always; boss adds a sub pad at/below root
  ev.push({ voice: "pad", t: 0, dur: 4, midi: inScale(s, 0, 1), gain: g(0.25 + i * 0.1) });
  if (bar % 2 === 1) ev.push({ voice: "pad", t: 0, dur: 4, midi: inScale(s, 4, 1), gain: g(0.18) });
  if (s.boss) ev.push({ voice: "pad", t: 0, dur: 4, midi: s.root - 12, gain: 0.35 });
  // bass: sparse at low intensity, walking at high
  const bassSteps = i < 0.3 ? [0] : i < 0.7 ? [0, 2] : [0, 1, 2, 3];
  for (const b of bassSteps) ev.push({ voice: "bass", t: b, dur: i < 0.7 ? 1.5 : 0.8, midi: inScale(s, s.motif[(bar + b) % 8] % 3, 0), gain: g(0.5 + i * 0.3) });
  // drums from 0.5
  if (i >= 0.5) {
    ev.push({ voice: "kick", t: 0, dur: 0.1, gain: 0.9 }); ev.push({ voice: "kick", t: 2, dur: 0.1, gain: 0.85 });
    if (i > 0.75 && r.chance(0.5)) ev.push({ voice: "kick", t: 3.5, dur: 0.1, gain: 0.7 });
    ev.push({ voice: "snare", t: 1, dur: 0.1, gain: 0.7 }); ev.push({ voice: "snare", t: 3, dur: 0.1, gain: 0.7 });
    const hatDiv = s.boss ? 0.25 : i > 0.8 ? 0.5 : 1;
    for (let t = 0; t < 4; t += hatDiv) ev.push({ voice: "hat", t, dur: 0.05, gain: g(0.25 + (t % 1 === 0 ? 0.15 : 0)) });
  }
  // lead from 0.6: motif in a high register, occasional rests
  if (i >= 0.6) {
    for (let k = 0; k < 8; k++) {
      if (r.chance(0.25 + (1 - i) * 0.3)) continue;
      ev.push({ voice: "lead", t: k * 0.5, dur: 0.4, midi: inScale(s, s.motif[(k + bar) % 8] + (r.chance(0.2) ? 7 : 0), 2), gain: g(0.35 + i * 0.2) });
    }
  }
  return { events: ev, barIndex: bar, beatSec: 60 / s.bpm };
}
