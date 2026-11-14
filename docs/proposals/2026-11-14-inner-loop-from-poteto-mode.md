# A poteto-grade inner loop: what made the semantic_layers build reliable, and what rig should take

2026-11-14. Sources:
- pstack 0.15.36 as installed (`~/.claude/plugins/cache/cursor-plugins/pstack/0.15.36/`): `skills/poteto-mode/SKILL.md`,
  `skills/poteto-mode/playbooks/`, `skills/poteto-mode/scripts/check-plan.mjs`, `docs/guide/02` and `06`;
- rig `main` at 7324485;
- the semantic_layers_v2.0 repo and its run log, `.superpowers/sdd/2026-11-06-e2e-knowledge-graph/` (`progress.md`, `process.md`,
  briefs, reports, review diffs).

Applies with `2026-11-14-two-human-gates.md`. An independent Fable 5.2 evaluator reviewed the first draft and returned
`changes-needed`: 2 critical, 7 high and 6 medium findings, plus 5 missing items. It found the draft had misread what made the
build reliable. This version is rebuilt on the run log (§9).

## 1. What actually made semantic_layers reliable, from its own run log

The run was routed through poteto mode by the owner's account. The working files are superpowers' subagent-driven development, and no
file in the repo names poteto or pstack, so the attribution rests on the owner's word. The run log is what can be checked, and it
shows two causes.

**Cause 1: an independent review after every task, which found real bugs most of the time.**
- "Task 3: review Needs fixes" (`progress.md:54`) and "Task 4: … silent data loss" (`:65`).
- "Task 11: review Needs fixes", with four issues (`:81`).
- "Tasks 7–10: … C1 … inverts … p50 (reported DOWN) and invents 1000x anomalies" (`:128`), a critical.
- "Hardening H1: review Needs fixes" (`:116`) and "Task 12: review Needs fixes … C1, C2" (`:163`).

The authors' own tests passed in each case. A reviewer who did not write the code caught the bugs.

**Cause 2: the controller verified at a scale the implementer never ran.** Implementers worked on 0.05-scale fixtures and the
controller ran full scale (`process.md`):
- "Controller full-scale hero … F1 verified" (`progress.md:149`);
- "Controller finding T12-F1 (Important, CQ05 full scale) … Root cause is the ScriptedClient stand-in" (`:161`).

Bugs that the fixture-scale tests passed showed up only at full scale.

**Supporting practices:**
- A cross-task interface table (`progress.md:21-30`, e.g. "T9 ↔ T7 | LLMClient, Resolver | OK").
- A deterministic stand-in for the one live dependency. Ruling R7 (`:40`): no API key, so a scripted LLM client powers the default
  suite, and live tests skip cleanly.
