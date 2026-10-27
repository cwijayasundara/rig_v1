# Goal

**Make Claude Code behave like a very good engineer, using as little of our own code as possible.**

rig is a thin layer on top of Claude Code. Claude Code already writes code well, so rig does not compete with it. rig adds only
what a measurement or a missing native feature says is needed to make the work correct, traceable, cheap and safe to merge.
"Production ready" means the evals below show a lift, not that the features are built.

## What "a very good engineer" means here

Five behaviours. Each one is a thing Claude Code does not reliably do alone.

1. **Knows what to build.** Work starts from a stated intent and testable behaviours (B1, B2, ...), and a large PRD is split into
   small, ordered intents traced back to its requirements.
2. **Plans before coding, and the plan is frozen.** A person approves the plan; contracts and expectations cannot be weakened
   afterwards by the agent that has to satisfy them.
3. **Proves it works.** Fast deterministic checks while editing, a full gate at commit and CI, a test that failed first, and no
   fixing a failing test by editing the test.
4. **Understands the codebase it joins.** A cited, checked map of an existing repo, kept current as the code changes.
5. **Gets better over time.** A mistake that repeats becomes a rule a person approves, and a rule that stops earning its keep goes.

## The rules that keep it thin

These come from the research (`docs/research/`) and from the one week this repo cost $1k.

1. **Native first.** Before writing anything, check whether Claude Code does it: plan mode, skills, subagents, hooks, plugins,
   `.claude/rules` with `paths:`, auto memory, `/code-review`, `/security-review`, `/goal`, `/loop`, routines, `claude-code-action`,
   settings (model, budget, plugin scope). If native covers it, use that and delete ours.
2. **New code needs a reason from this list**, and the spec names which one:
   - no native equivalent (see the table below);
   - it must be deterministic and outside the model (a hook, a script, a CI check), because the model cannot judge itself;
   - it is the minimum glue that points a native feature at our artefacts.
3. **Models advise, scripts decide.** No hook calls a model. Verdicts come from captured exit codes. A person approves; the agent
   never approves its own work. CI judges a PR with the base branch's checker, so a PR cannot weaken its own judge.
4. **Measure, then keep or cut.** Every part has an arm in `eval/`. Cut a part only when a native feature covers it or its eval
   shows no lift after two passes. Do not cut because a source article is silent about it. The metric is dollars per accepted task.
5. **Cadence follows model grade.** The only cost study (Jain, two OpenAI models, one task) found a harness was pure overhead on the
   strong model (7x cost, no gain) and decisive on the cheap one (3/10 to 10/10). Sensors run continuously for cheaper models and
   as a final gate for stronger ones; CI always runs everything. No Claude model has been measured, so ours is a hypothesis.
6. **Bounded context and cost.** Sonnet main thread and generators (architect, QA), Haiku reads, Sonnet reviews a change's diff, Opus reviews the chart. Project-scope plugins only.
   One review per change. Briefs under 60 lines. See `CLAUDE.md` and `docs/proposals/2026-10-08-why-slow-and-the-fix.md`.
7. **Fix the harness, not its output.** When rig produces wrong output in a target repo, fix and test the cause here and regenerate.

## Native first: what rig leaves to Claude Code and what it owns

| Need | Native (use it) | rig owns, because native does not |
|---|---|---|
| Guide injection | `.claude/rules/*.md` with `paths:` | generating them from the sensor registry, so guide and sensor share one source (`sync --check`) |
| Planning, parallel work, auto mode | plan mode, subagents, worktrees, `/goal` | the approval gate: person-only, hash-and-staleness, frozen contracts |
| Code review | `/code-review`, `REVIEW.md`, `/security-review` | a clean-context Sonnet reviewer in `/rig:pr`, and one `evaluator` (Opus) that reviews each sprint chart |
| Edit-time feedback | LSP plugins, hooks | the registry of sensors with cadence per grade, and test-tamper, suppression and harness-tamper detection |
| Merge gate | `claude -p`, `claude-code-action` | the base-branch CI check and git hooks that judge any editor |
| Traceability | nothing | requirement, intent, behaviour, test case, checked by a script (`chart check`, `sync`, red-proof) |
| PRD to sprint | `/batch` fan-out only | the **outer loop**: intents with dependencies, architecture and ADRs, test plan, cases and data, traced to the PRD |
| Codebase map | LSP navigation, nested CLAUDE.md | the **code wiki**: cited, hash-checked, warn-only staleness |
| Learning | local auto memory, no promotion path | the **learning loop**: committed one-line lessons with provenance, human-approved promotion to a sensor |
| Measuring any of it | `claude plugin eval` (early access) | our own runner in `eval/`: paired arms, hidden acceptance, dollars per accepted task |

