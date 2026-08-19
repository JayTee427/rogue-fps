// Dev-only play telemetry.
//
// Nobody had played this game until Jeff did, and the report came back as
// recollection: "the orange ball got me". This records what actually happened -
// what killed you, from how far, on which floor, with how much health left - and
// posts it to the dev server, which appends it to playtest.log.
//
// Silent by design: it must never throw into the frame loop, never block, and
// never appear in a production build. import.meta.env.DEV is false in `vite
// build`, so every call below compiles to a no-op there.

const ON = import.meta.env?.DEV === true;
const QUEUE = [];
let flushT = null;
let runId = null;

function flush() {
  flushT = null;
  if (!QUEUE.length) return;
  const batch = QUEUE.splice(0, QUEUE.length);
  try {
    // keepalive so the final events of a run survive a navigation
    fetch("/__telemetry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: batch.map((e) => JSON.stringify(e)).join("\n"),
      keepalive: true,
    }).catch(() => {});
  } catch { /* logging must never break play */ }
}

/** Record one event. Cheap, batched, and impossible to throw. */
export function log(type, data = {}) {
  if (!ON) return;
  try {
    QUEUE.push({ t: Math.round(performance.now()), run: runId, type, ...data });
    if (!flushT) flushT = setTimeout(flush, 1200);
  } catch { /* ignore */ }
}

export function startRun(seed, meta = {}) {
  if (!ON) return;
  runId = `${Date.now().toString(36)}`;
  log("run_start", {
    seed, ...meta,
    // When aiming dies but WASD works, these four fields say why.
    touchMode: document.body.classList.contains("touch"),
    coarse: matchMedia("(pointer: coarse)").matches,
    anyFine: matchMedia("(any-pointer: fine)").matches,
    maxTouch: navigator.maxTouchPoints,
  });
}

/** Flush immediately - used when a run ends, so nothing is lost. */
export function flushNow() {
  if (!ON) return;
  if (flushT) { clearTimeout(flushT); flushT = null; }
  flush();
}

export const telemetryOn = ON;
