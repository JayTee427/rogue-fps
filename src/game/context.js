// HOLLOW SIGNAL — the shell's shared context: singletons and game state.
// Everything here is created once and imported everywhere; nothing in this
// module knows about rooms, runs, or rules.

import { pickQualityTier, TIERS } from "core/quality.js";
import { createRenderer } from "./renderer.js";
import { Player } from "./player.js";
import { Input } from "./input.js";
import { WeaponView } from "./weaponView.js";
import { EnemyManager } from "./enemies.js";
import { FX } from "./fx.js";
import { HazardView } from "./hazardView.js";

// ------------------------------------------------------------------ boot --
const $ = (s) => document.querySelector(s);
const show = (id) => { for (const l of document.querySelectorAll(".layer")) l.classList.add("hidden"); if (id) $(id).classList.remove("hidden"); };

function benchmark() {
  // Deliberately small: this is a rough floor for very weak devices, not the
  // real decision. A CPU spin measures JS math, not the GPU — the first version
  // graded a machine running at 240 FPS as "low" and switched bloom off.
  const t0 = performance.now();
  let x = 0; for (let i = 0; i < 400_000; i++) x += Math.sqrt(i) * Math.sin(i);
  return performance.now() - t0 + (x === 42 ? 1 : 0);
}
const isMobile = matchMedia("(pointer: coarse)").matches;
const tierName = pickQualityTier(benchmark(), { mobile: isMobile, deviceMemory: navigator.deviceMemory });
const R = createRenderer($("#app"), tierName);
const { renderer, scene, camera, render } = R;
$("#perf").textContent = `${tierName.toUpperCase()} · ${isMobile ? "TOUCH" : "KBM"}`;

const player = new Player(camera);
const input = new Input(renderer.domElement, $("#hud"));
const weaponView = new WeaponView(camera, scene);
const enemies = new EnemyManager(scene);
const fx = new FX(scene, camera, TIERS[tierName]);
const hazards = new HazardView(scene);
// Written by flow (run start/end), read by loop (intensity): a holder, so
// both sides see one live object instead of fighting over a module let.
const audio = { music: null };

// ------------------------------------------------------------------ state --
const G = {
  run: null, arena: null, roomRng: null, mods: {}, roomActive: false, roomCleared: false,
  hp: 100, shield: 0, invuln: 0, dmgFlash: 0, timeScale: 1, hitstop: 0, kickX: 0, kickY: 0,
  bossMode: false, boss: null, extractHold: 0, roomTimer: 0, killsThisRoom: 0,
  lastFrame: performance.now(), best: Number(localStorage.getItem("hs_best") || 0),
  fpsAcc: 0, fpsN: 0, seedText: "",
  qTier: tierName, qWindow: [], qCooldown: 3,
  passives: null, regenAcc: 0,
  // director: a running read on how well the player is doing, persisted so a
  // run starts where the last one left off rather than assuming average.
  skill: 0.5,
  wavePlan: null, challenge: null, roomStats: null,
};


function toast(text, warn = false, ms = 1400) {
  const t = $("#toast"); t.textContent = text; t.className = "on" + (warn ? " warn" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), ms);
}


export { $, show, toast, benchmark, isMobile, tierName, R, renderer, scene, camera, render, player, input, weaponView, enemies, fx, hazards, audio, G };
