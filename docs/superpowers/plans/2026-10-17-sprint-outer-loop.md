# Sprint Outer Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PRD becomes traced, sized intents (each with a brief), an updated architecture and a test plan, approved once per sprint, that engineers then pick up through the existing change lifecycle.

**Architecture:** Two new pure-ish script modules (`chartcheck.ts`: parse and trace rules; `chart.ts`: files, digest, approval state, readiness), a few CLI commands in `sdlc.ts`, two skills and a restored `architect` agent that only write markdown, and templates. The trace report is deterministic (no model call); the existing lifecycle gains a `source:` link from a change to its intent.

**Tech Stack:** Node >= 22.18 with built-in TypeScript type stripping, zero dependencies, `node:test`. Tests use `scripts/testkit.ts` (`makeRepo`, `sdlc`, `write`, `approvedChange`).

**Spec:** `docs/superpowers/specs/2026-10-17-sprint-outer-loop-design.md` (read it first). Research: `docs/research/2026-10-17-findings.md`, `docs/research/2026-10-17-playbook-gap-analysis.md`.

## Global Constraints

- Node `>=22.18`, TypeScript run by type stripping: no enums, no `namespace`, no parameter properties. Zero runtime dependencies.
- Core scripts name no language or tool (`scripts/neutrality.spec.ts` fails otherwise).
- Per-file limits: scripts at most 500 lines, skills at most 60 (`scripts/size.spec.ts`). The harness total cap becomes **5,000** lines (it is 3,869 today); this project's budget is about 800.
- Only a person approves: `approve chart-<N>` needs `SDLC_HUMAN=1`, else exit 3.
- Chart files live under `.rig/product/` (PRD `prd/sprint-<N>.md`, `brief.md`, `architecture.md`, `adr/`, `intents/<slug>.md`, `testplan/{plan.md,cases.md,data/}`); the chart approval lives at `.rig/product/approvals/chart-<N>.json`, outside the digest.
- An intent is at most 2 engineer-days (`estimate_days: 1 | 2`); behaviours are `B<n>` per intent, cited as `slug#B<n>` at chart level.
- No new hook events. A subagent brief is at most 60 lines; this repo's `CLAUDE.md` rules apply (Sonnet implementers, at most 4 launches, one final review).
- Run and quote `npm run typecheck` and `npm test`; never report a pass you did not see.

## Review Focus

Failure modes the spec implies that no single task's happy path exercises (each pinned by a test in the named task):
1. An intent written with CRLF line endings, `prd: FR-3` (no brackets) or `depends: [a.md]` parses the same as the canonical form (Task 2).
2. A sprint with zero intents, or a PRD id mentioned only in prose, reports every requirement uncovered and does not crash or count the prose mention as a definition (Task 2).
3. A `depends` cycle blocks both members and a self-dependency is a cycle (Task 2).
4. Editing an intent of another sprint does not make this sprint's approval stale; editing a file of this sprint does (Task 3).
5. A hand-edited or garbage `chart-N.json` reads as `missing`, never throws; approving twice adds nothing (Task 3).

## File Structure

- Create `scripts/chartcheck.ts` (parse PRD, intents, cases; `traceReport`), `scripts/chart.ts` (chart files, digest, approval, readiness), their `.spec.ts` files.
- Modify `scripts/sdlc.ts` (commands `chart`, `ready`; `approve chart-N`; `new --source`), `scripts/lifecycle.ts` (export `isShipped`; `source:` field), `scripts/sync.ts` (intent/spec sync rule), `scripts/check.ts` (CI human-approval rows), `scripts/registry.ts` and `scripts/modelstate.ts` (`models.design`, architect role), `scripts/vendor.ts` (`VENDORED`), `scripts/size.spec.ts` (cap), `scripts/removed.spec.ts` and `scripts/vendor.spec.ts` (updated assertions).
- Create `agents/architect.md`, `skills/chart/SKILL.md`, `skills/testplan/SKILL.md`; modify `skills/start/SKILL.md`, `skills/approve/SKILL.md`.
- Create `templates/prd-format.md`, `architecture-format.md`, `testplan-format.md`, `intent-format.md`.
- Create `tests/e2e/phases/s6-chart.mjs`, `tests/e2e/prd/sprint-1.md`, `tests/e2e/prd/chart-fixture/`; modify `tests/e2e/run.mjs`.
- Create `eval/chart.mjs`, `eval/chart.test.mjs`, `eval/fixtures/chart/*.json`.
- Recover and adapt, do not copy blindly: `git show 4244194^:scripts/chart.ts` (own vs shared files, drift logic), `git show 4244194^:scripts/chartcheck.ts`, `git show 8e2f3df --stat` (templates), `git show 4244194^:skills/chart/SKILL.md`, `git show d3c7fb6^:agents/architect.md`.

