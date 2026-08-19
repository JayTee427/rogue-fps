// HOLLOW SIGNAL — the game loop. Ties core (delegated, tested) to the shell.
// core decides what is true; this file decides what you see, hear, and feel.

import * as THREE from "three";
import { rng as makeRng } from "core/rng.js";
import { newRun, startFloor, clearRoom, takeReward, chooseDoor, beatBoss, extract, die, canExtract, swapWeapon } from "core/run.js";
import { resolveHit } from "core/combat.js";
import { ROOM_MODIFIERS, BOSSES } from "core/floor.js";
import { HAZARD_DEFS } from "core/hazards.js";
import { scoreRun } from "core/score.js";
import { dailySeed, formatSeed, parseSeed } from "core/daily.js";
import { pickQualityTier } from "core/quality.js";
import { aimAssist } from "core/assist.js";
import { ITEM_BY_ID, ITEMS } from "core/items.js";
import { flavourFor } from "core/codex.js";
import { scaleEnemy } from "core/enemies.js";
import { rollWeapon, ARCHETYPES, WEAPON_MODS } from "core/weapons.js";
import { planEncounter, updateSkill } from "core/director.js";
import { rollChallenge, checkChallenge } from "core/challenges.js";
import { layoutDressing, PROP_KINDS } from "core/dressing.js";
import { BIOMES, pickBiome, biomePalette, biomeLayout } from "core/arenas.js";
import { ROOM_EVENTS, rollEvent, resolveEvent } from "core/events.js";
import { rollStock, buy, rerollStock, REROLL_COST } from "core/shop.js";
import { BOONS, rollPact, acceptPact, refusePact } from "core/pact.js";
import { activeSynergies, synergyEffects } from "core/synergy.js";
import { passiveMods } from "core/effects.js";
import { onShoot, onEnemyHit, onKill as killEffects, onHitTaken, onDeath } from "core/triggers.js";
import { computeStats, BASE_STATS } from "core/stats.js";

import { createRenderer, buildArena, buildDressing, COLORS } from "./renderer.js";
import { Player } from "./player.js";
import { Input } from "./input.js";
import { WeaponView } from "./weaponView.js";
import { EnemyManager } from "./enemies.js";
import { initAudio, resumeAudio, SFX, duckMusic, setListener, at as playAt, footstep } from "./audio.js";
import { MusicPlayer } from "./musicPlayer.js";
import { log as tlog, startRun as tStartRun, flushNow as tFlush } from "./telemetry.js";
import { FX } from "./fx.js";
import { HazardView } from "./hazardView.js";
import { TIERS } from "core/quality.js";
import { chainTargets, singularityPull, explosionVictims } from "core/fxitems.js";
import { ACHIEVEMENTS, checkAchievements, newAchievementState } from "core/achievements.js";
import { newTable, qualifies, rank, addEntry, sanitizeInitials, serializeTable, deserializeTable, topLine, MAX_ENTRIES } from "core/hof.js";
import { UNLOCKS, newProfile, applyRun, grantsFor, serializeProfile, deserializeProfile, profileSummary } from "core/meta.js";

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
let music = null;
let hof = deserializeTable(localStorage.getItem("hs_hof"));

// The pilot currently signed in, or null for an anonymous run. Profiles are keyed
// by initials in localStorage - a shared cabinet, not an account system.
let pilot = null;
let profile = newProfile();

const profileKey = (initials) => `hs_pilot_${sanitizeInitials(initials)}`;

function signIn(initials) {
  pilot = sanitizeInitials(initials);
  profile = deserializeProfile(localStorage.getItem(profileKey(pilot)));
  saveProfile();
  updatePilotLine();
}

function signOut() {
  pilot = null;
  profile = newProfile();
  updatePilotLine();
}

function saveProfile() {
  if (pilot) localStorage.setItem(profileKey(pilot), serializeProfile(profile));
}

function updatePilotLine() {
  const el = $("#pilotLine");
  if (!el) return;
  if (!pilot) { el.textContent = ""; return; }
  const g = grantsFor(profile);
  const bits = [];
  if (g.weapons.length) bits.push(`${g.weapons.length} weapon${g.weapons.length > 1 ? "s" : ""}`);
  if (g.items.length) bits.push(`${g.items.length} item${g.items.length > 1 ? "s" : ""}`);
  if (g.gold) bits.push(`${g.gold} salvage`);
  if (g.maxHp) bits.push(`+${g.maxHp} hp`);
  el.textContent = `${pilot} — ${profileSummary(profile).text}${bits.length ? " · carrying " + bits.join(", ") : ""}`;
}
// Achievements are earned WITHIN a run and travel with the score. Nothing
// carries between players, because the next player is a stranger.
let achState = newAchievementState();

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

// --- adaptive quality -------------------------------------------------------
// Judge the renderer by the only measure that matters: are we holding frame
// rate? Sustained <50 fps drops a tier; sustained >110 with headroom raises one.
const TIER_ORDER = ["low", "medium", "high"];
function governQuality(dt) {
  if (!G.run) return;
  G.qCooldown -= dt;
  G.qWindow.push(dt);
  if (G.qWindow.length > 90) G.qWindow.shift();
  if (G.qWindow.length < 90 || G.qCooldown > 0) return;
  const avg = G.qWindow.reduce((a, b) => a + b, 0) / G.qWindow.length;
  const fps = 1 / Math.max(avg, 1e-4);
  const i = TIER_ORDER.indexOf(G.qTier);
  let next = i;
  if (fps < 50 && i > 0) next = i - 1;
  else if (fps > 110 && i < 2 && !isMobile) next = i + 1;
  if (next !== i) {
    G.qTier = TIER_ORDER[next];
    applyQuality(G.qTier);
    G.qCooldown = 6;
    G.qWindow.length = 0;
  }
}

function applyQuality(tier) {
  const t = TIERS[tier];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * t.resScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (R.bloom) R.bloom.enabled = tier !== "low";
  renderer.shadowMap.enabled = !!t.shadows;
  $("#perf").dataset.tier = tier;
}

// --- director: enemies arrive in waves, paced to how you are actually doing ---
function pumpWaves(dt) {
  const wp = G.wavePlan;
  if (!wp || wp.next >= wp.waves.length) return;
  wp.t += dt;
  while (wp.next < wp.waves.length && wp.waves[wp.next].delay <= wp.t) {
    for (const d of wp.waves[wp.next].spawns) enemies.spawnDeferred(d);
    if (wp.next > 0) { toast("REINFORCEMENTS", true, 1200); SFX.door(); }
    wp.next++;
  }
}

/** Are there enemies still to come? The room is not clear until the plan is spent. */
function wavesPending() {
  const wp = G.wavePlan;
  return !!wp && wp.next < wp.waves.length;
}

function roomChallengeStart(rng, floor) {
  G.challenge = rollChallenge(rng, floor);
  G.roomStats = { kills: 0, headshots: 0, damageTaken: 0, reloads: 0, secs: 0, dashes: 0, shotsFired: 0, shotsHit: 0, itemsTaken: 0 };
  const line = $("#chalLine");
  if (line) line.textContent = G.challenge ? `${G.challenge.name.toUpperCase()} — ${G.challenge.desc}` : "";
}

function roomChallengeEnd() {
  const line = $("#chalLine");
  if (line) line.textContent = "";
  const ch = G.challenge;
  G.challenge = null;
  if (!ch || !G.roomStats) return null;
  return checkChallenge(ch, G.roomStats) ? ch : null;
}



function commitEntry() {
  if (!G.pendingEntry) return;
  const initials = sanitizeInitials($("#initials")?.value);
  hof = addEntry(hof, { ...G.pendingEntry, initials, at: Date.now() });
  localStorage.setItem("hs_hof", serializeTable(hof));
  G.pendingEntry = null;
  $("#initialsRow").classList.add("hidden");
  $("#repRank").textContent = `${initials} RECORDED`;
  SFX.pickup();
  renderHof();
  updatePilotLine();
}

function renderHof() {
  const wrap = $("#hofRows");
  if (!wrap) return;
  const rows = hof.entries ?? [];
  wrap.innerHTML = rows.length
    ? rows.map((e, i) => {
        const when = new Date(e.at || 0);
        const date = e.at ? `${when.getDate()}/${when.getMonth() + 1}` : "";
        return `<div class="hrow${i === 0 ? " first" : ""}">
          <span class="pos">${String(i + 1).padStart(2, "0")}</span>
          <span class="ini">${e.initials}</span>
          <span class="sc">${e.score.toLocaleString()}</span>
          <span class="fl">floor ${e.floor}${e.extracted ? " ✓" : ""}</span>
          <span class="kd">${e.kills} kills</span>
          <span class="dt">${date}</span>
        </div>`;
      }).join("")
    : '<div class="hrow"><span class="ini">—</span><span class="sc">no runs recorded yet</span></div>';
  const line = $("#bestLine");
  if (line) line.textContent = `BEST — ${topLine(hof)}`;
}

function toast(text, warn = false, ms = 1400) {
  const t = $("#toast"); t.textContent = text; t.className = "on" + (warn ? " warn" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = ""), ms);
}

