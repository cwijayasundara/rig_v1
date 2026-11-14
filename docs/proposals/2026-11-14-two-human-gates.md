# Two human gates: approve the chart PR, approve the change PR

2026-11-14. Owner's rule: **a person approves twice: at the end of the outer loop (the chart) and at the end of the inner loop
(the PR). Nothing else waits on a person.** Applies to `2026-11-14-path-to-production-and-adoption.md` and
`2026-11-14-frontend-design-in-the-loops.md`. An independent Fable 5.2 evaluator reviewed the first draft against the code and
returned `changes-needed` (2 critical, 7 high, 4 medium). All are applied (§9).

## 1. The idea: both gates are a GitHub PR approval

The chart lands as a PR (`rig/chart-<N>`), and so does each change (`sdlc/<slug>`). Approving those two kinds of PR are the
only human acts in the flow. The approval is the decision, so no local command records a second one.

- **Today a person approves the chart twice.** They run `/rig:approve chart-<N>`, which writes `approval.json` with
  `SDLC_HUMAN`. Then CI treats that row as a human row, which needs a second person's PR approval (`scripts/check.ts:297-303`).
- **Under this proposal**, the agent runs `sdlc chart seal <N>` (deterministic, no `SDLC_HUMAN`) to write the hashes. The chart
  PR's approval by an independent person is gate 1. `rig-check` accepts the chart only from an approved PR whose head carries
  those hashes, recomputed on head.
- **Repos with no remote** keep the local `SDLC_HUMAN` approval, which `lifecycle.ts:144-148` already handles.

This also makes the count checkable: one approved chart PR per sprint, plus one approved PR per change.

## 2. Every place rig stops for a person today, and where each one goes

| Touchpoint | Where | Under two gates |
|---|---|---|
| `/rig:approve chart-<N>` | `sdlc.ts approve` | **Gate 1**, as the chart PR's approval (§1) |
| PR approval by someone other than the author | `rig-check.yml`, `approvedBySomeoneElse` (`check.ts:345`) | **Gate 2**; `everyTier: true` |
| `/rig:approve <slug>` (spec, plan, contracts) | `lifecycle.ts:133`, `pr.ts:58`, `check.ts:215` | **Removed**; deterministic plan checks instead (§3) |
| `waive chart-N <finding>`, the chart's Deferred items | `sdlc.ts:243-246,386` | Requests on the chart PR, granted by gate 1 (§4) |
| `/rig:waive` | `sdlc.ts:371` | Requests on the change PR, granted by gate 2 (§4) |
| `intent-adjudicate` (a surviving mutant ruled a non-bug) | `intentmapio.ts:102-118`, not guarded today | Requests, as waivers; add it to the human-row files (`check.ts:284`) |
| `/rig:approve arch` (layer rules) | `arch.ts:198` | Written at chart; `.rig/layers.approved.json` joins the chart hash (gate 1) |
| `/rig:approve app` (journeys) | `app.ts:137-146` | Cannot be approved at chart, because the driver must run against a built app. The integration intent writes the driver, and its PR approval (gate 2) records it, with CI recording the hash on merge |
| `/rig:autonomy set` | `autonomy.ts:90` | Rung 2 is fixed: the queue runs and opens PRs unattended. The brake is `sdlc off` or an edit to the queue file, both through a PR. This hard-codes rung 2 and drops the per-rung brake, said plainly |
| `queue defer` | `queue.ts:105` | An edit to the queue file through a PR |
| Chart step-2 questions (≤ 4); `/rig:start` questions on ad-hoc work; the design-system question (`skills/start/SKILL.md:16`) | skills | None asked. Chart gaps become `(proposed at chart)` values on the chart page; ad-hoc open points go in the PR body |
| C5 check questions, C6 Q1–Q3 | approval page, PR body | Part of gates 1 and 2, answered in the approving review |
| `rig-hold` label, lead-override Environment click | `rig-check.yml` | Stay as gate-2 tools; the Environment click is the solo maintainer's route (`selfApprovers`) |
| Seeded audits | `audit.ts:110` | Audit gate 2, not part of the flow; off by default |

Setup and operations (`init`, `upgrade`, `off` and `on`) arrive as PRs, so gate 2 covers them.

