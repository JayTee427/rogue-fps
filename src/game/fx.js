// The juice. Particles, damage numbers, camera shake, muzzle light, hit decals.
// All the *maths* lives in core (particles / dmgnum / shake, delegated and
// tested); this file owns the meshes and the DOM. Feedback is over-tuned on
// purpose — the design bible says so.

import * as THREE from "three";
import { createPool, emit, step, PRESETS } from "core/particles.js";
import { createNumbers, pushNumber, stepNumbers, projectToScreen } from "core/dmgnum.js";
import { createShake, addTrauma, stepShake, sampleShake } from "core/shake.js";

const _v = new THREE.Vector3();

export class FX {
  constructor(scene, camera, quality) {
    this.scene = scene; this.camera = camera;
    const cap = quality?.particles ?? 300;
    this.pool = createPool(cap);
    this.rngShim = { next: Math.random };        // particles are cosmetic; not seeded

    // instanced points for particles — one draw call
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.sz = new Float32Array(cap);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("psize", new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uScale: { value: window.innerHeight * 0.9 } },
      vertexShader: `
        attribute float psize; varying vec3 vColor;
        uniform float uScale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          // clamp: a spark 20cm from the lens must not become a dinner plate
          gl_PointSize = min(psize * uScale / max(1.5, -mv.z), 42.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard;
          float a = smoothstep(0.25, 0.0, d); gl_FragColor = vec4(vColor * (0.6 + a*0.8), a); }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    window.addEventListener("resize", () => { mat.uniforms.uScale.value = window.innerHeight * 0.9; });

    // damage numbers: DOM layer (crisp text at any DPR, cheap)
    this.numbers = createNumbers(48);
    this.numLayer = document.createElement("div");
    this.numLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:800";
    document.querySelector("#hud").appendChild(this.numLayer);
    this.numEls = [];
    for (let i = 0; i < 48; i++) {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;transform:translate(-50%,-50%);will-change:transform,opacity;text-shadow:0 0 6px rgba(0,0,0,.9),0 2px 0 rgba(0,0,0,.8);white-space:nowrap;display:none";
      this.numLayer.appendChild(el); this.numEls.push(el);
    }
    this._viewProj = new THREE.Matrix4();

    // camera shake
    this.shake = createShake({ decay: 1.8, maxOffset: 0.16, maxRoll: 0.09, freq: 24 });

    // muzzle light + hit light
    this.muzzle = new THREE.PointLight(0xffc070, 0, 14, 1.6);
    scene.add(this.muzzle);
    this.hitLight = new THREE.PointLight(0xffe0a0, 0, 6, 2);
    scene.add(this.hitLight);
    this.hitLightT = 0;

    // scorch decals — a small ring buffer of flat discs
    this.decals = [];
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false });
    this.decalGeo = new THREE.CircleGeometry(0.6, 12);
  }

  // ---- emitters -------------------------------------------------------------
  burst(kind, pos, dir = null) {
    const preset = PRESETS[kind]; if (!preset) return;
    emit(this.pool, preset, pos, dir, this.rngShim);
  }
  hit(pos, dir, crit) {
    this.burst(crit ? "crit" : "hit", pos, dir);
    this.hitLight.position.copy(pos); this.hitLight.intensity = crit ? 16 : 7; this.hitLightT = crit ? 0.14 : 0.09;
  }
  kill(pos) { this.burst("kill", pos); this.burst("spark", pos); }
  explosion(pos, radius = 3) {
    this.burst("explosion", pos); this.burst("spark", pos);
    this.hitLight.position.copy(pos); this.hitLight.intensity = 14; this.hitLightT = 0.14;
    this.trauma(0.35 + radius * 0.05);
    this.scorch(pos, radius * 0.4);
  }
  muzzleFlash(strength = 1) { const m = this._muzzleWorld(); this.muzzle.position.copy(m).addScaledVector(this._forward(), 0.6); this.muzzle.intensity = 22 * strength; this.burst("muzzle", m, this._forward()); }
  dash(pos) { this.burst("dash", pos); }
  pickup(pos) { this.burst("pickup", pos); }
  burn(pos) { this.burst("burn", pos); }
  number(value, pos, kind = "hit", targetId = null) { pushNumber(this.numbers, { value, x: pos.x, y: pos.y + 0.6, z: pos.z, kind, targetId }); }
  trauma(a) { addTrauma(this.shake, a); }

  scorch(pos, size) {
    let m;
    if (this.decals.length >= 24) { m = this.decals.shift(); } else { m = new THREE.Mesh(this.decalGeo, this.decalMat); this.scene.add(m); }
    m.position.set(pos.x, 0.02, pos.z); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28;
    m.scale.setScalar(size); this.decals.push(m);
  }

  _forward() { return _v.set(0, 0, -1).applyQuaternion(this.camera.quaternion).clone(); }
  _muzzleWorld() { return this.camera.localToWorld(new THREE.Vector3(0.3, -0.2, -0.9)); }

  // ---- per frame ------------------------------------------------------------
  update(dt, cameraBaseRotation) {
    // particles
    step(this.pool, dt, 9.8);
    const p = this.pool, n = p.alive;
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = p.px[i]; this.pos[i * 3 + 1] = p.py[i]; this.pos[i * 3 + 2] = p.pz[i];
      const c = p.color[i]; const fade = Math.min(1, p.life[i] / Math.max(0.05, p.maxLife[i] * 0.4));
      this.col[i * 3] = ((c >> 16) & 255) / 255 * fade; this.col[i * 3 + 1] = ((c >> 8) & 255) / 255 * fade; this.col[i * 3 + 2] = (c & 255) / 255 * fade;
      this.sz[i] = p.size[i];
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.psize.needsUpdate = true;
    g.setDrawRange(0, n);

    // lights decay
    this.muzzle.intensity *= Math.pow(0.02, dt);
    if (this.hitLightT > 0) { this.hitLightT -= dt; if (this.hitLightT <= 0) this.hitLight.intensity = 0; }

    // damage numbers
    stepNumbers(this.numbers, dt);
    this.camera.updateMatrixWorld();
    this._viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    const m = this._viewProj.elements, w = window.innerWidth, h = window.innerHeight;
    const items = this.numbers.items;
    for (let i = 0; i < this.numEls.length; i++) {
      const el = this.numEls[i], it = items[i];
      if (!it) { if (el.style.display !== "none") el.style.display = "none"; continue; }
      const s = projectToScreen(it, m, w, h);
      if (!s.visible) { el.style.display = "none"; continue; }
      const pop = it.age < 0.08 ? 1 + (0.08 - it.age) * 6 : 1;
      el.style.display = "block";
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-50%) scale(${it.scale * pop})`;
      el.style.opacity = it.alpha;
      el.style.fontSize = it.kind === "crit" ? "26px" : "21px";
      el.style.color = it.kind === "crit" ? "#ffe066" : it.kind === "heal" ? "#6cff9a" : it.kind === "dot" ? "#ff8a3a" : "#ffffff";
      el.textContent = it.text + (it.kind === "crit" ? "!" : "");
    }

    // shake → applied on top of the player's camera rotation
    stepShake(this.shake, dt);
    const sh = sampleShake(this.shake, this.rngShim);
    this.camera.rotation.x = cameraBaseRotation.x + sh.y;
    this.camera.rotation.y = cameraBaseRotation.y + sh.x;
    this.camera.rotation.z = cameraBaseRotation.z + sh.roll;
  }
}
