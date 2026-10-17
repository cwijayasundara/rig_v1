# Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans inline, `CLAUDE.md`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** The harness mines recurring findings from committed evidence, keeps a small committed lessons file, proposes merges, retirements and rule promotions for a person to approve, and an eval arm shows whether that lowers recurrence.

**Architecture:** Four small deterministic modules (`learnfile`, `learnmine`, `learnreplay`, `learn`) behind `sdlc.ts learn <mine|replay|check|status>`; one skill `/rig:learn` where Sonnet drafts delta edits as a proposal file; one eval arm. No hook calls a model. The learner writes only under `.rig/learn/`.

**Tech Stack:** Node >= 22.18 TypeScript run directly (no build), `node:test`, the repo's `testkit.ts`; no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-17-learning-loop-design.md`

## Global Constraints

- A lesson is at most 25 words and cites at least 2 distinct change slugs; at most 30 active lines in `.rig/lessons.md`.
- Evidence sources in v1: `review.md` findings (`[category: <x>]`) and `.rig/waivers.jsonl` sensor ids. `runs.jsonl` and `unresolved.json` are out (uncommitted or carry no sensor id) **[plan call]**.
- Eligible = a key seen in at least 2 distinct changes. One occurrence is never a lesson.
- Delta edits only: the dream pass emits add / merge / retire / promote lines, never a rewritten file.
- The learner reads evidence and writes under `.rig/learn/` only. `.rig/lessons.md` and `.rig/rules.json` change only by a person's PR; both are in the protected harness list.
- A promoted rule must fire on every change that earned it and on no shipped change without that finding (replay gate).
- Retirement flag: `last-fired` older than 10 shipped changes, or a promoted rule waived 3 or more times **[plan call]**.
- No hook calls a model. `/rig:learn` runs on Sonnet with `--max-usd` ceiling. Harness cap 6000 lines; scripts at most 500 lines each; skills at most 60.
- Eval cut rule: no lift after two passes means cut `/rig:learn`, keep `/rig:rule`.

## Review Focus

- A `review.md` with no `[category: ...]` tags, or none at all: ignored, never a crash.
- One change listing the same category three times counts as one change.
- A lesson text containing `|` or a newline would corrupt the line format: `check` rejects it.
- An invalid or catastrophic regex in a proposed rule: `replay` reports an error and exits 1, never hangs or crashes.
- A change whose diff cannot be recovered (unmerged, shallow clone, missing `pr.md` commit): skipped and listed, never counted as "did not fire".
- No `.rig/lessons.md` yet: `mine`, `check` and `status` pass cleanly.

## File structure

- Create `scripts/learnfile.ts`: parse, format and check the lessons file.
- Create `scripts/learnmine.ts`: collect evidence into candidates; lesson firing and retirement flags.
- Create `scripts/learnreplay.ts`: recover a shipped change's diff; replay a rule against all changes.
- Create `scripts/learn.ts`: `cmdLearn` dispatch and output.
- Create `skills/learn/SKILL.md`; create `scripts/learn.spec.ts`, `scripts/learnfile.spec.ts`, `scripts/learnmine.spec.ts`, `scripts/learnreplay.spec.ts`, `scripts/learnwiring.spec.ts`.
- Create `eval/learn.mjs`, `eval/learn.test.mjs`, `eval/fixtures/learn/`.
- Modify `scripts/sdlc.ts` (register), `scripts/core.ts` (gitignore `learn/`), `scripts/sensors.ts` (`PROTECTED`), `templates/settings.json`, `templates/managed-settings.json`, `templates/rig-check.yml`, `scripts/removed.spec.ts` (skill lists), `skills/rule/SKILL.md`, `package.json` (eval script), `docs/GOAL.md`.

### Task 1: Lessons file format and check

**Files:** Create `scripts/learnfile.ts`, `scripts/learnfile.spec.ts`

