# Intent map incorporations, wave 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo's CLAUDE.md: inline, at most one Sonnet implementer per independent file group, one Opus review of `git diff main...HEAD` at the end). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close three escape hatches in the intent map ship path: only the last mutant of a clause is read (item 8), an equivalent mutant has no recorded exit (item 1), and a hand-written `pass` is accepted (item 6). Prove them end to end with an integration test that drives the real `sdlc.ts` CLI.

**Architecture:** Pure rules change in `scripts/intentmap.ts` and are ported 1:1 to the oracle `eval/intent-map.mjs` (both must return the same rule ids). `scripts/intentmapio.ts` gains the adjudication file and the run-ledger binding. A new spec drives `sdlc init/new/intent-record/intent-adjudicate/verify` in a temp git repo.

**Tech Stack:** TypeScript run by `node --test` (no build), Node `.mjs` oracle, `scripts/testkit.ts` (`makeRepo`, `sdlc`, `write`).

**Spec:** `docs/superpowers/specs/2026-11-08-intent-map-incorporations.md` (items 1, 6, 8). Waves 2 and 3 (items 2 to 5, 7) are out of scope here.

## Global Constraints

- Rule ids are reserved sensor ids through `RULES` in `scripts/intentmap.ts` (registry.ts spreads it): the only new id is `result-unbacked`. Adjudication reuses `vacuous`; no other new id. (Spec items 1, 6.)
- The map stays frozen: results and adjudications live in files beside it, never inside it; the result is not hashed into the approval. (Spec item 6, base design decision 5.)
- Adjudication approval bar, decided by the user: a non-empty `by` plus `harness-tamper` coverage. No waiver-style signing step.
- `formal-failed` for duplicate mutant ids and for one clause with both `holds: true` and `holds: false`. `unmutated` only when a clause has zero mutants. (Spec item 8.)
- Verification before any claim: run `npm test` and `npm run typecheck`, quote the output. Fix harness code, never generated files; never `--no-verify`.

## Review Focus

- Adjudication names a mutant id that does not exist, or one of a clause that holds: ignored, never suppresses another finding.
- `adjudications.json` malformed or missing: reads as `{}`, so `vacuous` stands (fail closed).
- A `pass` in `intent-results.json` whose `run` id matches a ledger line with a different command, a non-zero exit, or a different commit: `result-unbacked`.
- A clause with two mutants where only the first is killed: `vacuous`, not a pass.
- `runs.jsonl` absent (nothing ran): every `pass` is `result-unbacked`.

---

### Task 1: Read every mutant of a clause (item 8)

**Files:**
- Modify: `scripts/intentmap.ts:124-137` (`formalFindings`), `scripts/intentmap.ts:148-160` (`receipt`)
- Modify: `eval/intent-map.mjs:129-141` (same change)
- Test: `scripts/intentmap.spec.ts`, `eval/intent-map.test.mjs`

**Interfaces:**
- Produces: `formalFindings(map, holds, mutants, why)` unchanged signature; `receipt(map, holds?, mutants?: Mutant[])` appends to each formal row ` (planted: <id> rejected, ...)` for the clause's mutants that do not hold.