// -------------------------------------------------------------- run flow --
function beginRun(seed, cursesEnabled) {
  initAudio(); resumeAudio();
  G.run = newRun(seed, { cursesEnabled });
  // Everything the signed-in pilot has unlocked, applied before the first room.
  // An anonymous run gets none of it, which is the point: a stranger opening the
  // link plays the honest base game.
  const boons = grantsFor(profile);
  if (boons.weapons.length) {
    const pick = boons.weapons[boons.weapons.length - 1];
    G.run = swapWeapon(G.run, rollWeapon(makeRng(seed).fork("startgun"), pick, 1));
  }
  if (boons.items.length) {
    G.run = { ...G.run, held: [...G.run.held, ...boons.items.filter((id) => ITEM_BY_ID[id])] };
  }
  if (boons.gold) G.run = { ...G.run, gold: (G.run.gold ?? 0) + boons.gold };
  if (boons.rerolls) G.run = { ...G.run, rerolls: (G.run.rerolls ?? 0) + boons.rerolls };
  if (boons.maxHp) G.run = { ...G.run, maxHp: G.run.maxHp + boons.maxHp };
  if (boons.draftSize) G.run = { ...G.run, stats: { ...G.run.stats, draftSize: (G.run.stats.draftSize ?? 3) + boons.draftSize } };
  G.seedText = formatSeed(seed);
  G.hp = G.run.maxHp; G.shield = 0;
  G.runStartedAt = performance.now();
  tStartRun(G.seedText, { curses: !!G.run.cursesEnabled });
  achState = newAchievementState();      // this run earns its own
  frameErrors = 0;
  G.runDamageTaken = 0; G.runHeadshots = 0;
  SFX.startAmbient();
  music = new MusicPlayer(makeRng(seed).fork("music"));
  music.start();
  onFloorStart(true);
}

function onFloorStart(first = false) {
  const r = G.run;
  if (r.phase !== "floor_start") return;
  if (first || !canExtract(r)) { enterFloor(); return; }
  // offer extract vs deeper
  $("#fsTitle").textContent = `FLOOR ${r.floor}`;
  const s = scoreRun(r).total;
  $("#fsText").textContent = `Banking now scores ${s.toLocaleString()}. Going deeper multiplies everything — and everything hits harder.`;
  input.releaseLock();
  show("#floorStart");
}

function enterFloor() {
  G.run = startFloor(G.run);
  SFX.door();
  enterRoom();
}

function enterRoom() {
  const r = G.run;
  const room = r.currentFloor.rooms[r.roomIndex];
  const seedRng = makeRng(r.seed).fork(`room${r.floor}-${r.roomIndex}`);
  G.roomRng = seedRng;
  G.mods = { swarm: room.modifier === "swarm", noDash: room.modifier === "no_dash", lowGravity: room.modifier === "low_gravity", darkness: room.modifier === "darkness", timePressure: room.modifier === "time_pressure" };
  G.arena?.dispose();
  // Each floor gets its own biome: its own palette, fog and room proportions.
  const biomeId = pickBiome(makeRng(r.seed).fork(`biome${r.floor}`), r.floor);
  const bp = biomePalette(biomeId);
  const bl = biomeLayout(seedRng.fork("shape"), biomeId, r.floor);
  G.biome = biomeId;
  G.arena = buildArena(scene, seedRng.fork("arena"), {
    halfW: bl.halfW, halfD: bl.halfD, blockCount: bl.blockCount,
    palette: { floor: bp.floor, wall: bp.wall, trim: bp.trim, accent: bp.accent, sky: bp.sky },
    fogDensity: biomeFog(bp.fogDensity),
  });
  player.arena = G.arena;
  player.reset(0, G.arena.halfD - 4);
  G.arena.spawnSafe = { x: 0, z: G.arena.halfD - 4 };   // enemies keep clear of this
  player.yaw = 0; player.pitch = 0;
  applyStats();
  enemies.clear();
  // The director decides how the roster ARRIVES; spawnRoom still decides WHO it
  // is, so elites and affixes are untouched by the pacing layer. Roll everyone
  // first (firstWave 0 places nobody), then plan over the actual roster — the
  // plan cannot be made before the roster exists.
  const { deferred } = enemies.spawnRoom(seedRng.fork("enemies"), r.floor, r.roomIndex, G.arena, G.mods, room.eliteCount, 0);
  const plan = planEncounter(seedRng.fork("director"), {
    floor: r.floor, roomIndex: r.roomIndex, skill: G.skill,
    roster: deferred.map((_, i) => String(i)),
  });
  let waves = plan.waves.map((w) => ({
    delay: w.delay === 0 ? 0 : w.delay + 2,       // the opening wave is instant
    spawns: w.ids.map((i) => deferred[Number(i)]).filter(Boolean),
  }));
  // A small roster split four ways leaves you alone in a room waiting for the
  // next single enemy, which is the opposite of pressure. Under 6 enemies, the
  // room is an opener plus one reinforcement, not a trickle.
  if (deferred.length < 6 && waves.length > 2) {
    const [first, ...rest] = waves;
    waves = [first, { delay: rest[0].delay, spawns: rest.flatMap((w) => w.spawns) }];
  }
  G.wavePlan = { t: 0, next: 0, waves };
  pumpWaves(0);                                    // place the opening wave now
  roomChallengeStart(seedRng.fork("challenge"), r.floor);
  hazards.spawn(seedRng.fork("hazards"), room.hazardTag, G.arena, r.floor);
  G.dressing?.removeFromParent();
  // Only wall and ceiling dressing. The floor props were visual noise, and worse,
  // they competed with hazards and affix rings for the player's reading of what
  // on the ground matters.
  const props = layoutDressing(seedRng.fork("dressing"), G.arena, r.floor)
    .filter((p) => PROP_KINDS[p.kind]?.mount !== "floor");
  G.dressing = buildDressing(scene, props, PROP_KINDS);
  G.roomActive = true; G.roomCleared = false; G.bossMode = false; G.killsThisRoom = 0;
  // A short grace on arrival. Being shot before you have looked around is not
  // difficulty, it is a bad first impression.
  G.invuln = Math.max(G.invuln, r.floor === 1 && r.roomIndex === 0 ? 2.2 : 1.2);
  $("#bossbar").classList.add("hidden");
  music?.setBoss(false);
  G.roomTimer = G.mods.timePressure ? 60 : 0;
  G.shield = r.stats.roomShield ?? 0;
  scene.fog.density = G.mods.darkness ? 0.11 : biomeFog(biomePalette(G.biome ?? "").fogDensity);
  $("#floorNum").textContent = `FLOOR ${r.floor}`;
  $("#biomeName").textContent = (BIOMES[G.biome]?.name ?? "").toUpperCase();
  $("#roomNum").textContent = r.roomIndex >= 4 ? "ROOM 5/5 · BOSS NEXT" : `ROOM ${r.roomIndex + 1}/5`;
  $("#modName").textContent = room.modifier ? ROOM_MODIFIERS[room.modifier].name.toUpperCase() : (room.hazardTag ? room.hazardTag.replace("_", " ").toUpperCase() : "");
  if (room.modifier) toast(ROOM_MODIFIERS[room.modifier].name + " — " + ROOM_MODIFIERS[room.modifier].desc, true, 2200);
  else if (room.hazardTag && HAZARD_DEFS[room.hazardTag]) {
    const hz = HAZARD_DEFS[room.hazardTag];
    toast(`${hz.name.toUpperCase()} — ${hz.desc}`, true, 2800);
  }
  weaponView.equip(r.weapon);
  renderItems();
  addGold(0);                    // refresh the readout
  tlog("room_enter", {
    floor: r.floor, room: r.roomIndex + 1, biome: G.biome,
    hazard: room.hazardTag ?? null, modifier: room.modifier ?? null,
    reward: room.rewardType, elites: room.eliteCount,
    enemies: enemies.list.length + (G.wavePlan?.waves ?? []).reduce((a, w) => a + w.spawns.length, 0),
    hp: Math.round(G.hp), maxHp: G.run.maxHp, items: G.run.held.length, gold: G.run.gold ?? 0,
  });
  show("#hud");
  input.requestLock();
}

function enterBoss() {
  const r = G.run;
  const b = r.currentFloor.boss;
  const seedRng = makeRng(r.seed).fork(`boss${r.floor}`);
  G.arena?.dispose();
  G.arena = buildArena(scene, seedRng.fork("arena"), { blockCount: 4, halfW: 18, halfD: 18 });
  player.arena = G.arena; player.reset(0, 14); player.yaw = 0; player.pitch = 0;
  enemies.clear(); hazards.clear();
  // boss = a big elite of a fitting archetype with the floor's affix, hp from floor data
  const arch = { custodian: "warden", chorus: "sentinel", landlord: "brute" }[b.id] ?? "brute";
  const data = scaleEnemy(arch, r.floor, 4, b.affix);
  data.hp = b.hp; data.maxHp = b.hp; data.damage *= 1.6; data.name = b.name;
  const boss = enemies.spawn(data, 0, -8, true);
  boss.mesh.scale.multiplyScalar(1.7); boss.radius *= 1.7; boss.isBoss = true;
  boss.restScale = boss.mesh.scale.x;      // anim reads this as the rest pose
  // Choreography: core/bosspatterns.js picks the attacks, enemies.js performs them.
  boss.bossId = b.id; boss.rng = seedRng.fork("attacks"); boss.baseScale = boss.mesh.scale.x;
  boss.atkCd = 1.8;                       // a beat to breathe before the first tell
  if (b.id === "chorus") { for (const dx of [-5, 5]) { const m = scaleEnemy("sentinel", r.floor, 4, null); m.hp = Math.round(b.hp * 0.35); m.maxHp = m.hp; const e = enemies.spawn(m, dx, -9, true); e.mesh.scale.multiplyScalar(1.2); e.radius *= 1.2; e.isBossAdd = true; e.restScale = e.mesh.scale.x; } }
  G.boss = boss; G.bossMode = true; G.roomActive = true; G.roomCleared = false; G.roomTimer = 0;
  $("#roomNum").textContent = "BOSS"; $("#modName").textContent = `${b.name.toUpperCase()} · ${b.affix.toUpperCase()}`;
  $("#bossName").textContent = `${b.name.toUpperCase()} · ${b.affix.toUpperCase()}`; $("#bossFill").style.width = "100%"; $("#bossbar").classList.remove("hidden");
  music?.setBoss(true);
  toast(`${b.name} — ${b.affix}`, true, 2600); SFX.bossRoar();
  weaponView.equip(r.weapon); renderItems(); show("#hud"); input.requestLock();
}

