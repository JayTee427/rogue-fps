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
- **6 enemy archetypes**, each with a silhouette and a telegraph; **7 elite
  affixes**; **3 bosses** with random affixes.
- **Seeded runs.** Same seed, same station. Daily seed shared worldwide (UTC).
  Seeds are 8-char shareable codes.
- **5 room modifiers** (low gravity, darkness, swarm, no-dash, countdown),
  hazard tags, truthful door previews, elite placement scaling with depth.
- **The greed loop:** every 5 rooms a boss, then extract-and-bank or go deeper
  for a depth multiplier. Style bonuses (Untouchable, Hoarder, Cursed, …).
- **Second Wind** and **The Loop** — legendaries that change what death means.
- Quality tiers picked from a startup benchmark; mobile capped at medium.
- Synthesised audio, no assets. One static bundle, ~150 KB gzipped.

The design bible is [DESIGN.md](DESIGN.md).

## How it was built — and why the code is shaped this way

This project is also an experiment in **AI-to-AI delegation**, and the
architecture is a direct consequence. See [ARCHITECTURE.md](ARCHITECTURE.md).

The codebase is split along one line: *can this be verified by a test with no
browser?*

- **`src/core/`** — 13 pure ES modules (RNG, items, stats, draft, weapons,
  floor, enemies, combat, run state machine, score, daily seed, aim assist,
  quality). **Every one was written by Laguna S 2.1**, a 118B local model on a
  DGX Spark, against a hidden Vitest suite it never saw. Claude (Opus) wrote the
  design, the specs, and the 223 hidden tests; validated every suite against a
  throwaway reference first; and dispatched the units concurrently with a
  self-repair loop that fed each failure's raw test output back to the worker.
- **`src/game/`** — the Three.js shell: renderer, FPS controller, touch input,
  weapon viewmodel, enemy AI/visuals, HUD, and the loop. Written by Claude,
  because feel cannot be graded by a test.

Delegation results, all three waves: **13/13 accepted**, 9 on the first
attempt, 3 self-repaired without Claude reading a draft, 1 escalated — on a
defect in Claude's own test. Roughly 14 minutes of wall time. Claude's judgment
was spent on the seams between modules, where no single unit's suite could see:
a stats-contract gap that collapsed drafts to legendaries only, and a one-token
`ITEMS[id]`/`ITEM_BY_ID[id]` slip that silently disabled every item. Both are
now pinned by integration tests.

Full account in `delegation/` and the `laguna-spark` skill's
`references/orchestration.md`.

## Tests

```bash
npm test                 # 229 tests: 13 hidden suites + 3 integration
npm run test:core        # hidden suites only
```

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

`?dev` in the URL exposes `window.__hs` (`clearRoom()`, `toExit()`, `god()`) so
the loop can be driven from the console. Off by default.