- [ ] **Step 1: Write failing tests** (both files, same cases), using the login map text with `formalCommand` set and `clauses` all true:
  - `two mutants for C2, first rejected, second holds` → exactly one `vacuous` finding naming the second id.
  - `two mutants for C2 with the same id` → one `formal-failed` containing `duplicate`.
  - `C2 has one mutant holds:true and one holds:false under the same id` is covered by the duplicate-id case; add `no mutants for C3` → `unmutated` naming C3 only.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/intentmap.spec.ts` and `node --test eval/intent-map.test.mjs`. Expected: the new tests FAIL (second mutant ignored).
- [ ] **Step 3:** Replace the `byClause` map with a group-by of `clause -> Mutant[]`. For each wanted clause: empty group gives `unmutated`; each mutant with `holds === true` gives `vacuous`; any repeated `id` across `mutants` gives one `formal-failed` (`duplicate mutant id <id>`). Port identically to `eval/intent-map.mjs`.
- [ ] **Step 4:** Re-run both commands. Expected: PASS, including all pre-existing tests (the login fixture has one mutant per clause).
- [ ] **Step 5:** `git add scripts/intentmap.ts scripts/intentmap.spec.ts eval/intent-map.mjs eval/intent-map.test.mjs && git commit -m "fix(intent-map): every mutant of a clause is read, duplicates fail closed"`

### Task 2: Adjudicated survivors (item 1)

**Files:**
- Modify: `scripts/intentmap.ts` (types, `formalFindings`, `receipt`, `CheckOpts`, `ShipInput`, `shipCheck`)
- Modify: `eval/intent-map.mjs` (`formalFindings`, `check`)
- Modify: `scripts/intentmapio.ts` (read file, `cmdIntentAdjudicate`, `FIX['vacuous']`), `scripts/sdlc.ts` (register the subcommand next to `intent-record`)
- Modify: `skills/build/SKILL.md` (one paragraph: a surviving mutant is either fixed or adjudicated by a person via the command)
- Test: `scripts/intentmap.spec.ts`, `scripts/intentmapio.spec.ts`, `eval/intent-map.test.mjs`

**Interfaces:**
- Produces in `intentmap.ts`: `export type Adjudication = { verdict: 'non-bug' | 'clause-vacuous'; because: string; by: string }`, `export type Adjudications = Record<string, Adjudication>`. `CheckOpts.adjudications?: Adjudications`, `ShipInput.adjudications?: Adjudications`.
- Produces in `intentmapio.ts`: `readAdjudications(slug): Adjudications` (file `adjudications.json`, `{}` on missing or malformed) and `adjudicate(slug, mutantId, verdict, because, by): void` (throws on empty `by` or `because`, unknown verdict, or a mutant id not present in the formal command's last recorded verdict... simplest: not checked here; the id is looked up at ship time and an unknown id is simply never used). CLI: `intent-adjudicate <slug> <mutant-id> <non-bug|clause-vacuous> --by <name> -- "<reason>"`.

- [ ] **Step 1: Write failing tests.**
  - `intentmap.spec.ts`: a holding mutant `m1` on C2 with `adjudications: { m1: { verdict: 'non-bug', because: 'commutes', by: 'Ana' } }` gives no finding; the same with `verdict: 'clause-vacuous'` gives `vacuous`; an adjudication of `m1` with `by: ''` gives `vacuous`; an adjudication of an id that is not a mutant changes nothing. `receipt` output contains `adjudicated non-bug: commutes`.
  - `intentmapio.spec.ts`: `intent-adjudicate demo m1 non-bug --by Ana -- "commutes"` exits 0 and writes `adjudications.json` with that row; without `--by`, exit non-zero and no file; a malformed `adjudications.json` reads as `{}`.
  - `eval/intent-map.test.mjs`: parity for the non-bug and no-`by` cases.
- [ ] **Step 2:** Run the three test files. Expected: FAIL.
- [ ] **Step 3:** In `formalFindings`, a holding mutant is skipped (no finding) only when `adj[m.id]?.verdict === 'non-bug' && adj[m.id].by.trim() && adj[m.id].because.trim()`. Thread `adjudications` through `check`/`shipCheck` and `receipt`. In `intentShipFindings` pass `readAdjudications(slug)`. `adjudicate` writes the file via the same JSON style as `recordResult` and calls `sanctionWrites` (from `core.ts`) on it so the script's own write is not tamper; a hand edit is not sanctioned and is caught by the existing `harness-tamper` sensor. Confirm in the test that `isProtected('.rig/changes/demo/adjudications.json')` is true; if it is not, add the glob to `PROTECTED` in `scripts/sensors.ts`.
- [ ] **Step 4:** Update `FIX.vacuous` to mention `intent-adjudicate` for an equivalent mutant, one sentence. Re-run the three files plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(intent-map): a person can adjudicate a surviving mutant as non-bug`.

### Task 3: Back each pass with the run ledger (item 6)

**Files:**
- Modify: `scripts/runs.ts:9,66` (`RunRow` gains `id?: string`, `commit?: string`; `recordRun` returns the id)
- Modify: `scripts/intentmap.ts` (`RULES` + `'result-unbacked'`, `Results` row gains `run?: string`, `ShipInput.runs?`, new `resultFindings`)
- Modify: `scripts/intentmapio.ts` (`recordResult`, `intentShipFindings`, `FIX`)
- Test: `scripts/intentmap.spec.ts`, `scripts/intentmapio.spec.ts`; check `scripts/registry.spec.ts` still passes (new reserved id)

**Interfaces:**
- Produces: `recordRun(slug, row): string` returns `r<n>` where n is the 1-based line count of `runs.jsonl` after the append; the row stored carries `id`. `Results[E].run` holds that id. `ShipInput.runs: { id?: string; cmd: string; exit: number; commit?: string }[]`.
- `resultFindings(map, results, runs)`: for every scenario with `status === 'pass'` in the merged map, a finding `result-unbacked` unless `results[id]` exists and `runs` has a line with `id === results[id].run`, `cmd === results[id].command`, `commit === results[id].commit`, `exit === 0`.

