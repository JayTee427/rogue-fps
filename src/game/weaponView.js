// Weapon viewmodel + firing. Muzzle flash, recoil kick, tracers, reload anim.
// Firing logic reads the resolved weapon stats; hits go through core/combat.

import * as THREE from "three";
import { ARCHETYPES } from "core/weapons.js";
import { COLORS } from "./renderer.js";
import { SFX } from "./audio.js";

const flat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export class WeaponView {
  constructor(camera, scene) {
    this.camera = camera; this.scene = scene;
    this.group = new THREE.Group();
    camera.add(this.group);
    scene.add(camera);
    this.recoil = 0; this.reloadT = 0; this.reloading = false;
    this.mag = 0; this.heat = 0; this.overheated = false;
    this.fireCd = 0; this.shotIndex = 0; this.freeShots = 0;
    this.tracers = [];
    this.weapon = null;
    this._dir = new THREE.Vector3();
    this._build("sidearm");
  }

  _build(archetype) {
    this.group.clear();
    const body = flat(0x2a3140), accent = new THREE.MeshBasicMaterial({ color: COLORS.accent });
    const g = this.group;
    const shape = {
      sidearm:    () => { g.add(box(0.12, 0.16, 0.5, body, 0, -0.02, -0.1)); g.add(box(0.08, 0.2, 0.14, body, 0, -0.16, 0.12)); },
      scattergun: () => { g.add(box(0.14, 0.14, 0.9, body, 0, 0, -0.3)); g.add(box(0.14, 0.14, 0.9, body, 0.16, 0, -0.3)); g.add(box(0.1, 0.22, 0.2, body, 0.08, -0.16, 0.15)); },
      carbine:    () => { g.add(box(0.12, 0.18, 0.95, body, 0, 0, -0.35)); g.add(box(0.06, 0.28, 0.12, body, 0, -0.2, -0.05)); g.add(box(0.1, 0.06, 0.4, accent, 0, 0.12, -0.5)); },
      railgun:    () => { g.add(box(0.14, 0.14, 1.3, body, 0, 0, -0.5)); g.add(box(0.05, 0.05, 1.2, accent, 0, 0.1, -0.5)); g.add(box(0.05, 0.05, 1.2, accent, 0, -0.1, -0.5)); },
      launcher:   () => { g.add(cyl(0.16, 0.16, 1.0, body, 0, 0, -0.35)); g.add(cyl(0.2, 0.2, 0.2, accent, 0, 0, -0.9)); },
      beam:       () => { g.add(box(0.16, 0.16, 0.8, body, 0, 0, -0.3)); g.add(cyl(0.05, 0.05, 0.9, accent, 0, 0, -0.35)); },
    }[archetype] ?? (() => { g.add(box(0.12, 0.16, 0.5, body, 0, -0.02, -0.1)); });
    shape();
    // muzzle flash
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0 }));
    this.flash.position.set(0, 0, -0.9);
    g.add(this.flash);
    this.baseX = 0.28; this.baseY = -0.26; this.baseZ = -0.45;
    g.position.set(this.baseX, this.baseY, this.baseZ);
    function box(w, h, d, m, x, y, z) { const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mm.position.set(x, y, z); return mm; }
    function cyl(r1, r2, h, m, x, y, z) { const mm = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 10), m); mm.rotation.x = Math.PI / 2; mm.position.set(x, y, z); return mm; }
  }

  equip(weapon) {
    this.weapon = weapon;
    this._build(weapon.archetype);
    this.mag = weapon.stats.magSize; this.reloading = false; this.reloadT = 0; this.heat = 0; this.overheated = false;
    this.shotIndex = 0;
  }

  get archetype() { return this.weapon?.archetype ?? "sidearm"; }
  get isBeam() { return !!this.weapon?.stats?.continuous; }
  get ammoText() {
    if (this.isBeam) return this.overheated ? "HOT" : `${Math.round((1 - this.heat / (this.weapon.stats.heatCap ?? 4)) * 100)}%`;
    return this.reloading ? "···" : `${this.mag}`;
  }

  startReload(stats) {
    if (this.reloading || this.isBeam) return false;
    if (stats.noReload) return false;
    if (this.mag >= this.weapon.stats.magSize) return false;
    this.reloading = true; this.reloadT = 0; SFX.reload();
    return true;
  }

  /**
   * Try to fire. Returns null if nothing fired, else { rays: [{origin, dir}], isFirst, isLast, freeShot }.
   * `stats` = merged player+weapon stats. rng from the run.
   */
  tryFire(want, dt, stats, rng, playerDir) {
    this.fireCd -= dt;
    const w = this.weapon.stats;
    if (this.reloading) {
      this.reloadT += dt;
      const t = (w.reloadTime ?? 1.2) / (stats.reloadMult ?? 1);
      if (this.reloadT >= t) { this.reloading = false; this.mag = w.magSize; SFX.reloadDone(); this.shotIndex = 0; this.freshMag = true; }
      return null;
    }
    if (this.isBeam) {
      // continuous: heat management
      if (want && !this.overheated) {
        this.heat += dt; if (this.heat >= (w.heatCap ?? 4)) { this.overheated = true; }
        if (this.fireCd <= 0) { this.fireCd = 1 / (w.fireRate ?? 10); const ramp = Math.min(1, (this.beamT = (this.beamT ?? 0) + dt) / (w.rampTime ?? 2)); return { rays: [{ dir: playerDir.clone(), spread: 0 }], isFirst: false, isLast: false, dmgMult: (1 + ramp * ((w.rampTo ?? 90) / (w.damage ?? 30) - 1)) / (w.fireRate ?? 10) * 1.0, beam: true }; }
        return null;
      }
      this.beamT = 0;
      this.heat = Math.max(0, this.heat - dt * (this.overheated ? 0.6 : 1.2));
      if (this.overheated && this.heat <= 0.2) this.overheated = false;
      return null;
    }
    if (!want || this.fireCd > 0) return null;
    if (this.mag <= 0 && !stats.noReload) { if (want && this.fireCd <= 0) { SFX.empty(); this.fireCd = 0.25; this.startReload(stats); } return null; }

    this.fireCd = 1 / ((w.fireRate ?? 5) * (stats.fireRate ?? 1));
    const free = stats.freeShotChance > 0 && rng.next() < Math.min(0.9, stats.freeShotChance);
    if (!free && !stats.noReload) this.mag--;
    this.shotIndex++;
    const isFirst = !!this.freshMag; this.freshMag = false;
    const isLast = !stats.noReload && this.mag === 0;
    const pellets = w.pellets ?? 1;
    const spreadDeg = (w.spread ?? 1) * (stats.spread ?? 1);
    const rays = [];
    const doubled = stats.everyNthDouble > 0 && this.shotIndex % Math.round(stats.everyNthDouble) === 0;
    const count = pellets * (doubled ? 2 : 1);
    for (let i = 0; i < count; i++) {
      const d = playerDir.clone();
      if (spreadDeg > 0) {
        const a = rng.next() * Math.PI * 2, r = rng.next() * spreadDeg * (Math.PI / 180);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
        d.addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();
      }
      rays.push({ dir: d });
    }
    // feel
    this.recoil = Math.min(1, this.recoil + (this.archetype === "railgun" ? 1 : this.archetype === "scattergun" ? 0.8 : 0.35));
    this.flash.material.opacity = 1; this.flash.scale.setScalar(this.archetype === "railgun" ? 2.2 : 1 + rng.next() * 0.6);
    SFX.shoot(this.archetype);
    return { rays, isFirst, isLast, freeShot: free, dmgMult: 1, doubled };
  }

  spawnTracer(from, to, color = 0xffd080, width = 0.03, life = 0.08) {
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(width, width, len, 4, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to); m.rotateX(Math.PI / 2);
    this.scene.add(m);
    this.tracers.push({ m, life, max: life });
  }

  update(dt, moving) {
    // recoil spring + idle sway
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const t = performance.now() / 1000;
    const sway = moving ? Math.sin(t * 9) * 0.022 : Math.sin(t * 1.5) * 0.006;
    const swayY = moving ? Math.abs(Math.cos(t * 9)) * 0.01 : 0;
    this.group.position.set(this.baseX + sway, this.baseY + swayY + (this.reloading ? -0.18 : 0), this.baseZ + this.recoil * 0.22);
    this.group.rotation.set(-this.recoil * 0.45 + (this.reloading ? -0.5 : 0), 0, this.reloading ? 0.3 : 0);
    this.flash.material.opacity *= 0.7;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i]; tr.life -= dt; tr.m.material.opacity = Math.max(0, tr.life / tr.max) * 0.9;
      if (tr.life <= 0) { this.scene.remove(tr.m); tr.m.geometry.dispose(); this.tracers.splice(i, 1); }
    }
  }
}
