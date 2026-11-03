# PRD sufficiency probe (step 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per CLAUDE.md) to implement this plan task-by-task.

**Goal:** The chart checks the client's `source.md` for whole missing topics (failure handling, security, ground truth, rollout, escalation, and for agent products accuracy, autonomy, fallback, budget, audit), records each in `coverage.md`, and refuses approval while a topic is neither covered by the source, answered by a person, nor marked not applicable.

**Architecture:** `coverage.md` has one row per topic, written by the chart from `source.md` only, and a pure script checks it (every topic present once, covered quotes really in `source.md`, answered ids really confirmed in `prd.md`, open topics block, `n/a` has a reason), the same pattern as `conversion.md`. A second script output, `client-gaps.md`, is generated from the open rows so the BA can send it back to the client. Nothing here adds a question wave: the top 4 absent topics join the existing gap-pass batch.

**Tech Stack:** TypeScript scripts under `node`, specs `scripts/*.spec.ts`, `npm test`, `npm run typecheck`.

**Spec:** `docs/proposals/2026-11-03-prd-sufficiency-and-provenance.md`, Change 1 (owner decisions 2026-11-03: an unanswered absent topic blocks chart approval; `proposed` lines are listed, not blocked).

## Global Constraints

- Topic ids, exact: core `failure`, `security`, `ground-truth`, `rollout`, `escalation`; agent products `accuracy`, `autonomy`, `fallback`, `budget`, `audit`.
- Row syntax, one per topic, in `.rig/product/sprints/sprint-<N>/coverage.md`:
  `- <id> covered source.md:<line> "<quote>"` | `- <id> answered <AC/DR/NFR ids>` | `- <id> open` | `- <id> n/a[ by <who>] — <reason>`.
- Findings, severity `block`, rules: `coverage-missing`, `coverage-row`, `coverage-topic`, `coverage-quote`, `coverage-answer`, `coverage-open`, `coverage-reason`.
- Applies only to a sprint with `source.md` that is not yet approved; an approved sprint is never made to grow `coverage.md`.
- No new script over 500 lines; `sdlc.ts` is at 499, so the new subcommands live in a new module.

## Review Focus

