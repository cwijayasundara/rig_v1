# Native review in /rig:pr Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo's CLAUDE.md: implement inline, `npm test` once, then one review of `git diff main...HEAD`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** `/rig:pr` reviews the change's delta with the bundled `/code-review` and `/security-review` before the PR is opened; the evaluator agent keeps only chart mode.

**Architecture:** Mostly skill and template text plus the specs that pin it. `scripts/pr.ts` needs no change: the review now runs before `sdlc.ts pr`, so the first `pr` call already commits code and `review.md` together and opens the PR once. The follow-up mode stays (it still serves fixes after a human review).

**Tech Stack:** Markdown skills, TypeScript run with `node --disable-warning=ExperimentalWarning`, `node:test` specs (`npm test`, `npm run typecheck`).

**Spec:** `docs/superpowers/specs/2026-10-21-native-review-design.md`

## Global Constraints
- Rig is not enabled on this repo: no `/rig:*`, no `sdlc.ts check`, no change records here (CLAUDE.md).
- Fix the harness, not generated output; every behaviour change gets a spec that fails without it.
- `review.md` keeps the line shape `- [severity: critical|high|medium] [category: <slug>] path:line: problem → fix (confidence NN)`; `scripts/learnmine.ts` parses `[category: x]`.
- Categories stay exactly: correctness, security, contract, data, coupling, responsibility, abstraction, duplication, tests.
- Effort is always passed explicitly: `medium`, or `high` for tier L.
- The secrets sensor and every other sensor stay untouched.
- Subagent launches set `model`; a plain skill run needs none.

## Review Focus
- Delta is empty or wrong: change is uncommitted on trunk with no upstream, so a revision range or the default target could review nothing or the previous commit. Task 1 pins the target text.
- `/code-review` or `/security-review` cannot be started from the skill: the skill must say what to do instead (launch a `general-purpose` agent, `model: sonnet`, whose brief says to run them) and never skip the review silently.
- Review finds nothing: `review.md` still written with `verdict: pass` and an empty `## Findings`.
- A fix needs an unplanned file or a frozen contract: the existing stop rules apply and `review.md` still ships with the PR.
- Existing target `CLAUDE.md`: the Review block goes into `CLAUDE.md.proposed`, never an overwrite.

---

### Task 1: Spike the delta target and the invocation path (throwaway)

**Files:** none committed. Scratch repo under the scratchpad directory.

**Produces:** the exact target phrase used in Task 2 and whether the direct path or the fallback path is documented.

- [ ] **Step 1:** In a scratch git repo, commit a file on `main`, record `BASE=$(git rev-parse HEAD)`, then edit the file (uncommitted) and add a second untracked file with a plain bug (an off-by-one).
- [ ] **Step 2:** Run `claude -p "/code-review medium all changes since $BASE, committed and uncommitted"` and `claude -p "/security-review"`. Expected: findings name the edited and untracked files, not the earlier commit. If the target phrase reviews the wrong set, retry with no target and use whichever form reviews exactly the delta.
- [ ] **Step 3:** Ask a session to run both from a skill-like instruction (`claude -p "Run /code-review ... then /security-review and print both reports"`). Expected: both reports return in the reply. If a bundled command is not startable that way, record that and keep the fallback in Task 2.
- [ ] **Step 4:** Append the observed target phrase and invocation result to the spec's "Open risks" section as "Resolved:" lines and commit the spec update.

### Task 2: Rewrite the /rig:pr skill, with a spec

**Files:**
- Create: `scripts/prskill.spec.ts`
- Modify: `skills/pr/SKILL.md` (frontmatter `description`, `allowed-tools`, steps)

**Interfaces:** Produces the step order the spec pins; consumes Task 1's target phrase (`<TARGET>` below).

- [ ] **Step 1: Write the failing spec** `scripts/prskill.spec.ts`, using the `repoText` helper pattern from `scripts/chartcheck.spec.ts`. Tests, each a `test(...)`:
  - `pr skill reviews with /code-review and /security-review before sdlc.ts pr`: both strings present, and `indexOf('/code-review') < indexOf('pr <slug> --message')`.
  - `pr skill passes an explicit effort`: matches `/medium/` and `/high/` and `/tier L/`.
  - `pr skill no longer launches the evaluator`: `doesNotMatch(text, /rig:evaluator/)`.
  - `pr skill keeps review.md categories and the fallback`: includes `[category:`, `review.md`, and `general-purpose`.
  - `pr skill ships one commit`: `doesNotMatch(text, /fix\(review\)|docs\(review\)/)`.
