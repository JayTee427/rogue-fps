# Architecture — built for delegation

The whole codebase is split along one line, and the line is not "frontend/
backend" or "systems/content". It is:

> **Can this be verified by running a test with no browser?**

Everything on the *yes* side is pure logic, lives in `src/core/`, and is
delegated to Laguna behind a hidden Vitest suite. Everything on the *no* side —
rendering, input, audio, the game loop that ties it together — lives in
`src/game/` and is written by Claude.

This is not an aesthetic preference. It is the measured condition under which
delegation pays: when a draft can be graded by running it, Claude never reads a
passing one and the per-unit cost collapses to a spec plus a summary line. When
correctness can only be judged by looking, Claude is back in the loop and the
economics invert. So the architecture makes as much of the game as possible
gradable by a test.

## The rule for `src/core/`

- **Pure ES modules.** No `three`, no DOM, no `window`, no timers, no I/O.
- **Deterministic.** Any randomness comes in through an injected `rng` argument
  (a `() => number` in [0,1)), never from `Math.random`. Same seed, same result.
- **Data in, data out.** Plain objects and arrays. No classes with hidden state
  unless the state is the whole point (the RNG itself, a run object).
- **One responsibility per module.** Each module is one delegable unit with one
  hidden test file.

`src/game/` may import from `src/core/`. `src/core/` never imports from
`src/game/`. A lint rule enforces this.

## The units in `src/core/` (delegated)

| Module | Contract, in one line | Tests pin |
| --- | --- | --- |
| `rng.js` | seeded PRNG (mulberry32), `rng(seed)` → `{next(), int(a,b), pick(arr), shuffle(arr), chance(p), fork(label)}` | determinism, distribution sanity, fork independence |
| `items.js` | the catalog: 55 item defs `{id, name, rarity, tags, requires, stacks, effects}` + `queryItems(filter)` | count ≥ 55, every rarity present, `requires` refers to real ids, ids unique |
| `stats.js` | `computeStats(base, heldItems)` → resolved player/weapon stats; additive within a stat, multiplicative across | stacking maths on known inputs, caps, order independence |
| `draft.js` | `draftRewards(rng, run, n)` → n items respecting rarity weights, floor depth, `requires`, no-dupes-unless-stacks, curse opt-in | every rule in DESIGN.md's interaction promises |
| `weapons.js` | archetype table + `rollWeapon(rng, archetype, floor)` → weapon with rarity + 1–3 mods; `applyMods` | base stats match DESIGN, mod counts by rarity, ±10% jitter bounds |
| `floor.js` | `generateFloor(rng, floorIndex, run)` → 5 rooms + boss, each room `{modifier, hazardTag, eliteCount, doors[]}` | room count, door previews truthful, boss present, elite curve |
| `enemies.js` | archetype table + `scaleEnemy(archetype, floor, roomIndex)` + `rollAffix(rng, floor)` | scaling curve monotone, affix pool by depth |
| `combat.js` | `resolveHit(shot, target, stats)` → damage, crit, statuses applied; `tickStatuses(target, dt)` | crit maths, Executioner threshold, ignite stacking, slow cap |
| `statuses.js` | status-effect definitions and stacking rules (burn, slow, shield, overshield decay) | stacking/refresh semantics, decay maths |
| `run.js` | `newRun(seed, opts)`, `advance(run, choice)`, `applyReward`, `extract`, `die` — the run state machine | legal transitions, banking maths, The Loop and Second Wind semantics |
| `daily.js` | `dailySeed(date)` → deterministic seed for a calendar day; `formatSeed`, `parseSeed` | same day same seed, distinct days distinct, round-trip |
| `score.js` | `scoreRun(run)` → number, with breakdown; style bonuses | monotone in depth/kills, bonus rules |
| `assist.js` | `aimAssist(aimDir, targets, strength)` → adjusted dir; pure vector maths for touch magnetism | cone limits, strength 0 is identity, nearest-in-cone wins |
| `quality.js` | `pickQualityTier(benchmarkMs, deviceHints)` → tier `{res, shadows, particles}` | thresholds, monotone |

Fourteen units. Each is small, stateless from the outside, and gradable.

## What Claude owns (`src/game/`)

- `main.js` — boot, quality tier, mode select, the loop
- `renderer.js` — Three.js scene, arena builder from `floor` data, materials
- `player.js` — pointer-lock FPS controller, dash, jump, slide, using `stats`
- `touch.js` — virtual joystick, look-drag, fire/dash/reload buttons, `assist`
- `weaponView.js` — viewmodel, muzzle flash, recoil, reload anim
- `enemyView.js` — meshes, tells, AI steering (behaviour is thin; numbers from `core`)
- `hud.js` — HP, ammo, items, floor/room, draft screen, death/extract screens
- `audio.js` — WebAudio synth, no assets
- `fx.js` — hitstop, screen kick, particles, damage numbers

These are integration and feel. They cannot be graded by a test, so they are
not delegated — but they consume `core` through narrow interfaces, so the
surface area Claude has to get right is the wiring, not the rules.

## Delegation protocol

1. Claude writes `DESIGN.md` (done) and this file.
2. Claude writes the **hidden Vitest suite** for each core unit, in
   `tests/hidden/`, and a throwaway reference implementation to prove every
   suite is satisfiable. The suite is the spec made executable.
3. Claude writes each unit's **prose spec** — the paragraph the worker sees.
4. `delegate.py` (from the `laguna-spark` skill) dispatches all fourteen units
   concurrently. Each unit gets its spec and its own failing test output; the
   worker never sees the tests. Up to 5 self-repair attempts; identical failure
   twice escalates.
5. Claude reads one summary table, writes the escalated residue, and wires
   `src/game/` around the result.

Cross-module behaviour (does `draft` respect what `run` holds? does `combat`
use `stats` correctly?) is Claude's, exercised by a small integration suite in
`tests/integration/`.

## Toolchain

- **Vite** for dev server and static build.
- **Vitest** for `core` and integration tests (Node, no browser).
- **Three.js** for rendering.
- **Vercel** static deploy of `dist/`, `vercel.json` with SPA rewrite.
- No TypeScript for v1 — JSDoc types on the `core` interfaces instead, so
  the delegated units stay plain ES modules that the worker can write without
  a type-checker in the loop.

## Layout

```
rogue-fps/
├── DESIGN.md              the promises
├── ARCHITECTURE.md        this file
├── index.html
├── vite.config.js
├── vercel.json
├── package.json
├── src/
│   ├── core/              PURE — delegated
│   └── game/              Three.js shell — Claude
├── tests/
│   ├── hidden/            one spec per core unit; the worker never sees these
│   └── integration/       cross-module, Claude
└── delegation/
    ├── units.json         specs handed to delegate.py
    └── out/               attempts + results.json
```
