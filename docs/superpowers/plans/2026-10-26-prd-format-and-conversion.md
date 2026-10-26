# PRD Format and Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rig ships a PRD template whose every rule is a numbered line, converts any other PRD into it (losing nothing, checked by script and reviewed), has a person approve the converted PRD before decomposition, and generates the requirements ledger from it.

**Architecture:** A new pure module `scripts/prdformat.ts` (format check, criteria extraction, ledger generation, conversion-map check), reusing `prdBlocks`/`unquoted`/`normalise` from `scripts/chartcheck.ts`. `scripts/chart.ts` adds the PRD approval and the converted-sprint state; `scripts/sdlc.ts` adds `prd check|map|ledger <N>` and `approve prd-<N>`. The model-facing half is `skills/chart/SKILL.md` step 1, `agents/evaluator.md` (conversion mode), `templates/prd-format.md`, the approve and init skills.

**Tech Stack:** TypeScript on Node type stripping, `node --test scripts/*.spec.ts`; `.mjs` for e2e and eval.

**Spec:** `docs/superpowers/specs/2026-10-26-prd-format-and-conversion-design.md`, building on `docs/superpowers/specs/2026-10-26-prd-fidelity-design.md` (the ledger, its checks and the chart approval gate, merged in 2d1dd84; read its "Relation" table in the new design for what is kept and what changes)

## Global Constraints

