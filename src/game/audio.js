// Synthesised audio. No assets — every sound is a WebAudio patch, so the game
// is one static bundle and works offline. Kept intentionally punchy: the design
// bible says feedback is over-tuned on purpose.

let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.35; }

function env(node, t0, a, d, s = 0, r = 0.05, peak = 1) {
  node.gain.setValueAtTime(0, t0);
  node.gain.linearRampToValueAtTime(peak, t0 + a);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, s * peak), t0 + a + d);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
}

function noise(dur) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function osc(type, freq, t0, dur, gainPeak = 0.6, glideTo = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  env(g, t0, 0.003, dur * 0.7, 0.2, dur * 0.3, gainPeak);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.1);
}

export const SFX = {
  shoot(archetype = "sidearm") {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const p = { sidearm: [180, 0.08], scattergun: [90, 0.16], carbine: [220, 0.06], railgun: [60, 0.35], launcher: [70, 0.22], beam: [440, 0.05] }[archetype] ?? [180, 0.08];
    const n = noise(p[1]);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + p[1]);
    const g = ctx.createGain(); env(g, t, 0.002, p[1] * 0.6, 0.1, p[1] * 0.4, 0.9);
    n.connect(f).connect(g).connect(master); n.start(t);
    osc("square", p[0], t, p[1], 0.35, p[0] * 0.4);
  },
  hit() { if (!ctx || muted) return; const t = ctx.currentTime; osc("triangle", 900, t, 0.05, 0.4, 500); },
  crit() { if (!ctx || muted) return; const t = ctx.currentTime; osc("square", 1200, t, 0.09, 0.5, 1800); osc("triangle", 600, t + 0.02, 0.1, 0.4); },
  kill() { if (!ctx || muted) return; const t = ctx.currentTime; osc("sawtooth", 300, t, 0.18, 0.5, 60); const n = noise(0.12); const g = ctx.createGain(); env(g, t, 0.001, 0.08, 0.05, 0.05, 0.5); n.connect(g).connect(master); n.start(t); },
  hurt() { if (!ctx || muted) return; const t = ctx.currentTime; osc("sawtooth", 140, t, 0.25, 0.7, 70); },
  pickup() { if (!ctx || muted) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => osc("sine", f, t + i * 0.06, 0.16, 0.35)); },
  reload() { if (!ctx || muted) return; const t = ctx.currentTime; osc("square", 700, t, 0.04, 0.25); osc("square", 500, t + 0.12, 0.05, 0.25); },
  reloadDone() { if (!ctx || muted) return; const t = ctx.currentTime; osc("square", 900, t, 0.06, 0.3); },
  dash() { if (!ctx || muted) return; const t = ctx.currentTime; const n = noise(0.18); const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.18); const g = ctx.createGain(); env(g, t, 0.01, 0.1, 0.1, 0.07, 0.5); n.connect(f).connect(g).connect(master); n.start(t); },
  jump() { if (!ctx || muted) return; osc("sine", 300, ctx.currentTime, 0.1, 0.25, 500); },
  empty() { if (!ctx || muted) return; osc("square", 200, ctx.currentTime, 0.05, 0.25); },
  door() { if (!ctx || muted) return; const t = ctx.currentTime; osc("sine", 110, t, 0.5, 0.5, 55); osc("sine", 220, t + 0.05, 0.4, 0.3); },
  roomClear() { if (!ctx || muted) return; const t = ctx.currentTime; [392, 523, 659, 784].forEach((f, i) => osc("triangle", f, t + i * 0.09, 0.3, 0.4)); },
  bossRoar() { if (!ctx || muted) return; const t = ctx.currentTime; osc("sawtooth", 80, t, 0.9, 0.9, 40); const n = noise(0.6); const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 400; const g = ctx.createGain(); env(g, t, 0.05, 0.4, 0.2, 0.3, 0.6); n.connect(f).connect(g).connect(master); n.start(t); },
  popperBeep(rate) { if (!ctx || muted) return; osc("square", 1400, ctx.currentTime, 0.04, 0.2 + rate * 0.2); },
  death() { if (!ctx || muted) return; const t = ctx.currentTime; osc("sawtooth", 200, t, 1.2, 0.8, 30); osc("square", 100, t + 0.2, 1.0, 0.5, 25); },
  extract() { if (!ctx || muted) return; const t = ctx.currentTime; [523, 659, 784, 1046, 1318].forEach((f, i) => osc("sine", f, t + i * 0.1, 0.5, 0.4)); },
  ui() { if (!ctx || muted) return; osc("sine", 800, ctx.currentTime, 0.04, 0.2); },
};
