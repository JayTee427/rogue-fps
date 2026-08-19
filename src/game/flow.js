// HOLLOW SIGNAL — the run state machine. Floors, rooms, bosses, drafts,
// shops, pacts, events, doors, and the two ways a run ends. Damage lives in
// combat.js; this file decides where you are and what you are offered.

import { $, show, toast, G, player, input, weaponView, enemies, fx, hazards, scene, audio } from "./context.js";
import { getPilot, pilotGrants, creditRun, renderHof, boardPlace } from "./pilots.js";
import { heal, clearBossTell, clearBeamSweep } from "./combat.js";
import { initAudio, resumeAudio, SFX } from "./audio.js";
import { MusicPlayer } from "./musicPlayer.js";
import { log as tlog, startRun as tStartRun, flushNow as tFlush } from "./telemetry.js";
import { buildArena, buildDressing } from "./renderer.js";

import { rng as makeRng } from "core/rng.js";
import { newRun, startFloor, clearRoom, takeReward, chooseDoor, beatBoss, extract, canExtract, swapWeapon } from "core/run.js";
import { ROOM_MODIFIERS } from "core/floor.js";
import { HAZARD_DEFS } from "core/hazards.js";
import { scoreRun } from "core/score.js";
import { dailySeed, formatSeed, parseSeed } from "core/daily.js";
import { ITEM_BY_ID, ITEMS } from "core/items.js";
import { flavourFor, BIOME_LORE, BOSS_LORE, deathLineFor } from "core/codex.js";
import { hintFor } from "core/hints.js";
import { scaleEnemy } from "core/enemies.js";
import { rollWeapon, ARCHETYPES, WEAPON_MODS } from "core/weapons.js";
import { planEncounter, updateSkill } from "core/director.js";
import { rollChallenge, checkChallenge } from "core/challenges.js";
import { layoutDressing, PROP_KINDS } from "core/dressing.js";
import { BIOMES, pickBiome, biomePalette, biomeLayout } from "core/arenas.js";
import { rollEvent, resolveEvent } from "core/events.js";
import { rollStock, buy, rerollStock, REROLL_COST } from "core/shop.js";
import { BOONS, rollPact, acceptPact, refusePact } from "core/pact.js";
import { activeSynergies, synergyEffects } from "core/synergy.js";
import { passiveMods } from "core/effects.js";
import { computeStats, BASE_STATS } from "core/stats.js";
import { ACHIEVEMENTS, checkAchievements, newAchievementState } from "core/achievements.js";
import { UNLOCKS } from "core/meta.js";

let achState = newAchievementState();

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




// ---------------------------------------------------------- first-time hints --
// One line, the first time a thing appears, ever, on this browser. Queued so
// two new enemies in one room speak in turn instead of over each other.
const seenHints = new Set(JSON.parse(localStorage.getItem("hs_hints") ?? "[]"));
let hintDelay = 0;

export function maybeHint(ids) {
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    if (seenHints.has(id)) continue;
    const line = hintFor(id);
    if (!line) continue;
    seenHints.add(id);
    localStorage.setItem("hs_hints", JSON.stringify([...seenHints]));
    setTimeout(() => toast(line, false, 3600), 900 + hintDelay);
    hintDelay += 3800;
    setTimeout(() => { hintDelay = Math.max(0, hintDelay - 3800); }, 4000);
  }
}

// -------------------------------------------------------------- run flow --
function beginRun(seed, cursesEnabled) {
  initAudio(); resumeAudio();
  G.run = newRun(seed, { cursesEnabled });
  // Everything the signed-in pilot has unlocked, applied before the first room.
  // An anonymous run gets none of it, which is the point: a stranger opening the
  // link plays the honest base game.
  const boons = pilotGrants();
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
  G.frameErrors = 0;
  G.runDamageTaken = 0; G.runHeadshots = 0;
  SFX.startAmbient();
  audio.music = new MusicPlayer(makeRng(seed).fork("music"));
  audio.music.start();
  onFloorStart(true);
}

function onFloorStart(first = false) {
  const r = G.run;
  if (r.phase !== "floor_start") return;
  if (first || !canExtract(r)) { enterFloor(); return; }
  // offer extract vs deeper
  $("#fsTitle").textContent = `FLOOR ${r.floor}`;
  const s = scoreRun(r).total;
  $("#fsText").textContent = `Banking now scores ${s.toLocaleString()}. Descending repairs ${Math.round(r.maxHp * FLOOR_REPAIR)} HP and multiplies everything — and everything hits harder.`;
  input.releaseLock();
  maybeHint("extract");
  show("#floorStart");
}

// A floor should be a fresh test, not a continuation of the fight before it.
// Without this, the boss's damage is carried straight into a larger opening
// room: the reported run finished the floor-1 boss on 29hp and was dead two
// seconds into floor 2, killed by a popper and one projectile. Deliberately not
// a full heal - attrition within a floor is the part worth keeping.
const FLOOR_REPAIR = 0.4;

