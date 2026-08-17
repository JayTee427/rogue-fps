"""Delegate rogue-fps core units to Laguna against the hidden Vitest suites.

The measured shape from laguna-delegation, Vitest-native:
  - the worker sees the prose spec + ARCHITECTURE's core rules, never the tests
  - on failure it gets its own raw Vitest output back; Claude reads nothing
  - identical failing-test set twice running => escalate (spec defect)
  - a cut-off reply is reported as a LENGTH problem, not a logic problem
  - units run concurrently

Isolation: each attempt is written to src/core/<unit>.js in a private copy of
the repo's src/ tree, and Vitest is pointed at that copy via a temp vite config
alias. Units therefore never see or clobber each other's drafts, and a unit that
imports a sibling (draft imports items, rng) resolves against the ACCEPTED
version of that sibling once one exists, else the reference — so dependency
order does not gate concurrency.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

logging.getLogger("httpx").setLevel(logging.WARNING)
sys.path.insert(0, r"D:\Claude\laguna-mcp")
import httpx
from laguna_mcp import _chat

ROOT = Path(__file__).parent.parent
HIDDEN = ROOT / "tests" / "hidden"
REF = ROOT / "delegation" / "reference"
ACCEPTED = ROOT / "delegation" / "accepted"
NODE_BIN = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs"
NPX = str(NODE_BIN / "npx.cmd")

MAX_TOKENS = 7000

CORE_RULES = """Rules for every module in src/core (these are enforced by tests):
- Pure ES module (`export function`, `export const`). No `three`, no DOM, no
  `window`, no timers, no I/O, no `Math.random`.
- All randomness comes from the `rng` argument you are given: an object with
  `next()` in [0,1), `int(lo,hi)` inclusive, `pick(arr)`, `chance(p)`,
  `shuffle(arr)` (returns a copy), and `fork(label)`.
- Deterministic: same inputs and same rng seed => identical output.
- Data in, data out: plain objects/arrays. Never mutate an argument.
- Import siblings by their alias path, e.g. `import { ITEMS } from "core/items.js"`.
- Import NOTHING you do not actually use, and never import the rng: it arrives as an
  argument. `import { RNG } from "core/rng.js"` is wrong twice over — the export is
  `rng`, not `RNG`, and you do not need it. Vitest tolerates a bad named import; the
  browser refuses to load the module. Three delegated modules have shipped this exact
  line.
- Keep it under about 200 lines. One sharp implementation, not exhaustive
  variants. A file that runs on gets cut off before it ends and cannot parse."""

TASK = """Implement ONE JavaScript ES module for a browser roguelike FPS: `src/core/{unit}.js`.

{rules}

Specification for this module:

{spec}

Output ONLY the JavaScript source of the module. No prose, no markdown fences."""

REPAIR = """{task}

---

Your previous attempt:
```javascript
{previous}
```

{feedback}

