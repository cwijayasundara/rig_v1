# PRD provenance (step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, per CLAUDE.md) to implement this plan task-by-task.

**Goal:** Every `AC` / `DR` / `NFR` line of a sprint PRD has exactly one origin (client, confirmed, proposed), a line with none is a blocking finding, the ledger carries it, and the chart's final message lists what the agent proposed.

**Architecture:** Origin is derived in `scripts/prdformat.ts`: a marker on the line wins, otherwise a line mapped in `conversion.md` is `client`, otherwise `unattributed` (no map at all, an in-format PRD, means all `client`). The ledger writes the origin only when it is not the default, so existing ledgers stay byte-identical. Legacy markers keep working (`answered at chart` = confirmed; `default at chart`, `decided at chart` = proposed), so no migration.

**Tech Stack:** TypeScript scripts run by `node` (no build), specs in `scripts/*.spec.ts`, `npm test`, `npm run typecheck`.

**Spec:** `docs/proposals/2026-11-03-prd-sufficiency-and-provenance.md`, Change 2 (owner decisions 2026-11-03: list proposed lines at approval, block approval for absent topics is step 2).

## Global Constraints

- Markers, exact text: `(confirmed at chart by <who>)`, `(proposed at chart)`. Legacy accepted: `(answered at chart)`, `(default at chart)`, `(decided at chart)`.
- Origins, exact words: `client`, `confirmed`, `proposed`, `unattributed`.
- Ledger row: `- AC-1.1 [rule, proposed] prd.md:12 "..."`; `[rule]` is client and `[answer]` is confirmed, unchanged.
- Rule name of the new finding: `map-origin`, severity `block`.
- Out of scope for step 1 (say so in the PR): PR-body count, intent-behaviour tag check, topic coverage (step 2), trust boundary (step 3).

## Review Focus

- A criterion carrying both a marker and a mapped source sentence: the marker wins (an answer that refines a source line).
- `normalise` must strip the new markers on both sides, or ledger quotes stop matching `prd.md`.
- An old ledger (`[rule]`, `[answer]` only) still parses and `ledger-stale` does not fire for a PRD with no proposed lines.
- A sprint without `source.md` (in-format PRD): no `map-origin` findings, all rows client.

---

### Task 1: Origin in prdformat and the ledger

**Files:**
- Modify: `scripts/chartcheck.ts` (`normalise` near line 124, `LedgerRow`/`readLedgerLine` near 113-135)
- Modify: `scripts/prdformat.ts` (`criteria`, `prdLedger`; new `prdOrigins`)
- Test: `scripts/prdformat.spec.ts`, `scripts/chartcheck.spec.ts`

**Interfaces:**
- Produces: `export type Origin = 'client' | 'confirmed' | 'proposed' | 'unattributed'`; `export function prdOrigins(prd: string, map: string | null): Map<string, Origin>`; `prdLedger(prd: string, map: string | null = null): string`; `LedgerRow.origin: Origin`.

- [ ] **Step 1: Failing tests in `prdformat.spec.ts`** (use its existing `CONVERTED` / `MAP` fixtures)
  - `prdOrigins` with `map: null` returns `client` for every id.
  - With `MAP`, a criterion line given the suffix ` (proposed at chart)` is `proposed`; ` (confirmed at chart by Dana)` and ` (answered at chart)` are `confirmed`; ` (default at chart)` and ` (decided at chart)` are `proposed`; an unmarked criterion whose id is in no map row is `unattributed`; one whose id is in a map row is `client`; marker plus map row is the marker's origin.
  - `prdLedger(prd, map)` writes `[rule, proposed]` for a proposed line, `[answer]` for a confirmed one, `[rule]` for client, and the output for a PRD with no proposed line equals `prdLedger(prd)` of today (compare with the existing expected text).
- [ ] **Step 2: Failing test in `chartcheck.spec.ts`**: `parseLedger` of `- AC-1.1 [rule, proposed] prd.md:3 "x"` gives `origin: 'proposed'`; of `[answer]` gives `confirmed`; of `[rule]` gives `client`; `[rule, bogus]` is reported as an unknown kind like any other.
- [ ] **Step 3: Run** `node --test scripts/prdformat.spec.ts scripts/chartcheck.spec.ts` (see `package.json` for the exact runner): FAIL.
- [ ] **Step 4: Implement.** `normalise` also drops `\((?:answered|confirmed|proposed|default|decided) at chart(?: by [^)]*)?\)`. In `criteria()` record `marker: 'confirmed' | 'proposed' | null` from the raw text; `kind` stays `answer` for confirmed and `rule` otherwise. `prdOrigins` applies: marker, else `map === null` → client, else id in `parseMap(map)` ids → client, else unattributed. `readLedgerLine` splits the bracket on a comma: first part is the existing kind, second an optional origin in `proposed | unattributed`; `answer` implies `confirmed`, no suffix implies `client`.
- [ ] **Step 5: Run** the two specs: PASS. Commit `feat(prd): origin of every criterion, in the ledger`.