function enterFloor() {
  G.run = startFloor(G.run);
  if (G.run.floor > 1) {
    const before = G.hp;
    G.hp = Math.min(G.run.maxHp, G.hp + Math.round(G.run.maxHp * FLOOR_REPAIR));
    const gained = Math.round(G.hp - before);
    if (gained > 0) setTimeout(() => toast(`REPAIRS — +${gained} HP`, false, 2600), 600);
  }
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
  clearBossTell(); clearBeamSweep();
  // Each floor gets its own biome: its own palette, fog and room proportions.
  const biomeId = pickBiome(makeRng(r.seed).fork(`biome${r.floor}`), r.floor);
  const bp = biomePalette(biomeId);
  const bl = biomeLayout(seedRng.fork("shape"), biomeId, r.floor);
  G.biome = biomeId;
  G.arena = buildArena(scene, seedRng.fork("arena"), {
    halfW: bl.halfW, halfD: bl.halfD, blockCount: bl.blockCount,
    // Forward the whole biome palette. Cherry-picking keys here is what left
    // floorSeam, panel, block and blockTop undefined - four white materials a room.
    palette: bp,
    fogDensity: biomeFog(bp.fogDensity),
    fogColor: bp.fog,
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
  maybeHint([...enemies.list.map((e) => e.archetype), ...deferred.map((d) => d.data.archetype)]);
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
  audio.music?.setBoss(false);
  G.roomTimer = G.mods.timePressure ? 60 : 0;
  G.shield = r.stats.roomShield ?? 0;
  // Darkness should read as oppressive, not as a black screen: 0.11 fogged
  // out 99% of a 20m sightline.
  scene.fog.density = G.mods.darkness ? 0.042 : biomeFog(biomePalette(G.biome ?? "").fogDensity);
  $("#floorNum").textContent = `FLOOR ${r.floor}`;
  $("#biomeName").textContent = (BIOMES[G.biome]?.name ?? "").toUpperCase();
  // The place introduces itself once per floor, after the HUD settles.
  if (r.roomIndex === 0 && BIOME_LORE[G.biome]) setTimeout(() => toast(BIOME_LORE[G.biome], false, 4200), 1400);
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
  clearBossTell(); clearBeamSweep();
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
  audio.music?.setBoss(true);
  toast(`${b.name} — ${b.affix}`, true, 2600); SFX.bossRoar();
  if (BOSS_LORE[b.id]) setTimeout(() => toast(BOSS_LORE[b.id], false, 4200), 2800);
  weaponView.equip(r.weapon); renderItems(); show("#hud"); input.requestLock();
}

/** Biome fog is a 0..0.4 "how thick" rating; the game plays between 0.013 and
 *  0.030, with 0.042 reserved for the darkness modifier. Map one onto the other
 *  so a hull walk still reads clearer than a reactor without going opaque. */
function biomeFog(v) {
  // Arenas run to 60m across, so density has to leave the far wall visible.
  // The old 0.022-0.075 band put every biome under the black-void floor.
  const t = Math.max(0, Math.min(1, (Number.isFinite(v) ? v : 0.1) / 0.4));
  return 0.013 + t * 0.017;
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
  if (G.run.lastForgotten) {
    const lost = ITEM_BY_ID[G.run.lastForgotten]?.name ?? G.run.lastForgotten;
    setTimeout(() => toast(`FORGOTTEN — ${lost} is gone`, true, 3000), 400);
    G.run = { ...G.run, lastForgotten: null };
  }
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
  maybeHint("pact");
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
  audio.music?.stop(); audio.music = null;
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

  // Credit the pilot through their own module; flow never touches profiles.
  const newlyUnlocked = creditRun({
    floorsCleared: r.depthReached, roomsCleared: r.roomsCleared, kills: r.kills,
    bossesKilled: r.bossesKilled ?? 0, extracted: kind === "extracted",
    score: sc, itemsHeld: r.held, secs,
  });
  if (newlyUnlocked.length) {
    const names = newlyUnlocked.map((id) => UNLOCKS[id]?.name ?? id).join(" · ");
    setTimeout(() => toast(`UNLOCKED — ${names}`, false, 4200), 700);
  }
  // Made the board? Take three letters, arcade style.
  const board = boardPlace(sc);
  G.pendingEntry = board.qualifies
    ? { score: sc, floor: r.depthReached, kills: r.kills, secs,
        extracted: kind === "extracted", achievements: earned }
    : null;
  $("#repRank").textContent = board.qualifies ? `RANK ${board.place} OF ${board.of} — ENTER YOUR INITIALS` : "";
  $("#initialsRow").classList.toggle("hidden", !G.pendingEntry);
  if (G.pendingEntry) {
    const box = $("#initials");
    box.value = getPilot() ?? "";   // a signed-in pilot does not retype their name
    setTimeout(() => box.focus(), 120);
  }
  $("#repDeath").textContent = kind === "dead" ? deathLineFor(G.lastDamageWhy) : "";
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
// Say what the daily actually is: the same station for everyone, today only.
{
  const d = $("#dailyNote");
  if (d) d.textContent = `today's station is the same for everyone · seed ${formatSeed(dailySeed())}`;
}
$("#btnDeeper").addEventListener("click", () => { SFX.ui(); enterFloor(); });
$("#btnExtract").addEventListener("click", () => { G.run = extract(G.run); SFX.extract(); endRun("extracted"); });
$("#btnAgain").addEventListener("click", () => beginRun((Math.random() * 2 ** 32) >>> 0, G.run.cursesEnabled));
$("#btnMenu").addEventListener("click", menu);

export { beginRun, enterFloor, enterRoom, enterBoss, onRoomCleared, openDraft, afterReward, openDoors, endRun, menu, addGold, recomputeStats, applyStats, renderItems, pumpWaves, wavesPending, roomChallengeEnd, onBossDown };
