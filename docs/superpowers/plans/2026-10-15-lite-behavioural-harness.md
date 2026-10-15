# Lite Behavioural Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the opt-in `behavioral` block from the spec: frozen contract/example inputs, validate-before-run, and final-vs-continuous cadence, with no new dependency, skill, agent, node or command.

**Architecture:** `model.ts` parses the block; `core.ts` folds behavioural files into the existing approval digest; `verify.ts` runs validate then run through the recorder and reports a `behavioral` level; `check.ts` re-runs them at ship/CI; `slicecheck.ts` runs them per slice only under `continuous`; `sensors.ts` treats removing or changing the commands as weakening the harness.

**Tech Stack:** TypeScript (erasable syntax only), Node `node:test`, existing `sdlc.ts` CLI and testkit.

**Spec:** [docs/superpowers/specs/2026-10-15-lite-behavioural-harness-design.md](/Users/chamindawijayasundara/Documents/learning_101/rig_v1/docs/superpowers/specs/2026-10-15-lite-behavioural-harness-design.md)

## Global Constraints

- Opt-in: no `behavioral` block means byte-identical behaviour (existing tests pass unmodified).
- No new dependency, skill, agent, workflow, ratchet node, CLI command or script file.
- Zero tokens: deterministic script work only.
- Lite cap: ≤ 250 production lines, ≤ 250 test lines; stop and cut scope past that.
- Every task: test first, watch it fail, then implement. No commits unless the user asks.

## Review Focus

- A behavioural file edited after approval must stale the gate, including a newly added file.
- `validate` failing must prevent `run` from executing at all (proved by a side-effect file).
- A failing `run` at CI/ship must block even when `verify` was never run locally.
- `continuous` must not run at tier L slices or on slices touching no contract/behavioural file.
- Removing `behavioral` or changing its commands in a PR must read as weakening the harness.

---

### Task 1: Config block and sensor name

**Files:** Modify `scripts/model.ts`; Test `scripts/check.spec.ts` (config cases live there) or `scripts/model.spec.ts` if present, else `scripts/check.spec.ts`.

**Interfaces:** Produces `BehavioralConfig = { validate?: string; run?: string; files: string[]; cadence: 'final' | 'continuous' }`, `SensorConfig.behavioral: BehavioralConfig | null` (default `null`), and `'behavioral'` in `SENSOR_NAMES`.

- [ ] Write failing tests: valid block parses; bad `cadence`, non-string commands, empty block (neither command) each produce a `config` error naming `behavioral`.
- [ ] Run the spec file, confirm the new tests fail.
- [ ] Implement parsing next to the `githooks` block in `parseConfig`; add `'behavioral'` to `DEFAULT_CONFIG` (as `null`) so the unknown-key check accepts it.
- [ ] Run the spec file, confirm green.

### Task 2: Frozen inputs in the approval digest

**Files:** Modify `scripts/core.ts`; Test `scripts/gate.spec.ts`.

**Interfaces:** Produces `behavioralFiles(slug): string[]` (sorted repo-relative paths: files under `.rig/changes/<slug>/behavioral/**` plus files matched by `behavioral.files` globs, read raw from `.rig/sensors.json` so `core.ts` gains no import cycle). `approvalDigest` appends their sorted `path\ncontent\n` hash for `spec`/`plan`/`design` gates only when the list is non-empty.

- [ ] Write failing tests: approving a design, then editing and then adding a behavioural file, each make `approvalOf` return `stale`; editing an unrelated file does not.
- [ ] Run, confirm fail; implement; run, confirm green. Confirm the no-behavioural digest is unchanged (existing gate tests unmodified).

### Task 3: Validate-then-run at verify, re-run at ship/CI

**Files:** Modify `scripts/verify.ts`, `scripts/check.ts`, `scripts/sensors.ts` (`weakensConfig`); Test `scripts/verify.spec.ts`, `scripts/check.spec.ts`.

**Interfaces:** `verify` runs `validate` (recorded) and, only if it exits 0, `run` (recorded); `writeReport` appends a `behavioral` level row derived from the latest recorded exits. `runChecks` at `ship`/`ci` points executes both commands directly and emits a `behavioral` block finding on non-zero exit. `weakensConfig` reports `behavioral removed` / `behavioral.<key> changed`.

- [ ] Write failing tests: validate-fail leaves no side-effect file from `run` and fails verification; run-fail fails verification with its exit code; `check --at ci` blocks on a failing `run`; removing the block in a diff weakens the config.
- [ ] Run, confirm fail; implement; run, confirm green.

### Task 4: Continuous cadence at slice record

**Files:** Modify `scripts/slicecheck.ts`; Test `scripts/slicecheck.spec.ts`.

**Interfaces:** In `checkSlice`, when `config.behavioral?.cadence === 'continuous'` and the branch diff touches a `behavioral.files` or `contracts` glob, run `run` (after `validate` if declared); a non-zero exit returns `{ ok: false, why: 'behavioral …' }`.

- [ ] Write failing tests: continuous + contract-touching slice + failing run refuses; final cadence does not run it; continuous + untouched contracts does not run it.
- [ ] Run, confirm fail; implement; run, confirm green.

### Task 5: Skill and guide lines, docs

**Files:** Modify `skills/design/SKILL.md`, `skills/test/SKILL.md`, `guides/contracts.md`, `DESIGN.md` (one row), `CHANGELOG.md` (Unreleased entry).

- [ ] Add the three one-line rules from spec §4 and a DESIGN/CHANGELOG entry naming the opt-in block and the lite caps.
- [ ] Run `npm test` once and `npm run typecheck`; fix failures in one wave.
- [ ] Count production/test lines (`git diff --stat`); if over the lite cap, cut before finishing.
