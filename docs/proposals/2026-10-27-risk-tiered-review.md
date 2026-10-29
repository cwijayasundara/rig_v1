# Risk-tiered review: people read only the changes that need them

Status: agreed 2026-10-27 (decisions at the end). Built and merged 2026-10-27.

## The ask

> When agents generate more and more code, it becomes impossible to do all these code reviews manually.

Source read in full: Osmani, Westlee Lunt, Wang, *Solving code review at Anthropic* (claude.dev blog, Oct 2026). Its
numbers (pass after one review round 65% → 78%; reverts per merged PR down 40%+ while merges doubled) are Anthropic's own
and unverified.

## What the article does

The question changes from "did a person read the code?" to "what could go wrong, and which check, automated or human,
should catch it?" The goal is the least human time per change with no rise in reverts or incidents. Seven layers:

1. Verification before review: the agent runs tests/build/lint and shows output; a fresh-context agent reviews the diff.
2. AI review on every PR: parallel finders, then a separate verifier group that votes; only agreed findings post, tagged
   Important / Nit / Pre-existing. Every finding is answered: fixed, or closed with a reason.
3. Security review: separate pass, blocks merge while a finding is open.
4. Required CI; the PR template carries Testing, Risk, How to revert.
5. Human approval by risk, set by the change, not the author: low = none once green, medium = one, high = two. Always-human
   paths (CI workflows, billing, installers, owner-marked). Light paths for trusted authors only. Bot approvals never fill a
   human slot; approvals are per commit.
6. Merge queue, flags, staged release.
7. Fast rollback; incidents and reverts become an eval set the reviewer is rescored on whenever its prompt, tools or model
   change.

Convergence: an agent author and agent reviewer looped 50+ rounds on one PR. Fixes: cap at 3 rounds, re-review only the
new diff, flag the bug class, never repeat a finding, nightly review of old code. Their own named gap: no circuit breaker
that tightens approval when revert or incident rates move.

## Where rig stands

| Layer | rig today | Gap |
|---|---|---|
| 1 | Test-first build, sensors per edit, fresh passing `verify.json`, lessons loop | small: no simplify / bug-hunt pass |
| `REVIEW.md` | `templates/REVIEW.md`, read by the managed service only | no "what failure looks like here", no skip paths |
| 2 | One clean-context Sonnet reviewer (`templates/review-brief.md`), ≤ 8 findings, "Fails when" evidence | one finder, no verifier; no Pre-existing tag; one depth for all |
| rounds | "Review once, never a second review" (`skills/pr` step 2) | fixes in the wave are never checked |
| 3 | `/security-review` always, with a fallback agent | not in CI; nothing blocks merge on it |
| 4 | `rig-check` from the base branch; PR body has blast radius, door, evidence | no How to revert; CI ai-review runs only on the lead-override path |
| 5 | Every PR waits on a person; approval is per head commit and must be independent (`check.ts` `independentApproval`) | **no tiers: the gap behind the ask** |
| 6-7 | production gate; 6 seeded cases in `eval/review.mjs` | no revert mining, no revert-rate guardrail |
| context | code wiki, `pr-outline.md` | matches the article |

rig's strength the article argues for: a person already approves direction up front (chart, plan approval). Taking people
off routine diffs keeps them on "should we build this?", which the article says is where they matter most.

## Proposal

Three phases; each makes the next safe.

### Phase A: an automated review worth leaning on

A1. **AI review and security review on every PR in CI.** Split `rig-check.yml` `ai-review` from the lead-override path:
it runs on every PR, reads the brief from the base branch (as today), and a second step runs the security review action
or `claude -p` with the security scope from `skills/pr` step 2. An open critical or high finding fails the job; `rig-check`
needs it. Skip when the head tree equals the tree `/rig:pr` reviewed and `review.md` says `verdict: pass` (no double pay).

A2. **Finders, then a verifier.** For tier ≥ 1 (Phase B), `/rig:pr` launches two finders on narrow lenses (correctness
against B-numbers and the ledger; contracts, data and tests), then one verifier that rereads each finding's cited lines
and keeps it only with code evidence and a failing input. Tier 0 keeps today's single reviewer. Within CLAUDE.md's
4-launch budget: 2 finders + 1 verifier + the security fallback.

A3. **Pre-existing tag.** The brief asks for `git blame` on each finding's line: a line older than `<base>` goes under
`## Pre-existing`, never `## Findings`; it does not change the verdict and lands in the learn backlog, not the author's wave.

