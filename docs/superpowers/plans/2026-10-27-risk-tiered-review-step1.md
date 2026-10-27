# Risk-tiered review, step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the automated review worth leaning on: pre-existing bugs routed away from the author, fixes confirmed once, a REVIEW.md that says what failure looks like, a PR body that tells the human what to read, and AI plus security review on every PR in CI.

**Architecture:** Text changes to the reviewer brief, REVIEW.md template and `/rig:pr` skill (pinned by spec files that read the text); one new template `templates/confirm-brief.md`; `prBody` gains a `review` input and three sections; `templates/rig-check.yml` runs `ai-review` on every same-repo PR with a security step, and gates only on `## Findings`.

**Tech Stack:** Node 22 TypeScript (`node --test`, `--experimental-strip-types`), GitHub Actions YAML, Markdown skill text.

**Spec:** `docs/proposals/2026-10-27-risk-tiered-review.md` (items A1, A3, A4, A5, B3).

## Global Constraints

- One review per change: never a second full review. The confirm pass rereads cited files only and raises nothing new.
- `/rig:pr` stays within 4 agent launches: reviewer, security fallback (only when `/security-review` cannot run), confirm.
- The reviewer brief stays at most 60 lines (`scripts/reviewbrief.spec.ts`).
- Lines under `## Pre-existing`, `## Dismissed`, `## Unverifiable` carry no `[category: ...]` tag, so `learn mine` counts kept findings only.
- The confirm suffixes match the chart convention in `scripts/chartcheck.ts:206`: ` → fixed (confirmed)` and ` → reopened: <why>`.
- CI reads every brief from the base branch (`git show "origin/$BASE:..."`), never the PR's copy.
- Rig never enforces a second human; that lives in GitHub branch protection (proposal decision 1).
- Deviation from the proposal, A1: CI does **not** skip when the PR's `review.md` says pass. `review.md` is a file the PR writes, so trusting it would let a PR switch off its own gate. CI reviews every same-repo PR.

## Review Focus

1. A pre-existing critical finding in CI review output must not fail `ai-review`: the gate reads `## Findings` only (Task 4 test).
2. A review.md with no `## Unverifiable` section, or no review.md at all, still gives a PR body (Task 3 test).
3. A reopened finding must leave `verdict: changes-needed` even though the builder marked it fixed (Task 2 skill-text test).
4. Fork PRs have no secrets: `ai-review` must stay skipped for them, not fail (Task 4 test keeps the `head.repo.full_name` guard).
5. The lead override must still require `ai-review` success on the head commit after the job stops depending on the label (Task 4 test: `lead-override` keeps `needs: ai-review` and the label condition moves to it).

---

### Task 1: Pre-existing tag in the brief, REVIEW.md sections (A3, A5)

**Files:**
- Modify: `templates/review-brief.md`
- Modify: `templates/REVIEW.md`
- Test: `scripts/reviewbrief.spec.ts`, `scripts/prskill.spec.ts` (REVIEW.md test at line 61)

**Interfaces:**
- Produces: the reviewer answer shape gains `## Pre-existing` (after `## Unverifiable`), one line each `- path:line: problem → fix`, no severity or category tag. Task 2 and Task 4 read it.

- [ ] **Step 1: Write the failing tests** in `scripts/reviewbrief.spec.ts`:

```ts
test('a finding on a line older than the base goes under Pre-existing, untagged, and never changes the verdict', () => {
  assert.match(brief, /git blame/)
  assert.match(brief, /## Pre-existing\n- path:line: problem → fix/)
  assert.match(brief, /Pre-existing items never change the verdict/)
  const pre = brief.split('## Pre-existing')[1] ?? ''
  assert.doesNotMatch(pre, /\[category:/)
})
```

and in `scripts/prskill.spec.ts`, extend the REVIEW.md test:

```ts
  assert.match(rv, /## What failure looks like here/)
  assert.match(rv, /## Skip/)
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test scripts/reviewbrief.spec.ts scripts/prskill.spec.ts`
Expected: 2 failures naming the new assertions.

- [ ] **Step 3: Edit the brief.** Add one paragraph: before reporting a finding, run `git blame <base> -- <file>` on its line; a line unchanged since `<base>` goes under `## Pre-existing`, not `## Findings`. Add `## Pre-existing` to the answer shape and the sentence "Pre-existing items never change the verdict." next to the existing Unverifiable sentence. Stay within 60 lines.

- [ ] **Step 4: Edit `templates/REVIEW.md`.** Add `## What failure looks like here` (placeholder: "Replace with the one failure that costs most in this repo, e.g. a rounding bug that silently charges the wrong amount.") and `## Skip` (move the Exclusions list there and drop `## Exclusions`). Change the opening paragraph: both the managed service and the local reviewer read this file; the contracts and non-goals rules still live in CLAUDE.md `## Review`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `node --test scripts/reviewbrief.spec.ts scripts/prskill.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit** `feat(review): pre-existing findings and REVIEW.md failure/skip sections`

### Task 2: Confirm pass on the fix wave (A4)

**Files:**
- Create: `templates/confirm-brief.md`
- Modify: `skills/pr/SKILL.md` (steps 3 and 4)
- Test: `scripts/prskill.spec.ts`

**Interfaces:**
- Consumes: `## Pre-existing` from Task 1.
- Produces: review.md finding lines end in ` → fixed (confirmed)` or ` → reopened: <why>`; Task 3 counts reopened lines as open.

