# Intent map incorporations, waves 2 and 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo's CLAUDE.md: inline, one Opus review of `git diff main...HEAD` per wave, at most 4 agent launches per wave). Steps use checkbox (`- [ ]`) syntax. Wave 2 and wave 3 are two branches and two reviews: finish, review and merge wave 2 before starting wave 3.

**Goal:** Close the rest of the spec: a formal checker must bind to the shipped code (item 3), every trusted dependency is named and pinned (item 4), a one-way decision says why (item 5), a sampled-evidence tier (item 7) and a scheduled recheck of shipped maps (item 2).

**Architecture:** Same split as wave 1. Pure rules in `scripts/intentmap.ts`, ported to the oracle `eval/intent-map.mjs` when they are map-structure rules (items 4, 5; the oracle has no repo, so items 3, 7 and 2 are TS-only). File and process work in `scripts/intentmapio.ts` and two new small files: `scripts/intenttargets.ts` (item 3), `scripts/intentrecheck.ts` (item 2). Item 2 reuses the `maintain` proposal mechanism, so nothing unattended edits code.

**Tech Stack:** TypeScript run by `node --test`, the `.mjs` oracle, `scripts/testkit.ts`, GitHub Actions template.

**Spec:** `docs/superpowers/specs/2026-11-08-intent-map-incorporations.md` (items 2 to 5 and 7). Wave 1 plan: `2026-11-08-intent-map-incorporations-wave1.md` (built, branch `feat/intent-map-wave1`; this plan assumes it is merged).

## Global Constraints

- New reserved rule ids, added to `RULES` (registry.ts spreads it; never waivable): `formal-targets-diff`, `trusted-unpinned`, `one-way-unjustified`, `property-failed`. Rule ids the oracle ports must match the TS ones (the parity test in `scripts/intentmap.spec.ts`).
- The map stays frozen; nothing in this plan edits an approved map or hashes results into the approval.
- Opt-in: a change with no `intent-map.md` sees no new finding. A map with no `## Property command` sees no property finding. A map with no backticked symbol in a clause and no `## Trusted` sees no trusted finding.
- Plan skill text stays within its 60-line limit (`scripts/size.spec.ts`).
- Size: `scripts/neutrality.spec.ts` `SCRIPTS_CAP` is 9500 and scripts are at 9026. This plan adds about 350 lines, so Task 1 raises it to 10000 under the user's 2026-11-08 instruction to raise the harness to 12,000 lines (the total cap in `scripts/size.spec.ts` is already 12000; check it still holds).
- Verify with `npm run typecheck && npm test` and quote the tail. Fix the harness, never a generated file; never `--no-verify`.

## Review Focus

- Item 3: a formal command with no checker file (a bare `crosshair check src/auth.py`) must pass when the command names a changed source file; a checker whose only import is a side copy next to it must fail.
- Item 3: a docs-only change with a formal row fails closed (no source in the diff), with a fix line that tells the person to waive or re-point.
- Item 4: a backticked symbol that is also an Empirical scenario's subject is covered; a Trusted entry with an empty `pin:` fails; a map with no backticks and no `## Trusted` stays clean.
- Item 5: a formal row with no decision at all is `one-way-unjustified`; `both-ways` rows are untouched; a `one-way-because:` with an empty sentence fails.
- Item 7: the property command exiting 0 but printing nothing is a pass, non-zero is `property-failed`, a missing command with the section present but empty is `property-failed`; the receipt label never says "proof".
- Item 2: a command that was a pass at ship and now fails produces one proposal once (a second run with the same drift proposes nothing); an unshipped change is never rechecked; the recheck never writes into a change record.

---

# Wave 2: bind, name, justify (items 3, 5, 4)

### Task 1: Formal targets must be changed source (item 3)

**Files:**
- Create: `scripts/intenttargets.ts`
- Modify: `scripts/intentmap.ts` (`RULES`, `ShipInput.targets`, `targetFindings`, `shipCheck`), `scripts/intentmapio.ts` (`intentShipFindings`, `FIX`), `scripts/neutrality.spec.ts` (`SCRIPTS_CAP` to 10000, note the date and reason)
- Test: `scripts/intenttargets.spec.ts` (new), `scripts/intentmap.spec.ts`, `scripts/intentmap.integration.spec.ts`

