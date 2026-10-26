# PRD Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every testable sentence of a sprint PRD is quoted in a ledger, cited by a behaviour and a test case (or marked out of scope), kept intact by the chart, carried word for word to the build and the PR review, and a chart with open review findings cannot be approved.

**Architecture:** Pure parsing and rules in `scripts/chartcheck.ts` (text in, findings out), wired to disk in `scripts/chart.ts`, gated in `scripts/sdlc.ts` (`approveChart`, `cmdWaive`, `cmdNew`). The model-facing half is text: `skills/chart/SKILL.md`, `agents/architect.md`, `agents/evaluator.md`, `templates/*`, `skills/pr|start|plan|build/SKILL.md`. Eval in `eval/chart.mjs`.

**Tech Stack:** TypeScript run by Node's type stripping (`node --test scripts/*.spec.ts`), `.mjs` for e2e and eval.

**Spec:** `docs/superpowers/specs/2026-10-26-prd-fidelity-design.md`

## Global Constraints

- The sprint PRD copy (`.rig/product/sprints/sprint-<N>/prd.md`) is never rewritten by any new code or skill text.
- Ledger path: `.rig/product/sprints/sprint-<N>/requirements.md`. Change copy: `.rig/changes/<slug>/requirements.md`. Waivers: `.rig/product/sprints/sprint-<N>/waivers.json`.
- Ledger line: `- <id>[ (<alias>)] [<kind>] prd.md:<line> "<quote>"[ — <reason>]`; kinds `rule`, `context`, `answer`, `out-of-scope: <when>, decided by <who>`.
- Ledger ids: `FR-<n>.<k>`, `NFR-<n>.<k>`, `G-<k>`.
- Excluded PRD sections (exact headings): `Context and problem`, `Goals and success metrics`, `Risks and assumptions`, `Changes since last sprint`, `Open questions`. Every other section is in scope.
- Review suffixes: `→ fixed (confirmed)` closed; `→ reopened: <why>`, bare `→ fixed`, or no suffix open.
- Human-facing command names go through `skillRef(...)` (standalone repos answer to `/rig-x`).
- No edits to any target repo (`shop_app`). Fix the harness only.
- Verification: `npm test` and `npm run typecheck`, output quoted, before the final review.

## Review Focus