/** Biome fog is a 0..0.5 "how thick" rating; the game plays between 0.022 and
 *  0.075, with 0.11 reserved for the darkness modifier. Map one onto the other so
 *  a hull walk still reads clearer than a reactor without going opaque. */
function biomeFog(v) {
  const t = Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 0.1) / 0.4));
  return 0.022 + t * 0.053;
}

function addGold(n) {
  const mult = n > 0 ? (G.passives?.goldMult ?? 1) : 1;   // multiply gains, never losses
  G.run = { ...G.run, gold: Math.max(0, Math.round((G.run.gold ?? 0) + n * mult)) };
  const el = $("#goldNum");
  if (el) el.textContent = String(G.run.gold);
}

/** Recompute stats from everything the player is carrying, and carry the maxHp
 *  change through to run.maxHp and current health — exactly what core/run.js's
 *  takeReward does. Every path that adds to `held` or `boons` outside takeReward
 *  MUST call this: the shop, the bonus item, and the curse altar all bypass it,
 *  and without this a purchased item is inert and a +HP boon is discarded.
 *  Boons are not items, so run.js cannot see them; they are appended here. */
function recomputeStats() {
  const items = (G.run.held ?? []).map((id) => ITEM_BY_ID[id]).filter(Boolean);
  const boonObjs = (G.run.boons ?? []).map((id) => BOONS[id]).filter(Boolean).map((b) => ({ effects: b.effects }));
  const combos = activeSynergies(G.run.held ?? []);
  const synObj = combos.length ? [{ effects: synergyEffects(G.run.held ?? []) }] : [];
  const stats = computeStats(BASE_STATS, [...items, ...boonObjs, ...synObj]);
  // Announce anything that just completed.
  const known = G.synergiesSeen ?? (G.synergiesSeen = []);
  for (const s of combos) {
    if (known.includes(s.id)) continue;
    known.push(s.id);
    toast(`SYNERGY — ${s.name.toUpperCase()} · ${s.desc}`, false, 3200);
    SFX.roomClear();
  }
  G.synergies = combos;
  G.passives = passiveMods(G.run.held ?? []);
  const oldMax = G.run.maxHp ?? stats.maxHp;
  const newMax = stats.maxHp;
  G.run = { ...G.run, stats, maxHp: newMax };
  if (newMax !== oldMax) G.hp = Math.min(newMax, G.hp + (newMax - oldMax));  // a +HP pickup heals you by that much
  applyStats();
  renderItems();
}

function applyStats() {
  const s = G.run.stats;
  weaponView.playerStats = s;      // capacity() reads s.magazine
  player.setStats({ moveSpeed: s.moveSpeed,
    // The Double Jump item grants `extraJump: true`, but nothing ever turned
    // that into a jump count, so the item did literally nothing until now.
    jumps: (s.jumps ?? 1) + (s.extraJump ? 1 : 0), dashCooldown: G.mods.noDash ? 9999 : (s.dashCooldown ?? 1.4), gravity: (s.gravity ?? 1) * (G.mods.lowGravity ? 0.45 : 1), airControl: s.airControl ? 1 : 0.35, dashPhases: !!s.dashPhases, slide: !!s.slide });
}

function onRoomCleared() {
  // Three separate call sites can reach this, and one of them did not check
  // whether the room was already clear - so a room could pay its gold and
  // re-rate the player's skill several times. Found by the play telemetry.
  if (G.roomCleared) return;
  G.roomCleared = true; G.roomActive = false;
  G.wavePlan = null;
  // Rate the room and let the director push harder or ease off next time.
  const st = G.roomStats ?? {};
  G.skill = updateSkill(G.skill, { clearedSecs: st.secs ?? 0, damageTaken: st.damageTaken ?? 0, accuracy: st.shotsFired ? st.shotsHit / st.shotsFired : 0.5 });
  // deliberately not persisted: the next run is a different person
  tlog("room_clear", {
    floor: G.run.floor, room: G.run.roomIndex + 1,
    secs: Math.round((G.roomStats?.secs ?? 0) * 10) / 10,
    kills: G.killsThisRoom, damageTaken: Math.round(G.roomStats?.damageTaken ?? 0),
    accuracy: G.roomStats?.shotsFired ? Math.round((G.roomStats.shotsHit / G.roomStats.shotsFired) * 100) : null,
    hpLeft: Math.round(G.hp), skill: Math.round((G.skill ?? 0) * 100) / 100,
  });
  addGold(15 + G.run.floor * 5);
  const won = roomChallengeEnd();
  if (won) {
    // Pay it out. Awarding a challenge and then giving nothing is worse than
    // never offering one.
    toast(`CHALLENGE — ${won.name} · +${won.rewardAmount} ${won.reward}`, false, 2800);
    SFX.pickup();
    if (won.reward === "heal") G.hp = Math.min(G.run.maxHp, G.hp + won.rewardAmount);
    else if (won.reward === "gold") G.run = { ...G.run, gold: (G.run.gold ?? 0) + won.rewardAmount };
    else if (won.reward === "reroll") G.run = { ...G.run, rerolls: (G.run.rerolls ?? 0) + won.rewardAmount };
    else G.pendingBonusItem = won.rewardAmount;   // consumed by the next draft
  }
  SFX.roomClear();
  toast("ROOM CLEAR — reach the exit");
  G.arena.exit.material.opacity = 0.75;
}

function openDraft() {
  const rewardType = G.run.currentFloor.rooms[G.run.roomIndex].rewardType;
  G.run = clearRoom(G.run, { kills: G.killsThisRoom });
  input.releaseLock();
  if (rewardType === "weapon") return openWeaponOffer();
  if (rewardType === "shop") return openShop();
  if (rewardType === "curse") return openPact();
  if (rewardType === "heal") return openHeal();
  const r = G.run;
  const wrap = $("#draftCards"); wrap.innerHTML = "";
  r.draft.forEach((it, i) => {
    const c = document.createElement("div");
    c.className = `card ${it.rarity}`;
    const flav = flavourFor(it.id);
    c.innerHTML = `<div class="rar">${it.rarity}</div><h3>${it.name}</h3><p>${it.desc || describe(it)}</p>${it.stacks ? '<div class="stack">STACKS</div>' : ""}${it.requires ? `<div class="stack">REQUIRES ${ITEM_BY_ID[it.requires]?.name ?? it.requires}</div>` : ""}${flav ? `<div class="flav">${flav}</div>` : ""}`;
    c.addEventListener("click", () => { SFX.pickup(); afterReward(i); });
    wrap.appendChild(c);
  });
  // The "item" challenge reward promised extra cards. Deliver them here rather
  // than leaving G.pendingBonusItem set and never read.
  if (G.pendingBonusItem) {
    const extra = makeRng(r.seed).fork(`bonus${r.floor}-${r.roomIndex}`);
    const pool = ITEMS.filter((it) => it.rarity !== "cursed" && !r.held.includes(it.id));
    for (let n = 0; n < G.pendingBonusItem && pool.length; n++) {
      const it = pool.splice(extra.int(0, pool.length - 1), 1)[0];
      const c = document.createElement("div");
      c.className = `card ${it.rarity}`;
      const bf = flavourFor(it.id);
      c.innerHTML = `<div class="rar">bonus \u00b7 ${it.rarity}</div><h3>${it.name}</h3>`
        + `<p>${it.desc || describe(it)}</p>${bf ? `<div class="flav">${bf}</div>` : ""}`;
      c.addEventListener("click", () => {
        SFX.pickup();
        G.run = { ...G.run, held: [...G.run.held, it.id] };
        recomputeStats();
        afterReward(null);
      });
      wrap.appendChild(c);
    }
    G.pendingBonusItem = 0;
  }
  $("#btnSkip").onclick = () => afterReward(null);
  show("#draft");
}

function describe(it) {
  return Object.entries(it.effects).map(([k, v]) => v === true ? k : v.mul != null ? `${k} ×${v.mul}` : `${k} +${v.add}`).join(" · ");
}

function afterReward(index) {
  const before = G.run.maxHp;
  G.run = takeReward(G.run, index);
  G.hp = Math.min(G.run.maxHp, G.hp + Math.max(0, G.run.maxHp - before));
  // takeReward recomputes from held items only; it cannot see boons or synergies.
  // Recompute again so an item that just completed a combo actually applies it.
  recomputeStats();
  if (G.run.phase === "door") openDoors();
  else if (G.run.phase === "boss") enterBoss();
}

