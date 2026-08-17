// Enemy meshes, tells, and steering. Numbers come from core/enemies.js; this
// file only decides how each archetype LOOKS and MOVES. Six silhouettes, six
// tells — legibility is a design promise.

import * as THREE from "three";
import { scaleEnemy, rollRoster, rollAffix } from "core/enemies.js";
import { tickStatuses } from "core/combat.js";
import { COLORS } from "./renderer.js";
import { SFX } from "./audio.js";

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const EYE = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

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
};

export class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._tmp = new THREE.Vector3();
    this.projectiles = [];   // enemy shots: { mesh, vel, dmg, ttl }
  }

  clear() {
    for (const e of this.list) this.group.remove(e.mesh);
    for (const p of this.projectiles) this.group.remove(p.mesh);
    this.list = []; this.projectiles = [];
  }

  spawnRoom(rng, floor, roomIndex, arena, mods, eliteCount) {
    const roster = rollRoster(rng, floor, roomIndex, mods);
    const swarmHp = mods.swarm ? 0.5 : 1;
    roster.forEach((id, i) => {
      const elite = i < eliteCount;
      const affix = elite ? rollAffix(rng, floor) : null;
      const data = scaleEnemy(id, floor, roomIndex, affix);
      data.hp = Math.max(1, Math.round(data.hp * swarmHp)); data.maxHp = data.hp;
      // spawn ring away from the player at origin
      const ang = rng.next() * Math.PI * 2, rad = 9 + rng.next() * 8;
      const x = THREE.MathUtils.clamp(Math.cos(ang) * rad, -arena.halfW + 1.5, arena.halfW - 1.5);
      const z = THREE.MathUtils.clamp(Math.sin(ang) * rad, -arena.halfD + 1.5, arena.halfD - 1.5);
      this.spawn(data, x, z, elite);
    });
  }

  spawn(data, x, z, elite = false) {
    const look = LOOKS[data.archetype];
    const mat = flat(look.color, { emissive: new THREE.Color(elite ? 0x883300 : look.glow), emissiveIntensity: elite ? 1.0 : 0.7 });
    const mesh = new THREE.Mesh(look.geo(), mat);
    mesh.position.set(x, look.y, z);
    mesh.castShadow = true;
    if (elite) mesh.scale.multiplyScalar(1.25);
    // eyes / tell
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), EYE);
    eye.position.set(0, look.size * 0.3, look.size * 0.5);
    mesh.add(eye);
    if (data.archetype === "warden") {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.15), new THREE.MeshBasicMaterial({ color: COLORS.accent2, transparent: true, opacity: 0.55 }));
      shield.position.set(0, 0, 0.9);
      mesh.add(shield);
      mesh.userData.shield = shield;
    }
    this.group.add(mesh);
    const e = {
      ...data, mesh, statuses: [], elite, alive: true,
      t: Math.random() * 10, cd: 1 + Math.random(), state: "seek", stateT: 0, beepT: 0,
      radius: look.size * 0.6, hitFlash: 0, regenT: 0,
    };
    this.list.push(e);
    return e;
  }

  get aliveCount() { return this.list.filter(e => e.alive).length; }

  /** returns events: [{type:'hitPlayer', dmg}, {type:'kill', e}, {type:'popperBoom', pos, dmg}] */
  update(dt, player, arena, playerStats) {
    const events = [];
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
      if (e.hitFlash > 0) { e.hitFlash -= dt; if (e.hitFlash <= 0) this._restoreGlow(e); }

      const m = e.mesh;
      const dx = pp.x - m.position.x, dz = pp.z - m.position.z;
      const dist = Math.hypot(dx, dz);
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      const spd = e.speed * (e.slowMult ?? 1);

      switch (e.archetype) {
        case "skitter": {                                            // swarm melee, jittery
          const jit = Math.sin(e.t * 9) * 0.6;
          this._move(e, (nx - nz * jit * 0.4) * spd, (nz + nx * jit * 0.4) * spd, dt, arena);
          m.rotation.y += dt * 6; m.position.y = LOOKS.skitter.y + Math.abs(Math.sin(e.t * 12)) * 0.15;
          if (dist < 1.3 && e.cd <= 0) { events.push({ type: "hitPlayer", dmg: e.damage, src: e }); e.cd = 0.8; }
          break;
        }
        case "sentinel": {                                           // hold 9–14m, aim, then fire a tracer
          const want = dist > 14 ? 1 : dist < 9 ? -1 : 0;
          this._move(e, nx * want * spd, nz * want * spd, dt, arena);
          m.lookAt(pp.x, m.position.y, pp.z);
          if (e.state === "seek" && e.cd <= 0) { e.state = "aim"; e.stateT = 0; }
          if (e.state === "aim") {
            m.material.emissive.setHex(0xff2020); m.material.emissiveIntensity = Math.min(1.2, e.stateT * 2);   // the laser-sight tell
            if (e.stateT > 0.75) { e.state = "seek"; e.cd = 2.2 + Math.random(); this._restoreGlow(e); this._shoot(e, pp, 26, e.damage); }
          }
          break;
        }
        case "brute": {                                              // roar, glow, then charge
          if (e.state === "seek") { this._move(e, nx * spd, nz * spd, dt, arena); if (dist < 9 && e.cd <= 0) { e.state = "windup"; e.stateT = 0; SFX.bossRoar(); } }
          else if (e.state === "windup") { m.material.emissive.setHex(0xff5522); m.material.emissiveIntensity = e.stateT * 2; m.scale.setScalar((e.elite ? 1.25 : 1) * (1 + Math.sin(e.stateT * 20) * 0.04)); if (e.stateT > 0.7) { e.state = "charge"; e.stateT = 0; e.chargeDir = { x: nx, z: nz }; } }
          else if (e.state === "charge") { this._move(e, e.chargeDir.x * spd * 4.5, e.chargeDir.z * spd * 4.5, dt, arena); if (dist < 1.8 && e.cd <= 0) { events.push({ type: "hitPlayer", dmg: e.damage, src: e }); e.cd = 1.5; } if (e.stateT > 0.6) { e.state = "seek"; e.cd = 2.5; this._restoreGlow(e); m.scale.setScalar(e.elite ? 1.25 : 1); } }
          m.lookAt(pp.x, m.position.y, pp.z);
          break;
        }
        case "popper": {                                             // run at you, beep faster, explode
          this._move(e, nx * spd * (1 + Math.min(1, e.t * 0.1)), nz * spd, dt, arena);
          const rate = Math.max(0.12, Math.min(1, dist / 12));
          e.beepT += dt; if (e.beepT > rate) { e.beepT = 0; SFX.popperBeep(1 - rate); m.material.emissive.setHex(0xffaa00); m.material.emissiveIntensity = 1.5; } else m.material.emissiveIntensity = Math.max(0.7, m.material.emissiveIntensity * 0.85);
          if (dist < 1.6) { events.push({ type: "popperBoom", pos: m.position.clone(), dmg: e.damage, r: 3 }); this._kill(e, events, true); }
          break;
        }
        case "warden": {                                             // slow advance, shield faces you
          this._move(e, nx * spd, nz * spd, dt, arena);
          m.lookAt(pp.x, m.position.y, pp.z);
          if (dist < 1.8 && e.cd <= 0) { events.push({ type: "hitPlayer", dmg: e.damage, src: e }); e.cd = 1.2; }
          break;
        }
        case "wisp": {                                               // orbit high, erratic, drop mines
          const orbit = e.t * 1.4;
          const tx = pp.x + Math.cos(orbit) * 7, tz = pp.z + Math.sin(orbit) * 7;
          const ox = tx - m.position.x, oz = tz - m.position.z, od = Math.hypot(ox, oz) || 1;
          this._move(e, ox / od * spd, oz / od * spd, dt, arena);
          m.position.y = LOOKS.wisp.y + Math.sin(e.t * 3) * 0.6; m.rotation.y += dt * 2; m.rotation.x += dt * 1.3;
          if (e.cd <= 0) { this._shoot(e, pp, 14, e.damage, true); e.cd = 2.6; }
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

  _move(e, vx, vz, dt, arena) {
    const m = e.mesh;
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
    if (killed) this._kill(e, null);
    return killed;
  }

  _restoreGlow(e) {
    const look = LOOKS[e.archetype];
    e.mesh.material.emissive.setHex(e.elite ? 0x883300 : look.glow);
    e.mesh.material.emissiveIntensity = e.elite ? 1.0 : 0.7;
  }

  _kill(e, events, silent = false) {
    if (!e.alive) return;
    e.alive = false;
    this.group.remove(e.mesh);
    if (!silent) SFX.kill();
    if (events) events.push({ type: "kill", e });
  }

  /** first alive enemy hit by a ray from origin along dir within maxDist; warden shields block from the front */
  raycast(origin, dir, maxDist, pierce = 0) {
    const hits = [];
    for (const e of this.list) {
      if (!e.alive) continue;
      const to = this._tmp.subVectors(e.mesh.position, origin);
      const t = to.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - t * t));
      const r = e.radius * (e.mesh.scale.x || 1) * (e.archetype === "wisp" ? 1.4 : 1.15);
      if (perp <= r) {
        let blocked = false;
        if (e.archetype === "warden") {                       // shield: blocks if we're in front of it
          const f = new THREE.Vector3(0, 0, 1).applyQuaternion(e.mesh.quaternion);
          blocked = f.dot(dir) < -0.35;
        }
        hits.push({ e, t, headshot: false, blocked });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    return hits.slice(0, 1 + pierce);
  }
}