---

### Task 0: Branch and the written design

- [ ] **Step 1:** `git switch -c feat/sprint-outer-loop`; commit `docs/GOAL.md`, `docs/research/`, the spec and this plan: `docs: sprint outer loop design, research and plan`.

---

### Task 1: Cap, design model role, architect agent

**Files:** Modify `scripts/size.spec.ts`, `scripts/registry.ts`, `scripts/modelstate.ts`, `scripts/removed.spec.ts`, `scripts/vendor.spec.ts`; Create `agents/architect.md`. Test: `scripts/registry.spec.ts`, `scripts/modelstate.spec.ts`.

**Interfaces:**
- Produces: `Registry.models.design: string` (default `'opus'`); `modelRoleFindings` warns when an `architect` launch resolves to a different family than `models.design`; `agents/architect.md` (name `architect`, `model: claude-opus-5-5`, tools Read, Grep, Glob, LSP, Write, Edit, `maxTurns: 30`).

- [ ] **Step 1: Failing tests.** `registry.spec.ts`: default registry has `models.design === 'opus'`; `{"models":{"design":"sonnet"}}` parses; `{"models":{"x":"y"}}` errors with `models.x must be build, evaluate or design`. `modelstate.spec.ts`: a launch `{agent: 'rig:architect', requested: null, resolved: 'claude-sonnet-5-5'}` with `models.design = 'opus'` yields one `model-role` warning naming `architect` and `opus`; a resolved Opus launch yields none.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts scripts/modelstate.spec.ts`; expect the new tests FAIL.
- [ ] **Step 3: Implement.** Extend the `models` type and parser in `registry.ts`; generalise the `EVALUATOR` match in `modelstate.ts` into a role table (`evaluator` → `models.evaluate`, `architect` → `models.design`); write `agents/architect.md` from `git show d3c7fb6^:agents/architect.md`, shrunk to under 40 lines: reads the PRD, brief, previous architecture and (brownfield) the code through read-only reads; writes intents, `architecture.md`, ADRs; never touches code.
- [ ] **Step 4:** Raise the cap in `size.spec.ts` to 5000 (test name and message too). Update `vendor.spec.ts`: the agents assertion becomes `['rig-architect.md', 'rig-evaluator.md']`; `removed.spec.ts` line 81 agents assertion becomes `['architect.md', 'evaluator.md']`.
- [ ] **Step 5:** Run the four specs; expect PASS (the skill count in `vendor.spec.ts` changes in Task 6).
- [ ] **Step 6:** Commit `feat: design model role, architect agent, harness cap 5000`.

---

### Task 2: Parse and trace (`scripts/chartcheck.ts`)

**Files:** Create `scripts/chartcheck.ts`, `scripts/chartcheck.spec.ts`.

**Interfaces:**
- Produces:
  - `prdIds(text: string): string[]` (port from the old file: a heading `### FR-3: …` or a table row `| NFR-2 | …` defines an id; prose mentions do not).
  - `type Behaviour = { id: string; reqs: string[]; text: string }`; `type Intent = { slug: string; sprint: number | null; prd: string[]; depends: string[]; estimateDays: number | null; kind: 'boundary' | 'internal' | null; behaviours: Behaviour[]; contractFiles: string[]; exampleFiles: string[]; openQuestions: string[] }`; `parseIntent(slug: string, text: string): Intent`. Behaviour line: `- B1 (FR-3, NFR-1): text`. Contract lines under `## Interfaces`: `Contract: <path>` and `Example: <path>`. List fields are flow style on one line and tolerate missing brackets, quotes and a trailing `.md`. CRLF is normalised.
  - `type TestCase = { id: string; reqs: string[]; intent: string; behaviour: string; level: string; data: string }`; `parseCases(text: string): TestCase[]` for rows `| TC-1 | FR-3 | slug | B1 | contract | data/x.json | expected |`.
  - `type ChartFinding = { rule: string; severity: 'block' | 'report'; where: string; message: string }`.
  - `traceReport(i: { prd: string; intents: Intent[]; cases: TestCase[] | null; exists: (p: string) => boolean; engineers?: number }): ChartFinding[]` (`cases: null` skips the test-case rules). Rules and ids: `intent-untraced`, `unknown-id`, `req-uncovered`, `req-untested`, `case-untraced`, `case-orphan`, `case-data-missing`, `estimate`, `depends`, `boundary-contract`, `open-question` (all `block`); `capacity`, `progress` (`report`).

