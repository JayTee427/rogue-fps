# HOLLOW SIGNAL

*A roguelike first-person shooter in the browser. Every run is a different game.*

You are a salvage drone dropped into a derelict station whose rooms rearrange
between visits. Fight through it with a gun that changes every time you find
something. Extract, or go deeper.

**Play it now:** https://rogue-fps-six.vercel.app

**Run it locally:** `npm run dev` → http://localhost:5173. Desktop: WASD, mouse, Shift dash,
Space jump, R reload, click to lock. Phone: left thumb moves, right thumb looks,
buttons for fire / dash / jump / reload, with soft aim assist.

## What's in it

- **76 items** across common / uncommon / rare / legendary / cursed, with
  stacking rules, prerequisites (Chain Reaction needs Shrapnel), and opt-in
  curses. They stack additively within a stat and multiplicatively across.
- **6 weapon archetypes** (sidearm, scattergun, carbine, railgun, launcher, beam)
  with ±10% rolled stats and 18 mods; found weapons roll rarity + 1–3 mods.
- **6 enemy archetypes**, each with a silhouette and a telegraph. The Warden's
  shield has a gap that sweeps up and down, so it is beaten by timing rather than
  only by flanking; Poppers chain-detonate each other; Wisps lay mines.
- **7 elite affixes**, each with a colour-coded ground ring — body detail is
  legible in your face and invisible across the room, and you need to pick the
  dangerous one out of a crowd before it reaches you. Splitting elites really do
  split.
- **3 bosses** with real choreography: `core/bosspatterns.js` picks the next
  attack, never repeats back to back, and escalates across three HP phases. Every
  attack has a visible wind-up and a named telegraph.
- **Seeded runs.** Same seed, same station. Daily seed shared worldwide (UTC).
  Seeds are 8-char shareable codes.
- **5 room modifiers** (low gravity, darkness, swarm, no-dash, countdown),
  hazard tags, truthful door previews, elite placement scaling with depth.
- **The greed loop:** every 5 rooms a boss, then extract-and-bank or go deeper
  for a depth multiplier. Style bonuses (Untouchable, Hoarder, Cursed, …).
- **Second Wind** and **The Loop** — legendaries that change what death means.
- **A director** that paces each room: the roster arrives in waves timed to how
  well you are actually playing, tracked across runs. **Per-room challenges**
  with real payouts.
- **Meta-progression** — totals and unlocks that survive the run.
- **Positional audio.** HRTF panning, a procedurally generated 1.8 s convolution
  reverb, and a low-pass that closes with distance so a far shot is dull rather
  than merely quiet. Every voice is pitch-jittered, so no two shots are identical.
- **Graded rendering** — bloom, then a colour-grade pass: saturation, cool
  shadows against warm highlights, vignette, damage edge-flash, and faint grain.
- Runtime quality governor driven by measured frame times, not a startup CPU spin.
- Synthesised audio, procedural geometry, no assets. One static bundle.

The design bible is [DESIGN.md](DESIGN.md).

## How it was built — and why the code is shaped this way

This project is also an experiment in **AI-to-AI delegation**, and the
architecture is a direct consequence. See [ARCHITECTURE.md](ARCHITECTURE.md).

The codebase is split along one line: *can this be verified by a test with no
browser?*

- **`src/core/`** — 25 pure ES modules (RNG, items, stats, draft, weapons, floor,
  enemies, combat, run state machine, score, daily seed, aim assist, quality,
  particles, shake, damage numbers, hazards, item FX, music, director,
  challenges, meta, boss patterns, set dressing, codex). **Every one was written
  by Laguna S 2.1**, a 118B local model on a DGX Spark, against a hidden Vitest
  suite it never saw. Claude (Opus) wrote the design, the specs, and the hidden
  tests; validated every suite against a throwaway reference first; and
  dispatched the units concurrently with a self-repair loop that fed each
  failure's raw test output back to the worker — never to Claude.
- **`src/game/`** — the Three.js shell: renderer, FPS controller, touch input,
  weapon viewmodel, enemy AI/visuals, HUD, and the loop. Written by Claude,
  because feel cannot be graded by a test.

Delegation results across every wave: **24 modules accepted**, most self-repaired
without Claude ever reading a draft. The measured saving is 588 → 71 tokens per
unit, because the repair loop runs through the machine rather than through Claude.

Every escalation turned out to be a defect in *Claude's* spec, not a failure of
the model: a director that packed eight enemies into one wave (the spec never
said waves must actually be waves), a progress bar that read 0.4 when the player
had already won (the spec never said lower-is-better still means 1), and a file
truncated mid-function (the spec was too long to finish inside the token budget).

Claude's judgment went to the seams, where no single unit's suite can see: a
stats-contract gap that collapsed drafts to legendaries only, a one-token
`ITEMS[id]`/`ITEM_BY_ID[id]` slip that silently disabled every item, and an
`explosionVictims` result read as `v.ref` when it returns `{id, dist, falloff}` —
which threw on every explosion that actually caught something. All pinned by
tests now.

Full account in `delegation/` and the `laguna-spark` skill's
`references/orchestration.md`.

## Tests

```bash
npm test                 # 434 tests: 25 hidden suites + 4 integration
npm run test:core        # hidden suites only
```

One caveat worth knowing: Vitest only covers `src/core`. `src/game` is validated
by `npm run build` and by driving the real page — 434 tests once passed while the
build was broken by a duplicate identifier.

`tests/integration/core-imports.test.js` also enforces the core rules
mechanically: no `three`, no DOM, no `Math.random`, and every named import
between core modules must actually exist (Vitest is lenient about that; the
browser is not).

## Deploy

```bash
npm run build            # → dist/, ~150 KB gzipped
vercel                   # vercel.json has the SPA rewrite and cache headers
```

## Dev hooks

`?dev` in the URL exposes `window.__hs` (`clearRoom()`, `toExit()`, `toBoss()`,
`god()`, and `step(n)`) so the loop can be driven from the console. `step()`
exists because `requestAnimationFrame` is paused whenever the tab is not
compositing, which makes headless verification impossible without it. Off by
default.