Output ONLY the corrected JavaScript source of the full module. No fences, no prose."""

CUTOFF = ("Your reply was CUT OFF before the module ended — it ran past the output "
          "limit, so the file is incomplete and cannot even be parsed. This is a "
          "LENGTH problem, not a logic problem. Rewrite it MUCH shorter and finish it.")


def strip_fences(text: str) -> str:
    t = text.strip()
    first = re.search(r"```(?:javascript|js)?[ \t]*\r?\n", t)
    if not first:
        return t
    tail = t[first.end():]
    return tail[:tail.rfind("```")].strip() if t.endswith("```") else tail.strip()


def trim_vitest(output: str, limit: int = 45) -> str:
    """Keep failing test names, assertion diffs, and the summary — drop the noise."""
    keep, grab = [], 0
    for line in output.splitlines():
        s = line.strip()
        if s.startswith(("FAIL", "×", "✗", "AssertionError", "TypeError", "ReferenceError", "SyntaxError", "Error:")) \
           or s.startswith(("- Expected", "+ Received", "Expected", "Received")) \
           or re.match(r"^(Test Files|Tests)\s", s) or "expected" in s:
            keep.append(line.rstrip()); grab = 3
        elif grab > 0 and s:
            keep.append(line.rstrip()); grab -= 1
    return "\n".join((keep or output.strip().splitlines())[:limit])


def failure_signature(output: str) -> str:
    names = re.findall(r"^\s*(?:FAIL|×|✗)\s+(\S+ > .+?)\s*$", output, re.M)
    if not names:
        names = re.findall(r"^\s*(?:FAIL|×|✗)\s+(.+?)$", output, re.M)
    return "|".join(sorted(set(names)))


def sibling_source(name: str) -> Path | None:
    """The best available version of a sibling module: accepted > reference."""
    a = ACCEPTED / f"{name}.js"
    if a.exists():
        return a
    r = REF / f"{name}_ref.js"
    return r if r.exists() else None


SCRATCH = ROOT / "delegation" / ".scratch"   # inside the repo, so vitest resolves node_modules


def run_vitest(unit: str, draft_code: str) -> tuple[bool, str]:
    """Run tests/hidden/<unit>.test.js against a private src tree holding the draft.

    The temp tree MUST live inside the repo: the generated vitest.config.js does
    `import "vitest/config"`, and Node resolves that by walking up from the config
    file's own directory. A temp dir on another drive never finds node_modules
    and every unit "fails" with an empty summary — which is exactly what happened
    on the first dispatch, and it looked like six bad drafts.
    """
    SCRATCH.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"{unit}_", dir=str(SCRATCH)) as td:
        tdp = Path(td)
        core = tdp / "core"
        core.mkdir()
        # Populate every known core module from accepted/reference so imports resolve,
        # then overwrite this unit with the draft.
        names = {p.stem.replace("_ref", "") for p in REF.glob("*_ref.js")} | {p.stem for p in ACCEPTED.glob("*.js")}
        for n in names:
            src = sibling_source(n)
            if src:
                text = src.read_text(encoding="utf-8").replace("_ref.js", ".js")
                (core / f"{n}.js").write_text(text, encoding="utf-8")
        (core / f"{unit}.js").write_text(draft_code, encoding="utf-8")

        cfg = tdp / "vitest.config.js"
        cfg.write_text(f"""