- [ ] **Step 1: Write the failing tests** in `scripts/prskill.spec.ts`:

```ts
test('pr copies Pre-existing findings to review.md, untagged, never fixed and never changing the verdict', () => {
  const t = pr()
  assert.match(t, /`## Pre-existing`/)
  assert.match(t, /Pre-existing[^.]*never fixed/)
})

test('after the fix wave one fresh agent confirms each fixed finding, raising nothing new', () => {
  const t = pr()
  assert.match(t, /templates\/confirm-brief\.md/)
  assert.match(t, / → fixed \(confirmed\)/)
  assert.match(t, / → reopened: <why>/)
  assert.match(t, /a reopened finding keeps `verdict: changes-needed`/)
  const brief = repoText('templates/confirm-brief.md')
  assert.match(brief, /Raise nothing new/)
  assert.match(brief, /<n>\. confirmed/)
  assert.match(brief, /<n>\. reopened: <why>/)
  assert.ok(brief.trimEnd().split('\n').length <= 30)
})
```

Update the existing test at line 71 if its wording changes (the ` → fixed` append stays; the verdict is set after the confirm answers).

- [ ] **Step 2: Run them and see them fail**

Run: `node --test scripts/prskill.spec.ts`
Expected: 2 new failures.

- [ ] **Step 3: Write `templates/confirm-brief.md`** (≤ 30 lines), modelled on `agents/evaluator.md` Confirm mode: placeholders `<base>`, `<slug>`, `<findings>` (the numbered finding lines marked ` → fixed`); reread only the files each cites and `git diff <base>` for them; answer one line per finding in order, `<n>. confirmed` or `<n>. reopened: <why>`; raise nothing new; edit nothing.

- [ ] **Step 4: Edit `skills/pr/SKILL.md`.** Step 3: review.md gains `## Pre-existing` (copied from the reviewer, untagged, never fixed, never changing the verdict; `/rig:learn` may turn them into later intents). Step 4: after appending ` → fixed`, when any line was fixed, launch one `general-purpose` agent with `model: sonnet`, foreground, whose prompt is exactly `confirm-brief.md` filled in; rewrite each answered line's suffix to ` → fixed (confirmed)` or ` → reopened: <why>`; set `verdict: pass` only when every item under `## Findings` is confirmed; a reopened finding keeps `verdict: changes-needed` and is not fixed again (no second wave). Keep the step-2 sentence "never a second review"; add that the confirm pass is not a review.

- [ ] **Step 5: Run the tests and see them pass**

Run: `node --test scripts/prskill.spec.ts scripts/reviewbrief.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit** `feat(pr): confirm the fix wave once, raising nothing new`

### Task 3: PR body says Risk, How to revert, What the checks would miss (B3)

**Files:**
- Modify: `scripts/prbody.ts`, `scripts/pr.ts:70`
- Test: `scripts/prbody.spec.ts`

**Interfaces:**
- Consumes: review.md sections `## Findings`, `## Dismissed`, `## Unverifiable`, suffixes from Task 2.
- Produces: `PrBodyInput` gains `review: string` (review.md text, `''` when absent). Body order: Why, Behaviours, Blast radius (with Door), **Risk**, **How to revert**, **What the checks would miss**, Evidence, outline. Phase B adds the tier line to `## Risk`.

- [ ] **Step 1: Write the failing tests** in `scripts/prbody.spec.ts` (pass `review: ''` in every existing call):

```ts
const review = 'verdict: changes-needed\n## Findings\n- [severity: high] [category: tests] a.ts:1: p → f → fixed (confirmed)\n- [severity: medium] [category: data] b.ts:2: q → g → reopened: still drops rows\n## Dismissed\n- c.ts:3 r → dismissed: spec B2 says so\n## Unverifiable\n- the CSV opens in Excel → settle by: a journey\n'

test('Risk lists the signals a person should weigh', () => {
  const b = prBody({ intent, spec, plan: plan.replace('none', '- api.yaml'), verify, outline: '', review })
  assert.match(b, /## Risk\n\n- one-way door\n- 1 finding still open\n- 1 finding dismissed by the builder\n- 1 item the reviewer could not verify/)
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '' }), /## Risk\n\nnone of the signals: two-way door, no open, dismissed or unverifiable findings/)
})

test('How to revert depends on the door', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '' }), /## How to revert\n\nRevert the merge commit: `git revert -m 1 <merge sha>`\./)
  assert.match(prBody({ intent, spec, plan: plan.replace('none', '- api.yaml'), verify, outline: '', review: '' }), /## How to revert\n\nReverting the code does not undo the contract change to api\.yaml/)
})

test('What the checks would miss quotes the Unverifiable list, and says so when there is none', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review }), /## What the checks would miss\n\n- the CSV opens in Excel → settle by: a journey/)
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '' }), /## What the checks would miss\n\nnothing the reviewer named/)
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test scripts/prbody.spec.ts`
Expected: the 3 new tests fail.