- An 18-line `global-constraints.md` of exact invariants.
- Task briefs with the failing tests written out in full.
- Structured reports (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`).
- Numbered rulings decided by evidence.
- Tokens, tools and minutes logged per launch (`:148`).

**What made it slow, also from the log:** review and fix rounds, not the model choice.
- Sonnet rounds cost 125k–232k tokens and 11–30 minutes (`:148`, `:168`).
- You flagged slowness twice. Each time the fix was fewer and cheaper reviews, not cheaper implementers:
  - R17 (`:77`): "no in-task full-scale generation…; mechanical tasks get one sonnet reviewer; opus reviews kept for T6, T12, T13,
    T17";
  - R26 (`:106`): batch T7–T10 into one implementer and one review;
  - R32 (`:147`): "no separate re-review after a fix round: controller verifies via tests + diff read + full-scale data".

**What the stats do not show.** `process.md` tells every implementer to sign its commits as Opus 5.5, so the trailers do not say who
wrote the code. 100 of the 126 trailers are in one squash commit (`b19b8e9`, 209 files, 29,706 lines), so the commit-size figures
describe later work. There are 89 Playwright snapshots, not about 30.

## 2. pstack's poteto mode in one table (what it prescribes)

| Area | Rule | Source |
|---|---|---|
| Start | Restate the goal, the problem and the smallest change; stop if the evidence rules the change out | `SKILL.md` Non-negotiables |
| Design | Name the data shape first; `architect` explores designs in parallel; `interrogate` handles a contested design | `SKILL.md`, `playbooks/feature.md` |
| Plan | Each unit has You see, Verify unit, Verify live and Verify perf, checked by a script: "Tests alone are not sufficient verification" | `scripts/check-plan.mjs:5-6` |
| Build | A separate delegate writes the code, with no skip: "the gain is review separation" | `playbooks/feature.md` step 4 |
| Bug fix | Reproduce on the real surface; every shipped line traces to runtime evidence; revert refuted hypotheses | `playbooks/bug-fix.md:5-11` |
| Verify | On the matching surface: "inconclusive or wrong-surface is not a pass" | `playbooks/feature.md` step 5 |
| Second opinion | The same prompt on another model family; "agreement is high-signal" | `SKILL.md:102` |
| Ship | A non-author agent runs each PR as a user and posts PASS, PASS+NOTES or FAIL; "green CI and an approving bot review are not verdicts"; a verdict is re-checked by patch-id | `playbooks/shipping.md:5` |
| Asking | If a run can settle a fork, prototype instead of asking | `SKILL.md` Non-negotiables |

## 3. rig's inner loop against the two measured causes

| | Semantic_layers practice | rig today | Gap |
|---|---|---|---|
| Cause 1: independent review of every unit | A review after every task, from a fresh context | Local: a clean-context Opus reviewer on tier ≥ 1, and none at tier 0 (`skills/pr/SKILL.md:12`). CI: `ai-review` runs a clean-context code review and a security review on **every** PR, briefed from the base branch (`templates/rig-check.yml:5-6`) | Covered at the PR, but a tier-0 change meets its first review only in CI, after the PR is open, so the fix round runs after the PR |
| Cause 2: verification at a scale the author never ran | The controller's full-scale runs | Holdout cases written at chart and hidden from the builder (`scripts/holdout.ts:1-2`), run at `/rig:test` and in CI | Holdouts use the test plan's small data. Nothing runs at production-like scale or with realistic data the builder never saw |
| Live behaviour | 89 Playwright snapshots; full-scale CLI runs | Approved `/rig:app` journeys run at verify, ship and CI, and drivers write `evidence.json` (`skills/app/SKILL.md:16`, `scripts/check.ts:265-266`) | No rule ties each behaviour to a journey step or holdout case. A behaviour can ship covered only by unit tests |
| Cross-unit interfaces | An interface table across tasks | Intents carry `## Interfaces` and contracts | No sprint-level table of which intent produces and which consumes each interface |
| Live dependencies | A scripted stand-in (R7); live tests marked and skipped | Nothing named | No rule that an external dependency has a deterministic stand-in |
| Reports | `DONE_WITH_CONCERNS` and `BLOCKED` | The agents return free text | Concerns can be lost |
| Cost per launch | Tokens, tools and minutes logged | Models recorded per launch by the agent hooks | No tokens or minutes, so "defects per dollar" cannot be computed |

## 4. What to borrow, in order

### Now: deterministic or nearly free

**N1. Each behaviour is proved by something that runs the app, or by a hidden case.** This is pstack's "tests alone are not
sufficient", made traceable instead of model-written:
- `verify` checks that every B-number is named by a step in an **approved** journey driver or by a holdout case, as well as by a
  test. Commands never come from the PR's plan: CI runs only approved driver bytes, because a PR could otherwise supply its own
  check (`scripts/app.ts:96-97`).
- A repo with no `app.json` (a library) is exempt, and says so in the PR body.
- A journey or holdout step asserts the end state, never only an exit code (`skills/app/SKILL.md` rule 4).
- Under two gates, the integration intent's PR adds the driver steps and gate 2 approves them (two-gate proposal §2).

**N2. Verification at a scale the builder never saw.**
- At chart, QA writes, beside the holdout cases, **scale cases**: the same black-box checks run against realistic data generated by a
  seeded script (sizes from the PRD's NFRs).
- They run only at `/rig:test` and in CI, and are hidden like holdouts. The builder works on the small test-plan data.
- This is the semantic_layers controller's full-scale run, done by a script instead of a model. It reuses the holdout runner, which
  needs an app launcher for this (frontend proposal §5.2).

**N3. Deterministic stand-ins for external dependencies.**
- The architecture's `## Frontend`/stack rows name each external dependency (an LLM API, payments, mail). The architect writes an
  ADR for its stand-in (scripted, recorded or a local fake), as R7 did.
- Tests and journeys run on the stand-in by default. Live tests are marked and skipped without credentials.
- This removes the case where a check "cannot launch" because a key is missing.

**N4. A sprint interface table.** `implementation-plan.md` gains a table with one row per interface: the producer intent, the consumer
intents, the symbol or contract, and its status. `chart check` requires every `Consumes:` (frontend proposal §4.3) and every cross-intent
import named in a plan to have a row, and `verify` marks it OK once both sides pass.

**N5. Structured reports.** The test writer, implementer and reviewers end with `DONE`, `DONE_WITH_CONCERNS` or `BLOCKED`, recorded in
`evidence/reports.jsonl`:
- `DONE_WITH_CONCERNS` goes in the PR body under "What the checks would miss";
- `BLOCKED` takes the two-gate draft-PR path (§3.4).

**N6. Cost per launch.** The agent-done hook records tokens, tool calls and minutes next to the model it already records. `sdlc report`
sums them per change, which makes §6's metric computable.

### Next: the review of every change, before the PR (cause 1)

**R1. A local review on every change, and fix rounds without a re-review.**
- Remove the tier-0 skip in `/rig:pr`: every change gets the clean-context reviewer before the PR opens, so the fix round happens
  before gate 2, not after it. The run log shows reviews returning "Needs fixes" on most tasks.
- Match the reviewer to the difficulty, as your rulings did (R17):
  - the `evaluate` model (Opus or Fable) for changes with `weight` full, a contract, or tier ≥ 1;
  - Sonnet at high effort for mechanical tier-0 changes.

  This bends the rule that a higher model evaluates a Sonnet build, and the bend is your D1. Measure it before keeping it.
- After a fix round, **no second review**: the coordinator verifies through the tests, the diff and the claims stamp (R32 in your run;
  rig's `claims stamp` already records whether each fix touched the cited file).
- In CI, `ai-review` keeps running on every PR as the independent veto.

**R2. The CI review gets a second model family, at no extra launch.** `ai-review` runs its code review on a second family (Fable 5.2
next to Opus 5.5). **Every finding from either still blocks.** Agreement only ranks findings, because today every finding must be
fixed and security, contract and design findings may not be dismissed (`skills/pr/SKILL.md:16-17`). Taking only the findings both
agree on would lower recall.

### Later, only if the eval shows a miss they would catch

| Item | Condition, and the corrected design |
|---|---|
| A live verifier agent (pstack's Shipping verdict) | Head-only for features, since the feature does not exist on the parent; parent against head for bugfixes and refactors. Hash the source paths, not the change folder. A FAIL takes the draft-PR path. It is a model verdict, so a veto, never a pass. Cost unmeasured |
| A separate implementer agent | The coordinator then reads the diff as well, so it is not cost-neutral. Try it as an eval arm |
| Ordered commits per unit | Presentation only. All tests are frozen before code (`skills/build/SKILL.md:16`), so a later unit's tests are red at earlier SHAs, and a per-commit CI run would fail. `/rig:build` also has no commit permission, and `sdlc pr` makes one commit (`scripts/pr.ts:101-103`) |
| A data-shape section | Fold it into `## Interfaces`, which already holds shapes (`skills/plan/SKILL.md:14`), within the light plan's 30-line cap |
| A global constraints file | A generated view of the `requirements.md` rows carrying a number, limit or "never". Not a second source of truth |
| A 40-line PR body | Conflicts with the two-gate proposal's additions to the body (plan review, weakening lines, plan changes after build, waiver requests). Instead, put a five-line summary at the top |
| Rulings | When a run settles a fork, the implementer records the ruling in `.rig/changes/<slug>/rulings.md`. Not in `plan.md`, where an edit during the build counts as a plan change after build |
| A bugfix repro on the real surface | Covered by N1 for runnable repos (a journey step or holdout that fails on the base, which red-proof checks) |

## 5. Budget for one tier-2 change with Now and Next on

| Launch | Model | When |
|---|---|---|
| Plan evaluator | `evaluate` | `weight` full or a contract listed (as today) |
| Test writer | Sonnet | always (as today) |
| Mutation return to the test writer | Sonnet | when survivors exist (as today) |
| Local reviewer | `evaluate`, or Sonnet for mechanical tier 0 | always (R1, new at tier 0) |
| Local security reviewer | `evaluate` | tier 2 (as today) |
| CI `ai-review`, code and security, two families | `evaluate` + a second family | always (R2 adds one family) |

That is 3–5 local launches and 2–3 in CI. The only new launches are the tier-0 local review and the second CI family. N1–N6 are
scripts. CLAUDE.md's 4-launch budget governs work on rig's own repo, not rig's loop in a target repo, so the target budget needs its own
line (D2).

## 6. Measure

Phase 3 of the production roadmap adds three trap tasks, each one that unit tests pass and a running app fails:
- a route that is not wired;
- a flag that is not parsed;
- a UI state that renders nothing.

It also adds one task whose defect appears only at realistic scale. Arms: rig today; rig with N1–N6; rig with N1–N6 plus R1–R2.
Metrics: escaped defects, dollars and minutes per accepted task (N6 makes the last two exact). An item stays only if it lowers escaped
defects per dollar. That is how GOAL.md's rule 4 is honoured here: no eval has yet shown rig beating a bare model (`docs/GOAL.md:8`).

## 7. Order of work

| Step | Items | Gate |
|---|---|---|
| P0 | The trap tasks (§6), bare and rig-today arms | Do the traps escape? If not, the tasks are too easy |
| P1 | N1, N3, N5, N6 | Scripts and skill text; spec per item |
| P2 | N2 scale cases (needs the holdout launcher), N4 interface table | Re-run P0's traps |
| P3 | R1, R2 | Re-run, with the cost numbers from N6 |

Each step follows CLAUDE.md: one implementer per group of files, `npm test` once, one review, and a spec that fails without the fix.

## 8. Decisions for you

Decided by the owner on 2026-11-14:

- **D1 Model pairs by planning weight.** A light change is built by Haiku and evaluated by Sonnet. A full (medium to complex) change
  is built by Sonnet and evaluated by Opus. A script makes every choice:
  - **The pair is picked at plan time** from `predictWeight` (`risk.ts:105`), which already reads the blast radius. The tier cannot
    be used here, because it needs a diff.
  - **The light build runs in one Haiku subagent.** The main thread stays on `models.build`, and the builder gets a brief of at most
    60 lines (spec, plan, files). This promotes "separate implementer" from the deferred list, for light changes only.
  - **Escalation after the diff.** If the pre-review tier (`risk.ts:55`) comes out at 1 or more on a Haiku build, the change outgrew
    its plan: Opus reviews it, not Sonnet. Tier 2 always gets Opus plus the security pass.
  - **A failing light build.** If `verify` fails twice on a Haiku build, Sonnet takes it over once. After that it becomes a draft PR
    (two-gates §3.4).
  - **The backstop does not change.** CI `ai-review` runs on Opus for every PR, and on a second family as well once R2 lands.
  - **Config.** `models` gains `light: { build, evaluate }` and `full: { build, evaluate }` in `.rig/sensors.json`. Today
    `models.build` and `models.evaluate` only drive warnings (`modelstate.ts:103`, `hooks.ts:134`), and review launches name
    `model: opus` in skill text (`skills/pr/SKILL.md:14-17`). Both move to `S models <slug>`, which prints the pair, and the skills
    launch with whatever it prints.
  - **Measured in P3.** Escaped defects per dollar for Haiku-light against Sonnet-light. If Haiku-light escapes more, light falls
    back to the Sonnet/Opus pair.
- **D2** At most 5 local agent launches per change in a target repo. A sixth launch is a draft PR, not a retry.
- **D3** Scale cases come from a seeded generator script that QA writes at chart.

## 9. Independent review

Fable 5.2 read the first draft, pstack, rig and the semantic_layers files, read-only. Applied:
- **Attribution and causes.** Reliability came from per-task independent review and full-scale controller runs (§1), not live
  verification as a user. Slowness came from review rounds, not Opus implementers.
- **The stats.** The commit trailers are mandated by `process.md` and mostly sit in one squash commit; there are 89 snapshots.
- **rig's CI.** `ai-review` already reviews every PR, and journeys already record evidence.
- **The draft's live commands.** They would have come from the PR (CI runs only approved drivers); they had no pass criterion and
  would have defaulted to `n/a`. N1 now traces each behaviour to an approved journey step or a holdout case.
- **The live verifier.** Its parent-SHA run, its patch-id scope and its cost were wrong; it is now deferred with a corrected design.
- **The launch budget.** Corrected (§5).
- **Per-commit units.** They contradict frozen tests and are now presentation only.
- **"Only both block".** Replaced by "every finding blocks, agreement ranks".
- **Rulings.** Moved out of `plan.md`.
- **Plan size.** Data shape folds into `## Interfaces`, within the plan cap.
- **The PR body.** The 40-line limit conflicted with the two-gate proposal.
- **Constraints.** Now a generated view, not a second source of truth.
- **Missing items now covered:** the interface table, stand-ins, cost per launch and the total budget.
- **Order.** Measure first.
