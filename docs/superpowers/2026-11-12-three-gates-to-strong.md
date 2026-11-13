# Three gates to "Strong": design approval, tests, final approval

2026-11-12. Source: the "How rig measures up" section of `reports/scaling-agentic-factory.html` (scan at v0.9.0), re-checked by hand
against `main` at be1533f (0.10.0). Goal: move three rows of "Against your five pipeline goals" from Partial to Strong.

## 1. What the code shows today (re-checked)

| Gate | Report says | On main now | Correction |
|---|---|---|---|
| Human approves design | one gate, a markdown bundle, heavy for a weak reviewer | `skills/approve/SKILL.md`: `/rig:approve chart-N` covers prd, source, conversion, requirements, intents, test plan and chart-review. `S prd proposed` lists what the agent supplied. Approval records who, when, file hashes. Nothing asks the reviewer anything. | none |
| Auto tests, code, mutation | same agent writes tests and code; mutation blocks only on Node/Angular; no threshold | `skills/build/SKILL.md:13-22`: one context writes test, code and the intent-map checker. The test plan's cases and data are read by the builder. `templates/stacks/node.json:15` and `angular.json:15` run `mutation-diff` blocking in CI (any survivor fails, so the threshold is effectively 100% of changed lines). The six other stacks run whole-repo mutation nightly with `blocks: false`. | "No threshold" is really "all-or-nothing on two stacks, nothing on six". |
| Human final approval | GitHub approver ≠ author; rung 3 lets tier-0 merge with nobody; protect only prints commands | `templates/rig-check.yml:7-8` confirms the tier-0/rung-3 bypass. `scripts/protect.ts` adds required checks only to existing protection and prints a `PUT` otherwise, with `required_pull_request_reviews: null`. `scripts/risk.ts:58`: over `risk.maxLines` (400) only raises the tier. | Confirmed. `scripts/sensors.ts:154-158` raises a source-diff finding over `size.diffLines` (500), but the built-in `size` sensor defaults to `blocks: false` (`scripts/registry.ts:31`) and an approved plan downgrades it to a warning (`scripts/check.ts:250-252`). By default nothing refuses an oversize PR. |

Already strong, keep as is: red-proof in `/rig:test`, test-tamper (deleted tests, skips, dropped assertions block), intent-map planted
bugs, the clean-context Opus ai-review, CODEOWNERS, approval hashes, base-branch judging in CI.

## 2. What "Strong" means (acceptance for each gate)

**G1 Human approves design.** A reviewer approves from one page, not the bundle; the page lists every AC traced to its PRD line, every
value the agent supplied, and what the chart did not cover; the approval is refused until the reviewer has answered the page's
check questions, and the answers are stored in the approval row.

**G2 Auto tests, code, mutation.** Acceptance cases the implementer never sees decide whether the change passes; tests are written by a
different agent context from the code and frozen before the code is written; a mutation score on changed lines, with a numeric
threshold, blocks in CI on all eight stacks.

**G3 Human final approval.** No PR merges without a named person on any tier in the consultancy profile; an oversize PR is refused
whatever the plan says, unless a person splits or waives it; `init --protect` makes branch protection real (or readiness fails); the
approver answers a comprehension check, and a seeded-defect audit measures whether approvers catch planted bugs.

## 3. Critical items, in order

Ordered by risk removed per unit of work. C1 and C2 are the two the report's evidence rates highest (no-human merge and test gaming).

### C1. Hard final gate (G3, deterministic, smallest) — critical
- `humanApproval.everyTier: true` in `.rig/sensors.json` (default on in the client/core profile from `2026-11-11-rig-core-profile.md`):
  rig-check ignores the tier-0/rung-3 path; `autonomy` refuses rung 3 while it is set. Files: `templates/rig-check.yml`,
  `scripts/autonomy.ts`, `scripts/registry.ts`.
- `risk.hardCap: true`: at ship and in CI a diff over `risk.maxLines` blocks whatever `size.blocks` says, and plan approval does not
  lift it; only a `size` waiver (a person, judged on the base in CI) does.
- Decided 2026-11-12: D1 (a), D2 keep rung 3 behind `everyTier: false`, D3 0.8, D4 real PRs with CI holding the merge.
- `init --protect --create`: when the branch has no protection, create it (required checks, 1 approving review, dismiss stale reviews,
  code-owner review, `enforce_admins: true`) instead of printing. Add a `readiness` client-level check that fails without it.
  Files: `scripts/protect.ts`, `scripts/readiness.ts`.
- Specs that fail without each fix: tier-0 PR at rung 3 with `everyTier` still needs an approver; an approved plan over the cap is still
  blocked in CI; protect on an unprotected branch issues the PUT with reviews required.

### C2. Separate test writer and frozen tests (G2) — critical
- `/rig:build` splits into two contexts: a **test writer** (Sonnet, brief = spec.md behaviours, requirements.md, the contract/interface
  files and the test command; no source files) writes every failing test and runs `--expect-fail`; then the **implementer** writes code.
- At the hand-off, `sdlc tests-freeze <slug>` writes `.rig/changes/<slug>/tests.freeze.json` (path + hash of each test the writer made).
  Add it to PROTECTED. test-tamper blocks any change to a frozen test file in the rest of the build, at Stop and in CI: hash-based,
  so a Bash write is caught the same as an Edit. Changing a frozen test means relaunching the test writer, which re-freezes and is
  listed in the PR body.
