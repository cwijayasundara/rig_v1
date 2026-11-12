# Known Failure Classes in the Core Flow (R6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three defect classes reach the one-change flow (`/rig:start` and the PR review), not only `/rig:chart`: lost updates under concurrent commands, an option that swallows the next flag, and a rule weakened between the requirements and the spec.

**Architecture:**
- **The checklist.** `templates/edge-cases.md` already names the first two, but only `/rig:chart` walks it, and chart is off in the core profile. This change makes `/rig:start`'s spec step walk it too.
- **Guides.** Rules for the first two go in `guides/engineering.md` and `guides/testing.md`. Those are injected at edit time, and every profile ships them.
- **Review.** A robustness pass goes in `templates/REVIEW.md`, which both the `/rig:pr` reviewer and CI `ai-review` read.
- **Weakening check.** A deterministic `S approve <slug> --check` warning flags a spec behaviour that drops a "never", a limit or a number from the `requirements.md` row it cites.
- **Journey.** It gains two J3 rubric items, concurrency and weakening, with a bad snapshot each.
- **Option parsing has no journey item.** The journey's PRD lists "a command line" as a non-goal, so there is nothing for an inspector to probe. It is covered by the guide, the review pass and the spec step.

**Tech Stack:** TypeScript on Node ≥ 22.18, `node:test`, the e2e journey (`tests/e2e/journey/*.mjs`, `node --test`).

**Spec:** `docs/superpowers/2026-11-11-rig-readiness-and-adoption.md` §2 Step 1, row R6. Defects from `docs/feedback/`: a PRD rule ("ids are never reused") weakened, items lost under 20 concurrent adds, and `--name --json` taking `--json` as the name.

## Global Constraints

- **Strong words** (the weakening check, case-insensitive, whole words): `never`, `always`, `must`, `only`, `at most`, `at least`, `exactly`, `every`, `unique`. Numbers are every `\d+(\.\d+)?` in the quoted text.
- **Formats.**
  - A `requirements.md` row: `- <id> [<kind>] prd.md:<line> "<quote>"` (`scripts/chart.ts:204`).
  - A spec behaviour: `- B<n> (<id>, <id>, …): <text>` (`templates/intent-format.md:39`).
- The weakening check warns: `WARNING weakened: B<n> cites <id> but drops "<word>"`. It never refuses, because the person approving decides.
- `scripts/sdlc.ts` stays at exactly 500 lines. The only edit there replaces line 195 in place.
- Skills ≤ 60 lines, guides ≤ 60, rubrics ≤ 60 (`rubrics.test.mjs`), scripts ≤ 500. The harness cap is 12,000. Add at most 120 capped lines.
- Existing client repos keep their own `REVIEW.md` (`init --full --workflows` never overwrites it). The CHANGELOG line says to merge the new pass by hand.
- `npm test` and `npm run typecheck` pass. Quote the output.

## Review Focus

1. **A behaviour cites several ids.** The check takes the union of their strong words and numbers. A word kept in different case or inflection ("Never", "must not") counts as kept.
2. **A cited id has no row in `requirements.md`, or the file is absent** (every core change). There is no warning and no crash.
3. **Numbers written differently** ("14 days" vs "fourteen days", "3" vs "three") warn. That is acceptable, since the template already asks for the exact numbers, and the warning names the number.
4. **`edge-cases.md` read from a vendored core repo.** The start skill's path must resolve to `.rig/templates/edge-cases.md` after `forProject`. A core vendor copies every template, so the file is there.
5. **A rubric item added to J3.** Every recorded `J3.json` (synthetic and each bad set) must carry it, or replay reports "item missing from answer". `recorded/real` has no J3 and is untouched.

---

### Task 1: The weakening check in `approve --check`

**Files:**
- Create: `scripts/weaken.ts`
- Modify: `scripts/sdlc.ts:195` (in place), `scripts/vendor.ts` (`'weaken'` in `VENDORED`)
- Test: `scripts/weaken.spec.ts`

