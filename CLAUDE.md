# Working on rig (this repo)

rig is **not** enabled on its own repo: there is no `.rig/` here and `/rig:*` skills, `sdlc.ts check` and change records are
never run against this tree. superpowers routes the work. These rules replace what rig would otherwise enforce, and they
exist because one week of building this repo cost $1k and 3 hours per change (`docs/proposals/2026-10-08-why-slow-and-the-fix.md`).

## Models, pinned by role

`scripts/routing.ts` was deleted (commit 1f7d519); this table is the only place the roles are pinned. Set `model` on every `Agent` launch.

| Role | Model | Notes |
|---|---|---|
| Coordinator (main thread) | the session's model, never switched mid-session | keep it under 100k context; `/compact` before it passes that |
| Reads: code search, docs lookup, Explore | `haiku` | read-only |
| Writes: implementer, test writer | `sonnet` | one fresh context per independent group of tasks |
| Review of a change's diff | `opus` | only when the person asks for one |
| Chart reviewer (`rig:evaluator`, chart mode) | `opus` | one per chart, after the generators |
| Design of a tier L change | `opus` | only when the person asks for it |

Never run Opus as the coordinator. Never use `SendMessage` to hand a subagent's result back as a new user turn (each one
re-fires every Stop hook); launch agents in the foreground and let the tool result return.

## No review by default

This repo builds the harness; it is not built with rig's process. Plain Claude Code plus superpowers: implement the plan
inline (`superpowers:executing-plans`) or with at most one Sonnet implementer per independent group of files, run
`npm run test:changed`, and stop. The specs that fail without each change are the check. Run a review only when the person asks for one,
and then of the changed lines only (`git diff main...HEAD`, with the hunks' own functions for context), never across the codebase. Target per Spec-2-sized change: at most 3 subagent launches, under 30 minutes.

## Briefs, not transcripts

A subagent brief is at most 60 lines: file paths, the interface, the acceptance test, the verification command.
Never paste the plan or the conversation into it.

Give the exact line ranges to edit (`scripts/check.ts:285-300`), not only file names, so the subagent does not spend its run reading.

Only the unit specs of the changed code run, never the whole suite: `npm run test:changed` (`tests/changed.mjs`) runs typecheck,
size, neutrality, each `scripts/*.spec.ts` that is changed or names a changed file, and the sibling unit test of a changed `eval/` or
`tests/e2e/` file (`eval/foo.mjs` runs `eval/foo.test.mjs`; fake-model unit tests, not the scripted journey); docs only runs nothing. Implementers run it
or the spec files they touch (`node --disable-warning=ExperimentalWarning --test <files>`); the coordinator runs it once per change.
**Never start `npm test`, the e2e tests (`e2e:scripted`, `test:e2e:*`, `e2e`) or any eval (`eval*`) yourself**: a person runs them by
hand. When a change likely needs one (a hook, skill or journey change, or an eval variant), say which, in one line, and stop.

## Verification

`npm test` runs the spec files, the e2e unit tests and the scripted journey (`e2e:scripted`, which also runs the scripted-only Node shop extras). `npm run e2e` is the live journey under a 20 minute hard deadline (two build legs from recorded approved-chart snapshots; `npm run e2e:record` is the one-time hour-plus recording of those snapshots, not a test; Haiku acts, Sonnet inspects; costs money, started by a person; it logs and alerts violations and fixes nothing: decisions go in `tests/e2e/journey/triage.json`), `npm run eval:journey` its eval and `npm run eval` the paired eval runner. `npm run typecheck` is incremental
(`node_modules/.cache/rig-scripts.tsbuildinfo`). Quote the output of what you ran; never report a pass you did not see, and never imply `npm test`, e2e or an eval passed when only `test:changed` ran.

## Plugin scope

Never register the plugin at user scope: always `--scope project`.

## Fix the harness, not what it generated

Fix the harness that created code, not the created code itself. When rig produces wrong output in a target repo
(`shop-app` or any test repo: a stray change, a wrong README block, a bad `sensors.json`, a blocked push), find and fix
the cause in this repo (skill text, script, template), add a spec that fails without the fix, then regenerate the target
by re-running rig there. Never hand-edit the generated files in the target to make them look right, and never bypass a
rig hook (`--no-verify`) to get past one.
