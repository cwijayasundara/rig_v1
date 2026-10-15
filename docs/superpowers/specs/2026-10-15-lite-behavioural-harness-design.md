# Lite behavioural harness: frozen contracts, one final gate

Date: 2026-10-15. Status: implemented (uncommitted; `npm test` green 2026-10-15).

Source: Naresh Jain, "Are Harnesses Worth the Cost?" (martinfowler.com, 2026-10-13). A cheap model
(GPT-6 Luna) went from 3/10 to 10/10 accepted runs when given machine-readable contracts, validated
examples and contract-driven mocks it could not weaken, at 33% less per run than an unharnessed frontier
model. The same harness cost the frontier model (GPT-6 Sol) ~7x for no gain: for capable models the
sensors should run once as a final gate, not continuously. This spec takes only those two findings,
in the smallest form rig can carry.

## Lite budget (hard caps, checked in review)

- **Opt-in and off by default.** No `behavioral` block in `.rig/sensors.json` means byte-identical
  behaviour to today: no new findings, no new commands run, no new files read at any hook point.
- **No new dependency, tool, MCP server, skill, agent, workflow, ratchet node or CLI command.**
  No Specmatic, no contract-test generator, no mock server of rig's own. The repo declares its own
  contract tooling as two shell commands; rig only runs them, freezes their inputs and records the result.
- **One new config block, one new sensor name, five touched scripts, no new script file**
  (`model.ts` for the config type/parser and sensor name, `core.ts` for the approval digest,
  `verify.ts` for validate/run at the test node, `check.ts` for the CI/ship re-run,
  `slicecheck.ts` for the continuous cadence). Target ≤ 250 lines of production code and
  ≤ 250 lines of spec tests. If an implementation grows past that, it is the wrong implementation:
  stop and cut scope, do not add a file.
- **Zero tokens.** Everything below is deterministic script work, like every other sensor.

## Problem

rig's sensors are strong on the diff (test-tamper, suppression, secrets, layering, red-proof) but
nothing checks *behaviour against an expectation the implementer did not write*. The agent writes the
code and its tests from the same reading of the design, so a shared misreading passes both.
`levels.acceptance`/`levels.api` exist but are just commands with no frozen inputs, no
validate-before-run step, and no link to the approval gate. Meanwhile rig runs its declared commands
at build, test, sensors, ship and CI for every tier — the continuous cadence the article shows is
wasted spend on capable routes.

## Design

### 1. One optional block in `sensors.json`

```json
"behavioral": {
  "validate": "<cmd that checks examples against the specs, exit != 0 on mismatch>",
  "run": "<cmd that runs the behavioural suite against the implementation>",
  "files": [".rig/contracts/**"],
  "cadence": "final"
}
```

- All fields optional except that at least one of `validate`/`run` must be present for the block to
  do anything. `files` defaults to `[".rig/contracts/**"]`. `cadence` is `"final"` (default) or
  `"continuous"`; anything else is a config error (`config` sensor, as today).
- rig never parses the specs or examples. OpenAPI, AsyncAPI, JSON Schema, Pact files or a plain
  example folder are all the same to rig: files matched by `files`, judged by the repo's commands.
  Authoring contracts and choosing the tool stay the team's job (and the article is explicit that
  this authoring cost is real and unmeasured — rig does not hide it).

### 2. Frozen inputs: behavioural files join the approval digest

The expectations only help if the implementer cannot quietly edit them after approval.

- The behavioural files for every change are all files matched by `files` (repo-wide contracts and
  examples, shared across changes), plus any files inside `.rig/changes/<slug>/behavioral/**`
  (change-local examples), whether or not a glob covers them.
- `approvalDigest(slug, gate)` in `scripts/core.ts` additionally hashes the sorted
  `path\ncontent\n` of those files for the `spec`, `plan` and `design` gates. Editing, adding or
  removing one after approval makes the approval `stale`, exactly as editing `design.md` does
  today, and the existing gate machinery blocks the build until a person re-approves. No new
  approval stage, no new file format. Accepted consequence: editing a shared contract stales
  every unshipped approval that covers it. That is the intended behaviour — a shared expectation
  changed, so every design approved against the old one needs a fresh human look.
- On a branch diff, changing a behavioural file is reported by the existing `harness-tamper`
  path only when it also weakens config; a plain behavioural edit after approval is caught by the
  stale digest above, which is the stronger and cheaper check. CI re-runs `run` (§3), so a stale
  approval cannot ship green behavioural results on edited expectations without re-approval.

### 3. Cadence: validate cheap and early, run once at the gate