**Interfaces:**
- Produces in `intenttargets.ts`: `formalTargets(command: string, root: string): string[]`, repo-relative posix paths of (a) every whitespace token of the command that is an existing file under `root` (leading `./` stripped), and (b) the local imports of each such token that is a `.py`, `.js`, `.mjs`, `.cjs` or `.ts` file, one level deep. Python: `from a.b import x` and `import a.b` resolve to `a/b.py` or `a/b/__init__.py`, tried relative to the checker's directory then to `root`. JS and TS: `from './x'` and `require('./x')` resolve relative to the checker with extensions `''`, `.ts`, `.js`, `.mjs`, `.cjs`, `/index.js`. Bare package imports are ignored. Unreadable files give `[]` for their imports.
- Produces in `intentmap.ts`: `ShipInput.targets?: { files: string[]; diffSource: string[] }` and rule `formal-targets-diff`: when the map has a formal row, a `targets` is supplied, and no entry of `files` is in `diffSource` (and `files` minus the command's own checker is not enough: a checker file only counts if it is itself a source file in `diffSource`), one finding naming the command. `targets` undefined skips the rule (pure and oracle paths).
- Consumes: `isSource(file, config.paths)` from `scripts/model.ts` and the `diffs` already passed to `intentShipFindings`.

- [ ] **Step 1: Write failing tests.**
  - `intenttargets.spec.ts` (temp dir with files): `python3 formal.py` where `formal.py` has `from src.auth import decide` and `src/auth.py` exists gives `['formal.py', 'src/auth.py']`; `node ./check.mjs` with `import x from './model.mjs'` gives `check.mjs` and `model.mjs`; `crosshair check src/auth.py` gives `['src/auth.py']`; a token that is not a file and a bare `import os` give nothing.
  - `intentmap.spec.ts`: with `targets: { files: ['formal.py', 'model.py'], diffSource: ['src/auth.py'] }` one `formal-targets-diff`; with `files: ['formal.py', 'src/auth.py']` and the same `diffSource`, none; with `targets` undefined, none; a map with no formal row, none.
  - Integration (extend `beforeEach`): the temp repo gets `src/login.js` (a source file under the registry paths, committed on the base so it can be changed) and `formal.mjs` imports `./src/login.js`; each journey edits `src/login.js` so it is in the verify diff. Add `side copy`: `formal.mjs` imports only `./model.mjs` (a new file outside the source paths) and `verify` reports `formal-targets-diff`.
- [ ] **Step 2:** Run the three files with `node --disable-warning=ExperimentalWarning --test <file>`. Expected: FAIL.
- [ ] **Step 3:** Implement as in Interfaces. In `intentShipFindings` compute `targets` only when the parsed map has a `formalCommand`. Add `FIX['formal-targets-diff']`: `point the ## Formal command at a checker that imports the code this change edits; a checker that imports a copy of it proves the copy (a person re-approves a map edit)`. Run `npm run typecheck`. Check how `verify` computes `diffs` in the temp repo (base vs working tree) before writing the integration setup, and adapt the setup, not the rule.
- [ ] **Step 4:** Run the three files, then `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`. Expected: all PASS (the existing wave-1 integration journeys stay green through the new setup).
- [ ] **Step 5:** Commit `feat(intent-map): the formal checker must bind to changed source`.

### Task 2: A one-way decision says why (item 5)

**Files:**
- Modify: `scripts/intentmap.ts` (`RULES`, `structure()`), `eval/intent-map.mjs` (same), `eval/fixtures/intent-map/login/intent-plan.md` and `intent.md` (add `D2`, `D3`, point `R2` and `R3` at them), `eval/fixtures/intent-map/cases/one-way.md` (unchanged, add a sibling `cases/silent-one-way.md`), `skills/plan/SKILL.md` (line 21: the decision rule), `scripts/intentmapio.ts` (`FIX`)
- Test: `scripts/intentmap.spec.ts`, `eval/intent-map.test.mjs`

**Interfaces:**
- Produces: rule `one-way-unjustified` at plan time (and ship, it is a structure rule): every formal row names a decision; the decision's text either starts `both-ways` or contains `one-way-because:` followed by a non-empty sentence. A row with no `decision`, a decision id that is not in `## Decisions`, or an empty sentence each gives one finding naming the row.

- [ ] **Step 1: Write failing tests** (both files): `cases/silent-one-way.md` (R1 formal with no decision) gives `one-way-unjustified`; a decision `D2: one-way-because:` (empty) gives it; `D2: one-way-because: the words only promise refusal` clears it; a both-ways row is untouched; the updated login map still has no plan-time findings. The parity test must cover the new case file.
- [ ] **Step 2:** Run both test files. Expected: FAIL.
- [ ] **Step 3:** Implement in `structure()` and port to the oracle. Update the login fixtures: `D2: one-way-because: the words only say which role an admin gets, not that login succeeds` for R2 and `D3: one-way-because: the words only say how email and username collide, not how a token is made` for R3. Skill line 21: a formal row's decision starts `both-ways` or says `one-way-because: <sentence>`.
- [ ] **Step 4:** Run `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts` and `node --test eval/intent-map.test.mjs`. Expected: PASS, including `lifecycle.spec.ts` (it approves the login fixture).
- [ ] **Step 5:** Commit `feat(intent-map): a one-way decision records its reason`.

### Task 3: A Trusted section names and pins every dependency (item 4)

**Files:**
- Modify: `scripts/intentmap.ts` (`IntentMap.trusted`, `parse`, `structure`, `RULES`), `eval/intent-map.mjs` (same), the login fixtures (`## Trusted` with `check_password`, `lookup`, `signer`, `clock`; backticks around those symbols in C2 and C3 text), `skills/plan/SKILL.md`, `scripts/intentmapio.ts` (`FIX`)
- Test: `scripts/intentmap.spec.ts`, `eval/intent-map.test.mjs`

**Interfaces:**
- Produces: `IntentMap.trusted: { name: string; contract: string; pin: string }[]`, parsed from `## Trusted` lines `- <name>: <contract>. pin: <command>`. Rule `trusted-unpinned`, two forms: a Trusted entry with an empty `pin:`; and a backticked identifier in a formal clause's text that is neither a Trusted `name` nor a word in any Empirical scenario's `title`, `given`, `when` or `then`. Nothing else is checked (the pin command is not run).

- [ ] **Step 1: Write failing tests** (both files): a clause naming `` `lookup` `` with no Trusted entry gives `trusted-unpinned`; adding `- lookup: returns the row for the named account. pin: pytest -q tests/test_lookup.py` clears it; an entry with `pin:` empty gives it; a symbol covered by an Empirical scenario's title is clean; a map with no backticks and no `## Trusted` is clean; the updated login fixture has no plan-time findings.
- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement `parse` for the section and the two checks in `structure()`; port to the oracle. Fixture pins: `check_password` pinned by the E1 command already in the map; `lookup`, `signer`, `clock` pinned by `python3 -m pytest -q tests/test_trusted_boundary.py`, and add that small test file to `eval/fixtures/intent-map/login/tests/` (three trivial pinning tests; `prune` ignores it because it names no C-id). Skill line 21: list `## Trusted` and its line shape.
- [ ] **Step 4:** Run `npm run typecheck`, the full spec glob and the oracle test. Expected: PASS.
- [ ] **Step 5:** Commit `feat(intent-map): trusted dependencies are named and pinned`.

### Task 4: Wave 2 journey and review

**Files:** Modify `scripts/intentmap.integration.spec.ts`, the spec status line.

- [ ] **Step 1:** Add two journeys through the real CLI: `plan phase` (`sdlc approve demo --check` or the existing `approvalRefusal` route used in `lifecycle.spec.ts`) refuses a map with a silent one-way row with `one-way-unjustified` and a clause symbol without a Trusted entry with `trusted-unpinned`, and accepts the fixed map; and `ship phase` reports `formal-targets-diff` for the side copy (Task 1) and clears when the checker imports the changed source.
- [ ] **Step 2:** Run `npm run typecheck && npm test`; quote the tail. Expected: exit 0.
- [ ] **Step 3:** Update the spec status line (items 3 to 5 built), commit, then one Opus review of `git diff main...HEAD`; fix findings in one wave with a failing test each; re-run `npm test`.

---

# Wave 3: sampled tier and recheck (items 7, 2)

### Task 5: Property command (item 7)

**Files:**
- Modify: `scripts/intentmap.ts` (`IntentMap.propertyCommand`, `parse`, `RULES` + `property-failed`, `shipCore`, `receipt`), `scripts/intentmapio.ts` (`FIX`, `intentReceipt`), `skills/plan/SKILL.md`, `skills/build/SKILL.md`
- Test: `scripts/intentmap.spec.ts`, `scripts/intentmapio.spec.ts`, `scripts/intentmap.integration.spec.ts`

**Interfaces:**
- Produces: an optional `## Property command` section, one line, parsed exactly like `## Formal command`. At ship, when the section exists, `shipCheck` runs it once through `ShipInput.run`: exit 0 is a pass, any other exit or an empty section line is `property-failed`. The section is part of the frozen map (it is in the approved text), so it needs no new freeze. The receipt gets one line `- property: pass (evidence, sampled, not exhaustive)` or `- property: fails`. `intentReceipt` takes the verdict from the last ledger run of the command (`exit`), never from a new run. No section, no line, no finding.

- [ ] **Step 1: Write failing tests.** Unit: exit 0 gives no finding and the receipt line with that exact label; exit 1 gives `property-failed`; section present with an empty line gives `property-failed`; no section gives neither. IO: `intentReceipt` reads the last ledger run for the property command. Integration: a map with `## Property command` of `node prop.mjs` where `prop.mjs` exits 1 blocks `verify` with `property-failed`; exit 0 ships clean, and the command is in `runs.jsonl`.
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement. Skill lines: plan says the section is optional and for pure cores where a property suite exists (hypothesis, fast-check); build says run no extra command by hand, `verify` runs it.
- [ ] **Step 4:** Run typecheck and the full spec glob. Expected: PASS.
- [ ] **Step 5:** Commit `feat(intent-map): an optional property command, labelled sampled evidence`.

### Task 6: Scheduled recheck of shipped maps (item 2)

**Files:**
- Create: `scripts/intentrecheck.ts`, `templates/rig-intent-recheck.yml` (weekly cron, off until `RIG_INTENT_RECHECK` is `on`, same five-question header and one-open-PR guard as `templates/rig-maintain.yml`)
- Modify: `scripts/maintain.ts` (export `proposalText` and widen `Finding['kind']` with `'recheck'`; no behaviour change), `scripts/sdlc.ts` (register `intent-recheck`), `README.md` (command list), `skills/` none
- Test: `scripts/intentrecheck.spec.ts` (new)

**Interfaces:**
- Produces: `recheckFindings(slug: string): Finding[]` and `cmdIntentRecheck(args: Args): void`. For every `.rig/changes/<slug>/` that has an `intent-map.md` and is shipped on trunk (the `isShipped` set in `lifecycle.ts`; export it if it is not), merge `intent-results.json` into the map (`applyResults`), then: (a) run the formal command and judge it with `shipCheck` (no ledger argument, so wave 1's `result-unbacked` is not applied to a re-run) with the change's `adjudications.json`; (b) re-run each passing scenario's recorded command with `runCommand`; (c) re-run the property command when present. Any non-pass becomes one `Finding` of kind `recheck` with key `recheck:<slug>:<sorted rule ids or scenario ids>`, written as a proposal under `.rig/maintain/proposals/` with the existing `proposalText` and recorded in `seen.json`, so the same drift is proposed once. The command never writes into `.rig/changes/`. `--json` prints the findings; `--cap N` as `maintain` does.

- [ ] **Step 1: Write failing tests** (temp repo, a shipped change fixture with a map, results and a trivial formal stub): clean change gives no proposal; a scenario command that now exits 1 gives one proposal file named `recheck-1-<slug>.md`; running again gives none (seen); an unshipped change with the same drift gives none; the change record's files are byte-identical after the run.
- [ ] **Step 2:** Run the spec. Expected: FAIL.
- [ ] **Step 3:** Implement. Workflow template: a copy of the maintain template with the schedule `37 5 * * 1`, the scan step `node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts intent-recheck --cap 5`, branch prefix `rig/intent-recheck-`, and a header comment listing the five questions. `init --full --workflows` copies it: check how `rig-maintain.yml` is listed in `scripts/` (grep for `rig-maintain`) and add the new template the same way, plus whatever spec enumerates workflow templates.
- [ ] **Step 4:** Run typecheck and the full spec glob. Expected: PASS.
- [ ] **Step 5:** Commit `feat(intent-map): a weekly recheck of shipped maps proposes an intent on drift`.

### Task 7: Wave 3 journey and review

- [ ] **Step 1:** Add an integration journey to `scripts/intentmap.integration.spec.ts`: ship a change with a map through the real CLI, mark it shipped the way `lifecycle.spec.ts` does, change the world (make a recorded scenario command fail), run `sdlc intent-recheck` and assert one proposal, then run it again and assert none.
- [ ] **Step 2:** `npm run typecheck && npm test`; quote the tail. Expected: exit 0.
- [ ] **Step 3:** Update the spec status line (all items built), commit, one Opus review of `git diff main...HEAD`, one fix wave with failing tests first, re-run `npm test`.

## Self-review

- Coverage: item 3 is Task 1, item 5 Task 2, item 4 Task 3, item 7 Task 5, item 2 Task 6; Tasks 4 and 7 are the integration process and review for each wave. The spec's "Order of attack" is followed (3 first, then 4 and 5 which ride along, 7 and 2 last); I put 5 before 4 because 5 is two lines of rule and fixes the fixture the other rule also edits.
- My calls, for you to check: (1) `formal-targets-diff` is its own rule id, where the spec says `formal-failed`; (2) the rule counts only a source file in the diff, so a side copy created by the same change does not satisfy it (the spec's wording would let it); (3) one level of import resolution, Python and JS/TS only, otherwise the command line must name the source file; (4) item 2 reuses the `maintain` proposal and PR mechanism with its own weekly workflow, instead of opening a "tier-1 finding", which does not exist outside a change; (5) a formal row with no decision at all is `one-way-unjustified`, so the login fixture gains D2 and D3.
- Risk named in Task 1 Step 3: how `verify` computes the diff in the temp repo decides the integration setup; the executor adapts the setup, never weakens the rule.
- The two wave-1 minors (adjudication keyed by clause, ledger ids from the line count) and the stale-pass gap stay out of this plan; the recheck in Task 6 is the answer to the stale pass.
