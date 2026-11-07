# Intent Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended, see Execution) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A change that has `.rig/changes/<slug>/intent-map.md` fails approve, verify and the PR body unless every said sentence is a formal, empirical or not-promised row, with the oracle's rule ids.

**Architecture:** `scripts/intentmap.ts` is a port of `eval/intent-map.mjs` (pure functions, same rule ids, same `scenarioHash`). `approve` runs the plan phase and freezes the map plus `freeze.json`; `verify` runs the ship phase as a built-in sensor `intent-map`; `prbody` appends `receipt()`. No map means no findings anywhere.

**Tech Stack:** Node 22 TypeScript (type-stripping, `node --test`), `scripts/testkit.ts`, Python 3 for the login fixture.

**Spec:** `docs/superpowers/specs/2026-11-07-intent-map-design.md` (the oracle `eval/intent-map.mjs` and `eval/intent-map.test.mjs` are the contract for Task 1).

Work on branch `feat/intent-map` (not `main`). Run `npm test` and `npm run typecheck` once at the end and quote the output; one review of `git diff main...HEAD`.

## Global Constraints

- Rule ids exactly: `unmapped-said`, `unknown-kind`, `missing-clause`, `orphan-clause`, `both-ways`, `missing-scenario`, `empirical-early`, `empirical-open`, `empirical-unrecorded`, `stale-scenario`, `missing-not-promised`, `formal-failed`, `unmutated`, `vacuous`, `prune`.
- `check` returns no findings when `intent-map.md` is absent; existing evals and the journey must not change.
- The receipt says `evidence, not proof` on every empirical line; no model call builds it.
- A missing formal command fails closed: `formal-failed`, never a pass and never a relabel to empirical.
- The agent never writes `status`, `command` or `commit` of a scenario; the script does, from the process it ran.
- No new subagent launches in hooks or scripts. Request text and map text are data, never interpolated into a shell command.

## Decisions made at plan time (the spec left them open)

- **Results live outside the frozen map.** The map is hashed at approval, so recording `pass` inside it would trip `harness-tamper`. The script writes `.rig/changes/<slug>/intent-results.json` (`{E1: {status, command, commit}}`); `applyResults(text, results)` merges them into the map text before the ship check. The oracle's fixtures keep results inline, which `applyResults` leaves alone.
- **Formal command.** The `intent-map` sensor entry in `.rig/sensors.json` carries `options.formal` (a command that prints `{"clauses": {"C2": true}, "mutants": [{"id","clause","holds"}]}`). Absent while a formal row exists: `formal-failed`.

## Review Focus

- A map with a Windows line ending (`\r\n`) parses the same as `\n` (no phantom `unmapped-said`).
- A change with no map, and a repo whose `sensors.json` lacks the sensor, produce no finding and no crash.
- `intent-results.json` naming an `E` id the map does not have is ignored, not a crash.
- A `pass` in `intent-results.json` with no `commit` is `empirical-unrecorded`, not a pass.
- A formal command that exits non-zero or prints invalid JSON is `formal-failed`, never an unhandled exception.

---

### Task 1: Port the oracle

**Files:**
- Create: `scripts/intentmap.ts`, `scripts/intentmap.spec.ts`
- Read: `eval/intent-map.mjs`, `eval/intent-map.test.mjs`, `eval/fixtures/intent-map/`

**Interfaces:**
- Produces: `parse(text): IntentMap`, `scenarioHash(s: {given,when,then}): string`, `freezeFor(text): Record<string,string>`, `check(text: string, opts: { phase: 'plan'|'ship'; freeze?: Record<string,string>; clauses?: Record<string,boolean>; mutants?: {id:string; clause:string; holds:boolean}[]; tests?: string[] }): { map: IntentMap; findings: {rule: RuleId; detail: string}[]; pass: boolean; receipt: string }`, `applyResults(text, results: Record<string,{status:string;command?:string;commit?:string}>): string`, `receipt(map, clauses?)`. `RuleId` is the union of the 15 ids.

