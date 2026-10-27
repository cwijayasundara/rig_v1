# Phase C: merge queue, revert metrics, circuit breaker and rung 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tier-0 PRs can merge without a person, but only when a person set rung 3, the author is trusted, `risk.enforce` is on, and recent tier-0 merges were not reverted too often; reverts are counted per tier; `rig-check` runs in GitHub's merge queue.

**Architecture:** New `scripts/reverts.ts` reads the shipped-change history from git (`changeHistory`: slug, merge sha, tier from the committed `pr-body.md`, reverted) and judges the breaker (`breaker`). `report.ts` uses it for per-tier counts. `check.ts` (CI) adds the tier-0 path; `autonomy.ts` accepts rung 3.

**Spec:** `docs/proposals/2026-10-27-risk-tiered-review.md` C1, C2, C4, B2 tier 0, Decision 3.

## Global Constraints

- Rung 3 is set only by a person (`/rig:autonomy set 3`); `propose()` never proposes it.
- Everything the tier-0 path reads comes from the base branch: `risk`, `humanApproval.trusted`, `.rig/autonomy.json`, and the git history of the base.
- A change is reverted when a later commit says `This reverts commit <its merge sha>` (git's revert message), or (CI only, via `gh`) when a merged PR labelled `revert` deleted its `pr.md` (Decision 3). `sdlc report` stays network-free: commit messages only.
- Breaker: over the last `risk.window` (default 20) tier-0 merges, reverted / merged > `risk.maxRevertRate` (default 0.1) trips it; a tripped breaker treats tier 0 as tier 1 and says why. Fewer than 1 tier-0 merge: not tripped.
- Weakenings: raising `risk.maxRevertRate`, raising `risk.window`, adding a `humanApproval.trusted` login.
- Merge queue runs never re-check approvals (they were checked on the PR); they run the sensors only.
- C3 (reverts into review eval cases) is a separate plan.

## Review Focus

1. A PR that edits `.rig/autonomy.json` to rung 3 must not merge itself unattended (rung read from base).
2. A tier-0 PR by an untrusted author still needs a person.
3. A tripped breaker blocks with the counts in the message, never silently.
4. `pr-body.md` missing or unparseable at a merge: tier `null`, never counted as tier 0.
5. A `merge_group` event without `pull_request` must not crash `check`.

---

### Task 1: merge queue (C4)

**Files:** `templates/rig-check.yml`, `scripts/check.ts`; tests `scripts/workflows.spec.ts`, `scripts/check.spec.ts`

- [ ] Test: workflow `on` has `merge_group`; `ai-review` `if` requires `github.event_name == 'pull_request'`; `rig-check`'s BASE is `${{ github.base_ref || github.event.merge_group.base_ref }}` with `refs/heads/` stripped in the shell.
- [ ] Test (check.spec): with `GITHUB_EVENT_NAME=merge_group`, a PR adding a waiver row gets no `human-approval` block (with `risk.enforce` on the queue re-checks the unattended path; final-review fix).
- [ ] Implement: `const queued = process.env.GITHUB_EVENT_NAME === 'merge_group'`; skip `humanRowsAdded`/enforce when queued. Commit `feat(ci): rig-check runs in the merge queue`.

### Task 2: change history and per-tier metrics (C1)

**Files:** Create `scripts/reverts.ts`, `scripts/reverts.spec.ts`; Modify `scripts/report.ts` (+ its spec if the shape test pins keys)

**Interfaces:**
- `export type ChangeRow = { slug: string; sha: string; date: string; tier: 0 | 1 | 2 | null; reverted: boolean }`
- `export function changeHistory(root: string, revertPrs: number[] = []): ChangeRow[]` — first-parent commits that add `.rig/changes/*/pr.md` (as report does today), oldest first; tier from `git show <sha>:.rig/changes/<slug>/pr-body.md` (`## Risk\n\nTier N`); reverted by message, or by a first-parent commit whose subject is `Merge pull request #N` with N in `revertPrs` and which deletes that slug's `pr.md`.
- `export function breaker(rows: ChangeRow[], window: number, maxRate: number): string | null` — reason text `tier-0 merges reverted: R of M in the last W (over the risk.maxRevertRate of P)`.
- Report gains `tiers: Record<'0' | '1' | '2' | 'unknown', { merged: number; reverted: number }>`, printed as one line per tier; `reverted` keeps its meaning (now from `changeHistory`).

- [ ] Tests in a temp git repo: two shipped changes (tier 0 and tier 1 bodies), one reverted by `git revert -m 1`-style message → rows and tiers; a labelled revert PR merge that deletes `pr.md` counts only when its number is passed; a body with no Risk section → `tier: null`; `breaker` trips at 1 of 2 with rate 0.1, not at 0 of 2, not with no tier-0 rows, and only looks at the last `window` tier-0 rows.
- [ ] Implement; `report` uses it. Commit `feat(report): change history, reverts and merges per tier`.

### Task 3: breaker, trusted authors and rung 3 (C2, B2 tier 0)

**Files:** `scripts/registry.ts`, `scripts/autonomy.ts`, `skills/autonomy/SKILL.md`, `scripts/check.ts`; tests `scripts/registry.spec.ts`, `scripts/autonomy.spec.ts` (or the existing autonomy spec), `scripts/check.spec.ts`

- [ ] Registry: `risk.window` (positive int, default 20), `risk.maxRevertRate` (number 0..1, default 0.1), `humanApproval.trusted` (logins, lower-cased). Weakenings as in Global Constraints. Tests in the existing style.
- [ ] Autonomy: rung 3 parses and `set 3` works (human only); `propose()` never returns 3; the status line explains rung 3 ("also lets a tier-0 PR by a trusted author merge without a person while risk.enforce is on and the breaker holds"). Test.
- [ ] check.ts: with `risk.enforce`, `risk.tier === 0`, no human rows, base `.rig/autonomy.json` rung 3, PR author in base `humanApproval.trusted`, and `breaker(changeHistory(ROOT, labelled), …) === null`, skip `independentApproval` and print `tier 0: merges without a person (rung 3, trusted author)`. Otherwise the existing approval rule, and the block message names the first unmet condition (`rung N`, `author not trusted`, or the breaker reason). `labelled` comes from `gh api search/issues?q=repo:<repo>+is:pr+is:merged+label:revert` (empty on any error, with a warning line).
- [ ] Tests (riskRun style; a PR with `review.md` = `verdict: pass\n## Findings\n` so it is tier 0): rung 3 + trusted → no human-approval block; head sets rung 3 but base is 2 → block naming `rung 2`; untrusted → block naming `author not trusted`; base history with a reverted tier-0 merge and `window: 2` → block naming the breaker.
- [ ] Docs: README autonomy line and file table (rung 0-3), SECURITY row, CHANGELOG, skills/autonomy text, rig-check.yml header; raise the cap. `npm test && npm run typecheck`. Commit `feat(ci): tier 0 merges without a person at rung 3, behind a revert breaker`.

### After the tasks

One fresh review of `git diff main...HEAD`, one fix pass, `npm test` again.
