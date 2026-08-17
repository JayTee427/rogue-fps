// Procedural WebAudio for a browser roguelike FPS.
// No samples — every sound is a WebAudio patch, so the game is one static bundle and works offline.
// Written by Laguna S 2.1 to a Claude spec; three WebAudio API slips corrected by Claude on review
// (GainNode.start does not exist; dash swept gain instead of filter frequency; bossRoar used setTimeout).

let ctx = null;
let master = null;
let muted = false;
let ambient = null;
let musicBus = null;
let reverb = null;
let wet = null;
// Where voices connect. Normally the dry master; SFX.at() swaps in a panner so
// the SAME voice code can be positioned instead of duplicating every sound.
let routeTo = null;
const dest = () => routeTo ?? master;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.35;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.ratio.value = 2.5;
  master.connect(comp);
  comp.connect(ctx.destination);
  // Music sits on its own bus, ducked below SFX so cues always cut through.
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  musicBus.connect(comp);
  // A derelict station has a tail. The impulse response is generated, not loaded:
  // noise under an exponential decay is a convincing room and costs no download.
  const irLen = Math.ceil(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
  }
  reverb = ctx.createConvolver(); reverb.buffer = ir;
  wet = ctx.createGain(); wet.gain.value = 0.22;
  wet.connect(reverb); reverb.connect(comp);      // to comp, not master: never ducked twice
}

/** Accessors for the music player — it needs the same context and its own bus. */
export function getCtx() { return ctx; }
export function getMusicBus() { return musicBus; }
/** Duck the music briefly (used on big hits so the SFX reads). */
export function duckMusic(amount = 0.35, secs = 0.25) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime, base = muted ? 0 : 0.5;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(base * (1 - amount), t);
  musicBus.gain.linearRampToValueAtTime(base, t + secs);
}

/** Point the listener at the camera each frame — without this HRTF does nothing. */
export function setListener(pos, forwardX, forwardZ) {
  if (!ctx || !ctx.listener) return;
  const l = ctx.listener;
  if (l.positionX) {
    l.positionX.value = pos.x; l.positionY.value = pos.y; l.positionZ.value = pos.z;
    l.forwardX.value = forwardX; l.forwardY.value = 0; l.forwardZ.value = forwardZ;
    l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
  }
}

function panner(x, y, z) {
  const p = ctx.createPanner();
  p.panningModel = "HRTF"; p.distanceModel = "inverse";
  p.refDistance = 4; p.maxDistance = 60; p.rolloffFactor = 1.2;
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else p.setPosition(x, y, z);
  // Distance dulls a sound as well as quieting it. Without this, a far-off shot
  // is just a small version of a near one, which reads as fake.
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 22050;
  lp.connect(p);
  p.connect(master); p.connect(wet);
  lp.distanceRef = p;
  return lp;
}

/** Play any existing SFX at a world position: SFX.at(pos, () => SFX.hit()). */
export function at(pos, fn) {
  if (!ctx || muted) return;
  const prev = routeTo;
  const node = panner(pos.x, pos.y ?? 1, pos.z);
  // Close the filter with distance from the listener.
  const l = ctx.listener, lx = l.positionX ? l.positionX.value : 0, lz = l.positionZ ? l.positionZ.value : 0;
  const dist = Math.hypot(pos.x - lx, pos.z - lz);
  node.frequency.value = Math.max(800, 22050 - dist * 380);
  routeTo = node;
  try { fn(); } finally { routeTo = prev; }
}

/** A quiet footfall. Movement should be audible — silence reads as floating. */
export function footstep(speed = 1) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const n = noise(0.09, "lowpass", 420 + speed * 140, 1, 0.075 * Math.min(1.4, speed));
  n.g.gain.setValueAtTime(0.075 * Math.min(1.4, speed), t);
  n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
  n.src.start(t);
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.35;
  if (musicBus) musicBus.gain.value = m ? 0 : 0.5;
}

function env(node, t0, a, d, s = 0, r = 0.05, peak = 1) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, s * peak), t0 + a + d);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
}

function noise(dur, filterType = null, freq = 0, Q = 1, gain = 1) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  if (filterType) {
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq * (0.9 + Math.random() * 0.2), ctx.currentTime);
    f.Q.value = Q;
    src.connect(f);
    f.connect(g);
  } else {
    src.connect(g);
  }
  g.connect(dest());
  return { src, g };
}

function osc(type, f0, t, dur, gain = 0.6, glideTo = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0 * (0.94 + Math.random() * 0.12), t);   // no two shots identical
  if (glideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
  env(g, t, 0.003, dur * 0.7, 0.2, dur * 0.3, gain);
  o.connect(g).connect(dest());
  o.start(t);
  o.stop(t + dur + 0.1);
  return { o, g };
}