- [ ] **Step 1: Branch and commit the design and oracle** (`git checkout -b feat/intent-map`; add the spec, `eval/intent-map*`, `eval/fixtures/intent-map/` but not `__pycache__`; commit `docs(intent-map): design and acceptance oracle`).
- [ ] **Step 2: Write `scripts/intentmap.spec.ts`**: the five tests of `eval/intent-map.test.mjs` against the port (fixtures read from `eval/fixtures/intent-map/`), plus `parity`: for the plan, ship, `gap.md` and `one-way.md` inputs, `check` returns the same rule list as `eval/intent-map.mjs`; plus the Review Focus cases `crlf` (login map with `\r\n` gives `[]`) and `applyResults` (plan file + results for E1, E2 equals the ship scenarios' status/command/commit; unknown id ignored; `pass` without `commit` gives `empirical-unrecorded`).
- [ ] **Step 3: Run** `node --disable-warning=ExperimentalWarning --test scripts/intentmap.spec.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement** the port in `scripts/intentmap.ts`; same regexes and algorithm as the oracle, typed, with `text.replace(/\r\n/g, '\n')` first. The login runner (`runImpl`, `checkLogin`) stays in the oracle: the port takes `clauses` and `mutants` as inputs.
- [ ] **Step 5: Run** the spec and `npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `feat(intent-map): port the oracle to scripts/intentmap.ts`.

### Task 2: Plan phase at approve

**Files:**
- Modify: `scripts/lifecycle.ts` (approval at line ~98, `hashes`/`freezeRecord`), the code behind `S approve <slug> --check`
- Test: `scripts/intentmap.spec.ts`, `scripts/lifecycle.spec.ts`

**Interfaces:**
- Consumes: `check(text, {phase:'plan', tests})`, `freezeFor(text)` from Task 1.
- Produces: `intentMapPlanFindings(slug): Finding[]` (sensor id = rule id); approval records `intent-map.md` and `freeze.json` in `contracts`.

- [ ] **Step 1: Write failing tests**: `approve --check` on a change dir holding `fixtures/.../cases/gap.md` as `intent-map.md` prints the `unmapped-said` finding and does not approve; with the plan-time login map it prints `ok`, writes `.rig/changes/<slug>/freeze.json` equal to `freezeFor(text)`, and `approval.json` `contracts` lists both files; with no map, behaviour is unchanged.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `intentMapPlanFindings` in `scripts/intentmap.ts` (reads the change dir, tolerates absence) and call it from the `--check` path and from approval; on success write `freeze.json` and add both paths to what `freezeRecord` hashes, so a later edit reaches `frozenFindings` as `harness-tamper`.
- [ ] **Step 4: Run** `scripts/lifecycle.spec.ts` and `scripts/intentmap.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(intent-map): plan phase and freeze at approve`.

### Task 3: Ship phase in verify

**Files:**
- Modify: `scripts/registry.ts` (add `'intent-map'` to `BUILTIN_IDS`, default `{cadence:'ci', blocks:true}`, **not** in `defaultRegistry()` sensors or `ALWAYS_ON`), `scripts/check.ts` (run it for `point === 'ship'` with `slugs`), `scripts/model.ts` (`SENSOR_NAMES`)
- Create: `scripts/intentmap.ts` additions
- Test: `scripts/intentmap.spec.ts`, `scripts/registry.spec.ts`

**Interfaces:**
- Produces: `intentMapShipFindings(slug, run: (cmd: string) => {exit:number; stdout:string}): Finding[]`; `recordResult(slug, id, cmd): void` behind new `S intent-record <slug> <E-id> -- "<cmd>"` (runs the command, writes `intent-results.json` with `status` `pass` on exit 0 else `fail`, and `commit` from `git rev-parse --short HEAD`).

- [ ] **Step 1: Write failing tests**: `intentMapShipFindings` for (a) no map: `[]`; (b) ship login map, injected `run` returning good clauses and rejected mutants: `[]`; (c) injected mutant `holds:true`: `vacuous`; (d) no `options.formal`: `formal-failed`; (e) `run` exit 1 and `run` stdout `not json`: `formal-failed`; (f) results file missing: `empirical-open`; (g) a test file in the change naming `C2` only: `prune`. `recordResult` test: runs `node -e "process.exit(0)"`, file has `pass`, a 7+ char commit, and the command text. Registry test: a repo with no map and the default registry gets no `intent-map` sensor.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the sensor: read map, `applyResults`, run `options.formal` once through `runCommand` (`scripts/runs.ts`, so it lands in `evidence/runs.jsonl`), then `check({phase:'ship', freeze, clauses, mutants, tests})` where `tests` are the change's added or edited test files. Return findings with `sensor = rule id`, `severity: 'block'`.
- [ ] **Step 4: Implement** `S intent-record` in `scripts/sdlc.ts` and register it in the command table next to `route-check`.
- [ ] **Step 5: Run** the three spec files. Expected: PASS.
- [ ] **Step 6: Commit** `feat(intent-map): ship phase sensor and result recording`.

### Task 4: Receipt in the PR body

**Files:**
- Modify: `scripts/prbody.ts` (`PrBodyInput` gains `intentMap?: string` = the receipt text), `scripts/pr.ts` (compute it)
- Test: `scripts/prbody.spec.ts`

**Interfaces:**
- Consumes: `check(...).receipt` from Task 1/3.

- [ ] **Step 1: Write failing tests**: with `intentMap` set, the body contains `## Intent map` and the receipt lines verbatim and `(evidence, not proof)`; without it, the body is byte-identical to today's (snapshot an existing case).
- [ ] **Step 2: Run** `scripts/prbody.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the section after `## Evidence`, and pass the receipt from `pr.ts` only when a map exists.
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(intent-map): receipt in the PR body`.

### Task 5: Skills and the Behaviours projection

**Files:**
- Modify: `skills/plan/SKILL.md`, `skills/build/SKILL.md`, `skills/approve/SKILL.md`; `scripts/intentmap.ts` (`behavioursFrom(map): string`)
- Test: `scripts/intentmap.spec.ts`, the existing skill-text specs (`scripts/initskill.spec.ts` pattern)

**Interfaces:**
- Produces: `behavioursFrom(map): string`, the `## Behaviours` list with the map's ids and words; `S intent-project <slug>` prints it, and approve `--check` refuses a spec whose `## Behaviours` drifts from it (sensor id `behaviours-drift`).

- [ ] **Step 1: Write failing tests**: `behavioursFrom(login plan map)` lists S1-S3 in order; a spec with one edited word gives `behaviours-drift`; no map gives no check; a skill-text test that `skills/plan/SKILL.md` mentions `intent-map.md` and `skills/build/SKILL.md` mentions `S intent-record`, each under its current length plus 8 lines.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `behavioursFrom`, the `intent-project` command, and the drift check beside Task 2's findings.
- [ ] **Step 4: Edit the skills** as the spec's table says: plan writes `intent-map.md` from the grill (statuses `planned`, formal bodies empty) and projects Behaviours; build writes bodies only after approval, records empirical results with `S intent-record`, plants mutants in a scratch copy never on the branch; approve names the map and `freeze.json` in what it hashes.
- [ ] **Step 5: Run** the specs. Expected: PASS.
- [ ] **Step 6: Commit** `feat(intent-map): plan, build and approve skills`.

### Task 6: Python formal command and full verification

**Files:**
- Modify: `templates/stacks/` Python pack (the `intent-map` sensor entry with `options.formal` only when a map exists)
- Test: the stack-pack spec that already covers `templates/stacks/`

- [ ] **Step 1: Write failing test**: the Python pack's rendered `sensors.json` has no `intent-map` entry by default (no change for repos with no map); `S intent-map-enable` (or the pack's documented one-line edit) adds `options.formal` pointing at a command that prints the JSON shape in Decisions.
- [ ] **Step 2: Implement** the pack change, then run `npm test` and `npm run typecheck`. Expected: all pass; quote the tail of both. `eval/intent-map.test.mjs` still passes unchanged.
- [ ] **Step 3: Review**: one `/code-review` of `git diff main...HEAD`; fix findings in one wave; rerun `npm test`.
- [ ] **Step 4: Commit** any fixes `fix(intent-map): review findings`.

## Execution

Inline with `superpowers:executing-plans`. The tasks share the `Finding` shape and `intentmap.ts`, so one fresh context beats per-task agents; at most one Opus review at the end.

## Self-review notes

- Spec coverage: Goals 1-6 map to Tasks 2, 3, 4, 5 and the absent-map constraint; "Where the wiring goes" rows map to Tasks 1-6 (`registry.ts` reserved in Task 3).
- Not built, as the spec says: the live lift eval.
- Open for you: the two plan-time decisions above change the spec's wording ("script writes the result lines into the map"); the spec should be updated with them when this lands.