- [ ] **Step 1: Write failing tests.**
  - `intentmap.spec.ts` `shipCheck` cases: a result with matching ledger line gives no `result-unbacked`; no `run` field, unknown run id, different `cmd`, `exit: 1`, different commit, and empty `runs` each give exactly one `result-unbacked` naming the scenario.
  - `intentmapio.spec.ts`: after `intent-record demo E1 -- ...` the json has `run: 'r1'` and `runs.jsonl` line 1 carries `id: 'r1'` and a `commit`; then editing `intent-results.json` to drop `run` makes `verify` print `result-unbacked`.
- [ ] **Step 2:** Run both spec files. Expected: FAIL.
- [ ] **Step 3:** Implement as in Interfaces. `recordResult` stores `run: id` and `commit` on both the ledger row and the result. `intentShipFindings` loads `runs.jsonl` the way `intentReceipt` already does (reuse, extract a shared `readRuns(slug)` in `intentmapio.ts`). `FIX['result-unbacked']`: `record the result with S intent-record, never by hand`.
- [ ] **Step 4:** Run `npm run typecheck` and the two spec files plus `scripts/registry.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(intent-map): a pass must be backed by a ledger run`.

### Task 4: Integration test through the real CLI

**Files:**
- Create: `scripts/intentmap.integration.spec.ts` (picked up by the `scripts/*.spec.ts` glob in `npm test`)
- Modify: `docs/superpowers/specs/2026-11-08-intent-map-incorporations.md` (status line: wave 1 built, once green)

**Process.** One temp git repo per test (`makeRepo`, `sdlc init`, `sdlc new demo`). The map is `eval/fixtures/intent-map/login/intent-plan.md` plus a `## Formal command` of `node formal.mjs`. `formal.mjs` is written into the repo by the test; it prints, as its last line, the JSON stored in `verdict.json` (`{"clauses": {...}, "mutants": [...]}`), so each test controls the formal verdict deterministically with no Python, CrossHair or bcrypt. Real parts: the CLI, `verify`, the run ledger, `intent-record`, `intent-adjudicate`, the tamper sensor.

- [ ] **Step 1: Write the tests** (all drive `sdlc(repo, [...])`, assert on `code` and `stdout + stderr`):
  - `green path`: verdict all-true with one rejected mutant per clause C2, C3, C7, C8, C9; `intent-record demo E1 -- "node -e process.exit(0)"` and the same for E2; `verify demo` exits 0 with no finding.
  - `equivalent mutant`: verdict has `m1` on C2 holding. `verify` exits non-zero with `vacuous`; `intent-adjudicate demo m1 clause-vacuous --by Ana -- "x"` leaves it blocked; `... non-bug --by Ana -- "commutes"` makes `verify` pass; `intent-adjudicate` without `--by` is refused and `verify` is still blocked.
  - `second mutant survives`: two mutants on C3, the second holds. `verify` reports `vacuous` naming the second.
  - `hand-written pass`: skip `intent-record`; write `intent-results.json` with E1 and E2 `pass`, a command and a commit, no `run`. `verify` reports `result-unbacked` for E1 and E2. Then `intent-record` properly and the finding clears.
  - `ledger mismatch`: record E1 properly, then edit `command` in `intent-results.json`. `verify` reports `result-unbacked`.
  - `no formal run`: `verdict.json` absent so `formal.mjs` exits non-zero. `verify` reports `formal-failed`.
- [ ] **Step 2:** Run it before Tasks 1 to 3 are merged to see the red set; after them: `node --disable-warning=ExperimentalWarning --test scripts/intentmap.integration.spec.ts`. Expected: all PASS.
- [ ] **Step 3:** Run the full gate and quote the tail: `npm run typecheck && npm test`. Expected: exit 0.
- [ ] **Step 4:** Update the spec status line and commit `test(intent-map): integration journey for adjudication, backed results and per-clause mutants`.
- [ ] **Step 5:** One Opus review of `git diff main...HEAD` (`/code-review`), fix findings in one wave, re-run `npm test`.

## Self-review

- Coverage: item 8 is Task 1; item 1 is Task 2; item 6 is Task 3; the integration process the user asked for is Task 4. Items 2 to 5 and 7 are deliberately a later plan.
- Open risk named in Task 2 Step 3: whether `.rig/changes/*/adjudications.json` is already under `PROTECTED`. The step makes the executor check it and fix it if not; this is what makes "harness-tamper coverage" true rather than assumed.
- The spec's "dogfood through `/rig:start`" is not possible here (CLAUDE.md: rig is never run on this repo); Task 4 is the substitute.