## 3. Replacing the per-change approval: deterministic plan checks, recomputed in CI

### 3.1 What the per-change approval does today

`approval.json` holds the hashes of `spec.md`, `plan.md` and every file under the `contracts.files` globs (`lifecycle.ts:51-56`).
`gates.plan: false` exists (`registry.ts:55`) but loses the contract freeze, since `frozenFor` reads only `approval.json`
(`contracts.ts:32`). The approval also carries, and the replacement must keep:
- the build-before-approval block (`lifecycle.ts:88-101`) and the `stale` state (`lifecycle.ts:62`);
- the open-questions, carried-items, blast-radius and intent-map refusals (`lifecycle.ts:65-80`);
- the scenario hashes in `freeze.json` (`lifecycle.ts:106`);
- the PR-body freeze;
- the approval counts in `report.ts`.

### 3.2 What replaces it: facts a script can recompute on head

No model verdict enters these checks. `sdlc plan-check <slug>` runs at the end of `/rig:plan`, and `rig-check` recomputes it on
the PR head against the merge-base:

1. **Contracts unchanged.** No file under the `contracts.files` globs differs from the merge-base, unless the PR is a chart PR
   carrying a gate-1 approval. This is stronger than today's per-change freeze and covers uncharted changes too. A contract change
   always goes back to the outer loop.
2. **Inside the charted intent.** Every behaviour of the intent appears in `spec.md`. A behaviour citing ledger rows outside the
   intent is a **scope change**. `plan.md`'s files stay inside the intent's `scope:`.
3. **Plan before code, checked from git.** `/rig:plan` commits `spec.md` and `plan.md` as the first commit on `sdlc/<slug>`, before
   any source commit. CI reads the order from the branch. A later change to either file is listed in the PR body under
   **Plan changes after build**; the name avoids the existing `amendments.md`, which records review fixes (`pr.ts:64-65`). This
   replaces the build-before-approval block and the `stale` state.
4. **The existing refusals still refuse**: open questions, carried items, blast radius, intent map, the scenario hashes, and a test
   per behaviour.

The first commit's hashes take the place of `approval.json` for `frozenFindings`, `report.ts` and the PR-body freeze.

### 3.3 Model checks are evidence and a veto, never a pass

- **The evaluator's plan review** (`evaluate` model, run when `weight` is full or a contract is listed, `skills/plan/SKILL.md:24`;
  the tier is not known until there is a diff) goes in the PR body.
- **The weakening check stays a warning**, as designed (`weaken.ts:2-4`: lexical, "a warning, never a refusal"). Its lines are
  listed first in the PR body for the gate-2 approver.
- **The CI `ai-review` job** re-runs the plan review from the base-branch brief, against the spec the PR carries. A `changes-needed`
  verdict fails `ai-review` the way a code-review finding does today. That makes it a veto the person sees at gate 2, not an input
  to any pass.

### 3.4 When a change cannot proceed: a draft PR, not a silent stop

If a plan check refuses twice, or the evaluator returns `changes-needed` twice, the agent opens a **draft PR** with the refusal and
the findings and moves on to the next intent. The stop lands at gate 2, where a person already looks, instead of in a `status` line
that nobody owns.

### 3.5 Uncharted changes (a bugfix, a chore)

Gate 2 is the only gate. Checks 1, 3 and 4 apply; check 2 uses the scope the spec declares. The PR body leads with the spec, which
the reviewer is reading for the first time.

## 4. Waivers and adjudications: the agent requests, the PR approval grants

- `sdlc waive --request <sensor> <file> <reason>` appends a `requested` row. **Locally, verify and ship treat it as pending and
  pass**, so the PR can open. Without that, `sdlc pr` refuses on a failing `verify.json` (`pr.ts:59`) and the request never
  reaches gate 2.
- In CI the finding blocks until the PR is approved. The rules that carry over:
  - **CI scope**: waivers apply only to the change's own files (`check.ts:150-157`);
  - **expiry**;
  - **the never-waivable list**: protected paths, never waivable at CI (`check.ts:166`);
  - `waivers.jsonl` stays a human-row file.