## Scope, in the order the person set

1. **Inner loop (one change):** done. Registry of sensors, six hook events, frozen contracts, approval and verify gates, PR.
   The floor (guides, sensors, git hooks, `rig-check`) runs on all work, with or without a change open; the change steps are
   opt-in, and every change, explored or planned, reaches the base by a feature branch and a PR. Making the steps light by
   default is planned in `docs/proposals/2026-10-27-one-door-right-sized.md`.
2. **Outer loop (a sprint):** done (b07c0dc). PRD to traced intents, architecture, test plan; one approval per sprint.
3. **Code wiki:** built (5eb09a1), not yet shown to beat native. A native Read/Grep arm tied 6/6 on a small repo, so the search index
   was not rebuilt; the wiki is judged on accuracy and staleness (`npm run eval:wiki`). `init` on an existing repo should index it.
4. **CI evals and the PR review loop** (playbook plays 10, 11, 13): built. The dry evals run in `ci.yml` on every push and pull request;
   the live paired eval runs nightly and on demand (`.github/workflows/eval.yml`, gated by `eval/gate.mjs`, whose `eval/baseline.json`
   is still empty). The review loop is the clean-context reviewer in `/rig:pr`; there is no `claude-code-action` workflow.
5. **Maintain** (plays 14 to 16): built (`scripts/maintain.ts`; no `bands.yaml` or scheduled routine yet). One detection script; a finding becomes an
   `intent.md`. Scheduled scans use native routines and `/security-review`.
6. **Learning loop** (was `brain/memory`): built on `rig/learn`, not yet shown to lift. `sdlc.ts learn mine|replay|check|status` mines
   review findings and waivers seen in at least 2 changes; `/rig:learn` proposes delta edits to the committed `.rig/lessons.md`
   (at most 30 active, each citing 2 changes) and rule promotions; a rule is presented only after `learn replay` shows it fires on
   the changes that earned it and on no other; a person applies every change. Design:
   `docs/superpowers/specs/2026-10-17-learning-loop-design.md`. Judged by `npm run eval:learn` (live, costs money, person starts it):
   cut `/rig:learn` and keep `/rig:rule` if it shows no lift after two passes. The native auto-memory arm is not run.
   First live pass (2026-10-17, Haiku, 3 runs, $0.33, one seeded mistake): the mistake recurred in 3/3 baseline runs on changes 4 to 6 and in 0/3 with the loop;
   the cost rule was changed to dollars per accepted change after seeing it, so the pass counts as one of the two, with that caveat.

7. **Journey dashboard (a mod):** built (`hooks/dashboard.tsx`). Allowed by the owner on 2026-10-18, reversing the 2026-10-16 deletion of the mod UI
   (634244c) and its "dashboards" non-goal. It reads and never decides: tokens, context and dollars of the session (from the
   session, not a ledger we keep), where the person is in the AI SDLC journey (init, chart, testplan, approve, build, test, pr, review,
   merge) with the active change or sprint, any blocking finding, and the **next rig command to run**. It reuses `sdlc.ts status`,
   which already knows the next step, so the mod holds no lifecycle logic of its own. The reason it passes rule 2: Claude Code has
   `/cost` and a status line for spend, but nothing that knows rig's artefacts, so the "where am I, what next" half has no native
   equivalent. The spend half stays native where it can (status line first); the mod is the minimum glue. Zero tokens, no hook calls
   a model. Judged by a person using it on a real sprint, and cut if it costs more context or latency than it saves (rule 4).
   Old code: `git show 634244c^:hooks/band.tsx` and `mission.tsx`. Design first, in `docs/superpowers/specs/`.

## Rules for anything that runs unattended

