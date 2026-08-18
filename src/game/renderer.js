// Scene, arena, materials, and the quality tier. Stylised on purpose: flat
// shading, strong colour, emissive accents — reads at any resolution, runs on a
// phone, and (per DESIGN) legibility beats photoreal in an arcade shooter.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { TIERS } from "core/quality.js";

export const COLORS = {
  floor: 0x1a2130, wall: 0x232c3d, block: 0x2c3850, blockTop: 0x3a4a68,
  accent: 0xff5c3a, accent2: 0x3ad1ff, hazard: 0xff3a1e, exit: 0x3aff9a,
  skyTop: 0x0a0c10, skyBottom: 0x141a26,
};

export function createRenderer(container, tierName) {
  const tier = TIERS[tierName] ?? TIERS.medium;
  const renderer = new THREE.WebGLRenderer({ antialias: !!tier.msaa, powerPreference: "high-performance", stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * tier.resScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = !!tier.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Fog kept light: it sells depth, but too much and enemies vanish into the
  // dark — and "you always know why you died" is a design promise.
  scene.fog = new THREE.FogExp2(0x0e1219, 0.016);

  // Sky: a big inverted sphere with a vertical gradient + faint stars. Cheap,
  // reads as "derelict station open to space", and gives the walls a horizon.
  const skyGeo = new THREE.SphereGeometry(150, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x05070c) }, mid: { value: new THREE.Color(0x141a2b) }, bot: { value: new THREE.Color(0x24192b) } },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, bot; varying vec3 vPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        float h = normalize(vPos).y;
        vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, h)) : mix(mid, bot, smoothstep(0.0, -0.4, h));
        // stars above the horizon
        vec2 sp = normalize(vPos).xz * 90.0 + vec2(h * 40.0);
        float s = step(0.996, hash(floor(sp))) * smoothstep(0.05, 0.4, h);
        c += vec3(s * 0.8);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 300);

  // Lighting is tuned by measurement, not taste: a frame from spawn should
  // average ~65/255 brightness. Below ~40 the arena reads as a black void
  // (measured 32 with the first palette pass); above ~90 it washes out.
  const hemi = new THREE.HemisphereLight(0xb8ccff, 0x3a2c1a, 2.6);
  scene.add(hemi);
  scene.add(new THREE.AmbientLight(0x2a3a5a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0dd, 3.2);
  sun.position.set(12, 22, 8);
  sun.castShadow = !!tier.shadows;
  if (tier.shadows) {
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    sun.shadow.camera.far = 80; sun.shadow.bias = -0.0015;
  }
  scene.add(sun);
  const rim = new THREE.PointLight(COLORS.accent2, 6, 40, 1.6);
  rim.position.set(0, 6, 0);
  scene.add(rim);

  // Bloom is what makes emissive trims, muzzle flash, tracers and enemy glow read
  // as light rather than as bright paint. It is the single biggest lever for a
  // stylised look, and it is cheap enough for medium tier; low tier skips it.
  let composer = null, bloom = null, grade = null;
  if (tier.bloom !== false && tierName !== "low") {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.78, 0.7, 0.55);
    composer.addPass(bloom);

    // Final grade: saturation, a cool-shadow/warm-highlight tint, a vignette and
    // a red edge-flash on damage. Bloom alone left everything flat and untouched.
    grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, uVignette: { value: 0.52 },
        uDamage: { value: 0.0 }, uTime: { value: 0.0 }, uSat: { value: 1.12 },
      },
      vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse;