- **`validate`** runs in `verify` before `run`, and again at `check --at ship|ci` before the
  re-run there. If it fails, `run`
  does not run and the test node records a `behavioral` block: "examples do not match the specs",
  fix "fix the examples or the specs — a person re-approves if the specs change (§2)". This is the
  article's guide/sensor sync step: drift between guide and sensor is reported as drift, never
  silently absorbed into a test failure.
- **`run`** runs in `verify` (through the recorder, so it is stamped in `verification.md` like every
  other level) and again at `check --at ci` and `check --at ship`, which is what CI actually runs
  today (`templates/rig-check.yml` never calls `verify`, and CI reads no stamp). With
  `cadence: "final"` it runs **only** at those gates — not per slice, not at Stop, not in the
  sensors node. That is the frontier-route saving: one behavioural pass per change, plus the
  independent CI re-run.
- With `cadence: "continuous"`, `run` additionally runs at build-slice record (`ratchet record
  build --checks` in `scripts/slicecheck.ts`) when the slice's changed files touch a `files` glob
  or a contract glob (`config.contracts`). That path exists only for tier S and M; tier L slices
  are reviewer-judged, so a tier L change gets the behavioural run at `verify` regardless of
  cadence — stated here so nobody reads "continuous" as per-slice at tier L. This is the
  cheap-route setting: Haiku/Sonnet implementers get the feedback while they can still fix the
  slice cheaply. The choice is recorded in `sensors.json`, reviewed like any harness edit, and
  never inferred from the model name at runtime — routing already picks the model by tier, and
  the person picks the cadence to match.
- New sensor name `behavioral` in `SENSOR_NAMES` (`scripts/model.ts`). It is a suite-level sensor
  like `size`, waived locally with `/rig:waive behavioral * <reason>` through the existing
  human-only path; at CI it is never waivable (like `harness-tamper`), so the independent gate
  cannot be waived away by the PR it judges — a behavioural change lands on the trunk first.
  Behavioural files are expected to be committed: the freeze is computed from git's file list,
  so a gitignored behavioural file is not frozen (the same git basis as every other rig record).

### 4. What the skills say (one line each, no new skill)

- `skills/design/SKILL.md`: when `behavioral` is declared, the design lists each behaviour's
  contract/example file under `## Verification` alongside the B-numbers it pins.
- `skills/test/SKILL.md`: a `behavioral` block is fixed by changing the implementation or the
  execution setup, never the examples or specs (that needs re-approval, §2) — the article's
  "investigate the failure, don't weaken the expectation" rule, in one sentence.
- `guides/contracts.md`: one added iron rule — "the specs and examples under the `behavioral`
  files are the guide and the sensor: keep them in sync with `validate`, and treat a red `run`
  as a bug in the code until a person says otherwise."

### 5. Explicitly out of scope (the lite line)

- No N-run reliability evals, cost-per-accepted-change reporting or automatic cadence switching.
  The article's sample (10 runs, one greenfield service, one detailed brief) justifies trying
  frozen contracts and final-gate cadence; it does not justify building a measurement platform.
  Revisit only after a repo has shipped ≥ 5 changes with `behavioral` declared and `metrics`
  shows the behavioural round is a visible share of cost.
- No env-var seam sensor, wire-format sensor or async-flow templates (article failure classes
  3–5 from the deep dive). Each is a separate, separately justified sensor.
- No change to CI workflows, git hooks, the ratchet's nodes or round caps, or `levels` semantics.

## Verification

New cases in `scripts/verify.spec.ts` / `scripts/check.spec.ts` (whichever owns the touched code),
each failing without the change:

1. No `behavioral` block: `verify` output and findings are identical to today (existing tests
   unchanged and green).
2. `validate` exits non-zero → `run` is not executed, one `behavioral` block is recorded, and
   `verification.md` shows the behavioural line as failed, not passed.
3. `validate` passes, `run` fails → test node fails with the recorded exit code (verdict from the
   exit code, never from model text).
4. Editing a file under `.rig/changes/<slug>/behavioral/` after `/rig:approve <slug> design`
   makes `approvalOf` return `stale`; an unrelated change file edit does not.
5. `cadence: "final"`: a build-slice record on a contract-touching slice does not run the
   behavioural command; `cadence: "continuous"`: it does, exactly once per slice record.
6. A bad `cadence` value and a block with neither `validate` nor `run` are `config` errors.
7. `/rig:waive behavioral * <reason>` is accepted by the existing waiver path; a model
   (no `SDLC_HUMAN=1`) still cannot waive, and CI never waives a `behavioral` block.

`npm test` and `npm run typecheck` pass. No e2e phase is added; the scripted phases already cover
`verify`, and a live behavioural trial belongs to the first target repo that declares the block.

## Cost of adoption for a target repo

One config block, two commands the team already has (or writes once), and contract/example files
for the behaviours they care about. Nothing runs, and nothing is read, in repos that do not opt in.