A4. **One confirm pass on the fixes.** After the fix wave, reuse the evaluator's confirm mode on the diff: reread only the
cited files, answer `confirmed` or `reopened: <why>` per finding, raise nothing new. A reopened finding stays open for the
person. One bounded round; still never a second full review.

A5. **REVIEW.md for the local reviewer too.** Add `## What failure looks like here` and `## Skip` to the template;
the brief already reads REVIEW.md. Finding categories that recur go into it via `/rig:learn` (the article's "persistent
fixes").

### Phase B: risk tiers

B1. **`sdlc.ts risk <slug>`**, deterministic, run in CI from the base checker and base `sensors.json` so a PR cannot lower
its own tier. Tier is the max over:

| Signal | Source | Tier |
|---|---|---|
| a changed path matches `risk.alwaysHuman` (default: CODEOWNERS list, `.github/workflows/**`, plus team globs such as auth, billing, migrations) | base `sensors.json` | 2 |
| touches an action in `architecture.md` `## Access` | architecture | 2 |
| one-way door (plan `## Contracts` non-empty) | `prbody.ts` `door` | ≥ 1 |
| a finding still open, a finding dismissed in triage, or `## Unverifiable` non-empty | review.md | ≥ 1 |
| diff over `risk.maxLines` (default 400) | git | ≥ 1 |
| none of the above, verify pass, review pass | | 0 |

An optional model check (`risk.escalate: true`) reads the diff and may raise the tier with a reason, never lower it.

B2. **`rig-check` enforces the tier.** Tier 0: no human approval when every check is green, the author is in
`humanApproval.trusted`, and the autonomy rung is 3 (new; set only by a person through `/rig:autonomy`, proposed from
evidence like rungs 1-2). Tier 1: one independent approval of the head commit (today's rule; the lead override counts).
Tier 2: rig enforces the tier-1 rule only and suggests the rest: the check summary and PR body say "tier 2: two reviewers,
one a code owner, recommended" with the signals that set it. A team that wants two people enforced sets it in the source
control system (GitHub branch protection or rulesets, CODEOWNERS), never in rig. Bot approvals never count (already true). Default: rung ≤ 2, so tier 0
still needs a person until a team opts in.

B3. **PR body.** `prbody.ts` adds `## Risk` (tier and the signals that set it), `## How to revert` (two-way: `git revert
<sha>`; one-way: the contract's expand-migrate-contract step back) and `## What the checks would miss` (the reviewer's
Unverifiable list). That is what the human reads.

### Phase C: guardrails before any tier-0 merge

C1. **Metrics** in `report.ts`: human approvals per PR, time waiting on a person, review rounds, findings by outcome
(fixed, dismissed, pre-existing, reopened). Guardrail: revert rate per tier.

C2. **Circuit breaker.** `rig-check` counts reverts (a `Revert "` commit naming a merged `sdlc/*` branch, or a merged PR
labelled `revert` naming one) over the last
`risk.window` tier-0 merges; above `risk.maxRevertRate` it treats tier 0 as tier 1 and says why. Rung 3 is not changed;
the breaker only overrides it.

C3. **Reverts become review eval cases.** `/rig:learn` mines each revert and its fix into a case in the shape of
`eval/review/cases.mjs` (diff, intent, defect file and pattern). `npm run eval` scores every change to the review brief,
finders or verifier against the set; a change that does not raise the catch rate is dropped.

C4. **Merge queue.** Add `merge_group` to `rig-check.yml` triggers so it works with GitHub's merge queue.

## Not copied

- Their 3-round loop: one review, one confirm pass is cheaper and the article's own data shows later rounds mostly find
  old bugs (A3 routes those away).
- Quick / Standard / Deep as a separate setting: the tier sets the depth.
- Feature flags, staged release: deployment, outside rig.

## Order and evidence gates

1. A1, A3, A4, A5, B3 (small; no behaviour change for people).
2. B1, B2 with rung 3 unavailable: tiers are computed and shown, tier 1/2 enforced.
3. A2 with C3: keep the finder/verifier split only if the review eval shows lift over the single reviewer (no pruning,
   and no adding, without evidence).
4. C1, C2, C4, then make rung 3 settable.

## Decisions (2026-10-27)

1. Tier 2's second reviewer is a suggestion, never a rig block; teams enforce it in GitHub (branch protection, rulesets,
   CODEOWNERS). rig enforces at most one independent approval.
2. A finding dismissed in `/rig:pr` triage raises the change to tier 1, so a person sees every dismissal.
3. Reverts are detected from both the `Revert "` commit message and a `revert` label on the PR.
