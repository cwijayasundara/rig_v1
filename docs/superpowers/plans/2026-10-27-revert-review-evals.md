# Reverts become review eval cases (C3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** In a target repo, every reverted change becomes a candidate review case; a person confirms where the bug was; `learn review-eval` re-scores the PR reviewer against the confirmed cases and keeps a dated score per brief and model.

**Architecture:** New `scripts/reviewcases.ts`. `learn reverts` (zero tokens) writes `.rig/learn/review-cases/<slug>-<sha7>.json` from `changeHistory(ROOT, [], 'HEAD', true)`. `learn review-eval --max-usd <n>` builds a tool-less prompt from the review brief plus the change as it merged (`git diff <sha>^1 <sha>`, intent/spec/plan at `<sha>`), runs `claudeRunner`, scores the `## Findings` lines, and appends to `.rig/learn/review-eval.jsonl`.

**Spec:** `docs/proposals/2026-10-27-risk-tiered-review.md` C3 ("a change that does not raise the catch rate is dropped").

## Global Constraints

- Only cases with `confirmed: true` and a non-empty `defect.file` and `defect.pattern` are scored. Candidates never count; a person confirms (the article: engineers who know the code confirmed each bug).
- A finding catches a case when a line under `## Findings` starts `- [severity:`, contains `defect.file`, and matches `defect.pattern` (case-insensitive), the scoring rule of `eval/review.mjs`.
- `review-eval` costs money: it needs `--max-usd` and stops before a case once spent ≥ the cap; never runs without it.
- Existing case files are never overwritten (a person's confirmation is kept).
- The brief comes from `.rig/templates/review-brief.md` when vendored, else `${PLUGIN_ROOT}/templates/review-brief.md`; the row records `brief: <sha256 prefix>` and `model`, so two rows compare a brief change.

## Review Focus

1. A reverted change with no files outside `.rig/` still gets a case (files `[]`), never a crash.
2. A malformed case file is reported and skipped, not fatal.
3. The reviewer's answer with no `## Findings` heading scores 0 caught, never "every line".
4. A runner error on one case is recorded as failed and the run goes on.
5. `--max-usd` missing or not a positive number refuses before any spend.

---

### Task 1: `learn reverts`

**Files:** Create `scripts/reviewcases.ts`, `scripts/reviewcases.spec.ts`; Modify `scripts/learn.ts` (usage + dispatch), `scripts/vendor.ts` (VENDORED)

**Interfaces:** `export type ReviewCase = { slug: string; sha: string; base: string; files: string[]; confirmed: boolean; defect: { file: string; pattern: string }; note: string }`; `export function writeCandidates(root: string): { added: string[]; total: number; confirmed: number }`; `export function readCases(root: string): { cases: ReviewCase[]; bad: string[] }`.

- [ ] Tests (temp git repo, ship + `git revert`): one case file per reverted merge, named `<slug>-<sha7>.json`, with `base` = `<sha>^1`, `files` = changed paths outside `.rig/`, `confirmed: false`; a second run adds nothing and keeps an edited file byte-for-byte; `readCases` lists a malformed file under `bad`.
- [ ] Implement; `learn reverts` prints `review cases: N new, T total, C confirmed` and the note on how to confirm. Commit `feat(learn): reverted changes become review eval candidates`.

### Task 2: `learn review-eval`

**Files:** `scripts/reviewcases.ts`, `scripts/reviewcases.spec.ts`, `scripts/learn.ts`, README (script line, learning loop), CHANGELOG, `scripts/neutrality.spec.ts` cap

**Interfaces:** `export function scoreFindings(text: string, d: ReviewCase['defect']): boolean`; `export function casePrompt(root: string, c: ReviewCase, brief: string): string`; `export function reviewEval(root: string, opts: { maxUsd: number; model?: string; runner?: Runner }): { scored: number; caught: number; failed: number; usd: number }`.

- [ ] Tests: `scoreFindings` true for a matching Findings line, false for the same line under `## Deferred`, false with no Findings heading; `casePrompt` contains the merge diff, intent.md at the sha and no "Read them yourself"; `reviewEval` with a fake runner scores only confirmed cases, stops at the cap, records a thrown case as failed, and appends one row `{ at, model, brief, cases, caught, failed, usd }`; `learn review-eval` without `--max-usd` fails before running.
- [ ] Implement; the CLI prints `caught X of Y confirmed cases (brief <hash>, <model>, $<usd>)` and the previous row for the same brief or model when there is one. Docs; cap. `npm test && npm run typecheck`. Commit `feat(learn): score the PR reviewer against confirmed reverts`.

### After the tasks

One fresh review of `git diff main...HEAD`, one fix pass, `npm test` again.