**Interfaces:**
- Produces:
  - `export function weakenings(spec: string, requirements: string): string[]` (pure). For each `- B<n> (<ids>): <text>` line under `## Behaviours` (and `### Failure behaviour`), take each cited id that has a requirements row. Collect the strong words and numbers of the row's quote. Return one `B<n> cites <id> but drops "<w>"` per word or number missing from the behaviour's text, de-duplicated.
  - `export function weakeningLines(slug: string): string[]`: reads `.rig/changes/<slug>/spec.md` and `requirements.md`, returns `WARNING weakened: …` lines, and returns `[]` when either file is absent.
- `sdlc.ts:195` becomes `out([...weakeningLines(slug), \`ok: ${slug} can be approved\`].join('\n'))`, with its import on an existing import line.

- [ ] **Step 1: Write the failing tests** in `scripts/weaken.spec.ts`:
  - `a dropped "never" and a dropped number are named`. The row is `- AC-1 [rule] prd.md:4 "an id is never reused, at most 3 loans"`, and B1 cites AC-1 with `B1 (FR-1, AC-1): ids are reused rarely; up to 3 loans`. Expect exactly `['B1 cites AC-1 but drops "never"', 'B1 cites AC-1 but drops "at most"']`. The 3 is kept.
  - `kept words in any case pass, and several cited ids are unioned`: `Never`, plus a second id whose quote has `exactly 14`.
  - `a cited id without a row, and an uncited behaviour, give nothing`.
  - `approve --check prints the warning and still exits 0`. Use a repo with `approvedChange`-style setup from `testkit.ts`, then write `requirements.md` and a weakening `spec.md`. Expect exit 0 and stdout matching `/WARNING weakened: B1 cites AC-1 but drops "never"/`, then `ok:`.
  - `approve --check with no requirements.md is unchanged` (Review Focus 2).

- [ ] **Step 2: Run them and confirm they fail.** Run `node --disable-warning=ExperimentalWarning --test scripts/weaken.spec.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `scripts/weaken.ts` and the in-place `sdlc.ts:195` edit, and add `'weaken'` to `VENDORED`.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/weaken.spec.ts scripts/vendor.spec.ts` and `wc -l scripts/sdlc.ts`. Expected: pass, and `500`.

- [ ] **Step 5: Commit** with `feat(weaken): approve --check warns when a behaviour drops a cited requirement's never, limit or number`.

### Task 2: The spec step, the guides and the review pass

**Files:**
- Modify: `skills/start/SKILL.md` (step 3), `templates/edge-cases.md` (intro paragraph only), `guides/engineering.md`, `guides/testing.md`, `templates/REVIEW.md`, `CHANGELOG.md`
- Test: `scripts/failureclasses.spec.ts` (new)

**Interfaces:**
- Consumes: `harnessFiles(true, 'core')` from `scripts/vendor.ts`, to check the vendored text.
- Exact additions:
  - **Start skill, step 3.** After the `## Behaviours` bullet, add a bullet: "walk the change through `${CLAUDE_PLUGIN_ROOT}/templates/edge-cases.md`: for each item whose surface the change has (it writes shared state, takes a path, parses options, can fail), write the default as a behaviour unless the request says otherwise; and when the request or `requirements.md` states a rule, the behaviour keeps its words (never, always, at most, every number)". It must stay one line.
  - **`edge-cases.md` intro.** It now says the list is walked at chart time and by `/rig:start` for an uncharted change. The table stays as it is.
  - **`engineering.md`.** Iron rule 11, **Concurrent writers**: "a read-modify-write of shared state (a file, a row, a counter) holds a lock or uses an atomic compare-and-swap; two commands at once lose no write and never hand out the same id". Rule 12, **Options**: "parse options with the stack's parser; an option that takes a value never takes the next flag as that value, and an unknown flag fails".
  - **`testing.md`.** One rule: "a change with one of those surfaces has a test that runs two writers at once, or passes `--opt --other`".
  - **`REVIEW.md` Review passes.** Add pass 6, **Robustness**: concurrent writers, option parsing, and a behaviour weaker than the requirement it cites. Add to the Important list: "a lost update under concurrent calls, an option that takes the next flag as its value, or a spec behaviour weaker than the requirement it cites".