- A `covered` quote that is in `source.md` but nowhere near the topic: the script cannot judge it, so the evaluator's conversion mode gets a `missed-topic` category.
- `answered` pointing at a `proposed` criterion: refused (the agent's own value is not an answer).
- A sprint with `open` rows and an otherwise clean chart: `chart check` blocks and `approve` refuses.
- `n/a` with no reason, and an unknown or duplicated topic id.
- Re-running the chart after a person answers: the row moves `open` → `answered` and the block clears; `client-gaps.md` shrinks.

---

### Task 1: The topic table and the checker

**Files:**
- Create: `scripts/prdcoverage.ts`, `templates/prd-topics.md`
- Test: `scripts/prdcoverage.spec.ts`

**Interfaces:**
- Produces: `export const TOPICS: { id: string; label: string; agent: boolean; question: string }[]` (ids above, `agent: true` for the five agent topics); `export function parseCoverage(text: string): CoverageRow[]` with `CoverageRow = { id: string; state: 'covered' | 'answered' | 'open' | 'n/a'; line?: number; quote?: string; ids?: string[]; by?: string; reason?: string }`; `export function coverageProblems(i: { source: string; prd: string; coverage: string | null }): ChartFinding[]`; `export function clientGaps(coverage: string): string`.

- [ ] **Step 1: Failing tests** (fixtures: the `SOURCE`/`PRD` style of `prdformat.spec.ts`, a source that mentions "If the file is corrupt, exit 3" on line 9)
  - `coverage: null` → one `coverage-missing`.
  - A complete file (all ten ids, `failure covered source.md:9 "If the file is corrupt, exit 3"`, the rest `n/a — no model in this product` or `open`) → only `coverage-open` findings, one per open row, each naming the topic's `question`.
  - A missing id, a duplicated id, an unknown id → `coverage-row`/`coverage-topic`, one each.
  - A `covered` quote not in the source, or on a line more than 3 away → `coverage-quote` (reuse `normalise` and `prdBlocks(source, { allSections: true })` exactly as `conversionProblems` does).
  - `answered AC-4.1` where AC-4.1 is unmarked or `(proposed at chart)` → `coverage-answer`; with `(confirmed at chart by Dana)` → none; an id the PRD does not define → `coverage-answer`.
  - `n/a` with no reason → `coverage-reason`.
  - `clientGaps` of a coverage file with two open rows is a markdown list with the topic label and question, in `TOPICS` order; with none open it says "Nothing is missing."
  - The template names every `TOPICS` id and label (the template and the table cannot drift).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/prdcoverage.spec.ts`: FAIL.
- [ ] **Step 3: Implement** the three functions in `prdcoverage.ts`; `templates/prd-topics.md` holds, per topic, "covered when the source…" (one line each, with the colleague's wording for the five) and the standing question. Origins come from `prdOrigins(prd, null)`'s marker logic: export a small `confirmedIds(prd)` from `prdformat.ts` if `prdOrigins` cannot be reused as is.
- [ ] **Step 4: Run:** PASS. **Step 5: Commit** `feat(prd): coverage.md, the topics a source must say something about`.

### Task 2: Gate the chart and add the subcommands

**Files:** Modify `scripts/chart.ts` (`chartFindings`, `ownFiles`), `scripts/product.ts` (`coveragePath`); create `scripts/prdcmd.ts` if `cmdPrd` cannot grow in `sdlc.ts`; Test `scripts/chart.spec.ts`.

**Interfaces:** Consumes `coverageProblems`, `clientGaps`. Produces `coveragePath(n: number): string` (`sprintDir(n)/coverage.md`); subcommands `prd coverage <N> [--json]` (findings, last line `prd-<N>: coverage complete | <k> finding(s)`) and `prd gaps <N>` (writes `client-gaps.md` beside `coverage.md`, prints its path).

- [ ] **Step 1: Failing tests:** a sprint with `source.md`, unapproved, no `coverage.md`: `chartFindings` has `coverage-missing` (block) and `approve chart-1` refuses naming it; with a valid file whose rows are all covered/answered/n/a: none, approval works; one `open` row: `coverage-open` blocks; an approved sprint with no `coverage.md`: no finding; `coverage.md` is in `chartFiles`, so editing it after approval makes the chart stale; `prd gaps 1` writes `client-gaps.md` with the open topics.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement.** `chartFindings` pushes `coverageProblems` only when `unapproved && exists(sourcePath(n))`; add `coveragePath(n)` to `ownFiles`; wire the two subcommands (extract `cmdPrd` into `scripts/prdcmd.ts` and import it from `sdlc.ts` if `sdlc.ts` would pass 500 lines). **Step 4: Run** `chart.spec.ts`, `size.spec.ts`: PASS; fix fixtures that now lack a `coverage.md` by adding the all-`n/a` file via a shared helper, never by weakening the rule. **Step 5: Commit** `feat(chart): a source missing a topic blocks approval until answered or marked not applicable`.

### Task 3: Skill, evaluator and the eval fixture

**Files:** Modify `skills/chart/SKILL.md` (gap pass), `agents/evaluator.md` (conversion mode), `README.md` (subcommand list if it lists `prd`); create `eval/fixtures/prd-agent-gaps.md` (a synthetic agent PRD with failure, escalation, ground-truth and accuracy deliberately missing, no client data); Test `scripts/chartskill.spec.ts`.

- [ ] **Step 1: Failing test:** the chart skill text contains `coverage.md`, `templates/prd-topics.md`, `prd gaps`, `client-gaps.md`, and says the top 4 absent topics join the gap-pass batch; the evaluator text contains `missed-topic`.
- [ ] **Step 2: Run:** FAIL. **Step 3: Edit.** Chart gap pass: before the question batch, write `coverage.md` from `source.md` only (never `prd.md`), one row per topic, `n/a` only with a reason; absent topics ranked failure, escalation, ground-truth, security, rollout, then the agent ones; the first 4 go into the existing batch (an answer becomes a `(confirmed at chart by <who>)` criterion and the row `answered <ids>`); the rest stay `open`; run `S prd gaps <N>` and say in the final message that `client-gaps.md` can go to the client, and that `open` rows block approval. Evaluator conversion mode: `missed-topic` = a row `covered` whose quote is not about the topic, or `n/a`/`open` for a topic the source does cover. Keep the skill under 60 lines.
- [ ] **Step 4: Run** `npm run typecheck && npm test` once; quote the result. **Step 5: Commit** `docs(chart): coverage pass in the gap pass, missed-topic in the conversion review, agent-PRD fixture`.

### Task 4: One review

- [ ] `git diff main...HEAD` through one Opus review, fix findings in one wave, rerun `npm test`, then merge and push on the owner's word.
- Not in this plan (needs the person, costs money): the live eval over `eval/fixtures/prd-agent-gaps.md` (topic recall, false-absent rate on a complete PRD, questions asked, cost), which decides whether the probe is kept.
