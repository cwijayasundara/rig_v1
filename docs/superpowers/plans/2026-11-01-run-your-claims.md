# Run your claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reviewers may attach a runnable `Repro:` to a finding, and a new suggest-only `S claims` check compares what `review.md` and `plan.md` claim with what the tree shows.

**Architecture:** One new module `scripts/claims.ts` (pure parsing and rule functions, plus a thin `cmdClaims`) registered in `scripts/sdlc.ts`. `scripts/pr.ts` calls it and `scripts/prbody.ts` renders it; nothing ever fails a ship. The briefs and `skills/pr/SKILL.md` gain the `Repro:` field and the stamp call. `eval/review.mjs` gains a `tools` arm.

**Tech Stack:** Node with TypeScript run directly (`node --test`), `scripts/testkit.ts` helpers (`makeRepo`, `write`, `sdlc`, `gitIn`).

**Spec:** `docs/superpowers/specs/2026-11-01-run-your-claims-design.md`

## Global Constraints

- Nothing in this change blocks a PR or a verify: every claims rule is a suggestion (spec, "Decided by the person").
- Item 1 never drops a finding for lacking `Repro:`.
- No new agent launch per change; `CLAUDE.md` target stays at most 4.
- A spec file that fails without the fix accompanies each harness change (`CLAUDE.md`). Run `npm test` and `npm run typecheck` and quote the output.
- `templates/review-brief.md` stays at most 60 lines (`scripts/reviewbrief.spec.ts`).
- Paths in new code go through `toPosix`/`path` helpers (Windows CI).
- Model use while building follows `CLAUDE.md`: implement inline or one Sonnet implementer; one Opus review of `git diff main...HEAD` at the end.

## Review Focus

- A finding line with `Repro:` containing `:` or backticks still parses `path:line` correctly.
- A finding whose cited path is absolute, has a Windows drive, or is `""` (empty) is reported by C1, not thrown on.
- `review.md` with no `## Findings` heading, or only `reviewer: none` (tier 0), yields no suggestions and no error.
- `claims-stamp.json` missing or malformed skips C2 and says so; it never crashes `S pr`.
- A `Repro:` that writes outside the temp dir is described in the confirm brief as "unrun", never executed by the harness.

---

## File Structure

- Create `scripts/claims.ts`: `parseFindings`, `claimRows`, `stampReview`, `cmdClaims`. One responsibility: compare claims with evidence.
- Create `scripts/claims.spec.ts`: unit and CLI tests.
- Modify `scripts/sdlc.ts` (COMMANDS table, `claims`), `scripts/pr.ts` (call, write `claims.json`), `scripts/prbody.ts` (+ `scripts/prbody.spec.ts`).
- Modify `templates/review-brief.md`, `templates/confirm-brief.md`, `skills/pr/SKILL.md`, and the specs that pin their wording (`scripts/reviewbrief.spec.ts`, `scripts/prskill.spec.ts`).
- Modify `eval/review.mjs`, `scripts/wikigen.ts` (`claudeRunner` options), `eval/review.test.mjs`.

### Task 1: Parse findings and the four file-level rules (C1, C3, C4, Repro count)

**Files:**
- Create: `scripts/claims.ts`, `scripts/claims.spec.ts`

**Interfaces:**
- Produces:
  - `type ReviewFinding = { text: string; file: string; line: number; fixed: boolean; confirmed: boolean; repro: string | null }`
  - `type ClaimRow = { rule: 'C1' | 'C2' | 'C3' | 'C4' | 'C5'; claim: string; status: 'ok' | 'suggest' | 'skipped'; detail: string }`
  - `parseFindings(review: string): ReviewFinding[]`: only lines under `## Findings` that start `- [severity:`. `file`/`line` come from the first `path:line:` after the two tags. `repro` is the text after `Repro: ` up to the final ` →` on the line, else null. `fixed` is true when the line contains `→ fixed`; `confirmed` when it contains `→ fixed (confirmed)`.
  - `fileRows(i: { findings: ReviewFinding[]; exists: (rel: string) => boolean; lineCount: (rel: string) => number; planFiles: string[]; changed: (rel: string) => boolean; amendments: string; behaviourIds: string[] }): ClaimRow[]`: pure, runs C1, C3, C4 and C5.
- Consumes: `section`, `bullets`, `planFiles` from `scripts/model.ts`; `behaviourIds` as used in `scripts/prbody.ts`.

- [ ] **Step 1: Write failing tests in `scripts/claims.spec.ts`**
  - `parseFindings` on a review with one finding `- [severity: high] [category: correctness] src/a.ts:12: boom. Fails when: x=1. Repro: node --test t.js -k a:b → return early → fixed (confirmed)` returns `{ file: 'src/a.ts', line: 12, fixed: true, confirmed: true, repro: 'node --test t.js -k a:b' }`.
  - A finding under `## Pre-existing` or `## Deferred` is not returned; a review with no `## Findings` returns `[]`.
  - `fileRows`: C1 is `suggest` for a missing file and for `line` greater than `lineCount`, `ok` otherwise; C3 is `suggest` for a plan file with `changed(file) === false`; C4 is `suggest` for an amendment line `- A1 (B9): ...` when `behaviourIds` lacks `B9`, and `ok` for `none`; C5 is `suggest` for a confirmed finding that has a repro (text: "run it: it should now pass") and absent for one without.
