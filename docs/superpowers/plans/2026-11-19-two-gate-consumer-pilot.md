# Pilot the two-human-gate SDLC on one consumer repository

**Status** Local baseline, implementation chart binding, and required holdout checks. Review baseline `7ffe190`, 19 November 2026.

**Outcome** A person approves the sprint artefacts on a chart PR. The agent then plans, builds, tests, repairs, and opens each implementation PR unattended. A person approves the implementation PR after inspecting evidence tied to the approved intent and current revision. One chart approval can cover several implementation PRs. A change to the authorised outcome goes back through the chart gate.

This plan applies the [two-gate design](../../proposals/2026-11-14-two-human-gates.md) to one GitHub consumer. Keep the interactive workflow available. Select a consumer with a runnable application or API, reproducible test setup, an independent reviewer, and at least one historical regression that can serve as an acceptance case.

## 1. Establish the pilot baseline

- [ ] Install the chart-capable profile on a disposable branch of the consumer. Record the Rig revision, consumer base SHA, toolchain, model, and effective settings. Use the automatic plan path with `gates.plan: false`, enable risk enforcement, and require a human at every tier with `humanApproval.everyTier: true`.
- [ ] Trace a chart PR and one implementation PR using the actual consumer workflow. Record each request for human input, its cause, and whether the workflow can proceed when the agent session restarts. Check which parts of the existing proposal already work before adding code.
- [ ] Capture current outcomes for four fixtures: approved in-scope change, uncharted source change, broken critical behaviour, and green PR awaiting approval. Keep these fixtures for the final acceptance run.

### Local baseline

The recorded `shop_app` snapshot at `26f1105` provides a local starting point with a runnable CLI and a known failure case. The GitHub connector could not resolve `cwijayasundara/shop_app`. This run used the checked-in snapshot on a disposable local branch, with Rig `7ffe190` (vendored version 0.11.1), Node 26.13.0, npm 11.20.0, and Python 3.15.2. The import commit was `882913d559340ec40e27caa77717f02ea29b4976` and the configured local base was `f1a353504b16a259a2c52498b41c192e625cf0d9`. The `full` profile installed the chart skill, checker, and GitHub workflows. Effective settings were `gates.plan: false`, `risk.enforce: true`, and `humanApproval.everyTier: true`. Fixture commits bypassed local hooks to exercise the check entry points directly. No model ran. [Consumer snapshot](../../../eval/fixtures/review-cart) · [Cart CLI fixture](../../../eval/fixtures/review-cart-cli)

| Journey | Local result |
|---|---|
| Approved in-scope change | The cart CLI fixture stayed in the base intent's declared scope. `plan-check --commit` passed even though the base intent had no chart seal. The approved journey still needs an independent chart review. |
| Uncharted source change | A comment-only edit to `src/cart/cli.py` with an ad hoc change record passed `plan-check --commit`. CI repeated the scope and ledger warning. Its other checks blocked. |
| Broken critical behaviour | The `cli-empty-file-arg` case shows that an explicit empty `--file` must not fall back to `CART_FILE`. The control returned exit 2 and left the environment-selected file absent. The seeded regression returned exit 0 and created that file. Baseline `holdout --ci` reported zero cases and exited successfully. [Regression fixture](../../../eval/review/cart-cases.mjs) |
| Green implementation awaiting approval | The local checker reported that it could not verify a reviewer outside a GitHub pull request run. Traceability and missing Python tools also blocked the run. Effective mergeability still needs a live PR. |

The workflow trace found two separate interactions on the chart path. The local `approve chart-N` command writes a seal and commits the chart files. CI then requires a separate independent review on the PR head. On the implementation path the automatic plan command commits the plan, and CI requires a current review. The review-event workflow reruns the checker after a review. Live review events, interruption counts, and restart behaviour still need to be captured. [Chart approval command](../../../scripts/sdlc.ts) · [Review-event workflow](../../../templates/rig-approved.yml)

## 2. Bind implementation to the approved chart

**Start in** `scripts/chart.ts`, `scripts/plancheck.ts`, `scripts/check.ts`, and `skills/build/SKILL.md`. The plan checker already checks commit ordering, protects contracts, and consults base-branch intent. Its ad hoc path warns and skips scope and ledger checks.

