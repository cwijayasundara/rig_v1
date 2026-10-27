# shop_app cart-storage gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Rules from CLAUDE.md apply: fix the harness here, add a spec that fails without the fix, regenerate shop_app by re-running rig there, never hand-edit shop_app, one review of `git diff main...HEAD` at the end.

**Goal:** Close the 16 gaps a read-only review found in shop_app after sprint 1 / cart-storage reached the PR stage, by fixing the rig_v1 piece that caused each.

**Source:** review of `/Users/chamindawijayasundara/Documents/learning_101/shop_app` (2026-10-27). Findings are numbered as in that report. Nothing in it has been reproduced here yet: **each task starts by reproducing its finding in a failing spec**, and drops the task if the cause is not what is written below.

**Tech stack:** Node 22 TypeScript, `node --test`. Verify with `npm run typecheck` and `npm test`.

## Order and grouping

Four waves, one branch each, one review each (CLAUDE.md: at most 4 subagent launches per wave). Wave A first: it is the approval gate.

| Wave | Findings | Theme | Main files |
|---|---|---|---|
| A | 1, 2 | The approval gate holds | `scripts/hooks.ts`, `scripts/lifecycle.ts`, `scripts/protect.ts`, `skills/pr/SKILL.md`, `skills/build/SKILL.md` |
| B | 3, 4, 8 | Sensors that really run | `scripts/arch.ts`, `scripts/contracts.ts`, `scripts/stackinit.ts`, `templates/stacks/python.json`, `skills/chart/SKILL.md`, `skills/init/SKILL.md` |
| C | 5, 6, 7, 9 | What `pr` commits and says | `scripts/pr.ts`, `scripts/prbody.ts`, `scripts/plan.ts`, `scripts/wiki*.ts`, `scripts/runs.ts` |
| D | 10-16 | Docs, tests data, naming | `skills/pr/SKILL.md`, `skills/learn`, templates, `scripts/testkit.ts`, `scripts/stackpacks.ts` |

## Wave A: the approval gate holds

### Task A1 (finding 1): no build edits before approval
Evidence: shop_app `.rig/changes/cart-storage/evidence/runs.jsonl` has red/green runs 12:21-12:25; `approval.json` stamped 12:28.
- [ ] Read how `S activate` and the `protect.ts` hooks guard edits; find whether any guard refuses edits to plan-scoped files when `approval.json` is absent. Record the answer in the spec's header comment.
- [ ] Write a failing spec in `scripts/lifecycle.spec.ts` (or `protect` spec): an active change with no `approval.json` -> an Edit/Write to a file listed in `plan.md` is denied with a message naming `/rig:approve`; with `approval.json` it is allowed.
- [ ] Implement the guard in `scripts/protect.ts` (the same place that denies frozen contract edits). The `/rig:build` skill must also run `S status` first and stop when the change is not approved (`skills/build/SKILL.md`, one sentence).
- [ ] Add a `verify` check: `verify.json` is refused (`S pr` refuses) when `approval.json` is newer than the first `runs.jsonl` entry for the change. Spec first. This catches a bypass of the hook.

### Task A2 (finding 2): spec drift after approval
Evidence: security fix after approval changed `load` to catch `ValueError`/`RecursionError`; `spec.md` B7, `plan.md` unchanged; hashes in `approval.json` match the old spec.
- [ ] Decide the rule (needs the person): either (a) a review-fix that changes behaviour must append a dated `## Amendments` section to `spec.md` and the amendment is shown in the PR body, no re-approval; or (b) it re-approves. Recommend (a): re-approval after every fix wave would add a person stop that CLAUDE.md "auto inner loop" removed.
- [ ] Spec: `S pr` refuses (or warns, per the decision) when `review.md` lists a fixed finding tagged `behaviour` and `spec.md` has no `## Amendments` entry for it.
- [ ] `skills/pr/SKILL.md` step 4: after a fix wave, for each fixed finding that changes behaviour, append the amendment to `spec.md` and the one-line to `plan.md`. `templates/review-brief.md`: reviewer tags a finding `behaviour` when the fix changes observable behaviour.
- [ ] `prbody.ts` prints the amendments under the spec summary.