- [ ] **Step 2: Run `node --test scripts/claims.spec.ts`**. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the two functions above in `scripts/claims.ts`.** Plain regexes, no I/O inside `parseFindings` or `fileRows`. Status for a rule with nothing to check is `skipped`, never `ok`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(claims): parse review findings and check file-level claims`.

### Task 2: C2 stamp, `claimRows`, and the `S claims` command

**Files:**
- Modify: `scripts/claims.ts`, `scripts/claims.spec.ts`, `scripts/sdlc.ts` (add `claims: cmdClaims` to `COMMANDS`, next to `risk`)

**Interfaces:**
- Produces:
  - `stampReview(slug: string): void`: writes `.rig/changes/<slug>/claims-stamp.json` as `{ [file: string]: string | null }`, the `git hash-object` of each cited file in `## Findings` (null when absent). Uses `writeAtomic`.
  - `fixedRows(findings: ReviewFinding[], stamp: Record<string, string | null> | null, hashOf: (rel: string) => string | null): ClaimRow[]`: C2; `skipped` for every fixed finding when `stamp` is null; `suggest` when the file's hash equals the stamp's ("fixed, but the cited file is unchanged since the review: check the fix landed elsewhere").
  - `claimRows(slug: string): ClaimRow[]`: reads `review.md`, `plan.md`, `spec.md`, `amendments.md`, `verify.json` (`base`), the stamp, git; combines `fileRows` and `fixedRows`.
  - `cmdClaims(args: Args): void`: `claims <slug>` prints one line per non-ok row (`C2 suggest: <detail>`) or `claims: nothing to suggest`; `claims stamp <slug>` calls `stampReview`. Both exit 0 always. Follow `cmdApp`'s subcommand handling for argument parsing.
- Consumes: Task 1 functions.

- [ ] **Step 1: Failing tests** with `makeRepo()`, `write()`, `sdlc()`: (a) after `claims stamp demo` on a repo whose review.md cites `src/a.ts:1`, `claims-stamp.json` holds that file's hash; (b) with a finding marked `→ fixed` and `src/a.ts` untouched, `sdlc claims demo` prints a `C2 suggest` line and exits 0; after editing the file, no C2 line; (c) with the stamp file deleted, the output has a `C2 skipped` line, still exit 0; (d) a review.md of `reviewer: none` prints `claims: nothing to suggest`.
- [ ] **Step 2: Run `node --test scripts/claims.spec.ts`.** Expected: FAIL (unknown command `claims`).
- [ ] **Step 3: Implement** `stampReview`, `fixedRows`, `claimRows`, `cmdClaims`; register the command.
- [ ] **Step 4: Run the same command, then `npm run typecheck`.** Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(claims): S claims and the review stamp`.

### Task 3: Show the suggestions in the PR, never block

**Files:**
- Modify: `scripts/pr.ts` (just before `prBody` is called, around the `fs.writeFileSync(... 'pr-body.md' ...)` line), `scripts/prbody.ts`, `scripts/prbody.spec.ts`

**Interfaces:**
- Consumes: `claimRows(slug)`, `parseFindings`.
- Produces: `PrBodyInput` gains `claims?: ClaimRow[]` and `findingsText?: string`. In `## Evidence`, one more paragraph when `claims` is given: `Claims: N finding(s), M with a Repro.` followed by `- C2: <detail>` for each `suggest` row; omitted when there are no findings and no suggestions.

- [ ] **Step 1: Failing tests in `scripts/prbody.spec.ts`**: (a) `prBody({..., claims: [{ rule: 'C2', claim: 'x', status: 'suggest', detail: 'src/a.ts unchanged' }], findingsText})` contains `- C2: src/a.ts unchanged` and `Claims: 1 finding(s), 1 with a Repro.`; (b) with `claims` undefined the body is byte-identical to today's (existing tests still pass); (c) a `pr` run with a stale stamp still ships: add to `scripts/claims.spec.ts` a CLI test that `sdlc pr` is not refused by claims (use the existing helpers that `scripts/prskill.spec.ts` uses to reach a shippable change).
- [ ] **Step 2: Run `node --test scripts/prbody.spec.ts scripts/claims.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `scripts/pr.ts`, wrap the claims call in `try/catch` so any error leaves `claims` undefined; write `claims.json` (`ClaimRow[]`) next to `pr-body.md`. Never call `fail()` from this path.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(pr): list claims suggestions in the PR body`.

