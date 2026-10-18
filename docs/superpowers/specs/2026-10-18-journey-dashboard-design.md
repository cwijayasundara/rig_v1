# Journey dashboard (a mod)

Allowed by `docs/GOAL.md` Scope 7. Read-only: it shows, it never decides, and no hook calls a model.

## Answer to the open question

The mod API exists in the current Claude Code build (`plugin-authoring` skill, 2.1.302): `ui.render` on `AbovePrompt` draws a band,
`$.ui.status(text)` writes the status line, `$.command.register` adds a zero-token command, `$.session.usage()` returns context
tokens and session cost. A status line alone could show tokens and the next command, but not a multi-row journey, so the band is
the primary surface and the status line is the fallback (narrow terminals, `claude -p`, VS Code).

## What it shows

```
 rig ▸ sprint 0   init ✓ ─ chart ✓ ─ testplan ✓ ─ approve chart-0 ● ─ build ○ ─ pr ○ ─ merge ○
 next: a person runs /rig:approve chart-0          ctx 48k · $1.92 session · sensors ✓
```

- **Journey:** two lines of steps. Outer loop (when a `prd/sprint-<N>.md` exists): init, chart, testplan, approve chart-N, then ready
  intents. Inner loop (active change): start, plan, approve, build, test, pr, review, merge. States: done, current, a person's gate, todo.
- **Next command:** one line, copied from the script, never composed by the mod.
- **Spend:** context tokens and session dollars from `$.session.usage()`; the dollars are the session's, not a ledger we keep.
- **Blockers:** count of blocking sensor findings (from `status --json`), red when above zero.
- **Status line fallback:** `rig · plan · $1.92 · 48k ctx · next /rig:approve demo`.
- **`/rig:map`:** the same data as a pane (journey, spend per step is out of scope: no ledger).

## The gap this spec closes in the script

`sdlc.ts status` knows only the inner loop (`lifecycle.ts` `status`/`nextStep`, per change). It has no state for "initialised, no PRD
yet", "PRD written, not charted", "charted, test plan missing", "chart awaiting approval" or "ready intents". The mod must not infer
these, or lifecycle logic is duplicated (the failure that made the old mod 1,400 lines).

Add `sdlc.ts status --journey --json`, pure functions in `lifecycle.ts` over files that already exist:

| State | Test (files only) | Next |
|---|---|---|
| not initialised | no `.rig/` | `/rig:init` |
| no PRD | `.rig/product/prd/sprint-N.md` absent for the lowest unshipped N | write `prd/sprint-N.md`, then `/rig:chart N` |
| uncharted | PRD present, no intents with that sprint | `/rig:chart N` |
| no test plan | intents present, no test plan | `/rig:testplan N` |
| chart unapproved | `approval.json` for `chart-N` missing or stale | a person runs `/rig:approve chart-N` |
| ready | `ready` lists intents | `/rig:start .rig/product/intents/<slug>.md` |
| an active change | the existing `status`/`nextStep` | unchanged |

Output: `{ loop: 'outer'|'inner'|'none', sprint, steps: [{ id, label, state }], next, blockers }`. A repo with no PRD and one-off
changes shows the inner loop only.

## The mod

One mod folder `hooks/` in this repo, vendored by `vendor --standalone` like the other harness files.

- `register.ts` (target: under 150 lines): on `session.start` register `/rig:map`; on `turn.complete` and `prompt.submit` run
  `sdlc.ts status --journey --json` through `$.process` and store the result in one atom; a `ui.render` hook on `AbovePrompt` reads
  the atom and `$.session.usage()` and draws; `$.ui.status` writes the fallback line.
- It holds no lifecycle logic, no spend ledger, no approval path. It cannot approve: `/rig:approve` stays a human-only skill.
- Bounded cost: one process call per turn, no model call, no files written.
- The user-config option `rig.dashboard` (`band` | `status` | `off`), default `band`.

## Tests

- Script (spec files, no Claude): one test per row of the table above, using a temp repo; `--journey` output is stable JSON.
- Mod: `claude plugin validate` and one `claude plugin test` file that feeds a fixed journey JSON and asserts the band tree and the
  status-line text.
- Eval: none needed to build; judged by use on the shop_app sprint (GOAL Scope 7). Cut it if it adds latency per turn or context.

## Out of scope

Spend per step, budgets and caps, a story-points view, anything that writes state.

## Build order (one change, at most 4 subagent launches)

1. `status --journey` in `lifecycle.ts` and `sdlc.ts`, with its table-driven spec.
2. The mod and its test.
3. Vendoring (`vendor.ts` copies `hooks/`) and the settings wiring, plus a line in the README layout map.
4. One review of `git diff main...HEAD`.