- **Who grants.** `approvedBySomeoneElse` accepts any owner, member or collaborator other than the author (`check.ts:345-349`); it
  does not read CODEOWNERS. So either `check.ts` gains CODEOWNERS matching for the waived file, or the rule is "an independent
  approver" with code-owner review enforced by branch protection, which client readiness already requires. Recommended: the
  latter now, the former when a pilot needs it.
- **Approval is all-or-nothing.** A reviewer who accepts the code but not a waiver requests changes. The agent then fixes the
  finding instead of waiving it.

## 5. CI must re-run on the approval itself

`rig-check` triggers on `opened, synchronize, reopened, labeled, unlabeled` (`templates/rig-check.yml:15-16`). With `everyTier`, it
fails until a person approves, and then someone has to re-run it by hand. Add `pull_request_review: [submitted, dismissed]`, or
gate 2 itself leaves a person waiting.

## 6. What this gives up, said plainly

- **No person reads a plan before code is built.** That is a change to `docs/GOAL.md:36` ("A person approves"), which must be
  updated: a person approves what to build (gate 1) and what ships (gate 2); scripts hold the build to the first, and models
  advise both.
- A wrong plan costs build tokens before anyone sees it. The checks in §3.2 keep it inside the intent, the scope and the
  contracts, and the draft PR in §3.4 surfaces it.
- Gate 2 carries more weight, so `everyTier: true`, the C6 questions and the seeded audits matter more.
- The Phase 3 eval keeps an arm with the per-change human approval to measure what removing it costs.

## 7. Order of work

| Step | Change | Spec that fails without it |
|---|---|---|
| G0 | `pull_request_review` trigger; waiver requests pass locally as pending and block in CI until approval | An approved PR turns `rig-check` green with no manual re-run; a PR with a requested waiver opens |
| G1 | `sdlc plan-check` and its CI recompute (contracts equal to merge-base, intent and scope, plan committed first, the existing refusals); `gates.plan: false` in the client profile | A contract edit on a change PR blocks; a source commit before the plan commit is listed under "Plan changes after build"; a forged hash fails in CI |
| G2 | Chart as a PR gate: `sdlc chart seal`, and `rig-check` accepts a chart only from an approved chart PR; layer rules in the chart hash | The chart needs exactly one approval; a chart PR with a hash edited after approval fails |
| G3 | Plan review in `ai-review` as a veto; draft PR on a stop | A `changes-needed` plan review fails `ai-review`; two refusals open a draft PR |
| G4 | Adjudications as requests with a human-row rule; journeys recorded on merge of the integration PR; questions removed from chart and start; rung 2 fixed | The scripted journey goes from PRD to merged PRs with exactly one approved chart PR and one approved PR per change, and no `SDLC_HUMAN` event |

## 8. Decisions for you

- **D1** Remove the per-change plan approval for good, or keep it as an opt-in for regulated clients (`gates.plan: true`)?
  Recommended: keep the opt-in. It costs nothing when off.
- **D2** Who grants a waiver: any independent approver (now), or a CODEOWNER of the waived file, built into `check.ts` (later).
- **D3** Accept fixing the queue at rung 2 (unattended up to opening PRs), with `sdlc off` as the only brake.

## 9. Independent review

Fable 5.2 read the first draft and the code, read-only. Applied:
- **The waiver deadlock**: a requested waiver now passes locally as pending, so the PR opens.
- **The "seal"**: it claimed a model verdict and unprovable ordering. It is now deterministic facts recomputed on head, with the plan
  committed first and the plan review as an `ai-review` veto.
- **The weakening check** stays a warning.
- **Silent stops** become draft PRs.
- **Waivers**: there is no CODEOWNERS detection in CI, and adjudications were not human rows. Both are addressed (§4).
- **The `pull_request_review` trigger** is added.
- **The contract freeze** was narrowed in the draft; it now covers every contract glob against the merge-base.
- **Journeys and layer rules** now have paths that work.
- **The full list of what the approval carries** is in §3.1.
- **The tier** is not known at plan time; the name "amendments" collided with `amendments.md`.
- **Rungs** do have a job, so the trade-off is stated (D3).
- **The human-event count** is consistent: both gates are now PR approvals, so the chart is no longer approved twice.
- **Touchpoints and the solo-maintainer route** that the draft missed are now in §2.
- **GOAL.md:36** must change (§6).