## Wave B: sensors that really run

### Task B1 (finding 3): contracts never registered
Evidence: `sensors.json` `contracts: {covers: [], files: [], ...}`; `approval.json` `contracts: {}`; the intent's `## Interfaces` names `docs/contracts/cart-file.schema.json`.
- [ ] Find where `contracts` is first written (`scripts/contracts.ts`, `scripts/stackinit.ts`, `skills/chart/SKILL.md`). Reproduce with the `testkit` fixture: an intent whose `## Interfaces` names a file under `docs/contracts/` leaves `contracts.files` empty.
- [ ] Spec: after chart (or at `approve`), every path an approved intent's `## Interfaces` names under a contracts directory is in `sensors.json` `contracts.files`; `approve` records its hash in `approval.json`.
- [ ] Implement in the cheaper place: `approve` computes the set from the plan's `## Contracts` plus the intent interfaces; chart skill text states the one rule. Do not add a new command.

### Task B2 (finding 4): `layers` is a silent no-op
Evidence: python layers command is `if [ -f .rig/gen/importlinter.ini ]; ...`; `.rig/gen/` absent; `arch.ts:116` generates it only from `sdlc arch approve`.
- [ ] Spec: with an `architecture.md ## Layers` and no `.rig/gen/importlinter.ini`, the `layers` sensor returns a **warn** finding ("layers not enforced: run /rig:arch approve"), not a pass. With neither file, it stays silent (nothing to enforce).
- [ ] Spec: `chart` (which accepts the architecture ADRs) tells the person to run `/rig:arch` when `## Layers` exists and the ini does not; journey `next` shows it.
- [ ] Implement in `scripts/sensors.ts` (the layers cmd wrapper) and `templates/layers/python.json`. Check import-linter is installed in the target; if not, the sensor reports "not installed", not a pass.

### Task B3 (finding 8): `pip-audit` audits the machine
Evidence: `templates/stacks/python.json:12` `"cmd": "pip-audit"`; shop_app `dependencies = []`; output lists unrelated global packages and is committed in `runs.jsonl`.
- [ ] Spec in `scripts/stackpacks.spec.ts`: the audit command is project-scoped (`pip-audit -r requirements.txt` when present, else `pip-audit --path .venv/lib/*/site-packages` when a venv exists, else the sensor is skipped with a one-line reason). Verify the flags against `pip-audit --help` before writing.
- [ ] Spec: a skipped sensor writes no output to `runs.jsonl`.

## Wave C: what `pr` commits and says

### Task C1 (finding 7): harness evidence in the change commit
Evidence: `dbaef8d` bundles 27 files incl. `evidence/runs.jsonl` (absolute home/tmp paths), `.rig/wiki/*`, `wiki/state.json`, both `pr-body.md` and `pr-outline.md`; 1222 lines trips the 400-line risk limit.
- [ ] Read `scripts/pr.ts` staging. Decide which of these are product (wiki pages: yes, CLAUDE.md says `S pr` ships them) and which are not (`evidence/`, `wiki/state.json`, `pr-outline.md`).
- [ ] Spec: `evidence/` and `.rig/wiki/state.json` are in the change's `.gitignore` template (`templates/` -> `.rig/.gitignore`); `pr-outline.md` is not written when `pr-body.md` is (or one is derived from the other, not both stored).
- [ ] `risk.ts`: spec that generated paths (`.rig/wiki/**`, `.rig/changes/**`) do not count towards `maxLines`. Check the risk-tier spec first: if it already excludes them, the shop_app run used an older version and this reduces to `/rig:upgrade`.
- [ ] `runs.ts`: store repo-relative paths; spec that no entry contains the home directory.

### Task C2 (finding 5): sprint plan left dirty, "done" before merge
- [ ] Find what rewrites `.rig/product/sprints/<n>/plan.md` (`scripts/plan.ts` / `sync.ts`) and when relative to the commit in `pr.ts`.
- [ ] Spec: after `S pr`, `git status --porcelain` is clean for rig-owned files (stage the regenerated plan in the same commit, or regenerate before staging).
- [ ] Spec: a change whose `pr.md` is `local-only`/unmerged shows as `in review`, not `done`, in the sprint plan and the journey. `done` = merged.