- [ ] **Step 3: Implement** in `scripts/prbody.ts`: `risk(plan: string, review: string): string[]`, `revert(plan: string): string`, and the third section from `bullets(section(review, 'Unverifiable'))`. A finding is open when its line under `## Findings` has no ` → fixed` suffix or ends in ` → reopened: ...` (reuse the `SUFFIX` idea from `chartcheck.ts:206`, do not import chart code). One-way text: "Reverting the code does not undo the contract change to <files>: ship the previous contract as a new change (expand–migrate–contract)." Counts pluralise (`1 finding`, `2 findings`). In `scripts/pr.ts:70` pass `review: c('review.md')` (`read` in `core.ts:52` returns `''` for a missing file).

- [ ] **Step 4: Run the tests and see them pass**

Run: `node --test scripts/prbody.spec.ts scripts/pr.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit** `feat(pr): Risk, How to revert and What the checks would miss in the PR body`

### Task 4: AI review and security review on every PR in CI (A1)

**Files:**
- Modify: `templates/rig-check.yml`
- Modify: `SECURITY.md` (the CI row), `README.md` (where it names `ai-review`), `CHANGELOG.md`
- Test: `scripts/workflows.spec.ts`; `scripts/check.spec.ts` must still pass unchanged

**Interfaces:**
- Consumes: `## Pre-existing` from Task 1 (the gate ignores it).
- Produces: job `ai-review` on every same-repo PR; job `lead-override` with the label condition and `needs: ai-review`; `rig-check` `needs: [ai-review, lead-override]`, `if: ${{ !cancelled() }}`. Teams make `ai-review` and `rig-check` required status checks.

- [ ] **Step 1: Write the failing tests** in `scripts/workflows.spec.ts`, using the existing `parse`/`Workflow` helpers:

```ts
test('ai-review runs on every same-repo PR, and only the lead override needs the label', () => {
  const w = parse(read('templates/rig-check.yml')) as Workflow
  const ai = w.jobs?.['ai-review'] as { if?: string }, lo = w.jobs?.['lead-override'] as { if?: string; needs?: unknown }
  assert.doesNotMatch(ai.if ?? '', /rig-lead-override/)
  assert.match(ai.if ?? '', /head\.repo\.full_name == github\.repository/, 'fork PRs have no secrets: skip, never fail')
  assert.match(lo.if ?? '', /rig-lead-override/)
  assert.equal(lo.needs, 'ai-review')
})

test('ai-review runs a security pass from the base branch and gates on ## Findings only', () => {
  const t = read('templates/rig-check.yml')
  assert.match(t, /security/i)
  assert.match(t, /git show "origin\/\$BASE:\.rig\/security-brief\.md"/)
  assert.match(t, /sed -n '\/\^## Findings\/,\/\^## \[\^F\]\/p'/)
  assert.doesNotMatch(t, /grep -qE '\\\[severity: \(critical\|high\)\\\]' "\$RUNNER_TEMP\/review\.md"/, 'the whole-file grep would fail on Pre-existing items')
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test scripts/workflows.spec.ts`
Expected: the 2 new tests fail.

- [ ] **Step 3: Edit `templates/rig-check.yml`.** Move the label condition from `ai-review` to `lead-override` (keep the same-repo guard on `ai-review`). Add a step after the code review: brief from `git show "origin/$BASE:.rig/security-brief.md"`, falling back to an inline text matching `skills/pr` step 2's fallback scope (injection, authn/authz, secrets, unsafe input, crypto, path traversal, `## Access` rows), `claude -p --model sonnet --allowedTools "Read,Grep,Glob"`, output `$RUNNER_TEMP/security.md`. Gate both outputs through one shell function: `verdict: pass` required, and no `[severity: critical|high]` inside the `## Findings` section (extract with `sed -n '/^## Findings/,/^## [^F]/p'`). Update the header comment: `ai-review` is on every PR; make it a required check; two-person review for risky paths is set in branch protection, not here.

- [ ] **Step 4: Update docs.** `SECURITY.md` CI row and README mention: `ai-review` (code + security) runs on every same-repo PR and blocks on a critical or high finding; fork PRs skip it and need a human. `CHANGELOG.md`: one entry for this step.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass; quote the summary line.

- [ ] **Step 6: Commit** `feat(ci): AI and security review on every PR`

### After the tasks

One review of `git diff main...HEAD` (`/code-review` or one `sonnet` reviewer), fix findings in one wave, `npm test` again.