import {{ defineConfig }} from "vitest/config";
export default defineConfig({{
  resolve: {{ alias: {{ core: {json.dumps(str(core).replace(chr(92), '/'))} }} }},
  test: {{ environment: "node", include: [{json.dumps(str(HIDDEN / f'{unit}.test.js').replace(chr(92), '/'))}] }},
}});
""", encoding="utf-8")
        env = dict(os.environ)
        env["PATH"] = str(NODE_BIN) + os.pathsep + env.get("PATH", "")
        try:
            # Vitest prints ✓ × ⎯ etc. On Windows, text=True decodes as cp1252 and
            # raises UnicodeDecodeError inside the reader thread — the call then
            # returns garbage or hangs. Decode UTF-8 ourselves, leniently.
            p = subprocess.run(
                [NPX, "vitest", "run", "--config", str(cfg), "--reporter=verbose", "--no-color"],
                capture_output=True, timeout=240, env=env, cwd=str(ROOT),
            )
        except subprocess.TimeoutExpired:
            return False, "TIMEOUT after 240s"
        out = p.stdout.decode("utf-8", errors="replace") + p.stderr.decode("utf-8", errors="replace")
        return p.returncode == 0, out


async def run_unit(client, unit: dict, out_root: Path, sem, attempts_max: int) -> dict:
    uid = unit["id"]
    out_dir = out_root / uid
    out_dir.mkdir(parents=True, exist_ok=True)
    task = TASK.format(unit=uid, rules=CORE_RULES, spec=unit["spec"])
    prompt, history, last_sig, t_unit = task, [], None, time.time()

    for attempt in range(1, attempts_max + 1):
        async with sem:
            t0 = time.time()
            reply = await _chat(client, [{"role": "user", "content": prompt}],
                                max_tokens=MAX_TOKENS, temperature=0.0, thinking=True)
            secs = time.time() - t0
        code = strip_fences(reply.content)
        (out_dir / f"attempt{attempt}.js").write_text(code, encoding="utf-8")

        if reply.error or not code.strip():
            why = reply.error or ("starved" if reply.starved else "empty reply")
            history.append({"attempt": attempt, "error": why})
            if reply.starved and attempt < attempts_max:
                async with sem:
                    reply = await _chat(client, [{"role": "user", "content": prompt}],
                                        max_tokens=MAX_TOKENS, temperature=0.0, thinking=False)
                code = strip_fences(reply.content)
                if not code.strip():
                    break
                (out_dir / f"attempt{attempt}.js").write_text(code, encoding="utf-8")
                history[-1]["retried_without_thinking"] = True
            else:
                break

        ok, output = await asyncio.to_thread(run_vitest, uid, code)
        summary = next((l.strip() for l in output.splitlines() if re.match(r"^\s*Tests\s", l)), "").strip()
        rec = {"attempt": attempt, "secs": round(secs, 1), "gen_tokens": reply.completion_tokens,
               "truncated": reply.truncated, "passed": ok, "summary": summary}
        history.append(rec)
        print(f"    {uid:10} attempt{attempt}: {'PASS' if ok else 'fail'} {summary} ({secs:.0f}s)", flush=True)
        if ok:
            ACCEPTED.mkdir(exist_ok=True)
            (ACCEPTED / f"{uid}.js").write_text(code, encoding="utf-8")
            break

        sig = failure_signature(output)
        if sig and sig == last_sig:
            rec["escalated"] = "identical failure twice — spec defect"
            break
        last_sig = sig
        feedback = CUTOFF if reply.truncated else (
            "It was run against the hidden test suite with Vitest and FAILED:\n```\n"
            + trim_vitest(output) + "\n```\nWork out from these failures what is wrong "
            "and fix it. Keep everything that already passes.")
        prompt = REPAIR.format(task=task, previous=code, feedback=feedback)

    final = history[-1] if history else {}
    return {"unit": uid, "attempts": len(history), "accepted": bool(final.get("passed")),
            "escalated": final.get("escalated"), "final": final.get("summary", final.get("error", "")),
            "wall_secs": round(time.time() - t_unit, 1),
            "gen_tokens": sum(h.get("gen_tokens", 0) for h in history), "history": history}


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--attempts", type=int, default=5)
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()

    cfg = json.loads((ROOT / "delegation" / "units.json").read_text(encoding="utf-8"))
    units = [u for u in cfg["units"] if not args.only or u["id"] in args.only]
    # Only dispatch units whose hidden suite exists — no test, no delegation.
    units = [u for u in units if (HIDDEN / f"{u['id']}.test.js").exists()]
    out_root = ROOT / "delegation" / "out"
    sem = asyncio.Semaphore(args.concurrency)

    print(f"dispatching {len(units)} units: {[u['id'] for u in units]}\n")
    t0 = time.time()
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(*[run_unit(client, u, out_root, sem, args.attempts) for u in units])
    wall = time.time() - t0

    out_root.mkdir(parents=True, exist_ok=True)
    (out_root / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\n{'unit':12} {'att':>4} {'accepted':>9} {'final':>28} {'wall':>7}")
    print("-" * 66)
    for r in results:
        flag = "  ESCALATE" if r.get("escalated") else ""
        print(f"{r['unit']:12} {r['attempts']:>4} {str(r['accepted']):>9} {r['final'][:28]:>28} {r['wall_secs']:>6.0f}s{flag}")
    print("-" * 66)
    print(f"accepted {sum(r['accepted'] for r in results)}/{len(results)}  "
          f"first-try {sum(1 for r in results if r['accepted'] and r['attempts'] == 1)}  "
          f"wall {wall/60:.1f} min  Laguna tokens {sum(r['gen_tokens'] for r in results):,}")


if __name__ == "__main__":
    asyncio.run(main())