**Interfaces:**
- Produces: `type Lesson = { id: string; text: string; key: string; seen: string[]; first: string; lastFired: string; status: 'active' | 'retired' | `promoted:${string}` }`; `parseLessons(text: string): { lessons: Lesson[]; errors: string[] }`; `formatLesson(l: Lesson): string`; `checkLessons(text: string, slugs: string[]): string[]` (error messages; empty means pass).
- Line format: `- L7 | <text> | key: <category-or-sensor> | seen: a, b | first 2026-10-17 | last-fired 2026-10-24 | active`.

- [ ] **Step 1: Write failing tests** in `learnfile.spec.ts`: `parse and format round-trip a line`; `check rejects a 26-word lesson`, `a lesson citing one change`, `a slug not in slugs`, `duplicate ids`, `31 active lines`, `a text containing "|"`, `a bad date`; `check passes an empty string`. Error messages name the line id.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/learnfile.spec.ts`. Expect FAIL (module missing).
- [ ] **Step 3:** Implement the three functions in `scripts/learnfile.ts`. Lines not starting with `- L` are comments and ignored; `checkLessons` counts only `active` lines for the cap.
- [ ] **Step 4:** Rerun the spec. Expect PASS.
- [ ] **Step 5:** `git add scripts/learnfile.ts scripts/learnfile.spec.ts && git commit -m "feat(learn): lessons file format and check"`.

### Task 2: Mine evidence into candidates

**Files:** Create `scripts/learnmine.ts`, `scripts/learnmine.spec.ts`

**Interfaces:**
- Consumes: `listChanges`, `read`, `readJsonl`, `CHANGES`, `WAIVERS`, `Waiver` from `core.ts`; `Lesson` from Task 1.
- Produces: `type Candidate = { key: string; kind: 'finding' | 'waiver'; changes: string[]; count: number; sample: string }`; `mineCandidates(): Candidate[]` (eligible only, sorted by distinct changes desc then key); `lessonStatus(lessons: Lesson[], shipped: { slug: string; date: string; keys: string[] }[]): { lastFired: Record<string, string>; retire: { id: string; why: string }[] }`.
- Finding keys come from `[category: <x>]` in each change's `review.md`; waiver keys are the row's `sensor`. `count` is occurrences, `changes` is distinct slugs.

- [ ] **Step 1: Write failing tests** using `makeRepo` and `write`: `a category in two changes is eligible`, `a category thrice in one change is not`, `a review.md with no tags yields nothing`, `waivers on one sensor in two changes are eligible`, `lessonStatus sets lastFired to the latest later change carrying the key`, `lessonStatus flags a lesson not fired in 10 later changes`, `lessonStatus flags a promoted rule waived 3 times`.
- [ ] **Step 2:** Run the spec. Expect FAIL.
- [ ] **Step 3:** Implement. Parse tags with `/\[category: ([a-z-]+)\]/g`. `mineCandidates` reads `process.cwd()` via `core.ts` constants, so tests run it through the CLI in Task 4 or set `CLAUDE_PROJECT_DIR`; make the module take `root: string` as a parameter instead and let `learn.ts` pass `ROOT`.
- [ ] **Step 4:** Rerun the spec. Expect PASS.
- [ ] **Step 5:** Commit `feat(learn): mine review findings and waivers into candidates`.

### Task 3: Replay a rule against shipped changes

**Files:** Create `scripts/learnreplay.ts`, `scripts/learnreplay.spec.ts`

**Interfaces:**
- Consumes: `rulesSensor` (`scripts/sensors.ts`), `Rule` (`scripts/model.ts`), `parseUnifiedDiff` and `FileDiff` (see `scripts/diffs.ts`, `scripts/model.ts`), `gitIn` (`core.ts`).
- Produces: `changeDiff(root: string, slug: string): FileDiff[] | null` (null when unrecoverable); `replayRule(root: string, rule: Rule, earned: string[], all: string[]): { firesOn: string[]; missed: string[]; extra: string[]; skipped: string[]; error?: string }`. Pass means `missed` and `extra` are empty and `error` is unset.
- `changeDiff`: find the commit that added `.rig/changes/<slug>/pr.md` (`git log --diff-filter=A --format=%H -- <path>`), the base is `base` in that change's `verify.json` if present, else the commit's first parent; diff is `git diff <base> <commit>`, `.rig/` files excluded.

- [ ] **Step 1: Write failing tests** with two shipped changes built in a throwaway repo (commits adding `pr.md` plus a source line): `fires on both earning changes`, `extra lists a change without the finding that also matches`, `missed lists an earning change the rule does not match`, `an unrecoverable change is skipped, not missed`, `an invalid regex returns error and no throw`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Validate the regex with `new RegExp` in try/catch before replay; reject patterns longer than 300 characters; only match added lines, as `rulesSensor` does.
- [ ] **Step 4:** Rerun. Expect PASS.
- [ ] **Step 5:** Commit `feat(learn): replay a proposed rule against shipped changes`.

### Task 4: `sdlc.ts learn` command and protection

**Files:** Create `scripts/learn.ts`, `scripts/learn.spec.ts`; modify `scripts/sdlc.ts`, `scripts/core.ts`, `scripts/sensors.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `cmdLearn(args: Args): void` with subcommands `mine` (writes `.rig/learn/candidates.json`, prints candidates and retirement flags), `replay <rule-file.json>` (a JSON rule plus `--earned a,b`; exit 1 unless pass), `check` (`checkLessons` over `.rig/lessons.md` and `.rig/lessons-archive.md`; exit 1 on errors), `status` (counts: active, eligible, flagged).
- `core.ts` `GITIGNORED` gains `'learn/'`; `sensors.ts` `PROTECTED` gains `'.rig/lessons.md'` and `'.rig/lessons-archive.md'`.