### Task 4: `Repro:` in the briefs and the pr skill

**Files:**
- Modify: `templates/review-brief.md`, `templates/confirm-brief.md`, `skills/pr/SKILL.md`, `scripts/reviewbrief.spec.ts`, `scripts/prskill.spec.ts`

**Interfaces:** the finding line becomes `- [severity: ...] [category: ...] path:line: problem. Fails when: <input or state>. Repro: <command, optional> → fix`.

- [ ] **Step 1: Failing tests.**
  - `scripts/reviewbrief.spec.ts`: the brief still has at most 60 lines; matches `/Repro: <command/`; matches `/existing test|temp/` (the restriction); the shape line (starting `- [severity:`) still matches the category regex; the brief states a finding without `Repro:` is still valid (`/without a Repro/`).
  - A confirm-brief test: `templates/confirm-brief.md` matches `/Repro:/`, `/run it once/`, and `/unrun:/`, and still matches `/Edit nothing/`.
  - `scripts/prskill.spec.ts`: `skills/pr/SKILL.md` matches `/claims stamp/` and places it after the `review.md` write and before the fix wave (index of `claims stamp` is greater than index of `review.md` and less than index of `fix every item`).
- [ ] **Step 2: Run `node --test scripts/reviewbrief.spec.ts scripts/prskill.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Edit the texts.**
  - Review brief: one added sentence in the "Report a finding" paragraph: when an existing test or a one-line script that writes only under the temp directory shows the problem, add `Repro: <command>` before `→`; a finding without a Repro is still valid. Add `Repro: <command, optional>` to the shape line. Trim elsewhere if the 60-line cap is reached.
  - Confirm brief: for a finding with `Repro:`, run it once; if it still fails as the finding says answer `reopened: reproduces (<first output line>)`; a `Repro:` that would write outside the temp directory is not run and is answered `unrun: <why>`, then judged by reading.
  - `skills/pr/SKILL.md` step 3, after the review.md write: run `S claims stamp <slug>`. Step 7 area: mention `S claims <slug>` output is advisory. Keep the step's existing wording otherwise.
- [ ] **Step 4: Run the same command, then `node --test scripts/skilltext.spec.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(review): optional Repro on findings; stamp before the fix wave`.

### Task 5: Tools-enabled arm in the review eval

**Files:**
- Modify: `scripts/wikigen.ts` (`claudeRunner(model, opts?: { tools?: string; cwd?: string })`: when `opts.tools` is set, pass `--tools <opts.tools>` instead of `--tools ''`, and spawn with `cwd`), `eval/review.mjs`, `eval/review.test.mjs`

**Interfaces:**
- `ARMS` becomes `['clean', 'same', 'tools']`. For `tools`, `buildPrompt` keeps the brief's own `Inputs` and `You may read files` text (no stripping), appends `Your working directory is the repository at <dir>; <base> is main.`, and omits the pasted files. The runner is `claudeRunner(model, { tools: 'Bash,Read,Grep,Glob', cwd: repo.dir })`.
- `scoreReview` result gains `repros: number` (findings carrying `Repro:`). After a tools-arm run, the harness runs each `Repro:` command in `repo.dir` with a 60 s timeout and records `reproFails` (exit non-zero) in the row. `summarize` and `renderMarkdown` print `findings with a Repro` and `repros that fail on the defect` for the `tools` group.

- [ ] **Step 1: Failing tests in `eval/review.test.mjs`**: `scoreReview` on a finding line with `Repro: node --test x` returns `repros: 1`; `buildPrompt(c, 'tools', repo)` contains `You may read files` and does not contain `## Files the change touches, in full`; `--arms tools --dry` writes nothing under `eval/results` and exits 0 (the dry runner must tolerate the new arm and emit a Repro for catchable cases).
- [ ] **Step 2: Run `node --test eval/review.test.mjs`.** Expected: FAIL.
- [ ] **Step 3: Implement.** The live run is not part of this task.
- [ ] **Step 4: Run the same command, then `node eval/review.mjs --dry --arms clean,tools --runs 1`.** Expected: PASS, a results table with a `tools` row.
- [ ] **Step 5: Commit** `feat(eval): a review arm with read-only tools and a repro count`.

### Task 6: Full verification and the one review

- [ ] **Step 1:** Run `npm test` and `npm run typecheck`; quote both outputs. Expected: all pass.
- [ ] **Step 2:** One Opus review of `git diff main...HEAD` (`/code-review` or one reviewer agent). Fix findings in one wave.
- [ ] **Step 3:** Tell the person the live tools-arm run is theirs to start (`node eval/review.mjs --arms clean,tools --models claude-sonnet-5-5,claude-opus-5-5 --runs 3 --max-usd 8`), and that item 1's gate is: tools-arm recall not below `clean`, false findings on the clean controls not higher.
- [ ] **Step 4:** Update the memory note `ub-mode-pstack-adoption` with what shipped.