### Task 2: Block a line with no origin

**Files:** Modify `scripts/prdformat.ts` (`conversionProblems`); Test `scripts/prdformat.spec.ts`.

- [ ] **Step 1: Failing tests** next to the existing `conversionProblems` rule-list helper (line ~116): `MAP` minus the row for one criterion yields rule `map-origin`; the same criterion with ` (proposed at chart)` yields none; `map: null` still yields only `map-missing`; the message names the id, `prd.md:<line>`, and both ways out ("map the sentence it came from" / "mark who it came from").
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement** one loop over `prdOrigins(i.prd, i.map)` entries equal to `unattributed`, using `prdCriteria` for the line number. **Step 4: Run** the full `prdformat.spec.ts`: PASS; fix fixtures that now trip `map-origin` only by adding the missing map row, never by loosening the rule.
- [ ] **Step 5: Commit** `feat(prd): a criterion with no origin blocks the conversion`.

### Task 3: Wire the map into the ledger callers

**Files:** Modify `scripts/sdlc.ts` (~301), `scripts/chart.ts` (~147); Test `scripts/chart.spec.ts`.

- [ ] **Step 1: Failing test:** a sprint with `source.md`, `conversion.md` and one proposed criterion: `prd ledger` writes `[rule, proposed]`, and `chartFindings` raises no `ledger-stale`. Delete the row's marker without regenerating: `ledger-stale` fires.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement** a single helper `conversionMapOf(n: number): string | null` in `chart.ts` (map text when both `source.md` and `conversion.md` exist, else null), exported and used by both callers and by line 210 / `sdlc.ts:305` so the four reads agree. **Step 4: Run** `chart.spec.ts` and `prdformat.spec.ts`: PASS. **Step 5: Commit** `feat(chart): the ledger is generated with the conversion map`.

### Task 4: `prd proposed <N>` for the one review

**Files:** Modify `scripts/sdlc.ts` (`cmdPrd` usage list and branch); Test `scripts/chart.spec.ts` (or the spec that drives `cmdPrd`).

- [ ] **Step 1: Failing test:** output for the Task 3 sprint is a markdown table `| id | line | requirement |` with one row per `proposed` criterion and the last line `prd-<N>: <k> proposed line(s)`; with none, `prd-<N>: no proposed lines`.
- [ ] **Step 2: Run:** FAIL. **Step 3: Implement** `proposed` as a fifth `sub` in `cmdPrd`, from `prdOrigins` and `prdCriteria`; update the usage string. **Step 4: Run:** PASS. **Step 5: Commit** `feat(prd): list the lines the agent proposed`.

### Task 5: Skill and template text

**Files:** Modify `skills/chart/SKILL.md` (steps 1 gap pass, 2, architect brief line 26, step 8), `templates/prd-format.md` (Decisions comment, line 82), `templates/edge-cases.md` (line 10), `agents/architect.md`, `agents/evaluator.md` (conversion mode `invented`: an `unattributed` or unlisted `proposed` line); Test `scripts/chartskill.spec.ts`.

- [ ] **Step 1: Failing test:** the chart skill text contains `(confirmed at chart by`, `(proposed at chart)` and `prd proposed`, and no longer tells the model to write `(answered at chart)` or `(default at chart)`.
- [ ] **Step 2: Run:** FAIL. **Step 3: Edit the text.** Gap-pass answers: `(confirmed at chart by <who>)` with `<who>` the person's `git config user.name`; "you decide" answers and edge-case defaults: `(proposed at chart)`; design-doc decisions and ADR decisions the person delegated carry `(proposed at chart)` too (text convention, not script-checked in step 1). Step 8 of the chart: open the final message with the output of `S prd proposed <N>` under the heading "Proposed by the agent (nobody at the client said these)", then the existing content; the existing `(default at chart)` listing becomes `(proposed at chart)` behaviours by intent.
- [ ] **Step 4: Run** `npm run typecheck && npm test` once; quote the result. **Step 5: Commit** `docs(chart): confirmed and proposed markers, proposed table in the final message`.

### Task 6: One review

- [ ] Run `git diff main...HEAD` through one Opus review (`/code-review`), fix findings in one wave, rerun `npm test`.