1. A PRD quote containing `**bold**`, backticks, curly quotes or a CRLF line ending: the ledger quote without the markup still matches (`normalise` strips them on both sides).
2. A bullet that wraps onto an indented continuation line: it is one unit, so a ledger row quoting the whole bullet covers it, and quoting only its first line does not.
3. A fenced code block (example JSON) inside an in-scope section: skipped, not a unit (my call; noted in the design's builder list).
4. A behaviour citing `FR-4.2` still satisfies the FR-level rules for `FR-4` (`prd:` coverage, `intent-untraced`, `unknown-id`).
5. A waiver recorded for finding 2, then the review is rewritten so finding 2's text differs: the old waiver no longer covers it.

Each has a test in the owning task below.

---

### Task 1: Ledger parsing and ledger rules (pure)

**Files:**
- Modify: `scripts/chartcheck.ts`
- Test: `scripts/chartcheck.spec.ts`

**Interfaces:**
- Produces:
  - `type LedgerKind = 'rule' | 'context' | 'answer' | 'out-of-scope'`
  - `type LedgerRow = { id: string; alias: string | null; kind: LedgerKind; when: string; by: string; line: number; quote: string; reason: string }`
  - `parseLedger(text: string): LedgerRow[]`
  - `normalise(s: string): string`: collapse whitespace, strip `*`, `_`, backticks, map curly quotes to straight, trim, drop a trailing ` (answered at chart)`.
  - `prdUnits(prd: string): { line: number; text: string }[]`: in-scope bullets (with continuation lines), NFR table body rows, and paragraph sentences; skips headings, HTML comments, frontmatter, fenced blocks, table header and separator rows, excluded sections.
  - `ledgerProblems(i: { prd: string; ledger: string | null; intents: Intent[]; cases: TestCase[] | null; required: boolean }): ChartFinding[]`
  - `Behaviour` gains `rules: string[]` (ledger ids cited, e.g. `FR-4.2`, `G-1`, or an AC alias); `reqs` keeps FR/NFR parents, so `FR-4.2` adds `FR-4` to `reqs`. `TestCase` gains `rules: string[]` from the Requirement column the same way.
  - Exported regex `RULE_ID = /\b(?:N?FR-\d+\.\d+|G-\d+|AC-\d+(?:\.\d+)*)\b/g`.

- [ ] **Step 1: Write the failing tests** in `scripts/chartcheck.spec.ts`. Fixture PRD `IDS_PRD` holds `### FR-4: Items` with bullet `- Each item has an integer id starting at 1.` and a `## Data model` section with paragraph `Ids are never reused. They survive a restart.` plus a `## Context and problem` paragraph.
  - `prdUnits` returns exactly the two-sentence split of the data-model paragraph, the FR-4 bullet, and nothing from Context.
  - `parseLedger` reads `- FR-4.1 (AC-4.1) [rule] prd.md:9 "Each item has an integer id starting at 1."` into `{ id: 'FR-4.1', alias: 'AC-4.1', kind: 'rule', line: 9, ... }` and `[out-of-scope: sprint 2, decided by Ana]` into `kind: 'out-of-scope', when: 'sprint 2', by: 'Ana'`.
  - `ledgerProblems` rules, one test each, asserting `rules(found)`:
    - `ledger: null, required: true` gives `['ledger-missing']`; `required: false` gives it at severity `report`.
    - A ledger omitting "Ids are never reused." gives `ledger-unquoted` with the sentence in the message.
    - A row quoting "Ids may be reused." gives `ledger-misquote`; a row whose `prd.md:<line>` is 20 lines off also does (tolerance 3).
    - A `context` row with no reason, or an `out-of-scope` row with no `decided by`, gives `ledger-reason`.
    - A `rule` row no behaviour cites gives `rule-uncovered`; an `out-of-scope` row does not.
    - With cases, a `rule` row no case cites gives `rule-untested`.
    - A behaviour citing `FR-4.9` (not in the ledger) gives `unknown-id`.
  - Review Focus 1: a PRD bullet ``- Each `item` has a **unique** id.`` with CRLF endings matches the row `"Each item has a unique id."`.
  - Review Focus 2: a bullet with an indented continuation line is one unit; a row quoting only its first line leaves `ledger-unquoted`.
  - Review Focus 3: a fenced JSON block under `## Data model` yields no unit.
  - Review Focus 4: `parseIntent` on `- B1 (FR-4.2): ...` gives `reqs: ['FR-4']`, `rules: ['FR-4.2']`, and `traceReport` on that intent with `prd: [FR-4]` has no `intent-untraced`.
  - A PRD with no in-scope units and `ledger: null` gives no finding (heading-only fixtures elsewhere stay green).

- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chartcheck.spec.ts`. Expected: the new tests fail (`parseLedger is not a function` and similar).

- [ ] **Step 3: Implement** the interfaces above in `scripts/chartcheck.ts`. A unit is covered when some row's normalised quote contains the unit's normalised text; a row is misquoted when its normalised quote is not a substring of the normalised PRD, or no unit containing it starts within 3 lines of `line`. A behaviour or case covers a row when it cites the row's id or alias. `ledger-missing` is skipped when `prdUnits` is empty. All new rules are `block` except `ledger-missing` with `required: false`. Keep `parseBehaviours`/`parseCases` regex changes local to the reqs/rules extraction.

- [ ] **Step 4: Run** the same command. Expected: all pass, including every pre-existing test in the file.

- [ ] **Step 5: Commit** `git add scripts/chartcheck.ts scripts/chartcheck.spec.ts && git commit -m "feat(chart): requirements ledger parsing and trace rules"`

### Task 2: Wire the ledger into the chart on disk

**Files:**
- Modify: `scripts/chart.ts` (`ownFiles`, `chartFindings`), `scripts/product.ts` (path helpers)
- Modify: `tests/e2e/prd/chart-fixture/product/sprints/sprint-1/` (add `requirements.md`, cite ledger ids in intents and `testplan/cases.md`)
- Test: `scripts/chart.spec.ts`, `tests/e2e/phases/s6-chart.mjs` (via `npm run test:e2e:fast`)

**Interfaces:**
- Consumes: `ledgerProblems`, `prdUnits` from Task 1.
- Produces: `ledgerPath(n: number): string`, `waiversPath(n: number): string`, `reviewPath(n: number): string` in `scripts/product.ts` (`sprint-<N>/requirements.md`, `waivers.json`, `chart-review.md`). `ownFiles(n)` includes `requirements.md` and `waivers.json` when they exist; `chart-review.md` stays out.

- [ ] **Step 1: Write the failing tests** in `scripts/chart.spec.ts`:
  - `chartFindings` on a sprint whose PRD has the bullet `- Ids are never reused.` and no `requirements.md` reports `ledger-missing` as `block`; after `writeChartApproval(1, ...)` it reports it as `report`.
  - Writing `requirements.md` then editing it after approval makes `chartState(1).state === 'stale'` and names `requirements.md` in `changed`; the same for `waivers.json`; editing `chart-review.md` leaves it `approved`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** `chartFindings` calls `ledgerProblems({ prd, ledger: exists(ledgerPath(n)) ? read(...) : null, intents: intentsOf(n), cases, required: chartState(n).state !== 'approved' })`. Add `ledgerPath(n)` and `waiversPath(n)` to `ownFiles`.
- [ ] **Step 4: Update the e2e fixture.** Its PRD has four in-scope bullets and one NFR row: write `requirements.md` with one `rule` row each (`FR-1.1`, `FR-2.1`, `FR-3.1`, `NFR-1.1`), cite those ids in the three intents' behaviours and in `cases.md`'s Requirement column, so `S6: the known-good chart has no blocking finding` stays true.
- [ ] **Step 5: Run** `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts && npm run test:e2e:fast`. Expected: pass.
- [ ] **Step 6: Commit** `git commit -m "feat(chart): chart check reads the ledger; ledger and waivers join the approved files"`

### Task 3: Chart approval refuses open review findings; waive a finding

**Files:**
- Modify: `scripts/chartcheck.ts` (review parser), `scripts/sdlc.ts` (`approveChart`, `cmdWaive`), `skills/waive/SKILL.md` (argument-hint, description)
- Modify fixtures that approve a chart: `scripts/chart.spec.ts`, `scripts/journey.spec.ts`, `scripts/queue.spec.ts`, `scripts/sdlc.spec.ts`, `tests/e2e/prd/chart-fixture/product/sprints/sprint-1/chart-review.md` (new, `verdict: pass` and an empty `## Findings`)
- Test: `scripts/chartcheck.spec.ts`, `scripts/chart.spec.ts`

**Interfaces:**
- Consumes: `reviewPath`, `waiversPath` from Task 2.
- Produces:
  - `type ReviewFinding = { n: number; text: string; sha: string; status: 'confirmed' | 'reopened' | 'claimed' | 'open' }`, where `sha` is `sha(normalise(text without its suffix))`.
  - `parseReview(text: string): ReviewFinding[]`: `- ` bullets under `## Findings` only, numbered from 1.
  - `type ChartWaiver = { finding: number; text_sha: string; by: string; at: string; reason: string }`
  - `openFindings(review: ReviewFinding[], waivers: ChartWaiver[]): ReviewFinding[]`: those not `confirmed` and with no waiver matching both `finding` and `text_sha`.

- [ ] **Step 1: Write the failing tests.**
  - `chartcheck.spec.ts`: `parseReview` gives statuses `confirmed`, `reopened`, `claimed` (bare `→ fixed`), `open` for four lines; bullets under `## Deferred` are ignored. `openFindings` drops a waived finding, and (Review Focus 5) keeps it when the waiver's `text_sha` belongs to different text.
  - `chart.spec.ts`: on a clean chart, `approve chart-1` (human) with no `chart-review.md` exits 1 and mentions step 5 of the chart skill; with a review holding one bare `→ fixed` finding, it exits 1 and the stderr lists `1.` and the finding text; after `waive chart-1 1 accepted risk` (human), approval succeeds and `waivers.json` holds `{ finding: 1, by, reason: 'accepted risk' }`; `waive chart-1 1 x` without `SDLC_HUMAN` exits 3; `waive chart-1 7 x` (no such finding) exits 1.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chartcheck.spec.ts scripts/chart.spec.ts`. Expected: new tests fail.
- [ ] **Step 3: Implement.** In `approveChart`, after the block-finding check: read `reviewPath(n)` (missing: fail with `chart-${n} has no chart-review.md: run ${skillRef('chart')} ${n} to its review step`), compute `openFindings`, and fail listing `  <n>. <text>` plus `waive one with ${skillRef('waive')} chart-${n} <finding number> <reason>`. In `cmdWaive`, before the change-waiver path: when the first word matches `CHART_RE`, take `<number> <reason...>`, keep the `SDLC_HUMAN` guard and `ownerOrFail(args, 'waivers')`, need no active change and no `--days`, fail on a finding number not in `parseReview`, and append the row to the JSON array in `waiversPath(n)` (create `[]` if missing).
- [ ] **Step 4: Update every chart-approving fixture** listed above to write a passing `chart-review.md` before `approve chart-N`.
- [ ] **Step 5: Run** `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts && npm run test:e2e:fast`. Expected: pass.
- [ ] **Step 6: Commit** `git commit -m "feat(approve): a chart with open review findings is refused until each is confirmed fixed or waived"`

### Task 4: The change carries the PRD's words

**Files:**
- Modify: `scripts/sdlc.ts` (`cmdNew`), `scripts/chart.ts` (renderer), `scripts/lifecycle.ts` (hash an optional file)
- Test: `scripts/sdlc.spec.ts`, `scripts/lifecycle.spec.ts`

**Interfaces:**
- Consumes: `parseLedger`, `ledgerPath`, `intentOf`.
- Produces: `changeRequirements(slug: string): string | null` in `scripts/chart.ts`: `# Requirements: <slug>` plus one ledger line per row the intent cites (by `prd:` FR id pulling every `rule`/`answer` row of that parent, or by a behaviour's rule id), in ledger order, copied as-is; `null` when the sprint has no ledger. `lifecycle.ts` gains `OPTIONAL = ['requirements.md']`, hashed when present and never required by `approvalRefusal`.

- [ ] **Step 1: Write the failing tests.**
  - `sdlc.spec.ts`: on an approved chart with a ledger of `FR-1.1 [rule]`, `FR-1.2 [context]`, `FR-2.1 [rule]` and an intent with `prd: [FR-1]`, `new alpha --source <intent>` writes `.rig/changes/alpha/requirements.md` holding the `FR-1.1` line byte for byte and neither `FR-1.2` nor `FR-2.1`. Without a ledger, no file is written.
  - `lifecycle.spec.ts`: a change approved with `requirements.md` goes `stale` when that file is edited; a change without it approves as before.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/sdlc.spec.ts scripts/lifecycle.spec.ts`. Expected: new tests fail.
- [ ] **Step 3: Implement** `changeRequirements`, write it in `cmdNew` right after the `spec.md` seed, and mention it in the `created ...` output line. Add `OPTIONAL` to `hashes()` in `lifecycle.ts`.
- [ ] **Step 4: Run** the same command. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "feat(start): a charted change gets the PRD rows its intent cites, word for word"`

### Task 5: Skill, agent and template text

**Files:**
- Modify: `skills/chart/SKILL.md` (steps 1, 2 architect brief, 4, 5, 8), `agents/architect.md`, `agents/evaluator.md`, `templates/intent-format.md`, `templates/testplan-format.md`, `templates/review-brief.md`, `skills/pr/SKILL.md`, `skills/start/SKILL.md`, `skills/plan/SKILL.md`, `skills/build/SKILL.md`
- Test: `scripts/chartskill.spec.ts`, `scripts/reviewbrief.spec.ts`, `scripts/prskill.spec.ts`

**What each text must say** (keep each file inside its current length limits; match its voice):
- chart step 1: after the gap pass, write `requirements.md` as the ledger format above, every in-scope sentence, bullet and NFR row quoted exactly; answers quoted as `answer` rows; never edit `prd.md` for it; run `S chart check <N> --json` and fix only `ledger-*` findings before step 2.
- chart step 2 brief and `agents/architect.md`: read `requirements.md`; each behaviour cites the ledger ids it serves next to its FR (`- B2 (FR-4, FR-4.2): ...`) and keeps every number, limit and "never/only/every/unique/starts at" of the rows it cites; ADRs cite ledger ids too.
- chart step 4 and `testplan-format.md`: the Requirement column holds FR/NFR ids and the ledger ids the case proves; every `rule` and `answer` row gets a case.
- chart step 5: after the fix round, relaunch `rig:evaluator` once with "confirm the fixes for sprint <N>" and only the `→ fixed` lines; rewrite each to `→ fixed (confirmed)` or `→ reopened: <why>`; `verdict: pass` only when all are confirmed; no second fix round; say `/rig:approve` refuses open findings and a person may `/rig:waive chart-<N> <n> <reason>`.
- chart step 8: list open findings by number with the waive command.
- `agents/evaluator.md`: read `requirements.md`; add categories `weakened` (cites a row but drops or loosens a constraint; quote the row and the behaviour side by side; the example is "an integer id starting at 1, never reused" becoming "an integer id") and `ledger` (a `context` row a test could assert, an out-of-scope reason that does not hold); add a confirm mode that rereads only the cited files and answers `confirmed` or `reopened: <why>` per line.
- `intent-format.md`: the behaviour comment shows `(FR-4, FR-4.2)`.
- `review-brief.md`: read `.rig/changes/<slug>/requirements.md` when present; code that breaks a quoted row is `correctness` citing the ledger id.
- `skills/pr/SKILL.md` triage: a finding citing a ledger id is never moved to Deferred and never dismissed by the model.
- `skills/start|plan|build/SKILL.md`: read `requirements.md` next to `spec.md`; never edit it; a behaviour must not contradict it.

- [ ] **Step 1: Write the failing text tests**, one `assert.match` per bullet above in the matching spec file (for example `assert.match(skill, /requirements\.md/)` in step 1's text, `assert.match(evaluator, /\*\*weakened:\*\*/)`, `assert.match(brief, /requirements\.md[\s\S]*correctness/)`, `assert.match(pr, /ledger id[^\n]*never[^\n]*Deferred/)`).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chartskill.spec.ts scripts/reviewbrief.spec.ts scripts/prskill.spec.ts`. Expected: new tests fail.
- [ ] **Step 3: Edit the texts.**
- [ ] **Step 4: Run** `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`. Expected: pass (the skill-length, vendor and neutrality specs included).
- [ ] **Step 5: Commit** `git commit -m "feat(chart): skills and agents write, cite, keep and review the requirements ledger"`

### Task 6: Eval for prose rules

**Files:**
- Create: `eval/fixtures/chart/sprint-b.json`, `eval/fixtures/chart/sprint-b-prd.md`
- Modify: `eval/chart.mjs` (`scoreChart`, `renderChartTable`, a `--key` arg), `eval/chart.test.mjs`

**Interfaces:**
- `sprint-b.json`: `{ "prd": "eval/fixtures/chart/sprint-b-prd.md", "requirements": [...], "rules": [{ "quote": "Ids start at 1.", "mustKeep": ["\\b1\\b"] }, { "quote": "Ids are never reused, even after an item is removed.", "mustKeep": ["never|not.*reuse|unique"] }] }`. The PRD is a small cart store PRD with these two sentences in a `## Data model` paragraph, not in an FR.
- `scoreChart(key, findings, intents, ledger = [])` adds, only when `key.rules` is set: `rulesQuoted` (share of key rules whose quote some ledger row contains), `rulesCited` (share whose row id a behaviour cites), `constraintsKept` (share where every `mustKeep` regex matches, case-insensitive, the text of some behaviour citing that row). `runChartOne` reads `requirements.md` with `parseLedger`. `--key sprint-b` picks the key; `--dry` with `sprint-b` exits 2 with "no known-good chart for sprint-b".

- [ ] **Step 1: Write the failing tests** in `eval/chart.test.mjs`: a ledger quoting both rules and behaviours citing them with "starting at 1" and "never reused" scores `1, 1, 1`; dropping "never reused" from the behaviour gives `constraintsKept: 0.5`; with no `rules` in the key the three fields are absent.
- [ ] **Step 2: Run** `node --test eval/chart.test.mjs`. Expected: fail.
- [ ] **Step 3: Implement.** Add the three columns to the table only when present.
- [ ] **Step 4: Run** `node --test eval/chart.test.mjs`. Expected: pass. Live runs (`node eval/chart.mjs --key sprint-b`) cost money and are started by the person.
- [ ] **Step 5: Commit** `git commit -m "feat(eval): chart eval scores prose rules quoted, cited and kept"`

### Task 7: Verify and record

- [ ] **Step 1: Run** `npm test` and `npm run typecheck`. Expected: both exit 0; quote the summary lines.
- [ ] **Step 2:** Add a `CHANGELOG.md` entry naming the ledger, the new chart-check rules, the approval refusal and `waive chart-<N>`.
- [ ] **Step 3: Commit** `git commit -m "docs: changelog for the requirements ledger"`
- [ ] **Step 4:** One review of `git diff main...HEAD` (`/code-review`), fix findings in one wave, rerun Step 1.