function statRow(k, label, cur, next, higherIsBetter = true) {
  const d = next - cur;
  const cls = Math.abs(d) < 1e-6 ? "same" : (d > 0) === higherIsBetter ? "up" : "down";
  const fmt = (v) => Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
  return `<span class="k">${label}</span><span class="v">${fmt(next)}</span><span class="d ${cls}">${d === 0 ? "—" : (d > 0 ? "+" : "") + fmt(d)}</span>`;
}

function openWeaponOffer() {
  const r = G.run;
  const rr = makeRng(r.seed).fork(`weapon${r.floor}-${r.roomIndex}`);
  const arch = rr.pick(Object.keys(ARCHETYPES));
  const offered = rollWeapon(rr, arch, r.floor);
  G.offeredWeapon = offered;
  const held = r.weapon;
  const wrap = $("#weaponCards"); wrap.innerHTML = "";
  const card = (w, isHeld) => {
    const s = w.stats, dps = (s.damage * (s.pellets ?? 1) * s.fireRate);
    const hs = held.stats, heldDps = (hs.damage * (hs.pellets ?? 1) * hs.fireRate);
    const rows = isHeld ? "" : [
      statRow("dps", "DPS", heldDps, dps),
      statRow("damage", "damage", hs.damage, s.damage),
      statRow("fireRate", "rate", hs.fireRate, s.fireRate),
      statRow("magSize", "mag", hs.magSize, s.magSize),
      statRow("spread", "spread", hs.spread, s.spread, false),
      statRow("reloadTime", "reload", hs.reloadTime, s.reloadTime, false),
    ].join("");
    const el = document.createElement("div");
    el.className = `card wcard ${w.rarity}${isHeld ? " held" : ""}`;
    el.innerHTML = `<div class="rar">${isHeld ? "held · " : ""}${w.rarity}</div>
      <div class="arch">${ARCHETYPES[w.archetype].name.toUpperCase()}</div>
      <div class="mods">${w.mods.map(id => `<span>${WEAPON_MODS[id]?.name ?? id}</span>`).join("")}</div>
      ${isHeld ? `<div class="wstats"><span class="k">DPS</span><span class="v">${heldDps.toFixed(0)}</span><span class="d same"></span></div>` : `<div class="wstats">${rows}</div>`}`;
    return el;
  };
  wrap.appendChild(card(held, true));
  wrap.appendChild(card(offered, false));
  show("#weaponOffer");
}

function resolveWeapon(take) {
  if (take) { G.run = swapWeapon(G.run, G.offeredWeapon); weaponView.equip(G.run.weapon); SFX.pickup(); fx.pickup(player.pos.clone()); }
  else SFX.ui();
  G.offeredWeapon = null;
  renderItems();
  G.run = takeReward(G.run, null);        // resolve the reward phase, taking no item
  if (G.run.phase === "door") openDoors(); else if (G.run.phase === "boss") enterBoss();
}

// ---------------------------------------------------------------- shop --
function shopCard(offer, i) {
  const el = document.createElement("div");
  const it = offer.kind === "item" ? ITEM_BY_ID[offer.id] : null;
  el.className = `card ${it ? it.rarity : "common"}${offer.sold ? " sold" : ""}`;
  const title = it ? it.name : offer.kind === "heal" ? "Repair Kit" : offer.kind === "reroll" ? "Reroll Token" : "Weapon Cache";
  const body = it ? (it.desc || describe(it))
    : offer.kind === "heal" ? "Patch the hull. Restores health."
    : offer.kind === "reroll" ? "Refresh a future draft."
    : "A weapon of unknown make.";
  const flav = it ? flavourFor(it.id) : "";
  el.innerHTML = `<div class="rar">${it ? it.rarity : offer.kind}</div><h3>${title}</h3><p>${body}</p>`
    + `${flav ? `<div class="flav">${flav}</div>` : ""}`
    + `<div class="price">${offer.sold ? "SOLD" : offer.price + " \u00a4"}</div>`;
  if (!offer.sold) el.addEventListener("click", () => tryBuy(i));
  return el;
}

function renderShop() {
  const wrap = $("#shopCards"); wrap.innerHTML = "";
  G.shopStock.forEach((o, i) => wrap.appendChild(shopCard(o, i)));
  $("#shopGold").textContent = String(G.run.gold ?? 0);
  $("#btnShopReroll").textContent = `Reroll (${REROLL_COST} \u00a4)`;
}

function openShop() {
  const r = G.run;
  G.shopStock = rollStock(makeRng(r.seed).fork(`shop${r.floor}-${r.roomIndex}`),
    { floor: r.floor, gold: r.gold ?? 0, held: r.held });
  renderShop();
  show("#shop");
}

function tryBuy(i) {
  const res = buy({ gold: G.run.gold ?? 0, stock: G.shopStock, held: G.run.held }, i);
  if (!res.ok) { SFX.empty(); toast(res.error ?? "cannot afford that", true, 1200); return; }
  G.shopStock = res.stock;
  G.run = { ...G.run, gold: res.gold };
  const b = res.bought;
  if (b.kind === "item") { G.run = { ...G.run, held: [...G.run.held, b.id] }; recomputeStats(); }
  else if (b.kind === "heal") G.hp = Math.min(G.run.maxHp, G.hp + 35);
  else if (b.kind === "reroll") G.run = { ...G.run, rerolls: (G.run.rerolls ?? 0) + 1 };
  else if (b.kind === "weapon") {
    G.run = swapWeapon(G.run, rollWeapon(makeRng(G.run.seed).fork(`shopgun${G.run.roomIndex}`), "carbine", G.run.floor));
    weaponView.equip(G.run.weapon);
  }
  SFX.pickup();
  renderShop();
}

function leaveShop() {
  SFX.ui();
  G.run = takeReward(G.run, null);
  if (G.run.phase === "door") openDoors(); else if (G.run.phase === "boss") enterBoss();
}

// ---------------------------------------------------------- curse altar --
function openPact() {
  const r = G.run;
  const p = rollPact(makeRng(r.seed).fork(`pact${r.floor}-${r.roomIndex}`),
    { floor: r.floor, held: r.held, maxHp: r.maxHp });
  if (!p) return openHeal();            // every curse already taken: give something, not nothing
  G.pact = p;
  const curse = ITEM_BY_ID[p.curse], boon = BOONS[p.boon];
  const cf = flavourFor(curse.id);
  $("#pactText").textContent = p.text;
  $("#pactCurse").innerHTML = `<div class="rar">you take</div><h3>${curse.name}</h3>`
    + `<p>${curse.desc || describe(curse)}</p>${cf ? `<div class="flav">${cf}</div>` : ""}`;
  $("#pactBoon").innerHTML = `<div class="rar">you gain</div><h3>${boon.name}</h3><p>${boon.desc}</p>`;
  show("#pact");
}

function resolvePact(accept) {
  const p = G.pact;
  if (accept && p) {
    const res = acceptPact({ ...G.run }, p);
    G.run = { ...G.run, held: res.held, boons: [...(G.run.boons ?? []), p.boon] };
    recomputeStats();
    toast(`${BOONS[p.boon].name} - and what it cost you`, true, 2600);
    SFX.pickup();
  } else {
    SFX.ui();
    G.run = refusePact(G.run);
  }
  G.pact = null;
  G.run = takeReward(G.run, null);
  if (G.run.phase === "door") openDoors(); else if (G.run.phase === "boss") enterBoss();
}

// ----------------------------------------------------------- heal room --
function openHeal() {
  const before = G.hp;
  G.hp = Math.min(G.run.maxHp, G.hp + Math.round(G.run.maxHp * 0.35));
  toast(`REPAIR BAY - +${Math.round(G.hp - before)} HP`, false, 2200);
  SFX.pickup();
  G.run = takeReward(G.run, null);
  if (G.run.phase === "door") openDoors(); else if (G.run.phase === "boss") enterBoss();
}