export const SFX = {
  shoot(archetype = "sidearm") {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const p = {
      sidearm: () => {
        osc("square", 220, t, 0.06, 0.4, 90);
        const n = noise(0.04, "bandpass", 2500, 1, 0.5);
        n.src.start(t);
        osc("sine", 70, t, 0.02, 0.3);
      },
      scattergun: () => {
        const n = noise(0.18, "lowpass", 1800, 1, 0.6);
        n.src.start(t);
        osc("sine", 55, t, 0.12, 0.4);
        const n2 = noise(0.18, "lowpass", 1800, 1, 0.3);
        n2.src.start(t + 0.015);
      },
      carbine: () => {
        const n = noise(0.035, "highpass", 1200, 1, 0.5);
        n.src.start(t);
        osc("square", 300, t, 0.04, 0.4, 150);
      },
      railgun: () => {
        osc("sine", 900, t, 0.09, 0.3, 3800);
        const n = noise(0.06, "lowpass", 2000, 1, 0.5);
        n.src.start(t + 0.09);
        osc("sine", 50, t + 0.15, 0.2, 0.4);
      },
      launcher: () => {
        osc("sawtooth", 90, t, 0.22, 0.5, 45);
        const n = noise(0.1, "lowpass", 400, 1, 0.4);
        n.src.start(t);
      },
      beam: () => {
        osc("sine", 1400, t, 0.03, 0.2);
        const n = noise(0.03, "bandpass", 1400, 1, 0.1);
        n.src.start(t);
      }
    }[archetype] || p.sidearm;
    p();
  },
  hit() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const n = noise(0.01, "bandpass", 1500, 1, 0.7);
    n.src.start(t);
    osc("sine", 140, t, 0.04, 0.5);
  },
  crit() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("square", 1400, t, 0.09, 0.5, 320);
    const n = noise(0.09, "bandpass", 1200, 1, 0.4);
    n.src.start(t);
    osc("sine", 2200, t, 0.04, 0.4);
  },
  kill() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("sine", 55, t, 0.11, 0.4);
    const n = noise(0.15, "lowpass", 2000, 1, 0.6);
    n.src.start(t);
    [330, 495, 660].forEach((f, i) => osc("triangle", f, t + i * 0.045, 0.045, 0.3));
  },
  hurt(hpFrac = 1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("sawtooth", 160, t, 0.22, 0.6, 70);
    if (hpFrac < 0.3) osc("sine", 60, t, 0.3, 0.3);
    if (hpFrac < 0.15) osc("sine", 1200, t, 0.25, 0.2);
  },
  pickup() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => osc("sine", f, t + i * 0.06, 0.16, 0.35));
  },
  reload() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("square", 700, t, 0.04, 0.25);
    osc("square", 500, t + 0.12, 0.05, 0.25);
  },
  reloadDone() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("square", 900, t, 0.06, 0.3);
  },
  dash() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    // Doppler-ish whoosh: the bandpass centre falls 900 -> 220 Hz over the burst.
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.18), ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.18);
    const g = ctx.createGain(); env(g, t, 0.01, 0.1, 0.1, 0.07, 0.5);
    src.connect(f).connect(g).connect(dest()); src.start(t);
  },
  jump() {
    if (!ctx || muted) return;
    osc("sine", 300, ctx.currentTime, 0.1, 0.25, 500);
  },
  empty() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const n = noise(0.015, null, 0, 1, 0.4);
    n.src.start(t);
    osc("sine", 1200, t, 0.03, 0.4);
  },
  door() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("sine", 60, t, 0.3, 0.4);
    const n = noise(0.45, "bandpass", 400, 1, 0.3);
    n.src.start(t);
  },
  roomClear() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    [392, 523, 659, 784].forEach((f, i) => osc("triangle", f, t + i * 0.09, 0.3, 0.4));
    osc("sine", 55, t, 0.5, 0.2);
  },
  /** A real blast: sub-thump under a low-passed noise body. Explosions were
   *  silent until now — the loudest thing in the game had no sound at all. */
  explosion(size = 1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const sz = Math.max(0.5, Math.min(2, size));
    // sub: pitch drops away fast, which is what reads as WEIGHT
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120 * sz, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.26);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.5 * sz, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(og); og.connect(dest());
    o.start(t); o.stop(t + 0.45);
    // body: noise through a filter that closes as it decays
    const n = noise(0.45, "lowpass", 2400, 1, 0.5 * sz);
    n.g.gain.setValueAtTime(0.0001, t);
    n.g.gain.linearRampToValueAtTime(0.45 * sz, t + 0.008);
    n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    n.src.start(t);
  },

  bossRoar() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    SFX.bruteRoar();
    SFX.bruteRoar(0.03);
    const n = noise(0.8, "lowpass", 300, 1, 0.7);
    n.src.start(t);
  },
  popperBeep(rate = 0) {
    if (!ctx || muted) return;
    osc("square", 1600, ctx.currentTime, 0.035, 0.2 + rate * 0.2);
  },
  death() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("sawtooth", 200, t, 1.4, 0.7, 28);
    osc("square", 100, t, 1.4, 0.5, 25);
    osc("sine", 40, t + 1.3, 0.1, 0.4);
  },
  extract() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((f, i) => osc("sine", f, t + i * 0.1, 0.5, 0.4));
  },
  ui() {
    if (!ctx || muted) return;
    osc("sine", 800, ctx.currentTime, 0.04, 0.2);
  },
  skitterChitter() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const n = noise(0.025, "highpass", 900, 1, 0.3);
      n.src.start(t + i * 0.03);
    }
  },
  sentinelCharge() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(1300, t + 0.65);
    f.Q.value = 2;
    o.type = "sine";
    o.frequency.setValueAtTime(250, t);
    o.frequency.exponentialRampToValueAtTime(1300, t + 0.65);
    env(g, t, 0.01, 0.5, 0.1, 0.15, 0.3);
    o.connect(f).connect(g).connect(dest());
    o.start(t);
    o.stop(t + 0.8);
  },
  bruteRoar(offset = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + offset;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(600, t + 0.7);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(5, t);
    lfoG.gain.value = 200;
    lfo.connect(lfoG);
    lfoG.connect(f.frequency);
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    env(g, t, 0.01, 0.5, 0.1, 0.2, 0.6);
    o.connect(f).connect(g).connect(dest());
    lfo.start(t);
    o.start(t);
    o.stop(t + 0.8);
    lfo.stop(t + 0.8);
    osc("sine", 40, t, 0.7, 0.3);
  },
  wardenHum() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    osc("sine", 120, t, 0.4, 0.2);
    const n = noise(0.4, "bandpass", 800, 12, 0.2);
    n.src.start(t);
  },
  wispWhine() {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(1800, t);
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(6, t);
    lfoG.gain.value = 40;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    env(g, t, 0.01, 0.2, 0.1, 0.1, 0.3);
    o.connect(g).connect(dest());
    lfo.start(t);
    o.start(t);
    o.stop(t + 0.4);
    lfo.stop(t + 0.4);
  },
  heartbeat(hpFrac = 1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const gain = Math.max(0, Math.min(0.6, (0.4 - hpFrac) * 2));
    if (gain <= 0) return;
    osc("sine", 65, t, 0.08, gain);
    osc("sine", 65, t + 0.11, 0.06, gain);
  },
  startAmbient() {
    if (!ctx || muted || ambient) return;
    const t = ctx.currentTime;
    ambient = {};
    const d1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    d1.type = "sine";
    d1.frequency.setValueAtTime(42, t);
    g1.gain.value = 0.05;
    d1.connect(g1).connect(dest());
    d1.start(t);
    ambient.d1 = d1;
    ambient.g1 = g1;
    // A drone that never changes stops being heard after a minute. A very slow
    // LFO on level and pitch keeps the station feeling alive without a melody.
    const ambLfo = ctx.createOscillator(), ambLfoG = ctx.createGain();
    ambLfo.type = "sine"; ambLfo.frequency.value = 0.05;   // one cycle per 20 seconds
    ambLfoG.gain.value = 0.022;
    ambLfo.connect(ambLfoG).connect(g1.gain);
    ambLfo.start(t);
    const ambDrift = ctx.createOscillator(), ambDriftG = ctx.createGain();
    ambDrift.type = "sine"; ambDrift.frequency.value = 0.031;
    ambDriftG.gain.value = 3.5;                            // +/- 3.5 Hz of drift
    ambDrift.connect(ambDriftG).connect(d1.frequency);
    ambDrift.start(t);
    ambient.ambLfo = ambLfo; ambient.ambDrift = ambDrift;

    const d2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    d2.type = "sine";
    d2.frequency.setValueAtTime(44, t);
    g2.gain.value = 0.03;
    d2.connect(g2).connect(dest());
    d2.start(t);
    ambient.d2 = d2;
    ambient.g2 = g2;

    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource();
    ns.buffer = buf;
    ns.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(300, t);
    const g3 = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(0.1, t);
    lfoG.gain.value = 0.01;
    lfo.connect(lfoG);
    lfoG.connect(g3.gain);
    g3.gain.value = 0.02;
    ns.connect(f).connect(g3).connect(dest());
    lfo.start(t);
    ns.start(t);
    ambient.ns = ns;
    ambient.f = f;
    ambient.g3 = g3;
    ambient.lfo = lfo;
    ambient.lfoG = lfoG;
  },
  stopAmbient() {
    if (!ctx || !ambient) return;
    const t = ctx.currentTime;
    const fade = 0.6;
    for (const k of ["g1", "g2", "g3"]) {
      const g = ambient[k]; if (!g) continue;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    }
    const a = ambient; ambient = null;
    setTimeout(() => {
      try { a.d1?.stop(); a.d2?.stop(); a.ns?.stop(); a.lfo?.stop(); a.lfoG?.disconnect(); } catch { /* already stopped */ }
    }, fade * 1000);
  }
};
