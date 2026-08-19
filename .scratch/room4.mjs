import * as THREE from "three";
import { rng as makeRng } from "core/rng.js";
import { pickBiome, biomeLayout, biomePalette } from "core/arenas.js";
import { buildArena } from "../src/game/renderer.js";
import { parseSeed } from "core/daily.js";

const seed = parseSeed(process.argv[2]);
const floor = 1, roomIndex = 3;                       // "ROOM 4/5"
const seedRng = makeRng(seed).fork(`room${floor}-${roomIndex}`);
const biomeId = pickBiome(makeRng(seed).fork(`biome${floor}`), floor);
const bl = biomeLayout(seedRng.fork("shape"), biomeId, floor);
const scene = new THREE.Scene();
const arena = buildArena(scene, seedRng.fork("arena"), {
  halfW: bl.halfW, halfD: bl.halfD, blockCount: bl.blockCount,
  palette: biomePalette(biomeId), fogDensity: 0.02,
});
const exit = arena.exitPos, spawn = { x: 0, z: arena.halfD - 4 };
console.log("arena", bl.halfW + "x" + bl.halfD, "exit", exit.x, exit.z.toFixed(1), "spawn", spawn.x, spawn.z);
for (const b of arena.blocks) {
  const nearX = Math.max(Math.abs(exit.x - b.x) - b.w / 2, 0);
  const nearZ = Math.max(Math.abs(exit.z - b.z) - b.d / 2, 0);
  const gap = Math.hypot(nearX, nearZ);
  console.log(`block ${b.w}x${b.d} at (${b.x},${b.z}) — distance to exit centre: ${gap.toFixed(2)}m ${gap < 1.8 ? "  <-- BLOCKS THE TRIGGER" : ""}`);
}
