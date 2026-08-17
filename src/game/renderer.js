// Scene, arena, materials, and the quality tier. Stylised on purpose: flat
// shading, strong colour, emissive accents — reads at any resolution, runs on a
// phone, and (per DESIGN) legibility beats photoreal in an arcade shooter.

import * as THREE from "three";
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
  scene.background = new THREE.Color(0x0e1219);
  // Fog kept light: it sells depth, but too much and enemies vanish into the
  // dark — and "you always know why you died" is a design promise.
  scene.fog = new THREE.FogExp2(0x0e1219, 0.016);

  const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 200);

  const hemi = new THREE.HemisphereLight(0xa8c4ff, 0x2a2010, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
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

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener("resize", onResize);

  return { renderer, scene, camera, tier, dispose() { window.removeEventListener("resize", onResize); renderer.dispose(); } };
}

const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

/**
 * Build a rectangular arena with cover blocks and an exit pad. Returns the
 * group plus the collision description the Player uses. Deterministic per rng.
 */
export function buildArena(scene, rng, opts = {}) {
  const halfW = opts.halfW ?? 16, halfD = opts.halfD ?? 20;
  const g = new THREE.Group();
  g.name = "arena";

  const floorMat = flat(COLORS.floor);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2, 8, 8), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  g.add(floor);
  // grid lines for speed perception — a plain floor hides how fast you move
  const grid = new THREE.GridHelper(Math.max(halfW, halfD) * 2, Math.max(halfW, halfD), 0x2a3550, 0x1f2839);
  grid.position.y = 0.01;
  g.add(grid);

  const wallH = 5, wallMat = flat(COLORS.wall);
  const mkWall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat); m.position.set(x, wallH / 2, z); m.receiveShadow = true; g.add(m); };
  mkWall(halfW * 2 + 1, 1, 0, -halfD - 0.5);
  mkWall(halfW * 2 + 1, 1, 0, halfD + 0.5);
  mkWall(1, halfD * 2 + 1, -halfW - 0.5, 0);
  mkWall(1, halfD * 2 + 1, halfW + 0.5, 0);
  // wall trim glow strip
  const trimMat = new THREE.MeshBasicMaterial({ color: COLORS.accent2 });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 1, 0.08, 0.08), trimMat);
  trim.position.set(0, 2.2, -halfD - 0.02); g.add(trim);
  const trim2 = trim.clone(); trim2.position.z = halfD + 0.02; g.add(trim2);

  // cover blocks
  const blocks = [];
  const n = opts.blockCount ?? rng.int(6, 10);
  const blockMat = flat(COLORS.block);
  for (let i = 0; i < n; i++) {
    const w = rng.int(2, 4), d = rng.int(2, 4), h = rng.pick([1.2, 1.8, 2.6, 3.4]);
    const x = rng.int(-halfW + 3, halfW - 3), z = rng.int(-halfD + 6, halfD - 6);
    if (Math.hypot(x, z) < 5) continue;                                  // keep spawn clear
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.06, d + 0.04), new THREE.MeshBasicMaterial({ color: COLORS.blockTop }));
    cap.position.set(x, h + 0.03, z); g.add(cap);
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
