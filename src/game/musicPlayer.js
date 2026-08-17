// Plays what core/music.js composes. The sequencer is pure and tested; this is
// the WebAudio voice bank plus a look-ahead scheduler (schedule bars slightly
// ahead of the clock — setInterval alone is far too jittery for music).

import { createScore, setIntensity, nextBar, noteHz } from "core/music.js";
import { getCtx, getMusicBus } from "./audio.js";

const LOOKAHEAD = 0.25;      // seconds of audio scheduled in advance
const TICK = 60;             // ms between scheduler wakeups

export class MusicPlayer {
  constructor(rng) {
    this.score = createScore(rng);
    this.playing = false;
    this.nextBarTime = 0;
    this.timer = null;
    this.target = 0;         // intensity we are easing toward
  }

  start() {
    const ctx = getCtx(); if (!ctx || this.playing) return;
    this.playing = true;
    this.nextBarTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), TICK);
  }

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Called every frame with the desired 0..1 intensity; eased so it never lurches. */
  setTarget(v, dt = 0.016) {
    this.target = Math.max(0, Math.min(1, v));
    const cur = this.score.intensity;
    const rate = this.target > cur ? 1.5 : 0.4;          // ramp up fast, cool down slow
    setIntensity(this.score, cur + (this.target - cur) * Math.min(1, rate * dt));
  }

  setBoss(on) { this.score.boss = !!on; }

  _schedule() {
    const ctx = getCtx(); if (!ctx || !this.playing) return;
    while (this.nextBarTime < ctx.currentTime + LOOKAHEAD) {
      const bar = nextBar(this.score, { next: Math.random, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), pick: (arr) => arr[Math.floor(Math.random() * arr.length)], chance: (p) => Math.random() < p });
      const t0 = this.nextBarTime, beat = bar.beatSec;
      for (const e of bar.events) this._play(e, t0 + e.t * beat, e.dur * beat);
      this.nextBarTime += 4 * beat;
    }
  }

  _play(e, when, dur) {
    const ctx = getCtx(), bus = getMusicBus(); if (!ctx || !bus) return;
    const g = ctx.createGain();
    g.connect(bus);
    switch (e.voice) {
      case "kick": {
        const o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(150, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.09);
        g.gain.setValueAtTime(e.gain * 0.9, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.16);
        o.connect(g); o.start(when); o.stop(when + 0.2); break;
      }
      case "snare": {
        const n = this._noiseSrc(0.14); const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1400;
        g.gain.setValueAtTime(e.gain * 0.5, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.13);
        n.connect(f).connect(g); n.start(when); break;
      }
      case "hat": {
        const n = this._noiseSrc(0.05); const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
        g.gain.setValueAtTime(e.gain * 0.22, when); g.gain.exponentialRampToValueAtTime(0.001, when + 0.045);
        n.connect(f).connect(g); n.start(when); break;
      }
      case "bass": {
        const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(noteHz(e.midi), when);
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(280, when); f.Q.value = 6;
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(e.gain * 0.4, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, when + dur);
        o.connect(f).connect(g); o.start(when); o.stop(when + dur + 0.05); break;
      }
      case "lead": {
        const o = ctx.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(noteHz(e.midi), when);
        const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(2600, when); f.frequency.exponentialRampToValueAtTime(900, when + dur);
        g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(e.gain * 0.16, when + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, when + dur);
        o.connect(f).connect(g); o.start(when); o.stop(when + dur + 0.05); break;
      }
      case "pad": {
        // two slightly detuned triangles = a warm bed without a sample
        for (const det of [-4, 4]) {
          const o = ctx.createOscillator(); o.type = "triangle";
          o.frequency.setValueAtTime(noteHz(e.midi) * Math.pow(2, det / 1200), when);
          const pg = ctx.createGain(); pg.connect(bus);
          pg.gain.setValueAtTime(0, when);
          pg.gain.linearRampToValueAtTime(e.gain * 0.09, when + dur * 0.35);
          pg.gain.linearRampToValueAtTime(0.0001, when + dur);
          o.connect(pg); o.start(when); o.stop(when + dur + 0.1);
        }
        break;
      }
    }
  }

  _noiseSrc(dur) {
    const ctx = getCtx();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf; return s;
  }
}
