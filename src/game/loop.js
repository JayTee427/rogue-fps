// HOLLOW SIGNAL — the frame. Quality governor, the per-frame body, the
// error boundary that keeps a throw from freezing the game, the black-band
// probe, and the ?dev hooks that let all of it be driven headless.

import * as THREE from "three";
import { $, toast, G, R, renderer, scene, camera, render, player, input, weaponView, enemies, fx, hazards, audio, isMobile } from "./context.js";
import { fire, onKill, onBossAttack, damagePlayer, heal, clearBossTell, clearBeamSweep, explode, makeBeamMesh } from "./combat.js";
import { pumpWaves, wavesPending, onRoomCleared, menu, openDraft, onBossDown, enterBoss, recomputeStats, maybeHint } from "./flow.js";
import { angleCrossed } from "core/bosspatterns.js";
import { SFX, setListener, footstep } from "./audio.js";
import { log as tlog, flushNow as tFlush, telemetryOn } from "./telemetry.js";
import { TIERS } from "core/quality.js";
import { scaleEnemy } from "core/enemies.js";
import { rollWeapon } from "core/weapons.js";
import { singularityPull } from "core/fxitems.js";

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
  // Not renderer.setSize on its own: the composer and the camera have to move
  // with it, and onResize is the one place that knows all three.
  R.resize();
  if (R.bloom) R.bloom.enabled = tier !== "low";
  // Both halves together: the renderer flag alone left the light still
  // flagged from whatever tier the game started at.
  renderer.shadowMap.enabled = !!t.shadows;
  if (R.sun) R.sun.castShadow = !!t.shadows;
  $("#perf").dataset.tier = tier;
}