- [ ] **Step 1: Write the failing tests** in `scripts/failureclasses.spec.ts`:
  - `the core start skill walks the edge-case list from the vendored templates`. `harnessFiles(true,'core')` has `.claude/skills/rig-start/SKILL.md` containing `.rig/templates/edge-cases.md`, and it has the key `.rig/templates/edge-cases.md` (Review Focus 4).
  - `the start skill keeps a cited rule's words`: it matches `/keeps its words/`.
  - `the guides name concurrent writers and option values`. `guides/engineering.md` matches `/Concurrent writers/` and `/never takes the next flag/`. `guides/testing.md` matches `/two writers at once/`.
  - `REVIEW.md has the robustness pass and grades its findings Important`.
  - `edge-cases.md says /rig:start walks it too`.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Make the text edits.** Then add the CHANGELOG line: "existing repos merge the new `REVIEW.md` pass by hand".

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/failureclasses.spec.ts scripts/size.spec.ts scripts/skilltext.spec.ts scripts/profile.spec.ts`. Expected: pass, with every skill and guide ≤ 60 lines.

- [ ] **Step 5: Commit** with `feat(start): the spec step walks the edge-case list and keeps cited rules; guides and review cover the failure classes`.

### Task 3: Journey rubric items and bad snapshots

**Files:**
- Modify: `tests/e2e/journey/rubrics/J3.md`, every `tests/e2e/journey/recorded/{synthetic,bad/*}/verdicts/J3.json`
- Create: `tests/e2e/journey/recorded/bad/lost-loan-concurrent/` and `tests/e2e/journey/recorded/bad/spec-weakens-rule/`. Copy `bad/limit-hardcoded-twice/` (the same files), then set the seeded item.

**Interfaces:**
- New rubric lines (exact ids):
  - `- J3.10 [block] Two processes borrowing at the same moment lose no loan and never exceed the loan limit: run 20 concurrent borrow calls against one data file (a short Python script with multiprocessing) and show the loan count before and after.`
  - `- J3.11 [block] No behaviour in a change's spec.md drops a "never", a limit or a number from the requirements.md row it cites: run node .rig/bin/sdlc.ts approve <slug> --check for each change and quote any WARNING weakened line.`
- Each new bad set's `expected.json`: `{"violation": "J3.10", "note": "a concurrent borrow loses a loan"}` and `{"violation": "J3.11", "note": "B2 cites DR-5 but drops \"never\""}`. Each `J3.json` sets that item to `"verdict": "fail", "note": "seeded"`.

- [ ] **Step 1: Write the failing change.** Add J3.10 and J3.11 to the rubric only. Run `node --test tests/e2e/journey/driver-scripted.test.mjs`. Expected: FAIL, as the synthetic replay reports `J3.10: item missing from answer` (Review Focus 5).

- [ ] **Step 2: Add both items** as `{ "id": "J3.10", "verdict": "pass", "evidence": "synthetic: replayed", "note": "replayed" }` (and J3.11) to every existing recorded `J3.json`. Create the two bad sets.

- [ ] **Step 3: Verify.** Run `node --test tests/e2e/journey/driver-scripted.test.mjs tests/e2e/journey/rubrics.test.mjs`. Expected: pass, including `bad case lost-loan-concurrent` and `bad case spec-weakens-rule`. Then run `npm test && npm run typecheck`. Expected: all pass.

- [ ] **Step 4: Commit** with `test(journey): J3 checks concurrent borrows and weakened rules, with a bad snapshot each (R6)`.

### After the tasks

Do one Opus review of `git diff main...HEAD`, fix its findings in one wave, and run `npm test` again. The live journey (`npm run e2e`) is the real test of J3.10 and J3.11. It costs money, and a person starts it.
