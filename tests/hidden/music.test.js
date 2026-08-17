import { describe, it, expect } from "vitest";
import { SCALES, createScore, setIntensity, nextBar, noteHz } from "core/music.js";
import { rng } from "core/rng.js";

// A pure adaptive sequencer. It emits BARS of note events; the WebAudio layer
// plays them. Intensity 0..1 changes density and register; the key never
// changes mid-run so it always sounds like one piece.

describe("SCALES / noteHz", () => {
  it("defines minor-pentatonic, dorian, and phrygian as semitone arrays", () => {
    for (const k of ["minorPent", "dorian", "phrygian"]) {
      expect(Array.isArray(SCALES[k])).toBe(true);
      expect(SCALES[k][0]).toBe(0);
      for (const s of SCALES[k]) expect(Number.isInteger(s) && s >= 0 && s < 12).toBe(true);
    }
  });
  it("noteHz(midi) is A440 tuning", () => {
    expect(noteHz(69)).toBeCloseTo(440);
    expect(noteHz(57)).toBeCloseTo(220);
    expect(noteHz(81)).toBeCloseTo(880);
  });
});

describe("createScore", () => {
  it("returns a score with a root, scale, bpm, and intensity 0", () => {
    const s = createScore(rng(1));
    expect(Number.isInteger(s.root)).toBe(true);
    expect(s.root).toBeGreaterThanOrEqual(36); expect(s.root).toBeLessThanOrEqual(48);
    expect(Object.keys(SCALES)).toContain(s.scaleName);
    expect(s.bpm).toBeGreaterThanOrEqual(100); expect(s.bpm).toBeLessThanOrEqual(150);
    expect(s.intensity).toBe(0);
    expect(s.bar).toBe(0);
  });
  it("is deterministic per seed", () => {
    expect(createScore(rng(7))).toEqual(createScore(rng(7)));
  });
  it("different seeds pick different keys or tempos", () => {
    const a = createScore(rng(1)), b = createScore(rng(2));
    expect(a.root !== b.root || a.bpm !== b.bpm || a.scaleName !== b.scaleName).toBe(true);
  });
});

describe("setIntensity", () => {
  it("clamps to [0,1] and mutates the score", () => {
    const s = createScore(rng(1));
    setIntensity(s, 1.7); expect(s.intensity).toBe(1);
    setIntensity(s, -2); expect(s.intensity).toBe(0);
    setIntensity(s, 0.4); expect(s.intensity).toBeCloseTo(0.4);
  });
});

describe("nextBar", () => {
  const events = (s, n = 1) => { let out = []; for (let i = 0; i < n; i++) out = out.concat(nextBar(s, rng(100 + i)).events); return out; };

  it("returns { events, barIndex, beatSec } and advances the bar counter", () => {
    const s = createScore(rng(3));
    const b = nextBar(s, rng(1));
    expect(Array.isArray(b.events)).toBe(true);
    expect(b.barIndex).toBe(0);
    expect(b.beatSec).toBeCloseTo(60 / s.bpm);
    expect(s.bar).toBe(1);
    expect(nextBar(s, rng(2)).barIndex).toBe(1);
  });

  it("every event has the shape the player needs", () => {
    const s = createScore(rng(3)); setIntensity(s, 0.8);
    for (const e of events(s, 4)) {
      expect(["kick", "snare", "hat", "bass", "lead", "pad"]).toContain(e.voice);
      expect(e.t).toBeGreaterThanOrEqual(0); expect(e.t).toBeLessThan(4);      // beat offset within a 4/4 bar
      expect(e.dur).toBeGreaterThan(0);
      expect(e.gain).toBeGreaterThan(0); expect(e.gain).toBeLessThanOrEqual(1);
      if (["bass", "lead", "pad"].includes(e.voice)) expect(Number.isInteger(e.midi)).toBe(true);
    }
  });

  it("at intensity 0 there is a pad and sparse bass, and NO drums or lead", () => {
    const s = createScore(rng(4)); setIntensity(s, 0);
    const ev = events(s, 4);
    const voices = new Set(ev.map(e => e.voice));
    expect(voices.has("pad")).toBe(true);
    expect(voices.has("kick")).toBe(false);
    expect(voices.has("snare")).toBe(false);
    expect(voices.has("lead")).toBe(false);
  });

  it("at intensity 1 there are drums on every bar and a lead", () => {
    const s = createScore(rng(4)); setIntensity(s, 1);
    for (let i = 0; i < 4; i++) {
      const b = nextBar(s, rng(50 + i)).events;
      expect(b.some(e => e.voice === "kick")).toBe(true);
      expect(b.some(e => e.voice === "hat")).toBe(true);
    }
    expect(events(s, 4).some(e => e.voice === "lead")).toBe(true);
  });

  it("density rises with intensity (more events per bar)", () => {
    const count = (i) => { const s = createScore(rng(5)); setIntensity(s, i); return events(s, 8).length; };
    expect(count(0.5)).toBeGreaterThan(count(0));
    expect(count(1)).toBeGreaterThan(count(0.5));
  });

  it("all pitched notes are IN KEY: (midi - root) mod 12 is in the scale", () => {
    const s = createScore(rng(6)); setIntensity(s, 1);
    const scale = SCALES[s.scaleName];
    for (const e of events(s, 8)) if (e.midi != null) expect(scale).toContain(((e.midi - s.root) % 12 + 12) % 12);
  });

  it("the kick lands on beat 0 of every bar at intensity >= 0.5", () => {
    const s = createScore(rng(6)); setIntensity(s, 0.6);
    for (let i = 0; i < 6; i++) {
      const b = nextBar(s, rng(9 + i)).events;
      expect(b.some(e => e.voice === "kick" && Math.abs(e.t) < 1e-9)).toBe(true);
    }
  });

  it("bass sits below the lead in register", () => {
    const s = createScore(rng(8)); setIntensity(s, 1);
    const ev = events(s, 8);
    const bass = ev.filter(e => e.voice === "bass").map(e => e.midi), lead = ev.filter(e => e.voice === "lead").map(e => e.midi);
    expect(bass.length).toBeGreaterThan(0); expect(lead.length).toBeGreaterThan(0);
    expect(Math.max(...bass)).toBeLessThan(Math.min(...lead));
  });

  it("is deterministic given the same score state and rng seed", () => {
    const a = createScore(rng(11)); setIntensity(a, 0.7);
    const b = createScore(rng(11)); setIntensity(b, 0.7);
    expect(nextBar(a, rng(3))).toEqual(nextBar(b, rng(3)));
  });

  it("varies from bar to bar (not the same loop forever)", () => {
    const s = createScore(rng(12)); setIntensity(s, 0.8);
    const sig = (b) => b.events.filter(e => e.voice === "lead" || e.voice === "bass").map(e => `${e.voice}${e.midi}@${e.t.toFixed(2)}`).join("|");
    const sigs = new Set(); for (let i = 0; i < 8; i++) sigs.add(sig(nextBar(s, rng(300 + i))));
    expect(sigs.size).toBeGreaterThan(2);
  });

  it("boss mode adds a low pulsing pad and a faster hat pattern", () => {
    const s = createScore(rng(13)); setIntensity(s, 1); s.boss = true;
    const ev = events(s, 4);
    const hats = ev.filter(e => e.voice === "hat");
    const s2 = createScore(rng(13)); setIntensity(s2, 1);
    const hats2 = events(s2, 4).filter(e => e.voice === "hat");
    expect(hats.length).toBeGreaterThan(hats2.length);
    expect(ev.filter(e => e.voice === "pad").some(e => e.midi <= s.root)).toBe(true);
  });
});