- Files: `skills/build/SKILL.md`, a new `scripts/testfreeze.ts`, `scripts/sensors.ts`, `scripts/verify.ts`.
- Cost: one extra Sonnet launch per change in the target. Measure it in the eval before turning it on by default.

### C3. Hidden acceptance cases (G2) — critical
- At chart time the QA agent also writes executable black-box acceptance tests (CLI/HTTP/contract level, from `cases.md`) to
  `.rig/product/sprints/sprint-<N>/holdout/`. They are approved and hashed with the chart.
- The builder never sees them: managed-settings deny `Read`/`Grep`/`Glob` on `**/holdout/**`; a PreToolUse hook refuses Bash commands
  naming the path; the build briefs never mention it; `cases.md` keeps ids and requirement text but the expected values move into
  holdout.
- `/rig:test` and CI run them and report only case id, requirement id and pass/fail, never the test source or the expected output.
  The report records the holdout-vs-visible gap per change.
- Honest limit: locally this is a guardrail, not a wall (the model runs on the same disk). The wall is CI: holdouts are judged from the
  base branch, and a change that edits `holdout/` is tier 2. A separate holdout repo is the stronger option (decision D1).
- Files: `skills/chart/SKILL.md` step 4, `skills/testplan/SKILL.md`, `templates/testplan-format.md`, `templates/managed-settings.json`,
  `scripts/hooks.ts`, `scripts/verify.ts`, `templates/rig-check.yml`.

### C4. Mutation on changed lines, every stack, with a number (G2)
- Add `mutation-diff` (`cadence: ci`, `blocks: true`) to the six other packs using each tool's diff mode: `cargo mutants --in-diff`,
  `dotnet stryker --since`, `pitest scmMutationCoverage` (Maven) / changed classes (Gradle), `mutmut --paths-to-mutate {changed:py}`,
  `go-mutesting {changed:go}`.
- One normaliser script (`scripts/mutscore.ts`) reads each tool's report and prints `killed/total` on changed lines; it fails below
  `mutation.minScore` in `.rig/sensors.json` (default 0.8; raising it is allowed, lowering it is harness-tamper). Node/Angular move from
  "any survivor fails" to the same score, so equivalent mutants stop forcing waivers.
- Survivors are listed with file:line and fed to the test writer (C2), never the implementer.
- Verification: a per-stack fixture with one weak test must fail the sensor; run in the per-stack e2e.

### C5. One-page design approval with check questions (G1)
- `sdlc chart summary <N>` writes `approval.md` (generated, never edited): AC table (id, PRD line quote, intent, test-plan case,
  holdout case); "agent supplied" (`prd proposed`); "not covered" (`open` and `n/a` coverage rows, open questions, waived findings);
  one-paragraph ADR digests; at most 3 check questions drawn from the riskiest items (proposed values, one-way doors, NFR targets).
- `/rig:approve chart-N` shows `approval.md` first and asks the check questions with `AskUserQuestion`; the answers go into the approval
  row next to who and when. A blank or "skip" answer refuses. The bundle stays the evidence; the page is what is approved and hashed.
- Files: `scripts/chart.ts`, `skills/approve/SKILL.md`, `skills/chart/SKILL.md` step 8, the approval row format.

### C6. Final-approval comprehension check, seeded audits, review health (G3)
- PR body gains "Check before approving": 3 questions generated from the diff (what breaks if X, which intent does file Y serve). The
  approver answers in the approving review. rig-check requires an approving review with answers present (presence only; quality is
  audited, not graded).
- `sdlc audit seed <pr>` (opt-in, for 1 in N PRs): pushes a commit with one planted defect taken from a C4 survivor or the reviewcases
  set. rig-check blocks merge while an audit commit is present. The person running the audit reveals it; the record says whether the
  reviewer flagged that line. Catch rate goes into `report`.
- `sdlc report --github` adds approval rate, comment density, time to first review and seeded-defect catch rate, per approver over time.
- Files: `scripts/prbody.ts`, `templates/rig-check.yml`, new `scripts/audit.ts`, `scripts/report.ts`.

## 4. Order of work and budget

| Wave | Changes | Why this order |
|---|---|---|
| 1 | C1 | Deterministic, no model cost, closes the no-human merge path. One Sonnet implementer, one Opus review. |
| 2 | C2, then C3 | C3's holdout runner reuses C2's verify plumbing. Each its own change and review. |
| 3 | C4 | Six packs plus one normaliser; one implementer per group of packs. |
| 4 | C5, C6 | Reviewer-facing; C6's seeded defects reuse C4 survivors. |

Each change keeps CLAUDE.md's rules: at most 4 subagent launches, `npm test` once, one Opus review of `git diff main...HEAD`, a spec
that fails without the fix. Then re-check the three rows by the acceptance in section 2 and re-run the paired eval: C2 and C3 add cost
per change, and that cost has to show up in the numbers.

## 5. Decisions for the person

- **D1 Holdout location.** (a) In the repo under `holdout/`, denied locally, judged in CI (recommended to start); (b) a separate
  holdout repo only CI can read (stronger, more setup per client).
- **D2 Rung 3.** Keep it behind `everyTier: false` for internal use (recommended), or delete it.
- **D3 Mutation threshold.** 0.8 on changed lines as the default (recommended), or keep 100% for Node/Angular.
- **D4 Seeded defects in real PRs.** OK with CI holding the merge until revealed (recommended), or shadow PRs only.