- [ ] **Step 1: Failing tests** (`chartcheck.spec.ts`, pure, no repo). One test per rule, each with a fixture that trips exactly that rule and the same fixture fixed returning no finding of it: an intent whose behaviour cites no requirement → `intent-untraced`; a citation `FR-9` the PRD lacks → `unknown-id`; PRD `FR-2` cited by no intent → `req-uncovered`; with `cases` given, an `FR` with no case → `req-untested`; a case citing no requirement or naming a missing intent/behaviour → `case-untraced`/`case-orphan`; a case data path where `exists` is false → `case-data-missing`; `estimate_days` missing or 3 → `estimate`; depends on a missing slug, a two-node cycle and a self-dependency (both members of a cycle flagged) → `depends`; `kind: boundary` with no `Contract:` or no `Example:` → `boundary-contract`; any `## Open questions` not `none` in the PRD or an intent → `open-question`; summed `estimate_days` above `10 * engineers` → `capacity` (report). Review-focus tests: CRLF intent with `prd: FR-3` and `depends: [a.md]` parses equal to canonical; zero intents → every requirement `req-uncovered`, no throw; a PRD id only in prose is not a definition.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/chartcheck.spec.ts`; expect FAIL (module missing).
- [ ] **Step 3: Implement** the functions above in `chartcheck.ts` (at most 250 lines), recovering `prdIds`/`listField` from `git show 4244194^:scripts/chart.ts`. Cycle detection: depth-first over `depends`, flag every member of a cycle.
- [ ] **Step 4:** Run the spec; expect PASS. `npm run typecheck` clean.
- [ ] **Step 5:** Commit `feat(chart): parse PRD, intents and cases; deterministic trace rules`.

---

### Task 3: Chart files, digest, approval, readiness (`scripts/chart.ts`)

**Files:** Create `scripts/chart.ts`, `scripts/chart.spec.ts`; Modify `scripts/lifecycle.ts` (export `isShipped`).

**Interfaces:**
- Consumes: `parseIntent`, `traceReport` (Task 2); `frontmatter`, `read`, `exists`, `sha`, `ROOT`, `SDLC` (core); `isShipped(slug)`, `changeDir` (lifecycle).
- Produces: `PRODUCT = <SDLC>/product`; `ownFiles(n)`, `sharedFiles()`, `chartFiles(n): string[]` (repo-relative, sorted; own = PRD + sprint-n intents + the contract files those intents name; shared = `architecture.md`, `adr/*`, `testplan/**`; dotfiles ignored); `chartDigest(n): string`; `type ChartState = 'approved' | 'stale' | 'missing'`; `chartState(n): { state: ChartState; changed: string[] }`; `writeChartApproval(n: number, by: string): void`; `intentsOf(n): Intent[]`; `chartFindings(n: number, withCases: boolean): ChartFinding[]`; `intentReady(slug: string): { ready: boolean; why: string[] }`.

- [ ] **Step 1: Failing tests** (`chart.spec.ts`, using `makeRepo`/`write` and importing with `CLAUDE_PROJECT_DIR` set, as the lifecycle spec does): digest changes when a sprint-N file is edited, added or removed and not when a sprint-M intent changes (review focus 4); `writeChartApproval` then `chartState` is `approved`, `stale` after an edit with `changed` naming the file, `missing` before; a garbage `chart-1.json` reads `missing` (focus 5); a later sprint's architecture edit does not stale sprint N once sprint N+1 is approved (the old shared-file rule); `intentReady` is false with reasons `chart not approved`, `blocked by a, b` (a dependency whose change is not shipped), and true when approved and dependencies shipped (write a `pr.md` on `main` as `lifecycle.spec.ts` does).
- [ ] **Step 2:** Run the spec; expect FAIL.
- [ ] **Step 3: Implement.** Port `ownFiles/sharedFiles/drift/chartState` from the old `chart.ts`, replacing the jsonl log with the per-sprint JSON file `{ by, at, digest, files: [{path, sha}] }`; wrap `JSON.parse` so malformed means `missing`. `intentReady` reads the intent file's sprint, `chartState`, and `isShipped(dep)` for each `depends`.
- [ ] **Step 4:** Run the spec; expect PASS.
- [ ] **Step 5:** Commit `feat(chart): files, digest, approval state and intent readiness`.

---

### Task 4: CLI, CI row, vendoring

**Files:** Modify `scripts/sdlc.ts`, `scripts/check.ts`, `scripts/vendor.ts`; Test: `scripts/chart.spec.ts` (CLI cases), `scripts/lifecycle.spec.ts`.

**Interfaces:**
- Produces: `sdlc.ts chart check <N> [--cases] [--json]` (exit 0 unless the PRD is missing; `--cases` adds the test-case rules); `chart report <N>` (the traced chain with coverage counts, plus `progress` findings); `approve chart-<N>` (human-only, refuses while any `block` finding of the full check stands, idempotent); `ready [--json]` (ready intents: slug, sprint, estimate); CI `human-approval` rows now include added or edited `.rig/product/approvals/chart-*.json`.

- [ ] **Step 1: Failing tests.** `sdlc.ts chart check 1` on a fixture exits 0 and prints findings as JSON with `--json`; missing PRD exits 1. `approve chart-1` without `SDLC_HUMAN` exits 3; with a block finding it exits 1 and prints the finding; clean, it writes the file and a second run says already approved. `ready` lists only ready intents and omits blocked ones. `check.ts`: a PR that adds `.rig/product/approvals/chart-1.json` produces a `human-approval` row `chart-1 by <name>`. `lifecycle.spec.ts` line 197 still holds (`next` stays absent: the command is `ready`).
- [ ] **Step 2:** Run the three specs; expect the new cases FAIL.
- [ ] **Step 3: Implement** the commands in `sdlc.ts` (dispatch `chart-<N>` in `cmdApprove` before `checkSlug`; add `chart` and `ready` to `COMMANDS`); extend the approval-row loop in `check.ts` (~line 247) with the chart pattern; add `'chart'` and `'chartcheck'` to `VENDORED`.
- [ ] **Step 4:** Run the specs and `npm run typecheck`; expect PASS.
- [ ] **Step 5:** Commit `feat(chart): chart check/report/approve and ready commands, CI approval rows`.

---

### Task 5: Link intents to changes

**Files:** Modify `scripts/lifecycle.ts`, `scripts/sdlc.ts`, `scripts/chartcheck.ts`, `scripts/sync.ts`; Test: `scripts/lifecycle.spec.ts`, `scripts/sync.spec.ts`.

**Interfaces:**
- Produces: `new <slug> --source <intent file>`: the slug must equal the intent's slug; refuses unless `intentReady(slug).ready`, printing each reason (`blocked by …`, `chart-N is stale: … (changed: …)`, `chart-N is not approved`); writes `source: <path>` into `intent.md` frontmatter and copies the intent's `## Behaviours` into the change's `spec.md` skeleton. `intentSpecProblems(intent: Intent, spec: string): string[]` (a behaviour of the intent missing from `spec.md`, or a `spec.md` behaviour not in the intent that cites no requirement of the intent's `prd:`); `syncFindings` reports these as `block` findings (`sensor: 'sync'`) for every change with a `source:`.

- [ ] **Step 1: Failing tests.** `new` with a not-ready intent exits 1 with the reason; with a ready one it creates the change, `intent.md` has `source:` and `spec.md` lists `B1…Bn`; slug mismatch refuses; a started change keeps working after its chart goes stale; `intentSpecProblems` flags a dropped behaviour and an uncited extra one and accepts an extra that cites an intent requirement.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in the files listed (keep `lifecycle.ts` and `sdlc.ts` under 500 lines).
- [ ] **Step 4:** Run the specs and typecheck; expect PASS.
- [ ] **Step 5:** Commit `feat(chart): new --source, intent/spec sync rule`.

---

### Task 6: Templates, skills, spec upkeep

**Files:** Create `templates/{prd,architecture,testplan,intent}-format.md`, `skills/chart/SKILL.md`, `skills/testplan/SKILL.md`; Modify `skills/start/SKILL.md`, `skills/approve/SKILL.md`, `scripts/removed.spec.ts`, `scripts/vendor.spec.ts`, `scripts/lifecycle.spec.ts` if needed.

**Interfaces:** Skill `chart` (argument: a PRD path or sprint number; launches `rig:architect` without a model override, runs `chart check`, at most one fix round, commits on branch `rig/chart-<N>`, opens a PR when `gh` exists, ends `Next: a person reviews, then /rig:approve chart-<N>`); skill `testplan` (launches `general-purpose` with `model: sonnet`, writes `testplan/`, then `chart check <N> --cases`); `start` accepts `.rig/product/intents/<slug>.md` and runs `new <slug> --source`; `approve` accepts `chart-<N>`.

- [ ] **Step 1: Update the specs that assert deletion.** `removed.spec.ts`: drop `chart`, `chartcheck`, `skills/chart`, `templates/prd-format.md`, `chart` from the deleted lists and the commands assertion; `['architecture','codebase-design','prototype','testplan']` loses `testplan`; line 121 pattern drops `architect`; `inbox` stays deleted. `vendor.spec.ts`: skills count 11; `chart` and `testplan` listed. Run them; expect FAIL until the files exist.
- [ ] **Step 2: Write the four templates** (each at most 45 lines, headings and comment prompts only, as `templates/brief.md` does; `intent-format.md` carries the frontmatter and sections of spec §6, `prd-format.md` recovered from `git show 8e2f3df:templates/prd-format.md` and cut to the FR/NFR ids, §`engineers: n`, non-goals and open questions).
- [ ] **Step 3: Write the two skills** at most 60 lines each, in the style of `skills/start/SKILL.md` (one `S` definition, numbered steps, briefs to agents at most 40 lines); edit `start` and `approve`.
- [ ] **Step 4:** `npm test`'s spec part: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`; expect PASS.
- [ ] **Step 5:** Commit `feat(chart): templates, chart and testplan skills`.

---

### Task 7: End-to-end stage S6

**Files:** Create `tests/e2e/phases/s6-chart.mjs`, `tests/e2e/prd/sprint-1.md`, `tests/e2e/prd/chart-fixture/` (a known-good chart for the shop app: 4 requirements, 3 intents with one dependency, one boundary intent with a contract and example, cases and data); Modify `tests/e2e/run.mjs`.

- [ ] **Step 1:** Write `runChart(sb)` returning a `Checks`: installs the fixture into the sandbox, asserts `chart check 1 --cases` has no `block` findings; `approve chart-1` without `SDLC_HUMAN` exits 3 and with it exits 0; `ready` lists the root intent and not the dependent; `new <slug> --source` starts the root; editing an intent makes the next `new --source` refuse with `stale`; a removed requirement citation makes `chart check` report `intent-untraced`. Register `'S6 chart'` in `run.mjs` (`NEEDS` after S1, scripted driver only). Keep the word PRD out of `run.mjs` (a spec forbids it there; the phase file may use it).
- [ ] **Step 2:** `node tests/e2e/run.mjs --driver scripted --phase S6`; expect all checks PASS.
- [ ] **Step 3:** Commit `test(e2e): S6 charts a sprint, approves, starts an intent`.

---

### Task 8: Chart-quality eval

**Files:** Create `eval/chart.mjs`, `eval/chart.test.mjs`, `eval/fixtures/chart/sprint-a.json` (answer key: requirement ids, a valid dependency edge list), plus the PRD it keys; Modify `package.json` (`eval:chart`, and `test:e2e:unit` includes the new test).

**Interfaces:** `scoreChart(key: { requirements: string[] }, report: ChartFinding[], intents: Intent[]): { recall: number; inventedIntentRate: number; sizeCompliance: number; dependenciesValid: boolean }`: recall = key requirements cited by some intent / all; invented rate = intents with no valid `prd:` citation / all intents; size compliance = intents with `estimate_days` 1 or 2 / all; dependenciesValid = no `depends` finding. The runner `eval/chart.mjs` follows `eval/run.mjs`: copies a fresh starter, runs `claude -p` with `--model`, runs `/rig:chart` once per arm (arms: `architect-opus`, `architect-sonnet`), reads `chart check --json`, records tokens and USD, appends a JSONL row and a markdown table under `eval/results/`.

- [ ] **Step 1: Failing tests** for `scoreChart`: a perfect chart scores recall 1, invented 0, compliance 1, valid; an intent citing `FR-99` raises the invented rate; a 3-day estimate lowers compliance; a cycle sets valid false.
- [ ] **Step 2:** Run `node --test eval/chart.test.mjs`; expect FAIL. **Step 3:** implement; **Step 4:** expect PASS. The live run is not part of this task (it costs money); `npm run eval:chart -- --dry` must run without calling `claude`.
- [ ] **Step 5:** Commit `feat(eval): chart-quality scoring and runner`.

---

### Task 9: Docs and full verification

- [ ] **Step 1:** Update `README.md` (command table, a "sprint, step by step" section), `CHANGELOG.md`, `DESIGN.md` (outer loop row), `templates/readme-rig.md` (the new commands), and `CLAUDE.md` only if a statement became false.
- [ ] **Step 2:** Run `npm run typecheck`; expect no errors. Run `npm test`; expect all specs, e2e unit and scripted stages S0 to S6 to pass, including `size.spec.ts` (total at most 5,000). Quote the totals.
- [ ] **Step 3:** One review of `git diff main...HEAD` (`/code-review`, or a single reviewer agent per `CLAUDE.md`); fix findings in one wave; rerun Step 2.
- [ ] **Step 4:** Commit `docs: sprint outer loop`. Do not merge: the person decides.

## Self-review notes

- Spec coverage: §4 flow (Tasks 4–6), §5 artefacts (6), §6 brief (2, 6), §7 rules and links (2–5), §8 test plan (2, 6), §9 agents and skills (1, 6), §10 measurement (4 `report`, 8), §11 tests (each task, 7), §3 cap (1). `rig chart report`'s estimate-vs-actual from git timestamps is the one measure not tasked: add it to Task 4's `chart report` if the builder finds it cheap, else record it as a follow-up.
- `ready` is the command name because `lifecycle.spec.ts` asserts `next` stays removed.