- Sprint files: `.rig/product/sprints/sprint-<N>/` `source.md` (never edited after it is written), `prd.md`, `conversion.md`, `conversion-review.md`, `prd-approval.json`, `requirements.md` (generated).
- Criterion line: `- AC-n.m: WHEN <trigger> THE SYSTEM SHALL <response>` or `- AC-n.m: Given <state>, when <action>, then <result>`; data rule `- DR-n: <rule>`; NFR row `| NFR-n | category | requirement | target | verified by |`.
- Allowed non-criterion lines under `### FR-n`: `Need:`, `Priority:`, `Depends on:` (optionally bulleted or bold-labelled).
- Map line: `- <id>[, <id>...] source.md:<line> "<quote>"` or `- context source.md:<line> "<quote>" — <reason>`.
- Generated ledger line: `- <id> [rule|answer] prd.md:<line> "<criterion text>"`; parent of `AC-n.m` is `FR-n`, of `NFR-n` itself, `DR-n` has none.
- Ruling against the design text: the parent FR is derived from the AC id, not written in the alias slot. An alias would make a behaviour citing `FR-4` cover every AC of FR-4, which defeats the per-rule check. (The design's "alias slot" sentence is corrected in Task 7.)
- Human-facing command names via `skillRef(...)`. No edits to any target repo.
- `npm test` and `npm run typecheck` green, output quoted, before the final review.

## Review Focus

1. A PRD in format written with CRLF, bold ids (`- **AC-1.1:** WHEN ...`) or lower-case `when ... the system shall`: still in format.
2. A criterion that wraps onto an indented continuation line: one criterion, its full text in the ledger quote.
3. An FR holding a `####` sub-heading or a paragraph of notes: `prd-prose`, naming the line.
4. A converted sprint whose `conversion.md` was deleted: `map-missing` blocks and `approve prd-N` refuses (converted = `source.md` differs from `prd.md`).
5. The person edits `prd.md` after `approve prd-N`: the PRD approval is stale and `approve chart-N` refuses.

Each has a test in the owning task.

---

### Task 1: Format check, criteria extraction and the template

**Files:**
- Create: `scripts/prdformat.ts`, `scripts/prdformat.spec.ts`
- Modify: `templates/prd-format.md` (rewritten in the design's section order, worked FR/DR/example in comments from `docs/prds/shopping-cart-app-prd.md`)

**Interfaces:**
- Consumes: `normalise`, `uncomment`, `type ChartFinding` from `scripts/chartcheck.ts`; `section` from `scripts/model.ts`.
- Produces:
  - `type Criterion = { id: string; parent: string | null; kind: 'rule' | 'answer'; line: number; text: string }`
  - `prdCriteria(prd: string): Criterion[]`: every `AC-n.m` under its `### FR-n`, every `DR-n` under `## Data rules`, every NFR table body row (text = cells joined by ` | `), in file order; `answer` when the text holds `(answered at chart)`; continuation lines joined.
  - `prdFormatProblems(prd: string): ChartFinding[]` with rules `prd-section`, `prd-criterion`, `prd-prose`, `prd-id`, `prd-nfr` (all `block`).
  - `const PRD_SECTIONS: string[]` (the design's 12 section names in order).

- [ ] **Step 1: Write the failing tests** in `scripts/prdformat.spec.ts`:
  - `templates/prd-format.md` with its comments uncommented is in format (`prdFormatProblems` returns `[]`), so the template can never drift from the check.
  - A PRD with `### FR-4: Items` holding `- AC-4.1: WHEN an item is added THE SYSTEM SHALL give it the next id` and a `## Data model` paragraph "Ids start at 1. Ids are never reused." gives `prd-section` (no Data rules) and `prd-prose` for the paragraph line only if it sits under an FR or Data rules: put it under `## Data rules` and expect `prd-prose` naming its line; rewritten as `- DR-1: ...` and `- DR-2: ...` it passes.
  - `prd-criterion`: an FR with no AC; `AC-5.1` under `FR-4`; `- AC-4.2: ids are nice` (no shape).
  - `prd-id`: `AC-4.1` twice. `prd-nfr`: an NFR target `fast`.
  - Review Focus 1: CRLF, `- **AC-1.1:** when x the system shall y` and Given/when/then all pass.
  - Review Focus 2: a wrapped AC is one `Criterion` with the joined text.
  - Review Focus 3: a `#### Notes` heading plus paragraph inside FR-4 gives `prd-prose` with the paragraph's line.
  - `prdCriteria` on the shopping-cart example returns `{ id: 'AC-1.1', parent: 'FR-1', kind: 'rule', line, text }` first, DR rows with `parent: null`, NFR rows with `parent: 'NFR-1'`, and `kind: 'answer'` for an `(answered at chart)` criterion.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/prdformat.spec.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `scripts/prdformat.ts` and rewrite `templates/prd-format.md`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(prd): the PRD template and its format check"`

### Task 2: The generated ledger

**Files:**
- Modify: `scripts/prdformat.ts`, `scripts/chartcheck.ts` (`RULE_ID`, coverage, `unknown-id`), `scripts/chart.ts` (`chartFindings`, `changeRequirements`), `scripts/sdlc.ts` (`prd` command)
- Test: `scripts/prdformat.spec.ts`, `scripts/chartcheck.spec.ts`, `scripts/chart.spec.ts`

**Interfaces:**
- Consumes: `prdCriteria` (Task 1).
- Produces:
  - `prdLedger(prd: string): string`: `# Requirements (generated from prd.md by rig: never edit)` then one generated ledger line per criterion.
  - `parentOf(id: string): string | null` (exported from `chartcheck.ts`).
  - `S prd ledger <N>` writes `requirements.md`; `S prd check <N> [--json]` prints `prdFormatProblems`.
  - New `chart check` rule `ledger-stale` (block, sprint without chart approval): `requirements.md` differs from `prdLedger(prd.md)`. Applies only when `prd.md` is in format; an out-of-format PRD on an unapproved sprint is a `prd-format` block pointing at `S prd check`.

- [ ] **Step 1: Write the failing tests.**
  - `prdLedger` on a two-AC, one-DR, one-NFR PRD equals an exact expected string (lines `- AC-1.1 [rule] prd.md:<n> "WHEN ... SHALL ..."`), and `parseLedger` reads it back with no `ledgerProblems` finding when behaviours cite every id.
  - Coverage: a behaviour citing only `FR-1` does not cover `AC-1.1` (`rule-uncovered`); citing `(FR-1, AC-1.1)` does; `(FR-1, DR-2)` covers `DR-2`; a behaviour citing `NFR-1` covers the `NFR-1` row; `AC-9.9` and `DR-9` are `unknown-id`.
  - `chart.spec.ts`: `chartFindings` reports `ledger-stale` after an AC is added to `prd.md` without re-running `prd ledger`, and not after `sdlc prd ledger 1`; `changeRequirements` for an intent with `prd: [FR-1]` copies the `AC-1.x` rows and the `DR-2` row only when a behaviour cites it.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/prdformat.spec.ts scripts/chartcheck.spec.ts scripts/chart.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `RULE_ID` gains `DR-\d+`; `ledgerProblems` treats a row as cited when any behaviour's `rules` or `reqs` contains its id, and drops the blanket `AC-` exemption (an AC is unknown unless some row has it as id or alias); `changeRequirements` selects rows whose `parentOf(id)` is in the intent's `prd:` plus rows a behaviour cites.
- [ ] **Step 4: Run** the same command, then `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`. Expected: PASS (fix fixtures whose hand ledgers relied on the AC exemption).
- [ ] **Step 5: Commit** `git commit -m "feat(prd): the requirements ledger is generated from the PRD's numbered criteria"`

### Task 3: The conversion map check

**Files:**
- Modify: `scripts/prdformat.ts`, `scripts/chartcheck.ts` (export `prdBlocks` with an `allSections` option and `unquoted`), `scripts/sdlc.ts` (`prd map`)
- Test: `scripts/prdformat.spec.ts`

**Interfaces:**
- Produces:
  - `type MapRow = { ids: string[]; context: boolean; line: number; quote: string; reason: string }`, `parseMap(text: string): MapRow[]`
  - `conversionProblems(i: { source: string; prd: string; map: string | null }): ChartFinding[]` with `map-missing`, `map-unquoted`, `map-misquote`, `map-id`, `map-reason`, `map-fence`, `map-line` (all `block`).
  - `S prd map <N> [--json]` runs it on `source.md`, `prd.md`, `conversion.md`.

- [ ] **Step 1: Write the failing tests:** a source with a prose "Ids start at 1. Ids are never reused." paragraph and a fenced JSON example; a correct map gives `[]`; omitting the "never reused" sentence gives `map-unquoted` quoting it; a lone `10` left unquoted is reported; mapping it to `context` with no reason gives `map-reason`; naming `DR-7` absent from `prd.md` gives `map-id`; `prd.md` without the fenced example's content gives `map-fence`; `map: null` gives `map-missing`; the source's Context section is in scope (every section counts in a source).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/prdformat.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement**, reusing `prdBlocks(text, { allSections: true })`, `unquoted` and `normalise`; fences compared after `normalise` on their inner lines.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(prd): the conversion map accounts for every sentence of the original"`

### Task 4: The PRD approval gate

**Files:**
- Modify: `scripts/product.ts` (`sourcePath`, `conversionPath`, `conversionReviewPath`, `prdApprovalPath`), `scripts/chart.ts` (`isConverted`, `prdApprovalState`, `prdApprovalRefusal`, `writePrdApproval`; `ownFiles` adds `source.md`, `conversion.md`), `scripts/sdlc.ts` (`approve prd-<N>`, `approveChart`, `approveTarget`), `scripts/check.ts` (CI human row), `templates/settings.json`, `templates/managed-settings.json`, `skills/approve/SKILL.md`, `scripts/journey.ts`
- Test: `scripts/chart.spec.ts`, `scripts/check.spec.ts`, `scripts/permissions.spec.ts`, `scripts/removed.spec.ts` (approve argument-hint), `scripts/journey.spec.ts`

**Interfaces:**
- Produces:
  - `export const PRD_RE = /^prd-(\d{1,4})$/`
  - `isConverted(n: number): boolean`: `source.md` exists and `normalise(source) !== normalise(prd)`.
  - `prdApprovalState(n: number): 'approved' | 'stale' | 'missing'` over the sha of `prd.md`, `source.md`, `conversion.md`.
  - `prdApprovalRefusal(n: number): string | null`: any `prdFormatProblems`, `conversionProblems`, open question in `prd.md`, or `conversion-review.md` finding whose status is `open` or `reopened`.
  - `writePrdApproval(n: number, by: string): void` writes `{ by, at, files: [{ path, sha }] }`.

- [ ] **Step 1: Write the failing tests.**
  - `approve prd-1` without `SDLC_HUMAN` exits 3; with an out-of-format `prd.md` it exits 1 naming `prd-prose`; with a clean conversion it writes `prd-approval.json` and says `Next: /rig:chart 1` via `skillRef`.
  - Review Focus 4: `conversion.md` deleted in a converted sprint, `approve prd-1` exits 1 naming `map-missing`.
  - Review Focus 5: after approval, editing `prd.md` makes `prdApprovalState(1) === 'stale'`, and `approve chart-1` exits 1 naming `approve prd-1`; a sprint whose `source.md` equals `prd.md` needs no PRD approval.
  - Editing `source.md` or `conversion.md` after chart approval makes the chart stale.
  - `approve` with `--ask` and no argument prints `ASK prd-1` when the converted sprint's PRD approval is missing.
  - CI lists `prd approval prd-3 by Mallory` for a PR adding `sprint-3/prd-approval.json`; both settings templates deny `Edit(... /sprints/**/prd-approval.json)`.
  - The journey's next step for a converted sprint with no PRD approval is `${skillRef('approve')} prd-<N>` by the person.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts scripts/check.spec.ts scripts/permissions.spec.ts scripts/journey.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** The approve skill handles `ASK prd-<N>` like `ASK chart-<N>` (options "Approve prd-<N>", "Cancel"); its argument-hint becomes `<slug | prd-N | chart-N>`.
- [ ] **Step 4: Run** `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(approve): a person approves a converted PRD before the chart decomposes it"`

### Task 5: Chart step 1, the conversion reviewer, init

**Files:**
- Modify: `skills/chart/SKILL.md` (step 1 rewritten: source.md, `prd check`, convert + gap pass, `prd map`, conversion review, stop for `approve prd-<N>`, the re-run rule, `prd ledger`; the hand-written ledger paragraph removed), `agents/evaluator.md` (a `## Conversion mode` with `weakened`, `invented`, `ledger`), `agents/architect.md` (cite `AC-n.m`/`DR-n` next to the FR), `templates/intent-format.md` and `templates/testplan-format.md` (the example ids), `skills/init/SKILL.md` (point to `templates/prd-format.md`)
- Test: `scripts/chartskill.spec.ts`, `scripts/initskill.spec.ts`

- [ ] **Step 1: Write the failing text tests**, one `assert.match` per point: step 1 names `source.md` and "never edit"; runs `S prd check` and converts only when it has findings; writes `conversion.md`; asks the gap-pass questions during conversion; runs `S prd map`; launches `rig:evaluator` with "check the conversion for sprint <N>" and writes `conversion-review.md`; stops with `/rig:approve prd-<N>` then `/rig:chart <N>`; on a re-run never rewrites `prd.md` or `source.md`; runs `S prd ledger <N>` after the gap pass. The evaluator has `## Conversion mode` naming `weakened`, `invented` and `ledger`, and reads the original file when `source.<ext>` exists. The architect text shows `(FR-4, AC-4.1)` and `(FR-4, DR-2)`. Init names `templates/prd-format.md`. Update the Task 5 tests of the ledger plan that pinned the hand-written ledger (`**Requirements ledger.**`) to the generated form.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chartskill.spec.ts scripts/initskill.spec.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Edit the texts**, within their current length limits.
- [ ] **Step 4: Run** `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(chart): chart converts a PRD into the template, has it reviewed, and waits for the person"`

### Task 6: Reference PRDs, the e2e fixture and the eval

**Files:**
- Modify: `docs/prds/shopping-cart-app-prd.md` (in the template), `tests/e2e/prd/chart-fixture/product/sprints/sprint-1/` (`prd.md` in the template, `requirements.md` regenerated, intents and `cases.md` cite AC ids), `tests/e2e/phases/s6-chart.mjs` (its id regexes), `eval/chart.mjs`, `eval/chart.test.mjs`, `eval/fixtures/chart/sprint-b.json`
- Test: `npm run test:e2e:fast`, `node --test eval/chart.test.mjs`, a spec asserting both reference PRDs pass `prdFormatProblems`

**Interfaces:**
- `scoreChart(key, findings, intents, ledger, conversion?)` where `conversion = { map: MapRow[]; criteria: Criterion[] }`: for a key with `rules`, `rulesQuoted` = share of key rules some map row quotes; `rulesCited` = share whose mapped ids a behaviour cites; `constraintsKept` = share where every `mustKeep` regex matches the text of a mapped criterion. Without `conversion` (an in-format PRD) the ledger-based scoring stays.

- [ ] **Step 1: Write the failing tests:** `prdFormatProblems` is `[]` for `docs/prds/shopping-cart-app-prd.md` and the fixture PRD; the eval scores a sprint-b conversion where the map quotes both rules, `DR-1: Each item id is an integer starting at 1.` and `DR-2: Ids are never reused, even after an item is removed.` exist, and behaviours cite them, as `1, 1, 1`, and one where DR-2 lost "never" as `constraintsKept: 0.5`.
- [ ] **Step 2: Run** `node --test eval/chart.test.mjs && node --disable-warning=ExperimentalWarning --test scripts/prdformat.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rewrites and the scoring; regenerate the fixture ledger with `node --disable-warning=ExperimentalWarning scripts/sdlc.ts prd ledger 1` run inside a copy, or by calling `prdLedger` directly.
- [ ] **Step 4: Run** `node --test eval/chart.test.mjs && npm run test:e2e:fast`. Expected: PASS, S6 13/13.
- [ ] **Step 5: Commit** `git commit -m "feat(prd): reference PRDs in the template; the eval scores the conversion"`

### Task 7: Verify and record

- [ ] **Step 1:** Correct the design's "alias slot" sentence to "the parent FR is derived from the AC id" (Global Constraints ruling).
- [ ] **Step 2:** Raise `SCRIPTS_CAP` in `scripts/neutrality.spec.ts` to the measured total with a dated note.
- [ ] **Step 3:** `CHANGELOG.md` entry: the template, `prd check|map|ledger`, conversion at chart, `approve prd-<N>`, the generated ledger; existing repos: approved sprints unchanged.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: both exit 0.
- [ ] **Step 5: Commit** `git commit -m "docs: changelog for the PRD format and conversion"`, then one whole-branch review, one fix wave, rerun Step 4.