- [ ] **Step 1: Write failing tests** via the `sdlc(repo, [...])` helper: `learn mine writes candidates.json and nothing else outside .rig/learn`, `learn check exits 1 on a one-change lesson and 0 with no lessons file`, `learn replay exits 1 when a rule also matches an unrelated change`, `learn status prints the three counts`, `editing .rig/lessons.md is a harness-tamper finding in CI` (copy the pattern from `scripts/wikiwiring.spec.ts`), `a .rig/learn/ file is gitignored`.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/learn.spec.ts`. Expect FAIL.
- [ ] **Step 3:** Implement `cmdLearn`; register `learn: args => cmdLearn(args)` in `COMMANDS` in `sdlc.ts`.
- [ ] **Step 4:** Run the new spec plus `scripts/sdlc.spec.ts` and `scripts/sensors.spec.ts`. Expect PASS.
- [ ] **Step 5:** Commit `feat(learn): sdlc learn mine|replay|check|status`.

### Task 5: Skill, wiring and CI

**Files:** Create `skills/learn/SKILL.md`, `scripts/learnwiring.spec.ts`; modify `templates/settings.json`, `templates/managed-settings.json`, `templates/rig-check.yml`, `scripts/removed.spec.ts`, `skills/rule/SKILL.md`

**Interfaces:**
- Produces: skill `learn` (`/rig:learn`), `S` meaning `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts` as in `skills/wiki/SKILL.md`.

- [ ] **Step 1: Write failing tests** in `learnwiring.spec.ts`, copying the shape of `wikiwiring.spec.ts`: skill has `name: learn`, runs `S learn mine`, `S learn replay` and `S learn check`; says delta edits only and names `.rig/learn/proposal.md`; tells the person to add `@.rig/lessons.md` to `CLAUDE.md` themselves; allow-lists `Skill(rig:learn)` and `Skill(rig-learn)` in `templates/settings.json` and `Skill(rig:learn)` in `managed-settings.json`; the CI template has a blocking `learn check` step and no model call; `skills/rule/SKILL.md` mentions `learn replay`; both kept-skill lists in `removed.spec.ts` include `learn`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Write the skill (at most 60 lines): `S learn mine`; read `.rig/lessons.md` and `candidates.json`; write `.rig/learn/proposal.md` with only `ADD`, `MERGE`, `RETIRE`, `PROMOTE` lines, each citing slugs; for `PROMOTE` draft the rule as `/rig:rule` does, save it to `.rig/learn/rule-<id>.json` and run `S learn replay`, presenting only passing rules; stop with the proposal for the person to apply through a PR. Add the allow rules, the CI step, the kept-skill names and the `learn replay` pointer in the rule skill.
- [ ] **Step 4:** Run `npm test`. Expect all specs green, including `size.spec.ts`.
- [ ] **Step 5:** Commit `feat(learn): /rig:learn skill, allow rules, CI check`.

### Task 6: Eval arm

**Files:** Create `eval/learn.mjs`, `eval/learn.test.mjs`, `eval/fixtures/learn/` (a tiny repo plus `tasks.json` of 6 change tasks); modify `package.json`

**Interfaces:**
- Consumes: `resultsAllowed` from `eval/run.mjs`, `claudeRunner` from `scripts/wikigen.ts`, `learn mine`.
- Produces: `scoreChange(addedLines: string[]): { recurred: boolean }` (regex for the seeded mistake: a bare-string error response), `verdict(rows): 'loop beats off' | 'tie-cheaper' | 'no lift' | 'unmeasured'`, CLI `node eval/learn.mjs [--runs 3] [--model claude-haiku-5-5] [--max-usd 5] [--results FILE] [--dry]`; npm scripts `eval:learn` and `eval:learn:dry`.
- Arms `loop`, `off`, `native` (auto memory on, no rig lessons). Each runs the 6 tasks in order. After each change a scripted detector writes a `review.md` finding `[category: error-shape]` when `scoreChange` flags it; in `loop`, after change 2 the harness runs the dream step (Sonnet via `claudeRunner`) and applies the proposed lesson automatically (eval only; no person). Rows: `{arm, run, change, recurred, usd, tokens}`.
- `verdict`: `loop beats off` when mean recurrence over changes 4 to 6 is at least 0.34 lower than `off` and cost per change is no more than 10% higher; `tie-cheaper` when recurrence is equal and `loop` costs less **[plan call]**.

- [ ] **Step 1: Write failing tests** in `learn.test.mjs`: `scoreChange flags res.send('...') error replies and passes the contract shape`; `verdict returns each of the four outcomes from fixed rows`; `--dry replays a fake, writes no results and exits 0`.
- [ ] **Step 2:** Run `node --test eval/learn.test.mjs`. Expect FAIL.
- [ ] **Step 3:** Implement following `eval/wiki.mjs` (stage dirs, `resultsAllowed`, dry fake: `loop` recurs on changes 1 to 3 only, `off` on all six).
- [ ] **Step 4:** Run `npm run test:e2e:unit && npm run eval:learn:dry`. Expect PASS and a printed verdict.
- [ ] **Step 5:** Commit `feat(eval): learning loop arm against off and native memory`.

### Task 7: Verify and record

**Files:** Modify `docs/GOAL.md`; update memory file `production-harness-goal.md` after merge.

- [ ] **Step 1:** Run `npm run typecheck` and `npm test`; quote the tail of each. Both must be green; check `size.spec.ts` shows total at most 6000, else stop and ask the person about the cap.
- [ ] **Step 2:** In `docs/GOAL.md`, mark scope item 6 as built and unproven, naming `npm run eval:learn` as the gate and the cut rule.
- [ ] **Step 3:** One review: `/code-review` on `git diff main...HEAD`; fix findings in one wave; rerun `npm test`.
- [ ] **Step 4:** Commit `docs: goal marks the learning loop built, eval pending`. Do not merge or push until the person asks. The live eval costs money and is started by the person.

## Self-review notes

- Spec coverage: lessons file (T1), mine (T2), dream and promote (T5 skill + T3 replay), close the loop (T2 `lessonStatus`), protection (T4), cap and citation check in CI (T4, T5), measurement (T6), size (T7). Left native: `@` import, `/schedule`, PRs.
- Spec changes made here: a `key:` field on each lesson (needed to detect firing), an archive file for retired and promoted lessons so the import loads only active ones, v1 evidence limited to `review.md` and waivers.
- Not covered on purpose: the optional weekly routine and the held-out replay set (spec open question 1; add after the eval shows lift).