- [x] On the chart PR, show outcomes, invariants, allowed scope, contracts, critical acceptance cases, and unresolved assumptions. Record the independent human review and the revision it covered. Reuse the chart seal and approval machinery where available. A successful chart PR must require a single human decision.
- [x] For unattended changes, have base-controlled CI resolve the intent to the approved chart and verify its revision. Compare actual source changes with the approved scope, including both paths of renames and deleted files.
- [x] Allow plan repairs inside that scope and surface amendments on the PR. Update build instructions that request routine reapproval. Route changed contracts, scope expansions, or revised acceptance criteria back to the chart. Leave blocked work with a concrete reason and a resumable state.
- [x] Verify that an uncharted intent, stale approval, and out-of-scope edit omitted from the plan each block. Verify that an in-scope plan amendment reaches the PR without an intermediate human prompt.

Enable the pilot chart binding with `"gates": { "plan": false, "requireChart": true }` on the consumer base. Keep `risk.enforce` and `humanApproval.everyTier` enabled. Rig recomputes the chart seal from committed files on the current base and checks that the parent's seal at the first plan commit covers the same revision. A changed chart digest sends the work back to the approved base for a new implementation branch. The local and CI regression cases cover uncharted work, a stale seal, a candidate resealing changed acceptance, a newly approved base merged into an old plan branch, and an out-of-scope file omitted from the plan. Specs also cover an in-scope amendment reaching CI and the PR body with no block, and an out-of-scope amendment blocking the commit. Independent chart review and the live amendment-to-PR journey still need verification. [Plan checks](../../../scripts/plancheck.spec.ts)

## 3. Require independent evidence for critical behaviours

**Start in** `scripts/holdout.ts`, `templates/rig-check.yml`, and the chart test-plan format. Today the holdout runner uses base-branch cases and can return a successful empty result. Consumer setup must install the application and its dependencies.

- [x] At gate 1, associate each critical behaviour with a case ID, an observable result, and its verification method. Reuse frozen regression tests, consumer contracts, property checks, or application journeys as appropriate.
- [x] Keep the separate test writer, red run, and test freeze. In CI, run the approved cases against the candidate revision. Report required, executed, passed, failed, and missing cases by ID. A required case that fails, never runs, or lacks its toolchain must block.
- [ ] Exercise one real failure mode. For a payment consumer, for example, send two concurrent retries with one idempotency key after a lost response and inspect the settled ledger. For a UI consumer, replay a critical journey and assert persisted state. Show the reviewer both the observed result and the regression that the check detects.
- [ ] Generate a project-local `verify` skill for the consumer that boots the application and drives one critical journey, recording a step trace and screenshot as replayable evidence. Update its feature map when the application drifts. Use it for the failure-mode run above and attach its output for the reviewer. Borrow the shape of pstack's `create-verification-skill` and `maintain-verification-skill`, after reading their bodies, which the review did not. Built in code (not yet on a consumer): journey steps record observed values and screenshots, copied to the change's evidence and linked from the PR; `/rig:app` is the skill, extended rather than replaced. Open: the failure-mode run on the consumer.
- [ ] Add a differential-test runner for changes that replace existing behaviour: run the old revision as the oracle against the same sampled inputs, normalise irrelevant differences, and block on any difference not on an approved list kept on the base branch. Report inputs run, differences found and differences approved, by ID. A rule for differential tests already exists; the runner does not. Built in code: `S app diff`, `replaces: <app>` on the base intent makes CI require it, the approved list is read from the base ref, and the PR shows it. Open: a run on the consumer, and the sampled-input driver for code with no app.
- [ ] Demonstrate that a change deleting its own required evidence cannot turn the PR green. Confirm that work with no designated critical case accurately displays its evidence coverage.

In the pilot profile, a `Level` of `holdout` designates a required case. The chart summary names its behaviour and expected result, and chart checking requires a matching non-empty file and a configured execution command. CI reads the case list, command, and test files from the base, reports required, executed, passed, failed, and missing cases in the job summary, and runs even while the implementation PR awaits approval. The consumer's CI still needs its application setup before the check.

On the local cart CLI, `TC-1` checked the process exit code and the absence of the `CART_FILE` file. The control passed 1/1. The seeded regression failed 1/1, including when the candidate deleted both the case file and its test-plan row. A separate fixture verified that a missing runner blocks and that a sprint with no designated cases reports zero required cases. [Cart holdout fixture](../../../eval/fixtures/review-cart-cli/TC-1.holdout.py) · [Holdout checks](../../../scripts/holdout.spec.ts)