- [ ] **Step 2:** Run `node --disable-warning=ExperimentalWarning --test scripts/prskill.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Rewrite `skills/pr/SKILL.md`** (description: "Review the change's delta with /code-review and /security-review, fix the findings, then open one PR."). Add `Skill`-free allowed tools unchanged plus `Bash(git status*)`. Steps, in this order:
  1. Read `base` from `.rig/changes/<slug>/verify.json`; refuse to continue if verify is missing or failing (`/rig:test`).
  2. Review once, on the delta only: `/code-review <effort> <TARGET>` then `/security-review`, foreground, each once, never repeated. Effort `medium`, `high` for tier L. If a command cannot be started, launch `general-purpose` with `model: sonnet` and a brief of at most 60 lines naming the base and the two commands.
  3. Write `.rig/changes/<slug>/review.md` in the existing shape (`verdict: pass | changes-needed`, `## Findings`, `## Deferred`, `## One thing`); `/security-review` findings get `[category: security]`; others one of the nine categories.
  4. `S activate <slug>`, fix every finding in one wave without asking (existing stop rules: unplanned file, frozen contract file, relaxed test, then stop; never weaken a test, sensor or contract), then `S verify <slug>` (not `/rig:test`); same check failing twice: stop and show it.
  5. `S pr <slug> --message "<type(scope): summary>"` once: it commits code and review.md together, pushes, opens the PR. After a stop in step 4, revert the unfinished fix, run `S verify <slug>`, then `S pr` so review.md still ships.
  6. When a PR exists, `gh pr comment --body-file .rig/changes/<slug>/review.md`, plus a line naming what was fixed. End with the PR URL (or `local-only`), what was fixed and left, and `Next: a person reviews and merges the PR`.
- [ ] **Step 4:** Rerun the spec. Expected: PASS.
- [ ] **Step 5:** Commit `feat: pr reviews the delta with /code-review and /security-review before the PR opens`.

### Task 3: Trim the evaluator to chart mode

**Files:**
- Modify: `agents/evaluator.md`, `scripts/chartcheck.spec.ts:200` (keep its assertions), `scripts/prskill.spec.ts`

- [ ] **Step 1:** Add to `prskill.spec.ts`: `evaluator is chart-only`: `agents/evaluator.md` has `## Chart mode` and the seven chart categories, and `doesNotMatch(/git diff <base>/)` and `doesNotMatch(/Security:/)`. Run; Expected: FAIL.
- [ ] **Step 2:** Edit `agents/evaluator.md`: description becomes "Chart reviewer. One independent read-only pass over a sprint chart bundle against its PRD, brief, architecture, intents and test plan; advises, never edits." Remove the diff-mode numbered steps, the diff reply template and the diff category list; promote the Chart mode body to the main body (keep tools, `model: opus`, effort, the injection rule, the 30-line limit, the seven categories, and the "caller writes it to `.rig/product/chart-review.md`" line).
- [ ] **Step 3:** Run `chartcheck.spec.ts`, `models.spec.ts`, `prskill.spec.ts`. Expected: PASS.
- [ ] **Step 4:** Commit `refactor: evaluator reviews charts only`.

### Task 4: Review rules in the target CLAUDE.md, and a slimmer REVIEW.md

**Files:**
- Modify: `skills/init/SKILL.md` (the CLAUDE.md sections list, lines 30-39), `templates/REVIEW.md`
- Test: `scripts/initskill.spec.ts`, `scripts/prskill.spec.ts`

- [ ] **Step 1:** Add specs: `init writes a Review block into CLAUDE.md`: the init skill text includes `## Review` and `plan.md` `## Contracts` and `non-goals`; `REVIEW.md template defers to CLAUDE.md`: `templates/REVIEW.md` includes `CLAUDE.md` and has no `## Review passes`. Run; Expected: FAIL.
- [ ] **Step 2:** In `skills/init/SKILL.md` add a section to the CLAUDE.md list: `## Review` with two bullets, verbatim: "Flag any API, schema or event change that the change's plan.md `## Contracts` does not announce." and "Flag anything the brief's non-goals exclude." State that an existing CLAUDE.md gets it in `CLAUDE.md.proposed`.
- [ ] **Step 3:** Rewrite `templates/REVIEW.md` to the managed-service file only: Important vs Nits definitions and Exclusions kept, the five "Review passes" removed, one line saying local review rules live in `CLAUDE.md` under `## Review`.
- [ ] **Step 4:** Run `initskill.spec.ts`, `vendor.spec.ts`, `prskill.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: init writes review rules into CLAUDE.md`.

### Task 5: Residual wording and docs

**Files:** `scripts/registry.ts:31` (guide: "Build on the build model; leave diff review to /code-review; the evaluator reviews charts."), `scripts/journey.ts:43` (label `review and its fixes (/code-review)`), `scripts/learnmine.ts:1` (comment), `README.md` (lines ~141, 181, 205, 350, 420), `DESIGN.md` (lines 37, 79), `templates/readme-rig.md` (lines 11, 32), `CLAUDE.md` (model table rows "Final review of a change's diff" and "Chart reviewer"), `CHANGELOG.md`.

- [ ] **Step 1:** `grep -rn "evaluator" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .`; update each hit that describes the diff review (README flow diagram: "one native `/code-review` + `/security-review` before the PR"); leave the ones that are chart mode, model-role roles in `modelstate.ts`, and vendoring lists.
- [ ] **Step 2:** Update specs that assert changed text (`journey.spec.ts` label, `registryhooks.spec.ts` guide text if asserted). Add a CHANGELOG entry.
- [ ] **Step 3:** Run `npm run typecheck`. Expected: no errors.
- [ ] **Step 4:** Commit `docs: describe the native review`.

### Task 6: Verify and review once

- [ ] **Step 1:** Run `npm test`; quote the pass/fail counts. Fix failures.
- [ ] **Step 2:** Run the scripted `/rig:pr` e2e stage if one exists (`npm run test:e2e:fast` is inside `npm test`); if a stage asserts the old follow-up commit, update it to the single-commit order.
- [ ] **Step 3:** One review of `git diff main...HEAD` (`/code-review`, or one reviewer agent with `model: sonnet`). Fix findings in one wave, rerun `npm test`.
