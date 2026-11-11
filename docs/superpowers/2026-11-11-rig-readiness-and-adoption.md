# rig: production readiness and how to scale it

2026-11-11. Sources: the repo at `main` 1b84d61, its eval results, the two tester reports in `docs/feedback/`, `research_notes/`, and a local `npm test`. The draft was reviewed by an independent Fable 5.2 evaluator, and its 19 findings were applied.

## 1. Where rig stands

| Signal | What the repo shows | What it means for a client project |
|---|---|---|
| Quality lift | `docs/GOAL.md`: "no eval has shown a lift over plain Claude Code yet." On small tasks, rig + Haiku passes at the same rate as bare Haiku (3/3 each) at about 2.8x the cost and 3.5x the time (`eval/results/2026-10-31-delta.jsonl`). | By its own definition ("production ready means the evals show a lift"), rig is not production ready. What it gives today is a trail and gates. |
| The one measured win | The learning loop: a seeded mistake recurred in 34 of 36 changes without the loop and 12 of 36 with it (`2026-11-05-learn-runs6.jsonl`, Haiku, synthetic, one seeded mistake). | Points the right way. It is a lab result. |
| Real use | Two sprint runs on a shopping-cart CLI (`feedback_1/2.html`, $24.32 and $34.54). A PRD rule ("ids are never reused") was weakened during charting. A later run found lost items under 20 concurrent adds and `--name --json` renaming an item to "--json". The tester's notes say "/rig:start asks a lot of questions" (20 over two sprints) and "decision making shifted from BA to developer". | It has not been used on a multi-team or brownfield system. The defects found are production-shaped: concurrency, input handling, weakened requirements. |
| End-to-end proof | All 66 local journey reports (gitignored) are `Driver: synthetic` at $0. `tests/e2e/journey/triage.json` is `{}`, `eval/journey-baseline.json` is `{}`, and there is one real recorded snapshot (J2). `eval/ablation.json` is `[]`. | The live journey has not been run and triaged repeatedly, and the journey regression gate checks nothing. |
| Churn and releases | 1,227 commits in 36 days (754 feat/fix, about 21 a day). The last git tag is v0.4.1 (2026-10-05), 1,029 commits ago. 0.5.0 and 0.6.0 are in CHANGELOG but untagged, everything since is Unreleased, and `plugin.json` says 0.7.0 with no tag. The size cap was raised 7 times between 2026-10-21 and 11-08 (6,000 → 12,000 lines; `scripts/size.spec.ts:40`), while `GOAL.md:124` still says 8,000. | There is no current release a client can pin. This is question (b) happening inside the harness itself. |
| Concept load | 17 skills, about 11 glossary terms (intent, chart, sprint, ledger, sensor, floor, knownRed, tier, rung, approval/waiver), and a 531-line README. | Hard for mixed-skill teams. The feedback says so. |
| Security model | Sound and honestly documented (`SECURITY.md`). CI with base-branch judging plus branch protection is the trust boundary, and local hooks are only guardrails. The model can set `SDLC_HUMAN=1` locally through `sdlc.ts run`. CI catches forged approval and waiver rows, but not forged `runs.jsonl` rows on an unreviewed branch. | Usable, but only after the platform team sets up branch protection, CODEOWNERS, managed settings and the sandbox. Without them the gates are advisory. |
| Test health | `npm test` exits 0: spec files 1,444/1,444 pass, e2e unit + scripted journey + eval tests 290/292 (2 skipped). No live runs are included. | The engineering is disciplined. The gap is proof of value, not code quality. |

**Bottom line:** the deterministic floor is solid and worth using now. The full lifecycle (chart, ledger, autonomy rungs, maintain, wiki, dashboard) is unproven and still moving. A client gets a frozen, cut-down release, not `main`.

## 2. Making rig production ready for a client project

### Step 0: Freeze (weeks 1–2)
1. Tag `v0.8.0`, branch `release/0.8` (fixes only), and install the client from your fork pinned to that tag (`SECURITY.md` step 4). Fix the stale cap figure in GOAL.md.
2. Build **rig-core for the client**. This is real work, not just config: today nothing hides skills per team.
   - **On:** the floor (sensors, secrets, test-tamper, git hooks, CI `rig-check`, `ai-review`); `/rig:start` light (already the default); one person's approval of spec and plan; `/rig:build` → `/rig:test` → `/rig:pr`; one review per change; risk tier in the PR body; `/rig:waive`; `/rig:upgrade`.
   - **Off until the pilot passes:** autonomy rungs 2–3, lead override, Maintain workflow, wiki, dashboard, `/rig:chart`.
   - **On and measured:** `/rig:learn`.
   - **Mechanism:** a `vendor --standalone --profile core` option that copies only the "on" skills into the client repo, plus a spec proving the "off" skills are absent.
3. Freeze `main` for anything client-facing. New ideas go to the edge channel (§3b).

### Step 1: Prove it on something client-sized (weeks 2–6)
These are the production-readiness exit criteria. Each one is measured.

