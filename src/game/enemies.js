// Enemy meshes, tells, and steering. Numbers come from core/enemies.js; this
// file only decides how each archetype LOOKS and MOVES. Six silhouettes, six
// tells — legibility is a design promise.

import * as THREE from "three";
import { scaleEnemy, rollRoster, rollAffix } from "core/enemies.js";
import { EXTRA_FOES, scaleFoe, foeRoster } from "core/foes.js";
import { tickStatuses } from "core/combat.js";
import { nextAttack } from "core/bosspatterns.js";
import { gaitPose, windupPose, flinchPose, deathPose } from "core/anim.js";
import { COLORS } from "./renderer.js";
import { SFX, at as playAt } from "./audio.js";

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const EYE = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

// One colour per affix, used by the floor ring and the body detail so the two
// always agree. Learn the colour once, read it forever.
const AFFIX_COLOR = {
  armoured: 0x9aa6b8, hasty: 0xffe14a, regenerating: 0x6cff9a, explosive: 0xff3a1e,
  shielded: 0x4fd8ff, splitting: 0xc98aff, vampiric: 0xff2a6a,
};

// Bright, saturated, and each archetype its own hue — enemies must read
// instantly against a dark station. `glow` is a constant emissive so they never
// disappear in shadow or fog.
const LOOKS = {
  skitter:  { color: 0xff5a3a, glow: 0x5a1a0a, size: 0.55, y: 0.35, geo: () => new THREE.IcosahedronGeometry(0.4, 0) },
  sentinel: { color: 0x4fa3ff, glow: 0x0f2a5a, size: 1.0,  y: 1.1,  geo: () => new THREE.CylinderGeometry(0.35, 0.5, 2.0, 6) },
  brute:    { color: 0xd8873a, glow: 0x4a2a0a, size: 1.6,  y: 1.3,  geo: () => new THREE.BoxGeometry(1.7, 2.4, 1.4) },
  popper:   { color: 0xffd23a, glow: 0x6a5a0a, size: 0.6,  y: 0.5,  geo: () => new THREE.SphereGeometry(0.5, 8, 6) },
  warden:   { color: 0x8aa8d8, glow: 0x1a2a4a, size: 1.2,  y: 1.2,  geo: () => new THREE.CylinderGeometry(0.6, 0.6, 2.2, 8) },
  wisp:     { color: 0xd08aff, glow: 0x4a1a6a, size: 0.5,  y: 2.6,  geo: () => new THREE.OctahedronGeometry(0.45, 0) },
  // The four from core/foes.js. Distinct silhouettes, same visual language.
  lurker:   { color: 0x2f3d4a, glow: 0x0a1a2a, size: 0.7,  y: 0.5,  geo: () => new THREE.TetrahedronGeometry(0.7, 0) },
  sniper:   { color: 0x8affc8, glow: 0x0a4a2a, size: 0.9,  y: 1.4,  geo: () => new THREE.ConeGeometry(0.32, 2.2, 5) },
  shaman:   { color: 0xffa8e0, glow: 0x5a0a3a, size: 1.0,  y: 1.6,  geo: () => new THREE.DodecahedronGeometry(0.7, 0) },
  swarm:    { color: 0xc8ff3a, glow: 0x3a5a0a, size: 0.35, y: 0.8,  geo: () => new THREE.OctahedronGeometry(0.3, 0) },
};