### Task C3 (finding 6): wiki dead link and wrong stamp
- [ ] Reproduce with `wikivalidate.ts`: an `index.md` link whose target is not in `.rig/wiki/` is a validation warning today? The report says `wiki.json` lists `testing-guide.md` but the file is missing. Spec: the sync step either builds the page or removes the entry, and `wikivalidate` fails on a dead link.
- [ ] Stamp: pages describing uncommitted code must say so. Spec: `wikistate` stamps the commit that contains the cited code (stamp after the commit, in the same `pr` run) or `uncommitted`. Check the existing hash check design in memory `code-wiki-design` before changing the stamp rule.
- [ ] The report also said `wiki check` does not exist: confirm which subcommand the docs name and fix whichever side is wrong.

### Task C4 (finding 9): PR body wrong
- [ ] "Blast radius: none recorded": `prbody.ts:29` reads `bullets(section(spec,'Blast radius'))`. Reproduce with shop_app's `spec.md`; likely the section is a table or numbered list, not `-` bullets. Spec with that exact shape. Parse bullets, numbered items and table rows.
- [ ] Revert text: `prbody.ts:23` always says `git revert -m 1`. Spec: when the change is a plain commit on the base branch (no merge), say `git revert <sha>`; when local-only, say so.
- [ ] `pr.md` `state: local-only` with `branch` equal to the base's tip: spec that `S pr` without a remote does not report a PR branch distinct from main, or creates the branch before committing.

## Wave D: docs, tests data, naming (batch, lower priority)

- [~] **10 stale `CLAUDE.md` Map/Planned:** the `pr`/`learn` flow refreshes the hand-written Map from the diff, or flags it. Smallest: the PR body lists "CLAUDE.md Map lists these paths as planned but they now exist". Decide with the person before generating text into a hand-written section. Also fix the README template claim `.rig/.gitignore` "never committed".
- [ ] **11 whitespace-only sku/name:** a chart decision, not a harness bug. Surface it: the conversion/chart review's `Deferred` list must reach the person at approve, with each item decided or accepted. Spec in `chartcheck.ts`: an approve with undecided Deferred items warns.
- [ ] **12 tests read `.rig/.../testplan/data`:** `testplan` skill and `testkit` copy the data into `tests/data` and the tests reference that. Spec first; also grep other stacks' templates.
- [ ] **13 review.md fixed and deferred twin:** spec in `reviewcases.ts` that one finding cannot appear under both.
- [ ] **14 sdlc vs rig naming, superpowers spec committed:** grep generated templates for `sdlc`; user-facing text says `rig`, internal branch prefix `sdlc/` decided separately. `docs/superpowers/` should not be written into a target repo: find what wrote `2026-10-27-sprint-1-design.md` (probably a brainstorming step in chart/init) and stop it.
- [ ] **15 intent scope list lost:** reproduce which step rewrote the change `intent.md`; spec that the scope list is kept.
- [ ] **16 Makefile has no `types`:** python stack pack generates the Makefile; add `types` (`mypy .`) or change the docs text. Spec in `stackpacks.spec.ts`.

## Verification and finish

- [ ] After each wave: `npm run typecheck`, `npm test`; quote the output.
- [ ] One review per wave: `git diff main...HEAD` with a Sonnet reviewer (tier S/M).
- [ ] Regenerate: `/rig:upgrade` in shop_app, then re-run the affected steps there (do not edit shop_app by hand). cart-storage is already past PR, so check the fixes on **cart-model** (next change) rather than rewriting history.
- [ ] Add an e2e scripted case to `tests/e2e` for wave A (edit before approval is denied) and wave C (clean tree after `pr`).
- [ ] End by listing each of the 16 findings as done (hash), not reproduced, or deferred.

## Open decisions for the person

1. A2: amendments without re-approval (recommended), or re-approve after a behaviour-changing fix?
2. C1: do wiki pages ship in the change commit (CLAUDE.md says yes) or in their own commit?
3. D14: keep the `sdlc/` branch prefix, or rename to `rig/`?