| # | Criterion | Measure |
|---|---|---|
| R1 | Value (automated) | Paired eval of bare Sonnet vs rig-core on 20–30 tasks from a brownfield repo shaped like the client's, with hidden acceptance tests, n ≥ 3 per arm (120–180 runs). Metric: accepted rate and dollars per accepted task (`GOAL.md:117`). Include 2–3 tasks that cross a contract boundary. Allow 3–4 weeks, most of it writing the tasks and hidden tests. |
| R2 | End to end | `npm run e2e` today drives one fixed PRD in a throwaway Python repo. **Build one journey fixture per client stack**, then get 3 green live runs in a row, every violation decided in `triage.json`, and `journey-baseline.json` filled in. The live run is capped at 20 minutes and costs money. |
| R3 | Cost and time | Median per change ≤ $8 and ≤ 45 min (the GOAL target), measured from pilot session data. |
| R4 | Security and platform | Extend `sdlc readiness` (today it checks only CODEOWNERS on `.rig/` and that `rig-check.yml` exists, and its level 4 wants the wiki and Maintain) with a client level. That level checks: branch protection requiring `rig-check` and `ai-review` (set up by `init --protect`), CODEOWNERS on `.rig/`, `.claude/` and workflows, managed settings present, sandbox on, and the `Bash(node … sdlc.ts *)` allow rule reviewed. |
| R5 | Operations | Runbook: switch rig off for a repo with one command; what happens when CI or the model provider is down; a rehearsed `/rig:upgrade` 0.8.0 → 0.8.1 on the client repo; a named support owner with a response time. |
| R6 | Known failure classes | Concurrency, argument parsing, and requirements weakened between PRD and spec each get a guide or sensor in the **on** profile (the `/rig:start` spec step and the PR review, not only `/rig:chart`), plus a bad snapshot in `recorded/bad/` that the journey catches. |
| R7 | Learnability | A new engineer goes from install to merged PR in half a day using only rig-core commands. Record their questions and where they got stuck. |
| R8 | Data, IP and provider | Client sign-off on: the model route (Anthropic API, Bedrock or Vertex), retention terms, the CI secret (`ai-review` needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`, so client code leaves CI), the sandbox egress list (the managed template allows github.com and `git` push), and who owns the keys. The repo says nothing on this today. |
| R9 | Ablation | First real `eval:ablate` run (`ablation.json` is empty), so you know which parts of rig-core earn their cost on the current model. |

### Step 2: Shadow, then gated pilot (weeks 7–10)
- **Shadow (1 sprint):** one team works as usual, with only the floor and CI running. Record what the sensors would have caught and the false positives.
- **Pilot (2 sprints):** one volunteer team on rig-core. Measure escaped defects, first-pass CI rate, reverts per tier (`sdlc report --github`), and **human load**: questions and approvals per change, and minutes of human attention per merged PR. Set a ceiling, for example ≤ 3 questions per change. Human load needs new instrumentation; `report.ts` does not record it.
- **Go/no-go:** expand only if pilot numbers are at least as good as the shadow sprint's.

### Cost and staffing (estimates, to firm up after week 2)

| Item | People | Model spend |
|---|---|---|
| Freeze, rig-core profile, runbook, readiness level | 1 harness engineer × 2 weeks | negligible |
| R1 task set and eval | 1 harness engineer × 3–4 weeks | about $200–1,000 (120–180 runs; bare Sonnet ran $0.21–0.41 per task on toy tasks, brownfield tasks cost several times more) |
| R2 journey fixtures and live runs | 0.5 engineer × 3 weeks | price the first live run, then budget 10–15 runs |
| R4/R8 platform and security | 0.5 platform engineer × 2 weeks, plus client security time | none |
| Shadow and pilot | 1 embedded harness engineer for 3 sprints, plus a support owner | tester runs were $1–6 per intent on a toy CLI; budget $8 per change (GOAL target) × pilot volume |

That is roughly 10–12 harness-engineer weeks to a go/no-go. If R1 shows no lift, ship **the floor only** (sensors, git hooks, CI `rig-check`, one AI review, branch protection). It is cheap and deterministic, and its value does not depend on a quality lift.

## 3. Answers

### (a) Is there a baseline harness to onboard a trained AIDLC team onto for something as complex as Magenta?

**Not rig as built: it is unreleased, unproven and still changing daily. But there is a six-part baseline that has held for a year, and you can onboard onto that now:**

1. Short `CLAUDE.md` per repo and path-scoped guides.
2. Plan before code, and a person approves the plan.
3. Deterministic checks outside the model (lint, types, tests, secrets, test-tamper) at edit, commit and CI.
4. CI as the trust boundary: checks from the base branch, branch protection, CODEOWNERS on the harness.
5. One independent review per change, in a clean context, with the stronger model reviewing the weaker one.
6. Bounded cost: role-pinned models, short briefs, no stacked review systems.

That is rig-core. Everything else (sprint outer loop, PRD ledgers, autonomy rungs, unattended merge, maintenance bots, wikis, multi-agent orchestration) is still experimental, and the repo's own data is either missing or shows no lift.

**Sequencing for Magenta:** delivery on Magenta can start **at once on the floor (parts 3–5)**, which carries little risk. The full rig-core flow starts only after R1–R8 pass (about week 6), first in the shadow and pilot. Multi-repo: rig installs one `.rig/` per repo. Treat cross-repo changes as one change per repo, linked by the contract files the `contracts` sensor freezes. Coordinating them stays outside rig for now; R1 includes contract-boundary tasks to test this.

**Different skillsets:** one harness, and the difference is in **who may do what**, not in separate tools. The autonomy rung is set per repo (`.rig/autonomy.json`, read by CI from the base), so it cannot vary by person. Use instead:
- **CODEOWNERS and branch protection** for who approves which paths (seniors own tier-2 paths, juniors' PRs need a senior review);
- **the per-repo rung**, set to the least experienced team working in that repo;
- **command access:** leads run `/rig:chart` and waivers once those are switched on; everyone else uses rig-core's 5–6 commands;
- **training by role:** engineer (half a day, R7), lead/architect (adds chart and waivers), platform (managed settings, CI, upgrades).

### (b) How do we stop moving the goalposts?

1. **Two channels.** *Stable* is a tagged release: at most one minor release a quarter, patches as needed, and delivery teams only ever run it. *Edge* is `main`, for R&D. rig today has only edge: 1,029 commits since the last tag.
2. **Freeze the delivery contract, not the internals.** The contract is the commands people type, the files they review (intent, spec, plan, PR body) and the gates they own. It changes at most once a quarter, with a `/rig:upgrade` migration and a one-page "what changes for you". Sensors, prompts and model routing can change in any patch, as long as the contract holds.
3. **An adoption gate.** A technique moves from edge to stable only if it passes all four:
   - it is measured on the reference task set, with lower cost per accepted task or a higher accepted rate (GOAL rule 4, stated in the repo but not enforced: the size cap was raised 7 times instead);
   - it has been used for at least one sprint on a real project;
   - it ships with a migration and a retirement condition;
   - it does not raise the concept count, or it retires an older concept.
4. **Subtract at each model release.** Run `eval:ablate` and remove scaffolding the new model no longer needs. The repo's guiding study (Jain) is one task on two OpenAI models, and GOAL.md calls applying it to Claude "a hypothesis". So treat "stronger model, smaller harness" as something to test, not a given (R9 is the first test).
5. **A fixed R&D budget with an owner.** For example, at most 20% of harness-team time goes to edge, owned by the harness lead. A quarterly review promotes, keeps or kills each experiment. The business gets a predictable cadence, and the remaining 80% is visibly delivery support.

### (c) How to build and harden harnesses and variants: embed and harvest?

**Yes, embed. But use a baseline plus a project overlay with a promotion rule, not a fresh harness per project, which only produces forks.**

- **Baseline** (harness lead owns it): rig-core on the stable channel.
- **Project overlay** (embedded team owns it): stack pack, `sensors.json`, path guides, `REVIEW.md`, project rules, contract files. rig already keeps team config out of upgrades: `/rig:upgrade` never overwrites `sensors.json`, settings or the guides.
- **Embedded team:** one harness engineer inside the Magenta delivery team for the shadow and pilot (3 sprints). They don't build features. They watch where the agent fails and fix the harness, not the generated code (the repo's existing rule).
- **Promotion ladder** (the learning loop's rule applied to the harness itself):
  1. *Project-local:* the fix lives in the overlay.
  2. *Candidate:* the same failure class appears in a second project, or a real defect escaped because of it.
  3. *Baseline:* it has a spec that fails without it, a bad snapshot the journey catches, an eval arm showing it earns its cost, and a retirement condition. It then ships in the next stable release.
- **Variants:** a variant is the baseline plus a named overlay (for example "regulated", or "data pipeline"). If a variant needs to change baseline code, that change is a candidate for the baseline, not a fork.
- **Two codebases, not one:** Magenta (real, slow feedback) plus a reference repo of the same shape that you can run evals on freely. Pick it in week 1, from a past client codebase you have rights to, or a public brownfield project in the same stack. One project alone overfits the harness.

## 4. One timeline

| Weeks | Do | Gate |
|---|---|---|
| 1–2 | Tag v0.8.0, build rig-core profile, runbook, pick reference repo, start R8 with the client; Magenta teams adopt the floor | R5, R8 started |
| 2–6 | R1 eval, R2 fixtures and live runs, R4 readiness level, R6, R7, R9 | R1–R9 |
| 7 | Shadow sprint on one Magenta team | shadow numbers |
| 8–10 | Pilot, 2 sprints, with human-load measures | go/no-go |
| Quarterly after | Stable release train; promotion review of edge items | adoption gate |

## Open item

The "variants quoted below" in the question were not in the pasted text. Share them and I'll place each one as baseline, overlay or profile.