function openEvent(ev) {
  G.event = ev;
  $("#evTitle").textContent = ev.name.toUpperCase();
  $("#evPrompt").textContent = ev.prompt;
  const wrap = $("#evChoices"); wrap.innerHTML = "";
  ev.choices.forEach((ch, i) => {
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<h3>${ch.label}</h3><p>${ch.desc}</p>`;
    el.addEventListener("click", () => resolveRoomEvent(i));
    wrap.appendChild(el);
  });
  show("#event");
}

function resolveRoomEvent(choiceIndex) {
  const ev = G.event;
  G.event = null;
  const out = resolveEvent(makeRng(G.run.seed).fork(`ev${G.run.floor}-${G.run.roomIndex}`),
    ev.id, choiceIndex, { floor: G.run.floor, held: G.run.held, gold: G.run.gold ?? 0, hp: G.hp, maxHp: G.run.maxHp });
  if (out.gold) addGold(out.gold);
  if (out.heal) heal(out.heal);
  if (out.damage) { G.hp = Math.max(1, G.hp - out.damage); fx.trauma(0.4); SFX.hurt(G.hp / G.run.maxHp); }
  if (out.maxHp) { G.run = { ...G.run, maxHp: Math.max(1, G.run.maxHp + out.maxHp) }; G.hp = Math.min(G.hp, G.run.maxHp); }
  if (out.grantItem && ITEM_BY_ID[out.grantItem]) {
    G.run = { ...G.run, held: [...G.run.held, out.grantItem] };
    recomputeStats();
  }
  toast(out.text, (out.damage ?? 0) > 0, 3000);
  SFX.ui();
  // Enemies from an event drop into the room you are about to leave; hold the
  // doors until they are dealt with rather than spawning into an empty screen.
  if (out.spawnEnemies > 0) {
    for (let i = 0; i < out.spawnEnemies; i++) {
      const a = (i / out.spawnEnemies) * Math.PI * 2;
      enemies.spawn(scaleEnemy("skitter", G.run.floor, G.run.roomIndex, null),
        Math.cos(a) * 8, Math.sin(a) * 8, false);
    }
    G.roomActive = true; G.roomCleared = false;
    show("#hud"); input.requestLock();
    return;
  }
  openDoors();
}

function openDoors() {
  // Roughly one room in three offers a choice instead of just a corridor.
  if (!G.eventSeen?.includes(`${G.run.floor}-${G.run.roomIndex}`) && G.run.roomIndex < 4) {
    const er = makeRng(G.run.seed).fork(`evroll${G.run.floor}-${G.run.roomIndex}`);
    if (er.chance(0.34)) {
      const ev = rollEvent(er, G.run.floor, G.eventsUsed ?? []);
      if (ev) {
        G.eventSeen = [...(G.eventSeen ?? []), `${G.run.floor}-${G.run.roomIndex}`];
        G.eventsUsed = [...(G.eventsUsed ?? []), ev.id];
        return openEvent(ev);
      }
    }
  }
  const r = G.run;
  const doors = r.currentFloor.rooms[r.roomIndex].doors;
  const wrap = $("#doorCards"); wrap.innerHTML = "";
  doors.forEach((d, i) => {
    const c = document.createElement("div"); c.className = "card";
    const p = d.preview;
    c.innerHTML = `<h3>DOOR ${i + 1}</h3><div><span class="tag">${p.rewardType.toUpperCase()}</span>${p.hazardTag ? `<span class="tag">${p.hazardTag.replace("_", " ").toUpperCase()}</span>` : ""}${p.hasElite ? '<span class="tag elite">ELITE</span>' : ""}</div>`;
    c.addEventListener("click", () => { SFX.door(); G.run = chooseDoor(G.run, i); enterRoom(); });
    wrap.appendChild(c);
  });
  show("#doors");
}

function onBossDown() {
  G.run = beatBoss(G.run);
  SFX.extract();
  onFloorStart(false);
}

function endRun(kind) {
  const r = G.run;
  input.releaseLock();
  SFX.stopAmbient();
  music?.stop(); music = null;
  const sc = r.finalScore;
  if (sc > G.best) { G.best = sc; localStorage.setItem("hs_best", String(sc)); }
  $("#repSub").textContent = kind === "extracted" ? "extracted · banked" : "run over";
  $("#repTitle").textContent = kind === "extracted" ? "EXTRACTED" : "DEAD";
  $("#repScore").textContent = sc.toLocaleString();
  const br = scoreRun(r).breakdown;
  $("#repStats").innerHTML = `<span>floor reached</span><b>${r.depthReached}</b><span>kills</span><b>${r.kills}</b><span>rooms</span><b>${r.roomsCleared}</b><span>items</span><b>${r.held.length}</b><span>depth mult</span><b>×${br.depthMult}</b><span>best</span><b>${G.best.toLocaleString()}</b>`;
  $("#repBonus").textContent = br.bonuses.length ? "STYLE: " + br.bonuses.map(b => `${b.name} +${b.points}`).join(" · ") : "";
  $("#repSeed").textContent = `SEED ${G.seedText}`;

  const secs = Math.round((performance.now() - (G.runStartedAt ?? performance.now())) / 1000);

  // Achievements are earned WITHIN this run and travel with the score onto the
  // board. Nothing carries to the next player, because the next player is a
  // stranger. Computed before the ranking, which displays them.
  const ach = checkAchievements(achState, {
    floorsCleared: r.depthReached, roomsCleared: r.roomsCleared, kills: r.kills,
    bossesKilled: r.bossesKilled ?? 0, extracted: kind === "extracted", score: sc,
    itemsHeld: r.held, secs, damageTaken: Math.round(G.runDamageTaken ?? 0),
    headshots: G.runHeadshots ?? 0,
    curses: r.held.filter((id) => ITEM_BY_ID[id]?.rarity === "cursed").length,
    synergies: (G.synergies ?? []).length,
  });
  achState = ach.state;
  const earned = achState.earned ?? [];
  $("#repAch").innerHTML = earned.map((id) => `<span class="ach">${ACHIEVEMENTS[id]?.name ?? id}</span>`).join("");

  // Made the board? Take three letters, arcade style.
  if (pilot) {
    const res = applyRun(profile, {
      floorsCleared: r.depthReached, roomsCleared: r.roomsCleared, kills: r.kills,
      bossesKilled: r.bossesKilled ?? 0, extracted: kind === "extracted",
      score: sc, itemsHeld: r.held, secs,
    });
    profile = res.profile;
    saveProfile();
    if (res.newlyUnlocked.length) {
      const names = res.newlyUnlocked.map((id) => UNLOCKS[id]?.name ?? id).join(" · ");
      setTimeout(() => toast(`UNLOCKED — ${names}`, false, 4200), 700);
    }
  }
  G.pendingEntry = qualifies(hof, sc)
    ? { score: sc, floor: r.depthReached, kills: r.kills, secs,
        extracted: kind === "extracted", achievements: earned }
    : null;
  const place = G.pendingEntry ? rank(hof, sc) : null;
  $("#repRank").textContent = place ? `RANK ${place} OF ${MAX_ENTRIES} — ENTER YOUR INITIALS` : "";
  $("#initialsRow").classList.toggle("hidden", !G.pendingEntry);
  if (G.pendingEntry) {
    const box = $("#initials");
    box.value = pilot ?? "";   // a signed-in pilot does not retype their name
    setTimeout(() => box.focus(), 120);
  }
  show("#report");
  if (kind === "dead") SFX.death();
  tlog("run_end", {
    kind, floor: r.depthReached, rooms: r.roomsCleared, kills: r.kills,
    score: sc, items: r.held, weapon: r.weapon?.archetype,
    secs: Math.round((performance.now() - (G.runStartedAt ?? performance.now())) / 1000),
    lastDamage: G.lastDamageWhy ?? null,
  });
  tFlush();
}

function renderSynergyLine() {
  const el = $("#synLine");
  if (!el) return;
  const c = G.synergies ?? [];
  el.textContent = c.length ? c.map((s) => s.name.toUpperCase()).join(" · ") : "";
}

function renderItems() {
  renderSynergyLine();
  const wrap = $("#items"); wrap.innerHTML = "";
  const counts = {};
  for (const id of G.run.held) counts[id] = (counts[id] ?? 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const it = ITEM_BY_ID[id]; if (!it) continue;
    const s = document.createElement("span"); s.className = it.rarity; s.textContent = n > 1 ? `${it.name} ×${n}` : it.name; wrap.appendChild(s);
  }
  $("#weaponName").textContent = `${G.run.weapon.archetype.toUpperCase()} · ${G.run.weapon.rarity.toUpperCase()}`;
}

// ---------------------------------------------------------------- damage --
function damagePlayer(amount, why = "?") {
  G.lastDamageWhy = why;
  if (G.roomStats) G.roomStats.damageTaken += amount;
  G.runDamageTaken = (G.runDamageTaken ?? 0) + amount;
  if (G.invuln > 0 || !G.roomActive) return;
  if (window.__dbg) (window.__dmgLog ??= []).push({ t: Math.round(performance.now()), amount: Math.round(amount * 10) / 10, why, hp: Math.round(G.hp) });
  const s = G.run.stats;
  if (s.deflect > 0 && G.roomRng.next() < s.deflect) { toast("DEFLECT"); return; }
  const still = Math.hypot(player.vel.x, player.vel.z) < 0.5;
  if (still && s.stillDamageTaken) amount *= s.stillDamageTaken;
  if (G.shield > 0) { const a = Math.min(G.shield, amount); G.shield -= a; amount -= a; }
  const taken = onHitTaken(G.run.held ?? [], { amount, hp: G.hp, maxHp: G.run.maxHp });
  if (taken.shieldGained > 0) G.shield += taken.shieldGained;
  if (taken.goldLost > 0) addGold(-taken.goldLost);
  if (taken.invulnSecs > 0) G.invuln = Math.max(G.invuln, taken.invulnSecs);
  if (taken.critBonus > 0) G.critBonus = taken.critBonus;      // read by fire()
  const spikes = (G.run.stats.damageOnMeleeHit ?? 0) * amount;
  if (spikes > 0) {
    for (const en of enemies.list) {
      if (!en.alive || en.mesh.position.distanceTo(player.pos) > 3) continue;
      const hp2 = Math.max(0, en.hp - spikes);
      if (enemies.damage(en, spikes, hp2, hp2 <= 0)) onKill(en, { damage: spikes });
    }
    fx.trauma(0.12);
  }
  if (taken.reflectDamage > 0) {
    // thorns / spiked_shell: hurt whatever is close enough to have hit you
    for (const en of enemies.list) {
      if (!en.alive || en.mesh.position.distanceTo(player.pos) > 4.5) continue;
      const hp2 = Math.max(0, en.hp - taken.reflectDamage);
      if (enemies.damage(en, taken.reflectDamage, hp2, hp2 <= 0)) onKill(en, { damage: taken.reflectDamage });
      break;
    }
  }
  tlog("damage", {
    why, amount: Math.round(amount * 10) / 10, hpAfter: Math.round(G.hp - amount),
    floor: G.run.floor, room: G.run.roomIndex + 1,
    // how far the nearest live enemy was: "hit from across the room" and "hit
    // while surrounded" are different problems with the same HP loss
    nearest: (() => {
      let d = Infinity;
      for (const e of enemies.list) if (e.alive) d = Math.min(d, e.mesh.position.distanceTo(player.pos));
      return Number.isFinite(d) ? Math.round(d * 10) / 10 : null;
    })(),
    alive: enemies.aliveCount,
  });
  G.hp -= amount; G.invuln = 0.35; G.dmgFlash = 1;
  fx.trauma(Math.min(0.85, 0.28 + amount / 40));
  SFX.hurt(Math.max(0, G.hp) / G.run.maxHp);
  if (s.bulletTime && G.hp > 0 && G.hp / G.run.maxHp < 0.3 && (G.btCd ?? 0) <= 0) { G.timeScale = 0.6; G.btT = 1; G.btCd = 20; }
  if (G.hp <= 0) {
    G.hp = 0;
    // second_wind, borrowed_time: an item-granted revive, consumed on use
    const rev = onDeath(G.run.held ?? [], { hp: G.hp, maxHp: G.run.maxHp, floor: G.run.floor });
    if (rev.revive && !(G.revivesUsed ?? []).includes(rev.consumed)) {
      G.revivesUsed = [...(G.revivesUsed ?? []), rev.consumed];
      G.hp = Math.max(1, rev.reviveHp);
      G.invuln = 1.8;
      const nm = ITEM_BY_ID[rev.consumed]?.name ?? "SOMETHING";
      toast(`${nm.toUpperCase()} — not yet`, true, 2400);
      SFX.extract();
      return;
    }
    const next = die(G.run);
    if (next.phase === "dead") { G.run = next; endRun("dead"); return; }
    G.run = next;
    if (next.hp === 1 && next.phase === "room") { G.hp = 1; toast("SECOND WIND", true, 1800); G.invuln = 1.5; return; }
    // The Loop: floor restarts
    G.hp = next.maxHp; toast("THE LOOP — again", true, 2200); enterFloor();
  }
}

function heal(n) { if (n <= 0 || G.run.stats.noHeal) return; const before = G.hp; G.hp = Math.min(G.run.maxHp, G.hp + n); if (G.hp - before >= 1) fx.number(G.hp - before, { x: player.pos.x, y: player.pos.y - 0.2, z: player.pos.z }, "heal", "selfheal"); }

// -------------------------------------------------------------- shooting --
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _end = new THREE.Vector3();
function fire(want, dt) {
  const r = G.run, s = { ...r.stats, ...r.weapon.stats };
  const dir = player.forwardDir(_d);
  // touch aim assist (soft magnetism)
  if (input.isTouch && enemies.aliveCount) {
    const targets = enemies.list.filter(e => e.alive).map(e => ({ x: e.mesh.position.x - player.pos.x, y: e.mesh.position.y - player.pos.y, z: e.mesh.position.z - player.pos.z }));
    const a = aimAssist({ x: dir.x, y: dir.y, z: dir.z }, targets, 0.35, { coneDeg: 9 });
    dir.set(a.x, a.y, a.z);
  }
  const shot = weaponView.tryFire(want, dt, s, G.roomRng, dir);
  if (!shot) return;
  if (!shot.beam) { const a = weaponView.archetype; fx.muzzleFlash(a === "railgun" ? 2 : a === "scattergun" ? 1.4 : 1); fx.trauma(a === "railgun" ? 0.45 : a === "scattergun" ? 0.3 : a === "launcher" ? 0.35 : 0.1); }
  const origin = _o.copy(player.pos);
  const pierce = (s.pierce ?? 0) + (r.weapon.stats.pierce ?? 0);
  let anyHit = false;
  for (const ray of shot.rays) {
    const hits = enemies.raycast(origin, ray.dir, 120, pierce >= 99 ? 50 : pierce);
    _end.copy(origin).addScaledVector(ray.dir, hits.length ? hits[hits.length - 1].t : 60);
    if (!shot.beam || G.roomRng.next() < 0.5) weaponView.spawnTracer(origin.clone().add(new THREE.Vector3(0.2, -0.15, 0)), _end.clone(), shot.beam ? COLORS.accent2 : 0xffd080, shot.beam ? 0.05 : 0.025, shot.beam ? 0.05 : 0.08);
    for (const h of hits) {
      if (h.blocked) { toast("BLOCKED", true, 500); continue; }
      const stats = { ...s, damage: s.damage * (r.weapon.stats.damage ?? 1) / (r.weapon.stats.damage ? 1 : 1) };
      // player stats.damage is a multiplier on the weapon's damage
      const combined = { ...s, damage: (r.weapon.stats.damage ?? 10) * (r.stats.damage ?? 1) * (shot.dmgMult ?? 1),
        critChance: Math.min(1, (s.critChance ?? 0) + (G.critBonus ?? 0)) };
      const target = { hp: h.e.hp, maxHp: h.e.maxHp, armor: h.e.armor ?? 0, statuses: h.e.statuses };
      const fired = onShoot(G.run.held ?? [], { shotIndex: weaponView.shotIndex ?? 0, magSize: weaponView.capacity?.() ?? 10 });
      if (fired.damageMult !== 1) combined.damage *= fired.damageMult;
      const res = resolveHit({ isHeadshot: false, isFirstShot: shot.isFirst || fired.guaranteedCrit, isLastShot: shot.isLast }, target, combined, G.roomRng);
      h.e.statuses = res.statusesAfter;
      // frostbite, static_charge, storm_caller, voidheart
      const hitFx = onEnemyHit(G.run.held ?? [], { damage: res.damage, isCrit: res.crit });
      if (hitFx.shockDamage > 0) { const hp2 = Math.max(0, h.e.hp - hitFx.shockDamage); if (enemies.damage(h.e, hitFx.shockDamage, hp2, hp2 <= 0)) onKill(h.e, { damage: hitFx.shockDamage }); }
      if (hitFx.slowFactor > 0) { h.e.slowMult = Math.min(h.e.slowMult ?? 1, 1 - hitFx.slowFactor); h.e.slowT = hitFx.slowSecs; }
      if (hitFx.lifestealHp > 0) heal(hitFx.lifestealHp);
      const killed = enemies.damage(h.e, res.damage, res.hpAfter, res.killed);
      anyHit = true;
      const hitPos = origin.clone().addScaledVector(ray.dir, h.t);
      fx.hit(hitPos, ray.dir, res.crit);
      fx.number(res.damage, h.e.mesh.position, res.crit ? "crit" : "hit", h.e.mesh.uuid);
      const hp3 = hit.e.mesh.position;
      if (res.crit) { playAt(hp3, () => SFX.crit()); G.hitstop = Math.max(G.hitstop, 0.09); fx.trauma(0.22); } else playAt(hp3, () => SFX.hit());
      // Static Charge / Arc mod: every Nth hit chains lightning through nearby enemies
      if (s.chainEveryN > 0) {
        G.hitCount = (G.hitCount ?? 0) + 1;
        if (G.hitCount % Math.round(s.chainEveryN) === 0) {
          const pool = enemies.list.filter(e => e.alive).map(e => ({ id: e.mesh.uuid, x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z, ref: e }));
          let from = h.e.mesh.position;
          for (const l of chainTargets(pool, h.e.mesh.uuid, 3, 8)) {
            weaponView.spawnTracer(from.clone(), l.ref.mesh.position.clone(), 0x9ad8ff, 0.05, 0.14);
            const dmg = combined.damage * 0.5, hp = Math.max(0, l.ref.hp - dmg);
            fx.hit(l.ref.mesh.position, ray.dir, false); fx.number(dmg, l.ref.mesh.position, "hit", l.ref.mesh.uuid);
            if (enemies.damage(l.ref, dmg, hp, hp <= 0)) onKill(l.ref, { damage: dmg });
            from = l.ref.mesh.position;
          }
        }
      }
      // Singularity Rounds: every Nth shot opens a pull at the impact point
      if (s.blackHoleEveryN > 0 && !G.singularity && weaponView.shotIndex % Math.round(s.blackHoleEveryN) === 0) { G.singularity = { pos: hitPos.clone(), t: 2 }; fx.explosion(hitPos, 1); }
      heal(res.heal);
      if (killed) onKill(h.e, res);
    }
  }
  if (anyHit) { $("#crosshair").classList.add("hit"); setTimeout(() => $("#crosshair").classList.remove("hit"), 70); }
}

function onKill(e, res) {
  // Several paths can reach a single death: the shot that landed it, the kill
  // event enemies.js raises, an explosion catching the corpse. Count once.
  if (e._killCounted) return;
  e._killCounted = true;
  const s = G.run.stats;
  G.killsThisRoom++;
  if (G.roomStats) G.roomStats.kills++;
  addGold(2 + G.run.floor);
  fx.kill(e.mesh.position); fx.trauma(0.28); duckMusic(0.3, 0.2); G.hitstop = Math.max(G.hitstop, 0.05);
  heal(s.healOnKill ?? 0);
  // doombringer, dash_reset, chain_reaction, midas_touch
  const kf = killEffects(G.run.held ?? [], { damage: res?.damage ?? 0, enemyHp: e.maxHp });
  if (kf.heal > 0) heal(kf.heal);
  if (kf.gold > 0) addGold(kf.gold);
  if (kf.dashReset) player.dashCd = 0;
  if (kf.explode) explode(e.mesh.position, kf.explode.radius, kf.explode.damage);
  // singularity (gravityWell): the corpse briefly drags everything in
  const well = G.run.stats.gravityWell ?? 0;
  if (well > 0) {
    const centre = { x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z };
    const pool = enemies.list.filter((x) => x.alive).map((x) => ({ id: x.mesh.uuid, x: x.mesh.position.x, y: x.mesh.position.y, z: x.mesh.position.z }));
    for (const pull of singularityPull(centre, 8 * well, pool)) {
      const target = enemies.list.find((x) => x.mesh.uuid === pull.id);
      if (!target || !target.alive) continue;
      target.mesh.position.x += (centre.x - target.mesh.position.x) * Math.min(0.8, pull.strength ?? 0.4);
      target.mesh.position.z += (centre.z - target.mesh.position.z) * Math.min(0.8, pull.strength ?? 0.4);
    }
    fx.pickup(e.mesh.position.clone());
  }
  if (s.dashOnKill) player.dashCd = 0;
  if (s.onKillExplode > 0) explode(e.mesh.position, 2.5, res.damage * s.onKillExplode);
  if (e.isBoss) {
    // chorus adds die with the boss
    for (const o of enemies.list) if (o.isBossAdd) enemies._kill(o, null, true);
    G.roomActive = false; G.roomCleared = true; toast("BOSS DOWN", false, 1800); G.arena.exit.material.opacity = 0.75;
    return;
  }
  if (!G.bossMode && enemies.aliveCount === 0 && !wavesPending()) onRoomCleared();
}

// Each attack shape resolves to something the player can see and react to. The
// wind-up already happened — this is the moment it lands.
function onBossAttack(ev) {
  const p = ev.pos;
  switch (ev.shape) {
    case "shockwave":
    case "charge_slam": {
      fx.trauma(0.55); SFX.explosion();
      explode(p, 9, ev.damage * 0.7);
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 9) damagePlayer(ev.damage * (1 - d / 9), "boss");
      break;
    }
    case "mortar_volley": {
      // Shells land around the player: move, or wear them.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.random();
        hazards.addMine(player.pos.x + Math.cos(a) * 4.5, player.pos.z + Math.sin(a) * 4.5, ev.damage * 0.5);
      }
      SFX.explosion(); fx.trauma(0.25);
      break;
    }
    case "sweep_beam": {
      fx.trauma(0.3); SFX.sentinelCharge();
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 22) damagePlayer(ev.damage * 0.8, "beam");
      break;
    }
    case "summon_adds": {
      const r = G.run;
      for (const dx of [-4, 4]) {
        const m = scaleEnemy("skitter", r.floor, 4, null);
        enemies.spawn(m, p.x + dx, p.z + 2, false);
      }
      playAt(p, () => SFX.bossRoar());     // it comes from the boss, not your head
      break;
    }
    default: {                                  // spore_cloud and anything new
      explode(p, 7, ev.damage * 0.5); fx.trauma(0.3);
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 7) damagePlayer(ev.damage * 0.6, "boss");
    }
  }
}

function explode(pos, radius, dmg) {
  fx.explosion(pos, radius);
  SFX.explosion(Math.min(2, radius / 4));
  // explosionVictims returns plain data and does NOT carry `ref` back through,
  // so resolve the enemy by id. Reading v.ref threw on every explosion that
  // actually caught something.
  const byId = new Map(enemies.list.filter(e => e.alive).map(e => [e.mesh.uuid, e]));
  const pool = [...byId].map(([id, e]) => ({ id, x: e.mesh.position.x, y: e.mesh.position.y, z: e.mesh.position.z }));
  for (const v of explosionVictims({ x: pos.x, y: pos.y, z: pos.z }, radius, pool)) {
    const e = v.ref ?? byId.get(v.id);
    if (!e || !e.alive) continue;
    const d = dmg * v.falloff, hp = Math.max(0, e.hp - d);
    fx.number(d, e.mesh.position, "hit", e.mesh.uuid);
    if (enemies.damage(e, d, hp, hp <= 0)) onKill(e, { damage: d });
  }
}

// ------------------------------------------------------------------ loop --
function frameBody(now) {
  let dt = Math.min(0.05, (now - G.lastFrame) / 1000); G.lastFrame = now;
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.15; }
  if (G.btT > 0) { G.btT -= dt; if (G.btT <= 0) G.timeScale = 1; }
  G.btCd = Math.max(0, (G.btCd ?? 0) - dt);
  dt *= G.timeScale;

  const { s, look } = input.poll();
  if (G.run && $("#hud") && !$("#hud").classList.contains("hidden")) {
    const sens = input.isTouch ? input.mouseSens : input.mouseSens;
    if (input.locked || input.isTouch) player.look(look.dx, look.dy, sens);
    player.update(dt, s);
    if (player.dashed) { SFX.dash(); fx.dash(new THREE.Vector3(player.pos.x, 0.6, player.pos.z)); } if (player.jumped) SFX.jump();
    if (s.reload) weaponView.startReload(G.run.stats);
    weaponView.update(dt, Math.hypot(player.vel.x, player.vel.z) > 1);
    // remember the un-shaken camera pose; fx.update applies shake on top of it
    G.camBase = { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z };

    if (G.roomActive || G.bossMode) {
      const s2 = { ...G.run.stats, ...G.run.weapon.stats };
      fire(s.fire, dt);
      const events = enemies.update(dt, player, G.arena, s2);
      for (const ev of events) {
        if (ev.type === "hitPlayer") { damagePlayer(ev.dmg, ev.projectile ? "projectile" : ("melee:" + (ev.src?.archetype ?? "?"))); if (ev.src && G.run.stats.thorns) { const hp = Math.max(0, ev.src.hp - G.run.stats.thorns); enemies.damage(ev.src, G.run.stats.thorns, hp, hp <= 0) && onKill(ev.src, { damage: 0 }); } }
        else if (ev.type === "bossTelegraph") { toast(ev.text, true, Math.round(ev.secs * 1000)); SFX.ui(); }
        else if (ev.type === "bossAttack") { onBossAttack(ev); }
        else if (ev.type === "dropMine") { hazards.addMine(ev.x, ev.z, ev.damage); SFX.ui(); }
        else if (ev.type === "popperBoom") { const d = player.pos.distanceTo(ev.pos); if (d < ev.r) damagePlayer(ev.dmg * (1 - d / ev.r), "popper"); explode(ev.pos, ev.r, ev.dmg * 0.5); if (!G.bossMode && enemies.aliveCount === 0 && G.roomActive && !wavesPending()) onRoomCleared(); }
        else if (ev.type === "kill") { onKill(ev.e, { damage: 0 }); if (!G.bossMode && enemies.aliveCount === 0 && G.roomActive && !wavesPending()) onRoomCleared(); }
      }
      if (G.mods.timePressure && G.roomActive) { G.roomTimer -= dt; if (G.roomTimer <= 0) { damagePlayer(9999, "timer"); } }
      // hazards (turrets, mines, lava, acid, collapsing) — logic in core, drawn by hazardView
      let slowed = false;
      for (const ev of hazards.update(dt, player, G.arena, G.roomRng)) {
        if (ev.type === "damage") {
          if (ev.instant) damagePlayer(ev.amount, "hazard:" + ev.source);
          else { G.hazardAcc = (G.hazardAcc ?? 0) + ev.amount; if (G.hazardAcc >= 4) { const a = G.hazardAcc; G.hazardAcc = 0; G.invuln = 0; damagePlayer(a, "hazard:" + ev.source); } }
          if (Math.random() < dt * 10) fx.burn(new THREE.Vector3(player.pos.x, 0.25, player.pos.z));
        } else if (ev.type === "slow") { player.speedMult = Math.min(player.speedMult, 1 - ev.amount); slowed = true; }
        else if (ev.type === "explode") { const d = Math.hypot(player.pos.x - ev.x, player.pos.z - ev.z); if (d < ev.radius) damagePlayer(ev.damage * (1 - d / ev.radius), "mine"); explode(new THREE.Vector3(ev.x, 0.5, ev.z), ev.radius, ev.damage * 0.6); }
      }
      if (!slowed) player.speedMult = Math.min(1, player.speedMult + dt * 2);
      // singularity: pull enemies toward the point for its lifetime
      if (G.singularity) {
        G.singularity.t -= dt;
        for (const e of enemies.list) { if (!e.alive) continue; const d = singularityPull(G.singularity.pos, e.mesh.position, 6, 14, dt); e.mesh.position.x += d.x; e.mesh.position.z += d.z; }
        if (Math.random() < dt * 30) fx.burst("dash", G.singularity.pos);
        if (G.singularity.t <= 0) G.singularity = null;
      }
      // regen out of combat-ish
      if (G.run.stats.regen > 0 && G.invuln <= 0) heal(G.run.stats.regen * dt);
      if (G.shield > 0) G.shield = Math.max(0, G.shield - dt * 2);
    }
    G.invuln = Math.max(0, G.invuln - dt);
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 3);
    // low-health heartbeat: faster as it gets worse
    const frac = G.hp / G.run.maxHp;
    if (frac < 0.4 && (G.roomActive || G.bossMode)) { G.beatT = (G.beatT ?? 0) - dt; if (G.beatT <= 0) { SFX.heartbeat(frac); G.beatT = 0.45 + frac * 1.6; } }
    fx.update(dt, G.camBase ?? { x: camera.rotation.x, y: camera.rotation.y, z: camera.rotation.z });
    // adaptive score: more enemies and lower health = more intense
    if (music) {
      const threat = Math.min(1, enemies.aliveCount / 6);
      const peril = 1 - Math.min(1, G.hp / G.run.maxHp);
      music.setTarget((G.roomActive || G.bossMode) ? Math.max(0.35, threat * 0.7 + peril * 0.5) : 0.12, dt);
    }

    // exit pad
    if (G.roomCleared && G.arena) {
      const d = Math.hypot(player.pos.x - G.arena.exitPos.x, player.pos.z - G.arena.exitPos.z);
      G.arena.exit.userData.ring.rotation.z += dt * 2;
      if (d < 1.8) { G.roomCleared = false; if (G.bossMode) onBossDown(); else openDraft(); }
    }
    // hud
    if (G.bossMode && G.boss) { $("#bossFill").style.width = `${Math.max(0, G.boss.hp / G.boss.maxHp) * 100}%`; if (!G.boss.alive) $("#bossbar").classList.add("hidden"); }
    $("#hpFill").style.width = `${Math.max(0, G.hp / G.run.maxHp) * 100}%`;
    $("#shFill").style.width = `${Math.min(100, (G.shield / Math.max(1, G.run.maxHp)) * 100)}%`;
    $("#hpText").textContent = Math.ceil(G.hp);
    $("#ammoText").textContent = weaponView.ammoText;
    $("#ammo").classList.toggle("reloading", weaponView.reloading);
    $("#dashFill").style.width = `${(1 - Math.min(1, player.dashCd / Math.max(0.01, player.stats.dashCooldown))) * 100}%`;
    $("#dmgflash").classList.toggle("on", G.dmgFlash > 0.05 || (G.hp / G.run.maxHp) < 0.25 && Math.sin(now / 120) > 0);
    if (G.mods.timePressure && G.roomActive) $("#modName").textContent = `COUNTDOWN ${Math.ceil(G.roomTimer)}`;
    // fps counter (dev)
    if (player.dashed && player.dashInvuln > 0) G.invuln = Math.max(G.invuln, player.dashInvuln);
    if (G.roomActive && !G.bossMode) { pumpWaves(dt); if (G.roomStats) G.roomStats.secs += dt; }
    // regen_coil and friends: trickle health while the run is live
    const rps = G.passives?.regenPerSec ?? 0;
    if (rps > 0 && G.run && G.hp > 0 && G.hp < G.run.maxHp) {
      G.regenAcc += rps * dt;
      if (G.regenAcc >= 1) { const whole = Math.floor(G.regenAcc); G.regenAcc -= whole; heal(whole); }
    }
    // Ears follow the camera, or HRTF panning does nothing at all.
    setListener(camera.position, -Math.sin(player.yaw), -Math.cos(player.yaw));
    if (R.grade) R.grade.uniforms.uDamage.value = G.dmgFlash * 0.55;
    // Footfalls, paced by actual ground speed.
    const gsp = Math.hypot(player.vel.x, player.vel.z);
    if (gsp > 1.5 && (player.grounded ?? true)) {
      G.stepPhase = (G.stepPhase ?? 0) + dt * gsp * 0.42;
      if (G.stepPhase >= 1) { G.stepPhase = 0; footstep(gsp / 7); }
    }
    governQuality(dt || 0.016);
    G.fpsAcc += dt || 0.016; G.fpsN++; if (G.fpsAcc > 0.5) { $("#perf").textContent = `${G.qTier.toUpperCase()} · ${Math.round(G.fpsN / G.fpsAcc)} FPS`; G.fpsAcc = 0; G.fpsN = 0; }
  }
  render();
}

// --- error boundary -------------------------------------------------------
// Keep the loop alive through a throw, tell the player something went wrong
// rather than freezing, and stop shouting after the first few.
let frameErrors = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try {
    frameBody(now);
  } catch (err) {
    frameErrors++;
    if (frameErrors <= 3) {
      console.error("[frame]", err);
      const box = $("#crash");
      if (box) {
        box.textContent = `something broke: ${err?.message ?? err}`;
        box.classList.remove("hidden");
        clearTimeout(frame._t);
        frame._t = setTimeout(() => box.classList.add("hidden"), 6000);
      }
    }
    // A storm of identical errors means the loop cannot recover on its own.
    // Drop back to the menu rather than burning the CPU on a broken frame.
    if (frameErrors === 40) {
      try { input.releaseLock(); SFX.stopAmbient(); music?.stop(); } catch {}
      const box = $("#crash");
      if (box) { box.textContent = "the run could not continue — returned to the menu"; box.classList.remove("hidden"); }
      menu();
    }
  }
}

// -------------------------------------------------------------- menu wiring --
function menu() {
  input.releaseLock();
  renderHof();
  $("#menuHint").textContent = input.isTouch ? "left thumb: move · right thumb: look · buttons: fire / dash / jump / reload" : "WASD · mouse · shift dash · space jump · R reload · click to lock";
  show("#menu");
}
$("#btnRun").addEventListener("click", () => {
  const txt = $("#seedInput").value.trim();
  const seed = txt ? (parseSeed(txt) ?? (Math.random() * 2 ** 32) >>> 0) : (Math.random() * 2 ** 32) >>> 0;
  beginRun(seed, $("#chkCurses").checked);
});
$("#btnProgress").addEventListener("click", () => { renderHof(); show("#hof"); });
$("#btnHofClose").addEventListener("click", () => menu());
$("#btnContinue").addEventListener("click", () => { $("#signinRow").classList.toggle("hidden"); const b = $("#pilotInitials"); if (b) { b.value = pilot ?? ""; setTimeout(() => b.focus(), 60); } });
$("#btnSignIn").addEventListener("click", () => {
  const v = $("#pilotInitials")?.value;
  if (!v || !v.trim()) return;
  signIn(v);
  $("#signinRow").classList.add("hidden");
  SFX.ui();
});
$("#btnSignOut").addEventListener("click", () => { signOut(); SFX.ui(); });
$("#pilotInitials").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); });
$("#pilotInitials").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#btnSignIn").click(); });
$("#btnEnter").addEventListener("click", commitEntry);
$("#initials").addEventListener("keydown", (e) => { if (e.key === "Enter") commitEntry(); });
$("#initials").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3); });
$("#btnShopLeave").addEventListener("click", leaveShop);
$("#btnShopReroll").addEventListener("click", () => {
  const res = rerollStock(makeRng(G.run.seed).fork(`shopre${G.run.gold}`),
    { gold: G.run.gold ?? 0, stock: G.shopStock, run: { floor: G.run.floor, gold: G.run.gold ?? 0, held: G.run.held } });
  if (!res.ok) { SFX.empty(); toast("not enough salvage", true, 1200); return; }
  G.shopStock = res.stock; G.run = { ...G.run, gold: res.gold }; SFX.ui(); renderShop();
});
$("#btnPactAccept").addEventListener("click", () => resolvePact(true));
$("#btnPactRefuse").addEventListener("click", () => resolvePact(false));
$("#btnSwap").addEventListener("click", () => resolveWeapon(true));
$("#btnKeep").addEventListener("click", () => resolveWeapon(false));
$("#btnDaily").addEventListener("click", () => beginRun(dailySeed(), $("#chkCurses").checked));
$("#btnDeeper").addEventListener("click", () => { SFX.ui(); enterFloor(); });
$("#btnExtract").addEventListener("click", () => { G.run = extract(G.run); SFX.extract(); endRun("extracted"); });
$("#btnAgain").addEventListener("click", () => beginRun((Math.random() * 2 ** 32) >>> 0, G.run.cursesEnabled));
$("#btnMenu").addEventListener("click", menu);
document.addEventListener("keydown", (e) => { if (e.code === "Escape" && G.run && !$("#hud").classList.contains("hidden")) input.releaseLock(); });
document.addEventListener("click", () => resumeAudio(), { once: true });
document.addEventListener("touchstart", () => { initAudio(); resumeAudio(); }, { once: true });

// dev hooks — only when ?dev is in the URL. Lets the loop be driven from the
// console for verification without touching gameplay code paths.
if (new URLSearchParams(location.search).has("dev")) {
  window.__hs = {
    G, enemies, player, fx, hazards, renderer, scene, camera, THREE,
    scaleEnemy, rollWeapon,
    get music() { return music; },
    // Drive the loop by hand. requestAnimationFrame is paused whenever the tab
    // is not compositing (headless verification, background pane), so without
    // this there is no way to exercise frame logic in a test harness.
    step(n = 60, dtMs = 16.7) { for (let i = 0; i < n; i++) { G.lastFrame = performance.now() - dtMs; frame(performance.now()); } },
    snap() { render(); return renderer.domElement.toDataURL("image/png"); },
    clearRoom() { for (const e of enemies.list) if (e.alive) enemies._kill(e, null, true); if (G.bossMode) { G.roomActive = false; G.roomCleared = true; G.arena.exit.material.opacity = 0.75; } else onRoomCleared(); },
    toExit() { player.pos.x = G.arena.exitPos.x; player.pos.z = G.arena.exitPos.z; },
    toBoss() { G.run = { ...G.run, phase: "boss" }; enterBoss(); },
    recompute() { recomputeStats(); return { maxHp: G.run.maxHp, statMax: G.run.stats.maxHp, hp: G.hp, boons: G.run.boons }; },
    god() { G.invuln = 1e9; },
  };
}

// go
$("#boot").classList.add("hidden");
menu();
requestAnimationFrame(frame);
