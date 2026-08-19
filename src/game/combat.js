// HOLLOW SIGNAL — damage in both directions. Firing, kills, explosions,
// boss attacks and the live beam sweep, and what happens when the player is
// hit. The run state machine lives in flow.js; this file only spends and
// deals health.

import * as THREE from "three";
import { $, toast, G, player, input, weaponView, enemies, fx, hazards, scene } from "./context.js";
import { SFX, duckMusic, at as playAt } from "./audio.js";
import { log as tlog } from "./telemetry.js";
import { resolveHit } from "core/combat.js";
import { damageHazard, hazardRayHit } from "core/hazards.js";
import { die } from "core/run.js";
import { COLORS } from "./renderer.js";
import { aimAssist } from "core/assist.js";
import { ITEM_BY_ID } from "core/items.js";
import { scaleEnemy } from "core/enemies.js";
import { onShoot, onEnemyHit, onKill as killEffects, onHitTaken, onDeath } from "core/triggers.js";
import { chainTargets, singularityPull, explosionVictims } from "core/fxitems.js";
import { addGold, onRoomCleared, wavesPending, endRun, enterFloor } from "./flow.js";

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
  let selfBurn = 0;                      // soulfire/volatile: dealt damage that recoils
  for (const ray of shot.rays) {
    const hits = enemies.raycast(origin, ray.dir, 120, pierce >= 99 ? 50 : pierce);
    // Turrets and mines are shootable. A hazard closer than the first enemy
    // absorbs the ray: turrets soak hull damage, an armed mine detonates -
    // which is the safe way to clear one.
    const hz = hazardRayHit(hazards.hazards, origin, ray.dir, 120);
    if (hz && (!hits.length || hz.t < hits[0].t)) {
      const res = damageHazard(hazards.hazards, hz.id, (r.weapon.stats.damage ?? 10) * (r.stats.damage ?? 1));
      hazards.hazards = res.hazards;
      hazards.inject(res.events);
      const hp = origin.clone().addScaledVector(ray.dir, hz.t);
      fx.hit(hp, ray.dir, false);
      if (hz.kind === "turrets") SFX.hit(); else SFX.kill();
      anyHit = true;
      if (!shot.beam || G.roomRng.next() < 0.5) weaponView.spawnTracer(origin.clone().add(new THREE.Vector3(0.2, -0.15, 0)), hp.clone(), 0xffd080, 0.025, 0.08);
      continue;                                   // the hazard absorbs this ray
    }
    _end.copy(origin).addScaledVector(ray.dir, hits.length ? hits[hits.length - 1].t : 60);
    if (!shot.beam || G.roomRng.next() < 0.5) weaponView.spawnTracer(origin.clone().add(new THREE.Vector3(0.2, -0.15, 0)), _end.clone(), shot.beam ? COLORS.accent2 : 0xffd080, shot.beam ? 0.05 : 0.025, shot.beam ? 0.05 : 0.08);
    for (const h of hits) {
      if (h.blocked) { toast("BLOCKED", true, 500); continue; }
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
      selfBurn += res.damage * (combined.selfDamage ?? 0);
      // Abyssal Step: a strike can tear the target somewhere else. The
      // ENEMY moves, never the camera - yanking the player's view mid-aim
      // would read as a bug, not a power.
      if (!res.killed && (combined.teleportOnHit ?? 0) > 0 && G.roomRng.next() < combined.teleportOnHit) {
        const em = h.e.mesh, ang = G.roomRng.next() * Math.PI * 2, hop = 3 + G.roomRng.next() * 2;
        fx.dash(em.position.clone());
        em.position.x = Math.max(-(G.arena.halfW - 1), Math.min(G.arena.halfW - 1, em.position.x + Math.cos(ang) * hop));
        em.position.z = Math.max(-(G.arena.halfD - 1), Math.min(G.arena.halfD - 1, em.position.z + Math.sin(ang) * hop));
        fx.dash(em.position.clone());
      }
      const hitPos = origin.clone().addScaledVector(ray.dir, h.t);
      fx.hit(hitPos, ray.dir, res.crit);
      fx.number(res.damage, h.e.mesh.position, res.crit ? "crit" : "hit", h.e.mesh.uuid);
      const hp3 = h.e.mesh.position;
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
  if (selfBurn > 0) damagePlayer(selfBurn, "selfDamage");
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

/** A long thin glowing quad, origin at one end, pointing +Z; rotate to aim. */
function makeBeamMesh(range, opacity) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, range),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.geometry.translate(0, 0, range / 2);      // pivot at the boss, not the middle
  scene.add(m);
  return m;
}

function clearBossTell() {
  if (!G.bossTell) return;
  scene.remove(G.bossTell.mesh); G.bossTell.mesh.geometry.dispose(); G.bossTell.mesh.material.dispose();
  G.bossTell = null;
}

function clearBeamSweep() {
  if (!G.beamSweep) return;
  scene.remove(G.beamSweep.mesh); G.beamSweep.mesh.geometry.dispose(); G.beamSweep.mesh.material.dispose();
  G.beamSweep = null;
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
      // A beam that exists in space and time. It starts 75 degrees to one side
      // of where you are standing and sweeps 150 degrees through you - so
      // standing still is a guaranteed hit, crossing behind the sweep is a
      // clean dodge, and jumping its crossing moment clears it entirely.
      fx.trauma(0.2); SFX.sentinelCharge();
      const sw = ev.sweep ?? { arcDeg: 150, range: 22, height: 1.15 };
      const toPlayer = Math.atan2(player.pos.x - p.x, player.pos.z - p.z);
      const arc = (sw.arcDeg * Math.PI) / 180;
      const dir = G.roomRng.next() < 0.5 ? 1 : -1;
      clearBeamSweep();
      G.beamSweep = {
        origin: p.clone(), a: toPlayer - (arc / 2) * dir, arc: arc * dir,
        t: 0, dur: Math.max(0.2, ev.duration ?? 0.8),
        dmg: ev.damage * 0.8, range: sw.range, height: sw.height, hit: false,
        mesh: makeBeamMesh(sw.range, 1),
      };
      G.beamSweep.mesh.position.set(p.x, sw.height, p.z);
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


export { damagePlayer, heal, fire, onKill, onBossAttack, explode, makeBeamMesh, clearBossTell, clearBeamSweep };
