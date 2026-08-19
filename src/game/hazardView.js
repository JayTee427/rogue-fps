// Draws whatever core/hazards.js says exists. Every hazard reads at a glance:
// lava glows and pulses, acid is sickly green, turrets have a visible eye that
// tracks you, mines blink faster as you approach, collapsing tiles crack then
// drop away. Legibility is the whole point.

import * as THREE from "three";
import { spawnHazards, stepHazards } from "core/hazards.js";
import { SFX } from "./audio.js";

export class HazardView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.hazards = []; this.meshes = new Map(); this.projectiles = [];
    this._geo = {
      pool: new THREE.CircleGeometry(1, 20),
      turretBase: new THREE.CylinderGeometry(0.5, 0.7, 0.9, 8),
      turretHead: new THREE.BoxGeometry(0.5, 0.35, 0.8),
      mine: new THREE.CylinderGeometry(0.35, 0.4, 0.14, 10),
      tile: new THREE.BoxGeometry(1, 0.12, 1),
      shot: new THREE.SphereGeometry(0.16, 6, 6),
    };
  }

  clear() {
    for (const m of this.meshes.values()) this.group.remove(m);
    for (const p of this.projectiles) this.group.remove(p.mesh);
    this.meshes.clear(); this.projectiles = []; this.hazards = [];
  }

  spawn(rng, tag, arena, floor) {
    this.clear();
    this.hazards = spawnHazards(rng, tag, arena, floor);
    for (const h of this.hazards) this.meshes.set(h.id, this._build(h));
    return this.hazards.length;
  }

  /** Wisps lay mines mid-fight. Same hazard shape core/hazards.js produces, so
   *  stepHazards() drives it identically — no second code path to keep in sync. */
  addMine(x, z, damage) {
    if (this.hazards.length > 40) return;            // a long Wisp fight must not carpet the floor
    const h = { id: `wispmine${this._mineN = (this._mineN ?? 0) + 1}`, kind: "mines", x, z, radius: 1.3, armed: true, damage, blast: 3.2 };
    this.hazards.push(h);
    this.meshes.set(h.id, this._build(h));
    return h;
  }

  _build(h) {
    let m;
    switch (h.kind) {
      case "lava_floor": {
        m = new THREE.Mesh(this._geo.pool, new THREE.MeshBasicMaterial({ color: 0xff4a1a, transparent: true, opacity: 0.85 }));
        m.rotation.x = -Math.PI / 2; m.position.set(h.x, 0.03, h.z); m.scale.setScalar(h.radius);
        const glow = new THREE.PointLight(0xff5a1a, 4, h.radius * 4, 2); glow.position.y = 0.6; m.add(glow); m.userData.light = glow;
        break;
      }
      case "acid_pools": {
        m = new THREE.Mesh(this._geo.pool, new THREE.MeshBasicMaterial({ color: 0x5aff3a, transparent: true, opacity: 0.7 }));
        m.rotation.x = -Math.PI / 2; m.position.set(h.x, 0.03, h.z); m.scale.setScalar(h.radius);
        const glow = new THREE.PointLight(0x6aff4a, 2.5, h.radius * 3, 2); glow.position.y = 0.5; m.add(glow); m.userData.light = glow;
        break;
      }
      case "turrets": {
        m = new THREE.Group();
        const base = new THREE.Mesh(this._geo.turretBase, new THREE.MeshLambertMaterial({ color: 0x3a4660, flatShading: true }));
        base.position.y = 0.45; base.castShadow = true; m.add(base);
        const head = new THREE.Mesh(this._geo.turretHead, new THREE.MeshLambertMaterial({ color: 0x556a8a, flatShading: true, emissive: 0x220000 }));
        head.position.y = 1.15; m.add(head);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
        eye.position.set(0, 0, 0.42); head.add(eye);
        m.userData.head = head; m.position.set(h.x, 0, h.z);
        break;
      }
      case "mines": {
        m = new THREE.Mesh(this._geo.mine, new THREE.MeshLambertMaterial({ color: 0x555b66, flatShading: true, emissive: 0xff2020, emissiveIntensity: 0.4 }));
        m.position.set(h.x, 0.07, h.z);
        const ring = new THREE.Mesh(new THREE.RingGeometry(h.radius - 0.05, h.radius, 24), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; m.add(ring); ring.position.y = -0.05;
        break;
      }
      case "collapsing": {
        m = new THREE.Mesh(this._geo.tile, new THREE.MeshLambertMaterial({ color: 0x4a3a30, flatShading: true }));
        m.position.set(h.x, 0.06, h.z); m.scale.set(h.radius * 1.9, 1, h.radius * 1.9);
        break;
      }
      default: m = new THREE.Group();
    }
    this.group.add(m);
    return m;
  }

  /** returns events for the game loop: [{type:'damage'|'slow'|'explode'}, ...] — turret shots are handled here */
  /** Events caused outside the step (a shot detonating a mine, a turret dying)
   *  join the same outbound channel the step's own events use. */
  inject(events) {
    if (events?.length) (this._pending ??= []).push(...events);
  }

  update(dt, player, arena, rng) {
    if (!this.hazards.length && !this.projectiles.length) return [];
    const t = performance.now() / 1000;
    const r = stepHazards(this.hazards, dt, { x: player.pos.x, y: player.pos.y, z: player.pos.z }, rng);
    // hazards that vanished (mines) → remove mesh
    const alive = new Set(r.hazards.map(h => h.id));
    for (const [id, m] of this.meshes) if (!alive.has(id)) { this.group.remove(m); this.meshes.delete(id); }
    this.hazards = r.hazards;

    // animate
    for (const h of this.hazards) {
      const m = this.meshes.get(h.id); if (!m) continue;
      const d = Math.hypot(player.pos.x - h.x, player.pos.z - h.z);
      if (h.kind === "lava_floor") { m.material.opacity = 0.7 + Math.sin(t * 3 + h.x) * 0.15; if (m.userData.light) m.userData.light.intensity = 3.5 + Math.sin(t * 5 + h.z) * 1.2; }
      else if (h.kind === "acid_pools") { m.material.opacity = 0.6 + Math.sin(t * 2 + h.z) * 0.1; }
      else if (h.kind === "turrets") { const head = m.userData.head; if (h.dead) { head.rotation.x = Math.min(0.9, (head.rotation.x || 0) + dt * 3); head.material.emissive.setHex(0); head.material.emissiveIntensity = 0; if (m.userData.eye) m.userData.eye.visible = false; } else if (d <= h.range) { head.lookAt(player.pos.x, 1.15, player.pos.z); head.material.emissive.setHex(0x661111); head.material.emissiveIntensity = h.cd < 0.4 ? 1.5 : 0.5; } else { head.rotation.y += dt * 0.6; head.material.emissiveIntensity = 0.1; } }
      else if (h.kind === "mines") { const rate = Math.max(2, 14 - d); m.material.emissiveIntensity = 0.3 + Math.max(0, Math.sin(t * rate)) * 1.2; }
      else if (h.kind === "collapsing") {
        if (h.state === "cracking") { m.material.color.setHex(0x8a4a30); m.material.emissive.setHex(0xff3000); m.material.emissiveIntensity = (1 - h.timer / 1.2) * 0.8; m.position.y = 0.06 + Math.sin(t * 40) * 0.015 * (1 - h.timer / 1.2); }
        else if (h.state === "hole") { m.material.color.setHex(0x050508); m.material.emissive.setHex(0); m.position.y = -0.4; }
      }
    }

    // turret shots become projectiles here; other events pass through
    const out = [];
    if (this._pending?.length) { out.push(...this._pending); this._pending.length = 0; }
    for (const ev of r.events) {
      if (ev.type === "shoot") {
        const mesh = new THREE.Mesh(this._geo.shot, new THREE.MeshBasicMaterial({ color: 0xff5050 }));
        mesh.position.set(ev.x, ev.y, ev.z);
        this.group.add(mesh);
        this.projectiles.push({ mesh, vel: new THREE.Vector3(ev.dir.x, ev.dir.y, ev.dir.z).multiplyScalar(ev.speed), dmg: ev.damage, ttl: 2.5 });
        SFX.shoot("sidearm");
      } else if (ev.type === "explode") { SFX.kill(); out.push(ev); }
      else out.push(ev);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.addScaledVector(p.vel, dt); p.ttl -= dt;
      if (p.mesh.position.distanceTo(player.pos) < 0.7) { out.push({ type: "damage", amount: p.dmg, source: "turret", instant: true }); p.ttl = 0; }
      if (p.ttl <= 0 || Math.abs(p.mesh.position.x) > arena.halfW || Math.abs(p.mesh.position.z) > arena.halfD || p.mesh.position.y < 0) { this.group.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
    return out;
  }
}