For scope 4 (CI and PR loop), 5 (Maintain) and the autonomy rungs. From Matt Pocock's software-factory language
([skills#1316](https://github.com/mattpocock/skills/pull/1316)); a design for any new automated trigger fails review without an answer to each.

1. **Five questions per automated task**, written in its design before any code: what triggers it; what it reads and writes; what it
   triggers next; where a person re-enters; what stops two runs doing the same work (rig's answer for changes is `queue --check`, one writer per file).
2. **Start slow.** One automated trigger at a time, throttled at first (for example one merged PR in ten, or one scan a day), a person
   reviewing every PR it opens, and a cap on tries (verify already stops after two) before a person. Open the throttle only as the brakes
   (sensors, the single review, human review) earn trust.
3. **A run never waits for a person.** It ends; the person's later change to a file or the PR triggers a new run. Runs are stateless:
   their only memory is the repo, the PR and the change records. No new store.
4. **A source files an item once.** A monitor or scan that sees the same problem again comments on the open intent instead of filing a
   new one, and reopens it if the problem persists after the fix merges.
5. **Fix runs never chain.** A run that fixes the harness's own failure triggers nothing further and always gets human review.

Candidate Maintain tasks, each to pass the five questions first: a **ratchet** (a baseline-waived sensor loses one exempt file a day, one
small PR); a **drift report** (stale wiki pages and `design` review findings filed as one intent); **triage** of `.rig/intent/` ideas
(easy / needs a person / not a bug); a **CI-failure fix** run (rule 5).

## How we know it worked (the gate to "production ready")

- **Lift:** on the paired task set, harness arms beat bare arms on accepted rate or on dollars per accepted run, with enough runs
  to mean something. Today there is no evidence: pilot 2 (n = 1 per arm) scored 1/3 on every arm, and Haiku with rig cost $0.50
  against $0.02 bare. The first honest pass is the next gate, before more features.
- **Cost per change:** under 45 minutes and under $8 for a Spec-2-sized change; first-call context under 20k tokens.
- **Outer loop:** trace coverage, estimate against actual, rework per intent, chart-quality eval (`eval/chart.mjs`).
- **Wiki:** answers match the code and stale pages are flagged; it beats native by 2 of 8 questions, or is cheaper at a tie.
- **CI and PR:** first-pass CI success, share of review comments resolved without a human, repeat-mistake rate.
- **Thinness:** harness stays under the size cap (8,000 lines, enforced by `scripts/size.spec.ts`; 7,256 on 2026-10-21); anything over it needs a named lift.

## Not goals

- A state machine that reimplements the playbook's six stages. Artefacts are files; status comes from which files exist.
- Spend ledgers, tiers, story points, budgets and caps. `/cost`, `/context` and settings cover them. (A read-only journey dashboard is a goal, see Scope 7.)
- Auto-approval, a Bash-command hook, or anything that lets the agent mark its own work done.
- Competing with Claude Code on code generation.

## Documents kept

- `docs/GOAL.md` this file; `CLAUDE.md` working rules; `DESIGN.md` and `ROADMAP.md` for the shipped design.
- Designs of what is built: `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` (registry, hooks, contracts, sync),
  `2026-10-17-sprint-outer-loop-design.md`, `2026-10-17-wiki-design.md`.
- Evidence: `docs/proposals/2026-10-08-why-slow-and-the-fix.md` (cost), `docs/research/` (findings, gap analysis, raw notes,
  `sensor-catalogue.md`),
  `docs/ai-sdlc-checklist.md` (the playbook's plays with measures), `docs/stuff.eml` (scaffold metrics digest, Sept 2026).
- Removed 2026-10-17, in git history before this commit: the implementation plans of that date, `reports/` and the pre-rebuild audits (the useful parts are in `docs/research/`), the specs for the superseded chart workflow, e2e design and lite harness, the release-integration proposal
  (replaced by the scripted and live e2e in `tests/e2e/`), and `ai-sdlc-map.html` (a rendering of the checklist).

## Sources

Anthropic AI-native SDLC playbook (16 plays); Fowler: *Harness engineering*, *Sensors for coding agents*, Jain *Are harnesses worth
the cost?*; Devin: DeepWiki, Memory, index-repo; Claude Code docs (`https://code.claude.com/docs/en/overview`). Raw notes:
`docs/research/raw/`. Findings: `docs/research/2026-10-17-findings.md`. Gap analysis:
`docs/research/2026-10-17-playbook-gap-analysis.md`. Sensor catalogue and Jain anatomy: `docs/research/sensor-catalogue.md`.

## Open

- Blind recon before brainstorming (HumanLayer's research-questions step: ask only how the code works today, never how to build the task). Not built: it adds a step to `start`, so it needs a paired arm first. Plan: add a `recon` arm to `eval/review.mjs`-style paired runs on the shop intents, scored by spec defects the review finds and by reviewer findings per change, no model judge; keep only on lift, and only for large intents. A live run costs money, so a person starts it.
- Run the first honest paired eval; the brief that does not state the contract is the known next fix.
- Re-fetch the secondhand claims before leaning on them: Jain's exact results, the ETH Zurich AGENTS.md study, Bugbot figures.
- Journey dashboard: does the mod API still exist in the current Claude Code, and can a status line alone show the journey and next command?
- Confirm `PostModelSwitch` data and whether the hook input carries the model name.
- Specmatic: needs Java and the bundled jar's licence is unconfirmed; packs ship zero-dependency contract tools meanwhile.