// ------------------------------------------------------------------ loop --
function frameBody(now) {
  let dt = Math.min(0.05, (now - G.lastFrame) / 1000); G.lastFrame = now;
  G.lastDt = dt;                     // the probe reports it; nothing was writing it
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.15; }
  if (G.btT > 0) { G.btT -= dt; if (G.btT <= 0) G.timeScale = 1; }
  G.btCd = Math.max(0, (G.btCd ?? 0) - dt);
  dt *= G.timeScale;

  const { s, look } = input.poll();
  const hudUp = !!($("#hud") && !$("#hud").classList.contains("hidden"));
  // Losing the pointer is silent and, until now, unexplained: say it on screen
  // and record it. Evaluated outside the HUD branch below, because when a
  // screen opens the branch stops running and the prompt used to stay stuck on
  // - which is why CLICK TO AIM was sitting on top of the death screen.
  const wantAim = !!(G.run && hudUp && input.lockLost);
  if (wantAim !== G._lockLost) {
    G._lockLost = wantAim;
    $("#aimlost").classList.toggle("hidden", !wantAim);
    tlog("pointer_lock", { lost: wantAim, touch: input.isTouch });
  }
  if (G.run && hudUp) {
    if (input.locked || input.isTouch) player.look(look.dx, look.dy, input.mouseSens);
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
        else if (ev.type === "bossTelegraph") {
          toast(ev.text, true, Math.round(ev.secs * 1000)); SFX.ui();
          // The tell lives in the world, where the dodge does. A toast at the
          // screen edge is read by nobody who is currently being shot at.
          clearBossTell();
          if (ev.shape === "sweep_beam") {
            maybeHint("sweep_beam");
            const sw = ev.sweep ?? { range: 22, height: 1.15 };
            const ghost = makeBeamMesh(sw.range, 0.16);
            ghost.position.set(ev.pos.x, sw.height, ev.pos.z);
            G.bossTell = { mesh: ghost, t: 0, dur: ev.secs, kind: "beam", origin: ev.pos.clone(), height: sw.height };
          } else if (ev.kind === "area" || ev.shape === "shockwave") {
            const r = ev.shape === "shockwave" ? 9 : 7;
            const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.25, r, 48),
              new THREE.MeshBasicMaterial({ color: 0xff3a1e, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
            ring.rotation.x = -Math.PI / 2; ring.position.set(ev.pos.x, 0.05, ev.pos.z);
            scene.add(ring);
            G.bossTell = { mesh: ring, t: 0, dur: ev.secs, kind: "ring" };
          }
        }
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
      if (G.bossTell) {
        const bt = G.bossTell; bt.t += dt;
        const k = Math.min(1, bt.t / Math.max(0.01, bt.dur));
        if (bt.kind === "beam") {
          // Track the player through the charge: where the sweep will begin is
          // honest information, refreshed as you move.
          const toPlayer = Math.atan2(player.pos.x - bt.origin.x, player.pos.z - bt.origin.z);
          bt.mesh.rotation.y = toPlayer;
          bt.mesh.material.opacity = 0.08 + k * 0.3;
        } else {
          bt.mesh.material.opacity = 0.15 + k * 0.5 + Math.sin(bt.t * 18) * 0.08;
        }
        if (bt.t >= bt.dur) clearBossTell();
      }
      if (G.beamSweep) {
        const bs = G.beamSweep; bs.t += dt;
        const k = Math.min(1, bs.t / bs.dur);
        const prevA = bs.a + bs.arc * Math.max(0, (bs.t - dt) / bs.dur);
        const curA = bs.a + bs.arc * k;
        bs.mesh.rotation.y = curA;
        bs.mesh.material.opacity = 0.85 * (1 - k * 0.25);
        if (!bs.hit) {
          const dx = player.pos.x - bs.origin.x, dz = player.pos.z - bs.origin.z;
          const d = Math.hypot(dx, dz);
          const playerA = Math.atan2(dx, dz);
          if (d < bs.range && angleCrossed(prevA, curA, playerA)) {
            // The beam rides at torso height. player.pos.y is EYE height -
            // 1.7 at rest - so "above the beam" means feet well off the floor:
            // grounded always hits, and an early-jump crouch-graze still hits.
            // A full jump (apex ~2m of feet height) clears it with margin.
            if ((player.onGround ?? true) || player.pos.y < 2.6) {
              bs.hit = true;
              damagePlayer(bs.dmg, "beam");
              fx.trauma(0.4);
            }
          }
        }
        if (bs.t >= bs.dur) clearBeamSweep();
      }
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
    const music = audio.music;
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
    if (gsp > 1.5 && (player.onGround ?? true)) {
      G.stepPhase = (G.stepPhase ?? 0) + dt * gsp * 0.42;
      if (G.stepPhase >= 1) { G.stepPhase = 0; footstep(gsp / 7); }
    }
    governQuality(dt || 0.016);
  // Costs two integer comparisons a second and turns a black half-screen
  // into a hiccup that reports itself.
  G.sizeT = (G.sizeT ?? 0) + (dt || 0.016);
  if (G.sizeT > 1) {
    G.sizeT = 0;
    const drift = R.ensureSize();
    if (drift) tlog("viewport_fix", drift);
  }
    G.fpsAcc += dt || 0.016; G.fpsN++; if (G.fpsAcc > 0.5) { $("#perf").textContent = `${G.qTier.toUpperCase()} · ${Math.round(G.fpsN / G.fpsAcc)} FPS`; G.fpsAcc = 0; G.fpsN = 0; }
  }
  render();

  // The reported black band has outlived six explanations, none of which
  // reproduce here. So measure it where it happens: one scanline out of the
  // finished frame, and only complain when part of it really is black. Dev
  // builds only - it costs a readPixels of a single row.
  if (DEV_PROBE && (G.scanT = (G.scanT ?? 0) + 0.016) > 2) {
    G.scanT = 0;
    try {
      const gl = renderer.getContext();
      // Measure the middle scanline of whatever is currently in the buffer.
      const scan = () => {
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const row = new Uint8Array(w * 4);
        gl.readPixels(0, Math.floor(h / 2), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        const bands = 16, out = [];
        for (let b = 0; b < bands; b++) {
          const x0 = Math.floor(b * w / bands), x1 = Math.floor((b + 1) * w / bands);
          let s = 0, n = 0;
          for (let x = x0; x < x1; x++) { const i = x * 4; s += 0.2126 * row[i] + 0.7152 * row[i + 1] + 0.0722 * row[i + 2]; n++; }
          out.push(Math.round(s / Math.max(1, n)));
        }
        return out;
      };
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const prof = scan();
      // A band under 4/255 is not a dark room, it is nothing being drawn there.
      // Report a few times and then stop: enough to see whether it moves with
      // the view, never enough to become noise.
      // Strictly zero: the grade pass never leaves a drawn pixel this dark.
      if (Math.min(...prof) < 2 && (G.bandN = (G.bandN ?? 0) + 1) <= 8) {
        // The question this exists to settle: is the black inside the WebGL
        // buffer, or is it something in the DOM sitting on top of the canvas?
        // The scanline answers the first, elementFromPoint answers the second.
        const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
        const over = document.elementsFromPoint(cx, cy)
          .filter((e) => e.tagName !== "CANVAS" && e.tagName !== "HTML" && e.tagName !== "BODY")
          .slice(0, 3)
          .map((e) => `${e.tagName}#${e.id || "-"}.${(e.className || "").toString().trim().split(/\s+/)[0] || "-"}`)
          .join(" > ");
        // Exact bounds of the unwritten run, in buffer pixels. Anything the
        // grade pass touched reads 4 or more, so a true zero means nothing was
        // drawn there at all.
        const mid = new Uint8Array(w * 4);
        gl.readPixels(0, Math.floor(h / 2), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, mid);
        const zero = (x) => mid[x * 4] === 0 && mid[x * 4 + 1] === 0 && mid[x * 4 + 2] === 0;
        let x0 = -1, x1 = -1;
        for (let x = 0; x < w; x++) if (zero(x)) { if (x0 < 0) x0 = x; x1 = x; }
        // Same for a column, so the rectangle is known in both axes.
        const col = new Uint8Array(h * 4);
        const probeCol = x0 >= 0 ? Math.floor((x0 + x1) / 2) : Math.floor(w / 2);
        gl.readPixels(probeCol, 0, 1, h, gl.RGBA, gl.UNSIGNED_BYTE, col);
        let y0 = -1, y1 = -1;
        for (let y = 0; y < h; y++) {
          if (col[y * 4] === 0 && col[y * 4 + 1] === 0 && col[y * 4 + 2] === 0) { if (y0 < 0) y0 = y; y1 = y; }
        }
        // Everything that decides where drawing lands.
        const vp = renderer.getViewport(new THREE.Vector4());
        const sc = renderer.getScissor(new THREE.Vector4());
        const rt1 = R.composer?.renderTarget1, rt2 = R.composer?.renderTarget2;
        const state = {
          viewport: `${Math.round(vp.x)},${Math.round(vp.y)},${Math.round(vp.z)},${Math.round(vp.w)}`,
          scissor: `${Math.round(sc.x)},${Math.round(sc.y)},${Math.round(sc.z)},${Math.round(sc.w)}`,
          scissorTest: renderer.getScissorTest(),
          rt1: rt1 ? `${rt1.width}x${rt1.height}` : null,
          rt2: rt2 ? `${rt2.width}x${rt2.height}` : null,
          bloomRes: R.bloom?.resolution ? `${Math.round(R.bloom.resolution.x)}x${Math.round(R.bloom.resolution.y)}` : null,
          pr: renderer.getPixelRatio(),
        };

        // Name the thing, don't describe the symptom: hide each candidate,
        // redraw, re-measure. The grade grain is SIGNED (+-0.006 around zero),
        // so a black in-scene object rounds to exactly 0 - the earlier
        // inference that only unwritten framebuffer reads zero was wrong, and
        // it is why this bisection was removed once. It asks the scene
        // directly on the machine that has the bug.
        const suspects = [
          ["weapon", weaponView?.group],
          ["fxPoints", fx?.points],
          ["enemies", enemies?.group],
          ["hazards", hazards?.group],
          ["dressing", G.dressing],
          ["arena", G.arena?.group],
        ];
        let culprit = null, detail = null;
        for (const [name, obj] of suspects) {
          if (!obj || obj.visible === false) continue;
          obj.visible = false;
          render();
          const cleared = Math.min(...scan()) >= 2;
          obj.visible = true;
          if (!cleared) continue;
          culprit = name;
          if (name === "enemies") {
            // Which one? Hide each body in turn.
            for (const e of enemies.list) {
              if (!e.mesh?.visible) continue;
              e.mesh.visible = false;
              render();
              const gone = Math.min(...scan()) >= 2;
              e.mesh.visible = true;
              if (gone) {
                const d = Math.hypot(e.mesh.position.x - player.pos.x, e.mesh.position.z - player.pos.z);
                const m = e.mesh.material;
                detail = `${e.archetype}${e.affix ? "/" + e.affix : ""} alive=${e.alive} d=${d.toFixed(2)} ` +
                  `scale=${e.mesh.scale.x.toFixed(2)} color=#${m?.color?.getHexString?.() ?? "?"} ` +
                  `emissive=#${m?.emissive?.getHexString?.() ?? "?"} eI=${(m?.emissiveIntensity ?? 0).toFixed(2)} ` +
                  `state=${e.mstate ?? e.atkState ?? "?"} pos=${e.mesh.position.x.toFixed(1)},${e.mesh.position.y.toFixed(1)},${e.mesh.position.z.toFixed(1)}`;
                break;
              }
            }
          } else if (name === "hazards") {
            const kinds = [];
            hazards.group.traverse((o) => { if (o.isMesh) kinds.push(`${o.geometry?.type}@${o.position.x.toFixed(0)},${o.position.z.toFixed(0)}`); });
            detail = kinds.slice(0, 8).join(" ");
          }
          break;
        }
        render();                                  // leave the frame as the player saw it

        tlog("black_band", {
          buf: `${w}x${h}`, css: `${renderer.domElement.clientWidth}x${renderer.domElement.clientHeight}`,
          view: `${window.innerWidth}x${window.innerHeight}`, dpr: window.devicePixelRatio,
          tier: G.qTier, yaw: Math.round((player.yaw ?? 0) * 57.3),
          pitch: Math.round((player.pitch ?? 0) * 57.3),
          prof: prof.join(","), overCentre: over || "(nothing over the canvas)",
          // The unwritten rectangle itself, in buffer pixels.
          zeroRect: x0 < 0 ? null : `x ${x0}..${x1} (${x1 - x0 + 1}px) y ${y0}..${y1} (${y1 - y0 + 1}px)`,
          culprit: culprit ?? "(none of the suspects)", detail,
          // A pure-black object rendered through the grade pass measures 5-7
          // (verified with a planted box), so an exact-zero region means the
          // composer's output never reached those pixels. These say whether
          // the context died or the pass chain is not what we think it is.
          ctxLost: renderer.getContext().isContextLost(),
          drawCalls: renderer.info.render.calls,
          passes: R.composer ? R.composer.passes.map((x) => `${x.constructor.name}${x.enabled ? "" : ":off"}`).join(",") : "(no composer)",
          ...state,
          // "attacked constantly but took no damage" says the frame was only
          // partly executing. Record enough to tell a stalled loop from a
          // drawing fault.
          hp: Math.round(G.hp), alive: enemies.list.filter((e) => e.alive).length,
          roomActive: !!G.roomActive, errs: G.frameErrors, dt: Math.round((G.lastDt ?? 0) * 1000),
        });
        tFlush();
      }
    } catch { /* readPixels can fail on a lost context; never break the frame for a probe */ }
  }
}

// --- error boundary -------------------------------------------------------
// Keep the loop alive through a throw, tell the player something went wrong
// rather than freezing, and stop shouting after the first few.
// Runs wherever telemetry runs. Gating this behind ?dev meant the one
// playtest that could have identified the black region produced nothing.
const DEV_PROBE = telemetryOn;
G.frameErrors = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try {
    frameBody(now);
  } catch (err) {
    G.frameErrors++;
    if (G.frameErrors <= 2) {
      // Into the telemetry log, not just a console nobody has open. Without the
      // stack this is a bug report that says only "it broke".
      tlog("frame_error", {
        msg: String(err?.message ?? err),
        at: String(err?.stack ?? "").split("\n").slice(1, 5).join(" | "),
        floor: G.run?.floor ?? null, room: (G.run?.roomIndex ?? -1) + 1,
        alive: enemies?.list?.filter?.((e) => e.alive).length ?? null,
        items: G.run?.held?.length ?? null,
      });
      tFlush();
    }
    if (G.frameErrors <= 3) {
      console.error("[frame]", err);
      G._firstErr ??= String(err?.message ?? err);   // survives to the final message
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
    if (G.frameErrors === 40) {
      try { input.releaseLock(); SFX.stopAmbient(); audio.music?.stop(); } catch {}
      const box = $("#crash");
      if (box) {
        box.textContent = `the run could not continue — ${G._firstErr ?? "unknown error"}`;
        box.classList.remove("hidden");
      }
      menu();
    }
  }
}


// ---- dev hooks (?dev): drive the loop from a console -----------------------

// dev hooks — only when ?dev is in the URL. Lets the loop be driven from the
// console for verification without touching gameplay code paths.
if (new URLSearchParams(location.search).has("dev")) {
  // The registry guard runs in CI; running it here too means a hot-reload with
  // a typo'd effect key says so in the console instead of shipping silence.
  import("core/registry.js").then(async ({ auditAll }) => {
    const bad = await auditAll();
    for (const f of bad) console.error(`[registry] ${f.source}/${f.id} declares unknown effect key "${f.key}"`);
  }).catch(() => {});
  window.__hs = {
    G, enemies, player, fx, hazards, renderer, scene, camera, THREE,
    scaleEnemy, rollWeapon,
    resize: () => R.resize(), ensureSize: () => R.ensureSize(),
    get music() { return audio.music; },
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

// Sign the last pilot back in automatically. Retyping initials every session is
// friction for nothing, and this browser has already proved it is theirs.

export { frame, governQuality, applyQuality };