// The new archetypes borrow a proven behaviour rather than each getting a bespoke
// state machine: a lurker rushes like a skitter, a sniper holds like a sentinel.
const BEHAVIOUR = { lurker: "skitter", sniper: "sentinel", shaman: "wisp", swarm: "skitter" };

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._tmp = new THREE.Vector3();
    this.projectiles = [];   // enemy shots: { mesh, vel, dmg, ttl }
    this.shards = [];        // death debris
    this.pending = [];       // events raised outside update(), drained next frame
    this.dying = [];         // meshes mid-collapse, removed when deathPose says done
    // At most this many melee enemies may be committed to a lunge at once.
    // Without it, six skitters all reach you and all bite, which reads as
    // being chewed rather than being fought.
    this.lungers = new Set();
    // Two attackers took turns but often struck in the same frame, which lands
    // as one big hit rather than two readable ones. Space them out.
    this.lungeGap = 0;
  }

  clear() {
    for (const e of this.list) this.group.remove(e.mesh);
    for (const p of this.projectiles) this.group.remove(p.mesh);
    for (const sh of this.shards) this.group.remove(sh.m);
    for (const d of this.dying) this.group.remove(d.m);
    this.list = []; this.projectiles = []; this.shards = []; this.dying = [];
    this.lungers.clear();
  }

  /** Build the room's full roster, but only place the first `firstWave` of them.
   *  The rest are returned already rolled — same elites, same affixes — for the
   *  director to release later. Pacing must not cost the room its elites. */
  spawnRoom(rng, floor, roomIndex, arena, mods, eliteCount, firstWave = Infinity) {
    // rollRoster decides HOW MANY and scales that with depth - it is the tested
    // authority on room size. foeRoster knows the new archetypes but returns a
    // fixed count, which flattened every room to two enemies. So take the size
    // from one and the variety from the other: substitute newcomers into a
    // correctly sized roster.
    const base = rollRoster(rng, floor, roomIndex, mods);
    const pool = foeRoster(rng, floor, roomIndex).filter((id) => EXTRA_FOES[id]);
    let roster = base.map((id) => (pool.length && rng.chance(0.3) ? rng.pick(pool) : id));
    // rollRoster sizes every room the same regardless of position, so the first
    // room of the game arrived with eight enemies. Ramp the early rooms instead:
    // the opener is a handful, and by room 5 you get the full roster.
    const ramp = floor === 1
      ? [3, 4, 5, 6, 7][Math.min(4, roomIndex)]
      : [5, 6, 7, 8, 9][Math.min(4, roomIndex)] + Math.floor((floor - 2) * 0.8);
    if (roster.length > ramp) roster = roster.slice(0, ramp);
    // The very first room is a first impression. A Popper rushes you and
    // detonates, which is a fine lesson on floor 2 and a bad one before the
    // player has learned to move. Swap them out of the opening room only.
    if (floor === 1 && roomIndex === 0) roster = roster.map((id) => (id === "popper" ? "skitter" : id));
    const swarmHp = mods.swarm ? 0.5 : 1;
    const deferred = [];
    roster.forEach((id, i) => {
      const elite = i < eliteCount;
      const affix = elite ? rollAffix(rng, floor) : null;
      const data = EXTRA_FOES[id] ? scaleFoe(id, floor, roomIndex) : scaleEnemy(id, floor, roomIndex, affix);
      if (EXTRA_FOES[id] && affix) data.affix = affix;
      data.hp = Math.max(1, Math.round(data.hp * swarmHp)); data.maxHp = data.hp;
      // Spawn on a ring around the room's centre, then push away from wherever the
      // player actually stands. The old version ringed the ORIGIN while the player
      // spawns at the back of the room, so an enemy could appear on top of them -
      // the first thing a new player experienced was being hit before they moved.
      const safe = arena.spawnSafe ?? { x: 0, z: arena.halfD - 4 };
      let x = 0, z = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        const ang = rng.next() * Math.PI * 2, rad = 9 + rng.next() * 8;
        x = THREE.MathUtils.clamp(Math.cos(ang) * rad, -arena.halfW + 1.5, arena.halfW - 1.5);
        z = THREE.MathUtils.clamp(Math.sin(ang) * rad, -arena.halfD + 1.5, arena.halfD - 1.5);
        if (Math.hypot(x - safe.x, z - safe.z) >= 11) break;
      }
      if (i < firstWave) this.spawn(data, x, z, elite);
      else deferred.push({ data, x, z, elite });
    });
    return { roster, deferred };
  }

  /** Melee enemies take turns. Two attackers is a fight; six is a blender. */
  _claimLunge(e, max = 2) {
    if (this.lungers.has(e)) return true;
    if (this.lungeGap > 0) return false;
    for (const other of this.lungers) if (!other.alive) this.lungers.delete(other);
    if (this.lungers.size >= max) return false;
    this.lungers.add(e);
    this.lungeGap = 0.55;      // the next attacker waits its turn
    return true;
  }

  _releaseLunge(e) { this.lungers.delete(e); }

  /** Place one enemy the director held back. */
  spawnDeferred(d) { return this.spawn(d.data, d.x, d.z, d.elite); }

  spawn(data, x, z, elite = false) {
    const look = LOOKS[data.archetype];
    const mat = flat(look.color, { emissive: new THREE.Color(elite ? 0x883300 : look.glow), emissiveIntensity: elite ? 1.0 : 0.7 });
    const mesh = new THREE.Mesh(look.geo(), mat);
    mesh.position.set(x, look.y, z);
    mesh.castShadow = true;
    if (elite) mesh.scale.multiplyScalar(1.4);
    // eyes / tell
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), EYE);
    eye.position.set(0, look.size * 0.3, look.size * 0.5);
    mesh.add(eye);
    if (data.archetype === "warden") {
      // Two panels with a gap between them. The gap sweeps up and down, so the
      // Warden is beatable by timing rather than by flanking alone — "you
      // always know why you died" cuts both ways: you must see the opening.
      const shieldMat = new THREE.MeshBasicMaterial({ color: COLORS.accent2, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.12), shieldMat);
      const bot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.12), shieldMat);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      top.position.set(0, 0.65, 0.9); bot.position.set(0, -0.65, 0.9); rim.position.set(0, 0, 0.92);
      mesh.add(top); mesh.add(bot); mesh.add(rim);
      mesh.userData.shieldTop = top; mesh.userData.shieldBot = bot; mesh.userData.shieldRim = rim;
    }
    // Affix visuals: an elite must be readable at a glance, and each affix has
    // to say what it does before it does it.
    if (data.affix) {
      const A = data.affix;
      // Ground ring first. Body details are legible in your face and invisible
      // across the room; a lit disc on the floor reads at any range and is how
      // you pick the dangerous one out of a crowd before it reaches you.
      const ring = new THREE.Mesh(new THREE.RingGeometry(look.size * 0.85, look.size * 1.15, 24), new THREE.MeshBasicMaterial({ color: AFFIX_COLOR[A] ?? 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -look.y + 0.04;                  // mesh sits at look.y; put the ring on the floor
      mesh.add(ring);
      mesh.userData.floorRing = ring;
      if (A === "armoured") {
        const plate = new THREE.Mesh(look.geo(), new THREE.MeshLambertMaterial({ color: 0x9aa6b8, flatShading: true, wireframe: true }));
        plate.scale.multiplyScalar(1.18); mesh.add(plate);
      } else if (A === "shielded") {
        const bub = new THREE.Mesh(new THREE.SphereGeometry(look.size * 1.15, 12, 10), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
        mesh.add(bub); mesh.userData.bubble = bub;
      } else if (A === "explosive") {
        const core = new THREE.Mesh(new THREE.SphereGeometry(look.size * 0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3a1e }));
        core.position.y = look.size * 0.4; mesh.add(core); mesh.userData.core = core;
      } else if (A === "regenerating") {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(look.size * 0.9, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: 0x6cff9a }));
        ring.rotation.x = Math.PI / 2; mesh.add(ring); mesh.userData.ring = ring;
      } else if (A === "splitting") {
        const twin = new THREE.Mesh(look.geo(), new THREE.MeshBasicMaterial({ color: look.color, wireframe: true, transparent: true, opacity: 0.35 }));
        twin.scale.multiplyScalar(0.55); twin.position.x = look.size * 0.5; mesh.add(twin);
      } else if (A === "hasty") {
        // Speed reads as smear: three ghosts trailing behind, fading back.
        const ghosts = [];
        for (let i = 1; i <= 3; i++) {
          const g = new THREE.Mesh(look.geo(), new THREE.MeshBasicMaterial({ color: look.color, transparent: true, opacity: 0.3 / i }));
          mesh.add(g); ghosts.push(g);
        }
        mesh.userData.ghosts = ghosts;
      } else if (A === "vampiric") {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(look.size * 0.8, 0.04, 6, 18), new THREE.MeshBasicMaterial({ color: 0xff2a6a }));
        halo.rotation.x = Math.PI / 3; mesh.add(halo); mesh.userData.ring = halo;
      }
    }
    this.group.add(mesh);
    const e = {
      ...data, mesh, statuses: [], elite, alive: true,
      baseY: mesh.position.y, restScale: mesh.scale.x,   // the pose is an offset from these
      t: Math.random() * 10, cd: 1 + Math.random(), state: "seek", stateT: 0, beepT: 0,
      radius: look.size * 0.6, hitFlash: 0, regenT: 0,
      spawnPhase: Math.random() * Math.PI * 2,   // so a group does not orbit in lockstep
    };
    this.list.push(e);
    return e;
  }

  get aliveCount() { return this.list.filter(e => e.alive).length; }

  /** returns events: [{type:'hitPlayer', dmg}, {type:'kill', e}, {type:'popperBoom', pos, dmg}] */
  update(dt, player, arena, playerStats) {
    const events = this.pending;
    this.pending = [];
    this.lungeGap = Math.max(0, this.lungeGap - dt);
    this._updateShards(dt);
    this._updateCollapse(dt);
    const pp = player.pos;
    for (const e of this.list) {
      if (!e.alive) continue;
      e.t += dt; e.stateT += dt;
      // statuses (burn/slow) via core
      if (e.statuses.length) {
        const r = tickStatuses(e, dt);
        e.hp = r.hpAfter; e.statuses = r.statusesAfter; e.slowMult = r.speedMult;
        if (r.killed) { this._kill(e, events); continue; }
      } else e.slowMult = 1;
      if (e.regen) { e.regenT += dt; if (e.regenT > 1) { e.regenT = 0; e.hp = Math.min(e.maxHp, e.hp + e.regen); } }
      // --- locomotion ---------------------------------------------------
      // Enemies used to slide rigidly. gaitPose is pure maths over time and
      // speed; it returns an offset from the rest pose captured at spawn.
      const gspd = (e.lastStep ?? 0) / Math.max(dt, 1e-4);
      const pose = gaitPose(e.archetype, e.t, gspd);
      const rs = e.restScale ?? 1;
      const fl = flinchPose(e.hitFlash > 0 ? 0.08 - e.hitFlash : 99);
      // `m` is declared further down the loop body, so reach through e.mesh here.
      e.mesh.position.y = (e.baseY ?? e.mesh.position.y) + pose.bodyY + fl.offset;
      e.mesh.scale.set(rs * pose.scaleXZ, rs * pose.scaleY * fl.scale, rs * pose.scaleXZ);
      e.pose = pose;

      // Keep the affix ring pinned to the floor. It is parented to a mesh that
      // bobs, floats and scales during windups, so its local offset has to be
      // recomputed rather than set once.
      const fr = e.mesh.userData.floorRing;
      if (fr) { fr.position.y = (-e.mesh.position.y + 0.04) / (e.mesh.scale.y || 1); fr.material.opacity = 0.55 + Math.sin(e.t * 3) * 0.3; }
      // affix animation
      if (e.affix === "regenerating" && e.mesh.userData.ring) { e.mesh.userData.ring.rotation.z += dt * 3; e.mesh.userData.ring.scale.setScalar(1 + Math.sin(e.t * 4) * 0.12); }
      else if (e.affix === "vampiric" && e.mesh.userData.ring) { e.mesh.userData.ring.rotation.z -= dt * 2.4; }
      else if (e.affix === "shielded" && e.mesh.userData.bubble) { e.mesh.userData.bubble.material.opacity = e.shield > 0 ? 0.16 + Math.sin(e.t * 5) * 0.07 : 0; }
      else if (e.affix === "explosive" && e.mesh.userData.core) { e.mesh.userData.core.scale.setScalar(1 + Math.sin(e.t * 9) * 0.25); }
      else if (e.affix === "hasty" && e.mesh.userData.ghosts) {
        // Ghosts sit behind in local space; the mesh already faces travel, so
        // -z is "behind". Offset grows with how fast we actually moved.
        const sp = (e.lastStep ?? 0) * 40;
        e.mesh.userData.ghosts.forEach((g, i) => { g.position.z = -(i + 1) * 0.22 * Math.min(1.6, sp); });
      }
      if (e.hitFlash > 0) { e.hitFlash -= dt; if (e.hitFlash <= 0) this._restoreGlow(e); }

      const m = e.mesh;
      const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      const spd = e.speed * (e.slowMult ?? 1);

      if (e.bossId) {                                   // bosses run their own choreography
        for (const ev of this.updateBoss(e, dt, player, arena)) events.push(ev);
        continue;
      }

      switch (BEHAVIOUR[e.archetype] ?? e.archetype) {
        case "skitter": {
          // Circle, commit to a telegraphed lunge, fall back. The rhythm is the
          // point: a wind-up you can see means a strike you can sidestep, and a
          // retreat means the room breathes between attacks.
          e.mstate ??= "stalk"; e.mt = (e.mt ?? 0) + dt;
          const jit = Math.sin(e.t * 9) * 0.6;
          m.rotation.y += dt * 6;
          e.voiceT = (e.voiceT ?? Math.random() * 1.5) - dt;
          if (e.voiceT <= 0 && dist < 14) { playAt(m.position, () => SFX.skitterChitter()); e.voiceT = 1.2 + Math.random() * 1.6; }

          if (e.mstate === "stalk") {
            // Hold a ring around the player rather than piling onto them.
            const want = dist > 6.5 ? 1 : dist < 3.4 ? -0.7 : 0;
            const strafe = Math.sin(e.t * 1.7 + (e.spawnPhase ?? 0)) * 0.9;
            this._move(e, (nx * want - nz * strafe) * spd, (nz * want + nx * strafe) * spd, dt, arena);
            if (dist < 7 && e.mt > 0.5 && this._claimLunge(e)) { e.mstate = "windup"; e.mt = 0; }
          } else if (e.mstate === "windup") {
            // Rear back and glow. This is the tell; without it the strike is
            // indistinguishable from simply being near the thing.
            this._move(e, -nx * spd * 0.5, -nz * spd * 0.5, dt, arena);
            m.material.emissive.setHex(0xff3a1a);
            m.material.emissiveIntensity = 0.8 + Math.min(3.4, e.mt * 9);
            m.scale.setScalar((e.restScale ?? 1) * (1 + Math.sin(e.mt * 30) * 0.14));
            if (e.mt > 0.42) { e.mstate = "lunge"; e.mt = 0; e.lungeDir = { x: nx, z: nz }; e.lungeHit = false; this._restoreGlow(e); }
          } else if (e.mstate === "lunge") {
            // Committed: it drives in a straight line and cannot re-aim, so
            // stepping aside actually works.
            this._move(e, e.lungeDir.x * spd * 3.1, e.lungeDir.z * spd * 3.1, dt, arena);
            if (!e.lungeHit && dist < 1.7) {
              e.lungeHit = true;
              events.push({ type: "hitPlayer", dmg: e.damage, src: e });
            }
            if (e.mt > 0.32) { e.mstate = "recover"; e.mt = 0; }
          } else {
            // Back off and give the player the room back.
            this._move(e, (-nx * 0.9 - nz * jit * 0.3) * spd, (-nz * 0.9 + nx * jit * 0.3) * spd, dt, arena);
            if (e.mt > 1.15) { e.mstate = "stalk"; e.mt = 0; this._releaseLunge(e); }
          }
          break;
        }
        case "sentinel": {                                           // hold 9–14m, aim, then fire a tracer
          const want = dist > 14 ? 1 : dist < 9 ? -1 : 0;
          this._move(e, nx * want * spd, nz * want * spd, dt, arena);
          m.lookAt(pp.x, m.position.y, pp.z);
          if (e.state === "seek" && e.cd <= 0) { e.state = "aim"; e.stateT = 0; playAt(m.position, () => SFX.sentinelCharge()); }
          if (e.state === "aim") {
            m.material.emissive.setHex(0xff2020); m.material.emissiveIntensity = 0.8 + Math.min(3.2, e.stateT * 4.5);   // the laser-sight tell
            if (e.stateT > 0.75) { e.state = "seek"; e.cd = 2.2 + Math.random(); this._restoreGlow(e); this._shoot(e, pp, 26, e.damage); }
          }
          break;
        }
        case "brute": {                                              // roar, glow, then charge
          if (e.state === "seek") { this._move(e, nx * spd, nz * spd, dt, arena); if (dist < 9 && e.cd <= 0) { e.state = "windup"; e.stateT = 0; playAt(m.position, () => SFX.bruteRoar()); } }
          else if (e.state === "windup") { m.material.emissive.setHex(0xff5522); m.material.emissiveIntensity = 1 + e.stateT * 4; m.scale.setScalar((e.elite ? 1.35 : 1) * (1 + Math.sin(e.stateT * 20) * 0.12)); if (e.stateT > 0.7) { e.state = "charge"; e.stateT = 0; e.chargeDir = { x: nx, z: nz }; } }
          else if (e.state === "charge") { this._move(e, e.chargeDir.x * spd * 4.5, e.chargeDir.z * spd * 4.5, dt, arena); if (dist < 1.8 && e.cd <= 0) { events.push({ type: "hitPlayer", dmg: e.damage, src: e }); e.cd = 1.5; } if (e.stateT > 0.6) { e.state = "seek"; e.cd = 2.5; this._restoreGlow(e); m.scale.setScalar(e.elite ? 1.25 : 1); } }
          m.lookAt(pp.x, m.position.y, pp.z);
          break;
        }
        case "popper": {                                             // run at you, beep faster, explode
          this._move(e, nx * spd * (1 + Math.min(1, e.t * 0.1)), nz * spd, dt, arena);
          const rate = Math.max(0.12, Math.min(1, dist / 12));
          e.beepT += dt; if (e.beepT > rate) { e.beepT = 0; SFX.popperBeep(1 - rate); m.material.emissive.setHex(0xffaa00); m.material.emissiveIntensity = 3.0; } else m.material.emissiveIntensity = Math.max(0.7, m.material.emissiveIntensity * 0.85);
          if (dist < 1.6) this._detonate(e, events, 0);
          break;
        }
        case "warden": {                                             // slow advance, shield faces you, gap sweeps
          this._move(e, nx * spd, nz * spd, dt, arena);
          m.lookAt(pp.x, m.position.y, pp.z);
          // gap centre sweeps between -0.7 and +0.7 of body height
          e.gapY = Math.sin(e.t * 1.6) * 0.7;
          const half = 0.45;
          if (m.userData.shieldTop) {
            m.userData.shieldTop.position.y = e.gapY + half + 0.45;
            m.userData.shieldBot.position.y = e.gapY - half - 0.45;
            m.userData.shieldRim.position.y = e.gapY;
          }
          e.voiceT = (e.voiceT ?? 0.5) - dt; if (e.voiceT <= 0 && dist < 12) { playAt(m.position, () => SFX.wardenHum()); e.voiceT = 2.2; }
          if (dist < 1.8 && e.cd <= 0) { events.push({ type: "hitPlayer", dmg: e.damage, src: e }); e.cd = 1.2; }
          break;
        }
        case "wisp": {                                               // orbit high, erratic, drop mines
          const orbit = e.t * 1.4;
          const tx = pp.x + Math.cos(orbit) * 7, tz = pp.z + Math.sin(orbit) * 7;
          const ox = tx - m.position.x, oz = tz - m.position.z, od = Math.hypot(ox, oz) || 1;
          this._move(e, ox / od * spd, oz / od * spd, dt, arena);
          m.position.y += Math.sin(e.t * 3) * 0.35;      // adds to the gait, does not replace it
          m.rotation.y += dt * 2; m.rotation.x += dt * 1.3;
          e.voiceT = (e.voiceT ?? Math.random()) - dt; if (e.voiceT <= 0 && dist < 16) { playAt(m.position, () => SFX.wispWhine()); e.voiceT = 1.8 + Math.random(); }
          if (e.cd <= 0) {
            // The design promises the Wisp DROPS MINES. Alternate: mine, shot, mine.
            if ((e.dropCount = (e.dropCount ?? 0) + 1) % 2 === 1) events.push({ type: "dropMine", x: m.position.x, z: m.position.z, damage: e.damage * 1.2 });
            else this._shoot(e, pp, 14, e.damage, true);
            e.cd = 2.6;
          }
          break;
        }
      }
      e.cd -= dt;
    }

    // enemy projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.addScaledVector(p.vel, dt);
      p.ttl -= dt;
      const d = p.mesh.position.distanceTo(pp);
      if (d < 0.7) { events.push({ type: "hitPlayer", dmg: p.dmg, projectile: true }); p.ttl = 0; }
      if (p.ttl <= 0 || Math.abs(p.mesh.position.x) > arena.halfW || Math.abs(p.mesh.position.z) > arena.halfD) { this.group.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
    return events;
  }

  /** A popper going off sets off every popper near it. Chains are the reason
   *  a room of poppers is a puzzle ("pop the far one") and not just chip damage.
   *  Depth-capped so a dense cluster can't recurse without bound. */
  _detonate(e, events, depth = 0) {
    if (!e.alive || e._boom) return;
    e._boom = true;
    const pos = e.mesh.position.clone();
    const r = 3 + depth * 0.4;                       // each link reaches a touch further
    events.push({ type: "popperBoom", pos, dmg: e.damage * (depth ? 0.8 : 1), r });
    this._kill(e, events, true);
    if (depth >= 4) return;
    for (const o of this.list) {
      if (o === e || !o.alive || o._boom || o.archetype !== "popper") continue;
      if (o.mesh.position.distanceTo(pos) < r + 1.2) this._detonate(o, events, depth + 1);
    }
  }

  /** Boss choreography. core/bosspatterns.js chooses WHAT and WHEN; this makes it
   *  visible: every attack has a wind-up you can see and a name you can read. */
  updateBoss(e, dt, player, arena) {
    const events = [];
    e.atkCd ??= 0; e.atkState ??= "idle"; e.atkT ??= 0;
    const pp = player.pos, m = e.mesh;
    const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
    const dist = Math.hypot(dx, dz);
    const nx = dx / (dist || 1), nz = dz / (dist || 1);

    switch (e.atkState) {
      case "idle":
        e.atkCd -= dt;
        if (e.atkCd <= 0) {
          e.atk = nextAttack(e.rng, e.bossId, e.hp / e.maxHp, e.atk?.shape ?? null);
          e.atkState = "windup"; e.atkT = 0; e._hitThis = false;
          events.push({ type: "bossTelegraph", text: e.atk.telegraph, secs: e.atk.windup });
          playAt(m.position, () => SFX.sentinelCharge());
        }
        break;
      case "windup":
        m.material.emissive.setHex(0xff2010);
        m.material.emissiveIntensity = 0.8 + (e.atkT / e.atk.windup) * 3.2;
        // Pull back before the strike - the wind-up has to be readable as motion,
        // not only as a colour.
        const wu = windupPose(e.atkT / Math.max(e.atk.windup, 1e-4));
        m.scale.setScalar((e.baseScale ?? 1) * wu.scale * (1 + Math.sin(e.atkT * 26) * 0.04));
        m.rotation.x = wu.lean * 0.35;
        e.atkT += dt;
        if (e.atkT >= e.atk.windup) {
          e.atkState = "active"; e.atkT = 0;
          this._restoreGlow(e); m.scale.setScalar(e.baseScale ?? 1);
          events.push({ type: "bossAttack", shape: e.atk.shape, kind: e.atk.kind, pos: m.position.clone(), damage: e.damage });
        }
        break;
      case "active":
        e.atkT += dt;
        if ((e.atk.kind === "melee" || e.atk.kind === "area") && dist < 4.5 && !e._hitThis) {
          e._hitThis = true;
          events.push({ type: "hitPlayer", dmg: e.damage, src: e });
        }
        if (e.atkT >= e.atk.duration) { e.atkState = "recover"; e.atkT = 0; e.atkCd = e.atk.cooldown; }
        break;
      case "recover":
        e.atkT += dt;
        if (e.atkT >= 0.2) { e.atkState = "idle"; e.atkT = 0; }
        break;
    }

    m.lookAt(pp.x, m.position.y, pp.z);
    // It only closes ground while idle — committed attacks do not track you.
    if (e.atkState === "idle" && dist > 5) this._move(e, nx * e.speed * 0.35, nz * e.speed * 0.35, dt, arena);
    return events;
  }

  _move(e, vx, vz, dt, arena) {
    const m = e.mesh;
    e.lastStep = Math.hypot(vx, vz) * dt;     // read by the hasty motion-smear
    m.position.x += vx * dt; m.position.z += vz * dt;
    m.position.x = THREE.MathUtils.clamp(m.position.x, -arena.halfW + 0.6, arena.halfW - 0.6);
    m.position.z = THREE.MathUtils.clamp(m.position.z, -arena.halfD + 0.6, arena.halfD - 0.6);
    // slide around cover blocks
    for (const b of arena.blocks) {
      const dx = m.position.x - b.x, dz = m.position.z - b.z;
      const px = b.w / 2 + e.radius - Math.abs(dx), pz = b.d / 2 + e.radius - Math.abs(dz);
      if (px > 0 && pz > 0) { if (px < pz) m.position.x += Math.sign(dx || 1) * px; else m.position.z += Math.sign(dz || 1) * pz; }
    }
    // separation from other enemies
    for (const o of this.list) {
      if (o === e || !o.alive) continue;
      const dx = m.position.x - o.mesh.position.x, dz = m.position.z - o.mesh.position.z;
      const d = Math.hypot(dx, dz), min = e.radius + o.radius;
      if (d < min && d > 0.001) { m.position.x += dx / d * (min - d) * 0.5; m.position.z += dz / d * (min - d) * 0.5; }
    }
  }

  _shoot(e, target, speed, dmg, arc = false) {
    const geo = new THREE.SphereGeometry(arc ? 0.22 : 0.14, 6, 6);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: arc ? 0xb08aff : 0xff4040 }));
    mesh.position.copy(e.mesh.position);
    const dir = new THREE.Vector3(target.x - mesh.position.x, (target.y - 0.4) - mesh.position.y, target.z - mesh.position.z).normalize();
    this.group.add(mesh);
    this.projectiles.push({ mesh, vel: dir.multiplyScalar(speed), dmg, ttl: 3 });
  }

  /** apply damage from the player; returns { killed, crit } via caller. */
  damage(e, amount, hpAfter, killed) {
    e.hp = hpAfter;
    e.hitFlash = 0.08;
    e.mesh.material.emissive.setHex(0xffffff); e.mesh.material.emissiveIntensity = 0.8;
    // Deaths from player damage happen outside update(), so their events go to
    // a queue that update() drains next frame. Poppers shot at range have to be
    // able to explode, and that explosion is an event.
    if (killed) this._kill(e, this.pending);
    return killed;
  }

  _restoreGlow(e) {
    const look = LOOKS[e.archetype];
    e.mesh.material.emissive.setHex(e.elite ? 0x883300 : look.glow);
    e.mesh.material.emissiveIntensity = e.elite ? 1.0 : 0.7;
  }

  /** Collapse the mesh over ~0.35s instead of blinking it out of existence. */
  _startCollapse(e) {
    const m = e.mesh, rs = e.restScale ?? 1;
    this.dying.push({ m, t: 0, rs });
  }

  _kill(e, events, silent = false) {
    if (!e.alive) return;
    // Shooting a popper must set it off too — a dead bomb that doesn't explode
    // reads as a bug, and it removes the whole "shoot it at range" decision.
    if (e.archetype === "popper" && !e._boom && events) { this._detonate(e, events, 0); return; }
    e.alive = false;
    this._releaseLunge(e);
    this._startCollapse(e);
    if (!silent) SFX.kill();
    if (events) events.push({ type: "kill", e });
    this._shatter(e);
    // Splitting: two smaller, faster copies. Never recurse — the children carry
    // no affix, or one elite could fill the room.
    if (e.affix === "splitting" && !e.isSplit) {
      for (const off of [-0.8, 0.8]) {
        const child = this.spawn({ ...e, affix: null, hp: Math.max(1, Math.round(e.maxHp * 0.35)), maxHp: Math.max(1, Math.round(e.maxHp * 0.35)), damage: e.damage * 0.6, speed: e.speed * 1.3 },
          e.mesh.position.x + off, e.mesh.position.z, false);
        child.isSplit = true; child.mesh.scale.multiplyScalar(0.65); child.radius *= 0.65;
        child.restScale = child.mesh.scale.x;
      }
    }
  }

  /** Death: the mesh breaks into flying shards that tumble, fall, and fade.
   *  Enemies that simply vanish read as a bug; this is the difference. */
  _shatter(e) {
    const src = e.mesh, look = LOOKS[e.archetype];
    const n = e.isBoss ? 26 : 10;
    const mat = new THREE.MeshLambertMaterial({ color: look.color, flatShading: true, emissive: new THREE.Color(look.glow), emissiveIntensity: 1.2, transparent: true });
    const size = look.size * (src.scale.x || 1) * 0.35;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.TetrahedronGeometry(size * (0.5 + Math.random() * 0.8), 0);
      const m = new THREE.Mesh(geo, mat.clone());
      m.position.copy(src.position).add(new THREE.Vector3((Math.random() - 0.5) * size * 2, (Math.random() - 0.5) * size * 2, (Math.random() - 0.5) * size * 2));
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.group.add(m);
      const vel = m.position.clone().sub(src.position).normalize().multiplyScalar(4 + Math.random() * 6); vel.y += 3 + Math.random() * 4;
      this.shards.push({ m, vel, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), life: 0.9 + Math.random() * 0.5, max: 1.2 });
    }
  }

  _updateCollapse(dt) {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt / 0.35;
      const p = deathPose(d.t);
      d.m.scale.setScalar(Math.max(0.001, d.rs * p.scale));
      d.m.rotation.z += dt * 4;
      if (p.done || d.t >= 1) { this.group.remove(d.m); this.dying.splice(i, 1); }
    }
  }

  _updateShards(dt) {
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.vel.y -= 22 * dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (s.m.position.y < 0.05) { s.m.position.y = 0.05; s.vel.y = -s.vel.y * 0.35; s.vel.x *= 0.7; s.vel.z *= 0.7; }
      s.m.rotation.x += s.spin.x * dt; s.m.rotation.y += s.spin.y * dt; s.m.rotation.z += s.spin.z * dt;
      s.life -= dt;
      s.m.material.opacity = Math.max(0, Math.min(1, s.life / 0.4));
      if (s.life <= 0) { this.group.remove(s.m); s.m.geometry.dispose(); s.m.material.dispose(); this.shards.splice(i, 1); }
    }
  }

  /** first alive enemy hit by a ray from origin along dir within maxDist; warden shields block from the front */
  raycast(origin, dir, maxDist, pierce = 0) {
    const hits = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      // Hit volume is a vertical CAPSULE from the floor to the top of the mesh,
      // not a sphere at mesh centre. A sphere makes low swarm enemies (Skitter
      // at y=0.5) unhittable from eye height unless you aim at your own feet —
      // and "standing still is how you die" means they are usually at your feet.
      const s = e.mesh.scale.x || 1;
      const r = e.radius * s * (e.archetype === "wisp" ? 1.4 : 1.25);
      const top = e.mesh.position.y + r * 1.2, bottom = Math.max(0, e.mesh.position.y - r * 1.2);
      // nearest point on the ray to the capsule axis (a vertical segment)
      const to = this._tmp.subVectors(e.mesh.position, origin);
      let t = to.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const cy = Math.min(top, Math.max(bottom, py));
      const dx = px - e.mesh.position.x, dy = py - cy, dz = pz - e.mesh.position.z;
      const perp = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (perp <= r) {
        let blocked = false;
        if (e.archetype === "warden") {
          // Blocked only if we hit the FRONT and missed the sweeping gap. The
          // gap is the counterplay; without this check the Warden is a wall.
          const f = new THREE.Vector3(0, 0, 1).applyQuaternion(e.mesh.quaternion);
          const fromFront = f.dot(dir) < -0.35;
          const hitY = origin.y + dir.y * t;                  // world height of the impact
          const gapWorldY = e.mesh.position.y + (e.gapY ?? 0);
          const throughGap = Math.abs(hitY - gapWorldY) < 0.42;
          blocked = fromFront && !throughGap;
        }
        hits.push({ e, t, headshot: false, blocked });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    return hits.slice(0, 1 + pierce);
  }
}
