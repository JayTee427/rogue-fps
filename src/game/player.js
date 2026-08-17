// First-person controller. Fast ground speed, generous air control, dash on a
// short cooldown — "standing still is how you die." All numbers come from
// resolved `stats` so items (Long Legs, Feather, Double Jump, Blink Dash) change
// movement without this file knowing about them.

import * as THREE from "three";

const GRAVITY = 30;
const JUMP_VEL = 11;
const DASH_SPEED = 46;
const DASH_TIME = 0.16;
const EYE_HEIGHT = 1.7;
const RADIUS = 0.45;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, EYE_HEIGHT, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.jumpsLeft = 1;
    this.dashCd = 0;
    this.dashT = 0;
    this.dashDir = new THREE.Vector3();
    this.sliding = false;
    this.speedMult = 1;        // from slow statuses etc.
    this.stats = { moveSpeed: 8, jumps: 1, dashCooldown: 1.4, gravity: 1, airControl: 0.35, dashPhases: false, slide: false };
    this.arena = null;         // { halfW, halfD, blocks: [{x,z,w,d,h}] }
    this.bobT = 0;
    this._fwd = new THREE.Vector3(); this._right = new THREE.Vector3(); this._wish = new THREE.Vector3();
  }

  setStats(stats) {
    this.stats = { ...this.stats, ...stats };
    if (this.stats.airControl > 1) this.stats.airControl = 1;
  }

  reset(x = 0, z = 0) {
    this.pos.set(x, EYE_HEIGHT, z);
    this.vel.set(0, 0, 0);
    this.onGround = true; this.jumpsLeft = this.stats.jumps ?? 1; this.dashCd = 0; this.dashT = 0;
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * sens));
  }

  /** input: { x: -1..1 (strafe), y: -1..1 (forward), jump, dash, crouch } */
  update(dt, input) {
    const s = this.stats;
    const speed = s.moveSpeed * this.speedMult * (this.sliding ? 1.35 : 1);
    this._fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this._wish.set(0, 0, 0).addScaledVector(this._fwd, input.y).addScaledVector(this._right, input.x);
    if (this._wish.lengthSq() > 1) this._wish.normalize();

    // dash
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (input.dash && this.dashCd <= 0 && this.dashT <= 0) {
      const dir = this._wish.lengthSq() > 0.01 ? this._wish.clone() : this._fwd.clone();
      this.dashDir.copy(dir.normalize());
      this.dashT = DASH_TIME;
      this.dashCd = s.dashCooldown;
      this.vel.y = Math.max(this.vel.y, 0);
      this.dashed = true;
    } else this.dashed = false;

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.z = this.dashDir.z * DASH_SPEED;
    } else {
      // ground: snappy accel toward wish; air: partial control
      const ctrl = this.onGround ? 1 : (s.airControl ?? 0.35);
      const accel = this.onGround ? 60 : 60 * ctrl;
      const tx = this._wish.x * speed, tz = this._wish.z * speed;
      const k = Math.min(1, accel * dt / Math.max(speed, 1));
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.z += (tz - this.vel.z) * k;
      if (this.onGround && this._wish.lengthSq() < 0.01) { this.vel.x *= Math.pow(0.001, dt); this.vel.z *= Math.pow(0.001, dt); }
    }

    // slide (crouch while moving fast) — from the Slide item
    this.sliding = !!(s.slide && input.crouch && this.onGround && Math.hypot(this.vel.x, this.vel.z) > speed * 0.6);

    // jump
    if (input.jump && this.jumpsLeft > 0 && !input._jumpHeld) {
      this.vel.y = JUMP_VEL;
      this.jumpsLeft--;
      this.onGround = false;
      this.jumped = true;
    } else this.jumped = false;

    // gravity
    this.vel.y -= GRAVITY * (s.gravity ?? 1) * dt;
    if (this.vel.y < -40) this.vel.y = -40;

    // integrate + collide
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._collideXZ();
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= EYE_HEIGHT) {
      this.pos.y = EYE_HEIGHT;
      if (!this.onGround) this.landed = true; else this.landed = false;
      this.vel.y = 0;
      this.onGround = true;
      this.jumpsLeft = s.jumps ?? 1;
    } else { this.onGround = false; this.landed = false; }

    // camera
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bobT += dt * (this.onGround ? moving * 1.4 : 0);
    const bob = this.onGround ? Math.sin(this.bobT) * 0.055 * Math.min(1, moving / 6) : 0;
    this.camera.position.set(this.pos.x, this.pos.y + bob - (this.sliding ? 0.5 : 0), this.pos.z);
    this.camera.rotation.set(0, 0, 0, "YXZ");
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = -this.vel.dot(this._right) * 0.006;   // subtle strafe roll
  }

  _collideXZ() {
    const a = this.arena;
    if (!a) return;
    const lim = a.halfW - RADIUS, limD = a.halfD - RADIUS;
    if (this.pos.x > lim) { this.pos.x = lim; this.vel.x = 0; }
    if (this.pos.x < -lim) { this.pos.x = -lim; this.vel.x = 0; }
    if (this.pos.z > limD) { this.pos.z = limD; this.vel.z = 0; }
    if (this.pos.z < -limD) { this.pos.z = -limD; this.vel.z = 0; }
    if (this.dashT > 0 && this.stats.dashPhases) return;   // Blink Dash phases through cover
    for (const b of a.blocks) {
      const dx = this.pos.x - b.x, dz = this.pos.z - b.z;
      const px = b.w / 2 + RADIUS - Math.abs(dx), pz = b.d / 2 + RADIUS - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) { this.pos.x += Math.sign(dx || 1) * px; this.vel.x = 0; }
        else { this.pos.z += Math.sign(dz || 1) * pz; this.vel.z = 0; }
      }
    }
  }

  forwardDir(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyEuler(this.camera.rotation).normalize();
  }
}