uniform float uVignette; uniform float uDamage; uniform float uTime; uniform float uSat;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uSat);
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col * vec3(0.88, 0.92, 1.0), col * vec3(1.0, 0.96, 0.9), smoothstep(0.0, 1.0, luma * 1.4));
  float d = distance(vUv, vec2(0.5));
  col *= smoothstep(0.95, 0.25, d * uVignette);
  col += vec3(1.0, 0.08, 0.08) * uDamage * 0.5 * smoothstep(0.25, 0.8, d);
  col += (hash(vUv * 800.0 + uTime * 0.5) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`,
    });
    composer.addPass(grade);
    composer.addPass(new OutputPass());
    // the composer owns tone mapping now
    renderer.toneMapping = THREE.NoToneMapping;
  }

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    composer?.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  const render = () => {
    if (grade) grade.uniforms.uTime.value = performance.now() * 0.001;
    if (composer) composer.render(); else renderer.render(scene, camera);
  };

  return { renderer, scene, camera, tier, composer, bloom, grade, render, dispose() { window.removeEventListener("resize", onResize); renderer.dispose(); } };
}

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

// Per-room palettes so floors don't all look the same. Picked by rng.
// Base colours sit in the 0x30–0x60 range on purpose: Lambert under our lights
// roughly halves them, and anything starting below ~0x28 renders as black.
const PALETTES = [
  { floor: 0x2c3a52, floorSeam: 0x4a8dff, wall: 0x3a4a68, panel: 0x485c80, block: 0x4c6088, blockTop: 0x7a94c0, trim: 0x3ad1ff, name: "cobalt" },
  { floor: 0x3a3048, floorSeam: 0xff5fb3, wall: 0x483a5a, panel: 0x5a4a70, block: 0x604e80, blockTop: 0x8c72b0, trim: 0xff5ca8, name: "magenta" },
  { floor: 0x2e4640, floorSeam: 0x4affaa, wall: 0x3a5850, panel: 0x486a5e, block: 0x50786a, blockTop: 0x78a894, trim: 0x5aff9a, name: "verdigris" },
  { floor: 0x463830, floorSeam: 0xffb24a, wall: 0x584438, panel: 0x6a5446, block: 0x78604c, blockTop: 0xa88468, trim: 0xffb347, name: "ember" },
];

/**
 * Build a rectangular arena with cover blocks and an exit pad. Returns the
 * group plus the collision description the Player uses. Deterministic per rng.
 */
export function buildArena(scene, rng, opts = {}) {
  const halfW = opts.halfW ?? 16, halfD = opts.halfD ?? 20;
  const pal = opts.palette ?? rng.pick(PALETTES);
  // A biome palette carries its own atmosphere; the built-in ones do not.
  if (opts.fogDensity != null && scene.fog) scene.fog.density = opts.fogDensity;
  const g = new THREE.Group();
  g.name = "arena";

  // floor: tiles with emissive seams — reads speed, reads distance, looks built
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2, 1, 1), flat(pal.floor));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  g.add(floor);
  const seamMat = new THREE.MeshBasicMaterial({ color: pal.floorSeam, transparent: true, opacity: 0.35 });
  const seamGeo = new THREE.BufferGeometry();
  const seamVerts = [];
  const tile = 4;
  for (let x = -halfW; x <= halfW; x += tile) seamVerts.push(x, 0.012, -halfD, x, 0.012, halfD);
  for (let z = -halfD; z <= halfD; z += tile) seamVerts.push(-halfW, 0.012, z, halfW, 0.012, z);
  seamGeo.setAttribute("position", new THREE.Float32BufferAttribute(seamVerts, 3));
  g.add(new THREE.LineSegments(seamGeo, new THREE.LineBasicMaterial({ color: pal.floorSeam, transparent: true, opacity: 0.45 })));
  // a brighter cross at the room centre — an anchor for the eye
  const cross = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.75, 48), new THREE.MeshBasicMaterial({ color: pal.floorSeam, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  cross.rotation.x = -Math.PI / 2; cross.position.y = 0.014; g.add(cross);

  // walls: panelled, with a glowing trim line and dark baseboard
  const wallH = 5.5, wallMat = flat(pal.wall), panelMat = flat(pal.panel);
  const mkWall = (w, d, x, z, along) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat); m.position.set(x, wallH / 2, z); m.receiveShadow = true; g.add(m);
    // vertical panels every 4m, slightly proud of the wall. A panel is 2.4 wide
    // ALONG the wall and just thicker than the wall THROUGH it — get the axes
    // backwards and you build a 41 m slab across the room (which is exactly what
    // the first version did; every "black frame" was the camera 1.3 m from it).
    const len = along === "x" ? w : d;
    const thick = (along === "x" ? d : w) + 0.12;
    for (let s = -len / 2 + 2; s < len / 2 - 1; s += 4) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? 2.4 : thick, wallH - 1.6, along === "x" ? thick : 2.4), panelMat);
      p.position.set(along === "x" ? x + s : x, wallH / 2 - 0.3, along === "x" ? z : z + s); g.add(p);
    }
    // trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? w : d + 0.2, 0.08, along === "x" ? d + 0.2 : 0.08), new THREE.MeshBasicMaterial({ color: pal.trim }));
    trim.position.set(x, 2.3, z); if (along === "z") trim.rotation.y = Math.PI / 2; g.add(trim);
    const base = new THREE.Mesh(new THREE.BoxGeometry(along === "x" ? w : d + 0.16, 0.5, along === "x" ? d + 0.16 : 0.5), new THREE.MeshBasicMaterial({ color: 0x0b0e14 }));
    base.position.set(x, 0.25, z); if (along === "z") base.rotation.y = Math.PI / 2; g.add(base);
  };
  mkWall(halfW * 2 + 1, 1, 0, -halfD - 0.5, "x");
  mkWall(halfW * 2 + 1, 1, 0, halfD + 0.5, "x");
  mkWall(1, halfD * 2 + 1, -halfW - 0.5, 0, "z");
  mkWall(1, halfD * 2 + 1, halfW + 0.5, 0, "z");
  // corner pillars with lights — anchors the space and lifts the ambient
  for (const [cx, cz] of [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(1.2, wallH + 0.4, 1.2), flat(pal.panel)); pil.position.set(cx, (wallH + 0.4) / 2, cz); g.add(pil);
    const lamp = new THREE.PointLight(pal.trim, 6, 22, 1.8); lamp.position.set(cx * 0.92, wallH - 0.6, cz * 0.92); g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: pal.trim })); bulb.position.copy(lamp.position); g.add(bulb);
  }

  // cover blocks: bevelled look via a slightly larger dark base + bright cap
  const blocks = [];
  const n = opts.blockCount ?? rng.int(6, 10);
  const blockMat = flat(pal.block);
  for (let i = 0; i < n; i++) {
    const w = rng.int(2, 4), d = rng.int(2, 4), h = rng.pick([1.2, 1.8, 2.6, 3.4]);
    const x = rng.int(-halfW + 3, halfW - 3), z = rng.int(-halfD + 6, halfD - 6);
    if (Math.hypot(x, z) < 5) continue;                                  // keep spawn clear
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.08, d + 0.06), new THREE.MeshBasicMaterial({ color: pal.blockTop }));
    cap.position.set(x, h + 0.04, z); g.add(cap);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.18, d + 0.2), new THREE.MeshBasicMaterial({ color: 0x0b0e14 }));
    foot.position.set(x, 0.09, z); g.add(foot);
    // a thin emissive edge on one face — reads as machinery
    if (rng.chance(0.5)) { const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: pal.trim })); edge.position.set(x, h * 0.6, z + d / 2 + 0.03); g.add(edge); }
    blocks.push({ x, z, w, d, h });
  }

  // exit pad at the far end (only "open" once the room is cleared)
  const exit = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 24), new THREE.MeshBasicMaterial({ color: COLORS.exit, transparent: true, opacity: 0.25 }));
  exit.position.set(0, 0.06, -halfD + 3);
  exit.name = "exit";
  g.add(exit);
  const exitRing = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: COLORS.exit }));
  exitRing.rotation.x = Math.PI / 2; exitRing.position.copy(exit.position); exitRing.position.y = 0.14;
  exit.userData.ring = exitRing;
  g.add(exitRing);

  scene.add(g);
  return { group: g, halfW, halfD, blocks, exit, exitPos: exit.position.clone(), dispose() { scene.remove(g); g.traverse(o => { o.geometry?.dispose(); }); } };
}

// Set dressing. core/dressing.js decides WHERE everything sits (deterministically,
// from the room seed); this only decides what it looks like. Shared geometry and
// materials across every prop of a kind, so a fully dressed room is a handful of
// draw calls rather than eighty.
const PROP_GEO = {};
const PROP_MAT = {};
function propAssets(kind, spec) {
  if (!PROP_GEO[kind]) {
    PROP_GEO[kind] = kind === "hanging_cable"
      ? new THREE.CylinderGeometry(0.03, 0.03, spec.h, 4)
      : kind === "barrel"
        ? new THREE.CylinderGeometry(spec.w / 2, spec.w / 2, spec.h, 8)
        : new THREE.BoxGeometry(spec.w, spec.h, spec.d);
    PROP_MAT[kind] = spec.emissive
      ? new THREE.MeshBasicMaterial({ color: kind === "strip_light" ? 0xbfe6ff : 0x7fd4ff })
      : new THREE.MeshLambertMaterial({ color: kind === "crate" ? 0x6b5f4e : kind === "barrel" ? 0x4a5a63 : 0x3e4550, flatShading: true });
  }
  return [PROP_GEO[kind], PROP_MAT[kind]];
}

export function buildDressing(scene, props, kinds) {
  const group = new THREE.Group();
  for (const p of props) {
    const spec = kinds[p.kind];
    if (!spec) continue;
    const [geo, mat] = propAssets(p.kind, spec);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = p.rotY;
    m.scale.setScalar(p.scale);
    if (!spec.emissive) { m.castShadow = false; m.receiveShadow = true; }
    group.add(m);
  }
  scene.add(group);
  return group;
}