## 4. Make the PR decision enforceable and affordable

**Start in** `scripts/protect.ts`, `scripts/prcheck.ts`, `scripts/prbody.ts`, and the consumer's effective GitHub rules. Existing branch protection can already be present when Rig adds required check names.

- [ ] Verify effective required checks, independent approval, dismissal of stale reviews, code ownership of workflow and checker changes, and bypass identities. Exercise those rules on a disposable PR. Repeat after rules or ownership change.
- [x] Lead the PR summary with the approved intent revision, highest-consequence changed behaviour, independent evidence, and remaining uncertainty. Flag weakened tests, waivers, and scope amendments. Link to exact runs and artefacts. Keep the existing comprehension questions as a fallback.
- [ ] Verify that a small high-risk change appears ahead of a larger mechanical edit, a later push invalidates the approval, and a workflow edit requires the intended owner.

## 5. Decide whether to expand

Run the four consumer journeys from step 1 again. The pilot passes its functional milestone when the approved change reaches the PR with zero intermediate human prompts, the uncharted implementation stops, the broken critical behaviour fails an independent check, and the green PR remains unmergeable until a current human approval. Preserve both PR revisions, check results, review events, and interruption counts.

Evaluate historical incidents, compatibility regressions, and ordinary changes using the same brief, model version, consumer base, and independent acceptance criteria across bare Claude, the lighter Rig mode, and the complete two-gate workflow. Report task acceptance and lifecycle completion separately. Record first-pass and eventual outcomes, severity and count of bad changes that reached green, good changes blocked and why, human minutes per accepted change, model cost, and wall time. After merge, count fix-forward incidents as well as reverts. Promote confirmed misses into the review-eval corpus.

Before running the comparison, have the consumer owner set tolerances for escaped defects, false blocks, and reviewer time. Publish denominators and individual severe misses. Expand only after the four functional journeys pass and the consumer meets its agreed tolerances. If a required control fails, keep the pilot bounded and rerun the failing journey after repair.

## Evidence behind the priorities

At the review baseline, typecheck and 76 focused tests passed. Live consumer settings and the complete two-gate journey were unverified. On the October delta fixture, all three reported arms passed 3/3. Rig with Haiku averaged $0.087 and 8.2 minutes, versus $0.032 and 2.4 minutes for bare Haiku. On November's hard fixture, Sonnet rig-on passed 3/3, full-flow Sonnet Rig passed 0/3, and bare Sonnet passed 0/2 in the cited runs. The successful rig-on rows recorded zero lifecycle phases. These small samples motivate a consumer-level trial with separate measures of product correctness and workflow completion. [October comparison](../../../README.md) · [November Rig runs](../../../eval/results/2026-11-14-hard-rig.jsonl) · [November bare runs](../../../eval/results/2026-11-14-hard-bare.jsonl)

| Research input | Application to the pilot |
|---|---|
| Anthropic | Use properties and independent comparisons where examples underspecify behaviour. Turn recurring, confirmed review findings into rules or tests and measure recurrence. [Verification](https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/) · [Code review](https://claude.dev/blog/solving-code-review-at-anthropic/) |
| OpenAI and Google | Give the agent a reproducible application environment and inspectable runtime state. Attach replayable evidence for the reviewer. [OpenAI harness engineering](https://openai.com/index/harness-engineering/) · [Google Jules web-app verification](https://jules.google/docs/changelog/2025-08-07/) |
| MartinFowler.com and Cursor pstack | Track which sensors catch defects and which cause repair loops. Use practitioner workflows as design inputs and validate them on the consumer. [Harness engineering](https://martinfowler.com/articles/harness-engineering.html) · [Maintainability sensors](https://martinfowler.com/articles/sensors-for-coding-agents.html) · [pstack](https://github.com/cursor/plugins/tree/main/pstack) |

The 16 November verification post also lists reviewer replay against known incidents, which §5 covers. Candidates from pstack not yet planned: `interrogate` (different models try to break a diff and only run-proven findings are kept) and `blast-radius`. Rig already has the post's commit gate, verification trailer, checklist, prune, flaky policy and stage recall.

The supplied talk had no accessible transcript during the review. No plan dependency relies on claims from it. [All Code Is Slop (Except Mine)](https://www.youtube.com/watch?v=O_zcc6Xl12g)
