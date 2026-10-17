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

These come from the research (`docs/research/`, `reports/`, `research_notes/`) and from the one week this repo cost $1k.

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
6. **Bounded context and cost.** Sonnet main thread, Haiku reads, Opus only for design and final review. Project-scope plugins only.
   One review per change. Briefs under 60 lines. See `CLAUDE.md` and `docs/proposals/2026-10-08-why-slow-and-the-fix.md`.
7. **Fix the harness, not its output.** When rig produces wrong output in a target repo, fix and test the cause here and regenerate.

## Native first: what rig leaves to Claude Code and what it owns

| Need | Native (use it) | rig owns, because native does not |
|---|---|---|
| Guide injection | `.claude/rules/*.md` with `paths:` | generating them from the sensor registry, so guide and sensor share one source (`sync --check`) |
| Planning, parallel work, auto mode | plan mode, subagents, worktrees, `/goal` | the approval gate: person-only, hash-and-staleness, frozen contracts |
| Code review | `/code-review`, `REVIEW.md`, `/security-review` | one `evaluator` that reviews against the spec, plan and contracts |
| Edit-time feedback | LSP plugins, hooks | the registry of sensors with cadence per grade, and test-tamper, suppression and harness-tamper detection |
| Merge gate | `claude -p`, `claude-code-action` | the base-branch CI check and git hooks that judge any editor |
| Traceability | nothing | requirement, intent, behaviour, test case, checked by a script (`chart check`, `sync`, red-proof) |
| PRD to sprint | `/batch` fan-out only | the **outer loop**: intents with dependencies, architecture and ADRs, test plan, cases and data, traced to the PRD |
| Codebase map | LSP navigation, nested CLAUDE.md | the **code wiki**: cited, hash-checked, warn-only staleness |
| Learning | local auto memory, no promotion path | the **learning loop**: committed one-line lessons with provenance, human-approved promotion to a sensor |
| Measuring any of it | `claude plugin eval` (early access) | our own runner in `eval/`: paired arms, hidden acceptance, dollars per accepted task |

## Scope, in the order the person set

1. **Inner loop (one change):** done. Registry of sensors, three hooks, frozen contracts, approval and verify gates, PR.
2. **Outer loop (a sprint):** done (b07c0dc). PRD to traced intents, architecture, test plan; one approval per sprint.
3. **Code wiki:** built (5eb09a1), not yet shown to beat native. A native Read/Grep arm tied 6/6 on a small repo, so the search index
   was not rebuilt; the wiki is judged on accuracy and staleness (`npm run eval:wiki`). `init` on an existing repo should index it.
4. **CI evals and the PR review loop** (playbook plays 10, 11, 13): not started. Evals run on changes to CLAUDE.md, `.claude/**` and
   rig files, plus nightly; one `claude-code-action` workflow for review and triage.
5. **Maintain** (plays 14 to 16): not started. One detection script, `bands.yaml`, a scheduled routine; a breach becomes an
   `intent.md`. Scheduled scans use native routines and `/security-review`.
6. **Learning loop** (was `brain/memory`): not started. Committed markdown, provenance, delta edits only, human-reviewed
   candidates, demotion when a lesson stops firing, promotion of a recurring lesson to a sensor, replay gate against stored diffs.
   Held back until there are about 30 shipped changes of evidence; Devin's memory has no published validation either.

## How we know it worked (the gate to "production ready")

- **Lift:** on the paired task set, harness arms beat bare arms on accepted rate or on dollars per accepted run, with enough runs
  to mean something. Today there is no evidence: pilot 2 (n = 1 per arm) scored 1/3 on every arm, and Haiku with rig cost $0.50
  against $0.02 bare. The first honest pass is the next gate, before more features.
- **Cost per change:** under 45 minutes and under $8 for a Spec-2-sized change; first-call context under 20k tokens.
- **Outer loop:** trace coverage, estimate against actual, rework per intent, chart-quality eval (`eval/chart.mjs`).
- **Wiki:** answers match the code and stale pages are flagged; it beats native by 2 of 8 questions, or is cheaper at a tie.
- **CI and PR:** first-pass CI success, share of review comments resolved without a human, repeat-mistake rate.
- **Thinness:** harness stays under the size cap (6,000 lines today); anything over it needs a named lift.

## Not goals

- A state machine that reimplements the playbook's six stages. Artefacts are files; status comes from which files exist.
- Spend ledgers, tiers, mission-control UI, story points. `/cost`, `/context` and settings cover them.
- Auto-approval, a Bash-command hook, or anything that lets the agent mark its own work done.
- Competing with Claude Code on code generation.

## Documents kept

- `docs/GOAL.md` this file; `CLAUDE.md` working rules; `DESIGN.md` and `ROADMAP.md` for the shipped design.
- Designs of what is built: `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` (registry, hooks, contracts, sync),
  `2026-10-17-sprint-outer-loop-design.md`, `2026-10-17-wiki-design.md`.
- Evidence: `docs/proposals/2026-10-08-why-slow-and-the-fix.md` (cost), `docs/research/` (findings, gap analysis, raw notes,
  `sensor-catalogue.md`),
  `docs/ai-sdlc-checklist.md` (the playbook's plays with measures), `docs/stuff.eml` (scaffold metrics digest, Sept 2026).
- Removed 2026-10-17, in git history before this commit: all implementation plans (`docs/superpowers/plans/`, every one executed
  and merged), `reports/` and `research_notes/` (pre-rebuild audits; the useful parts are in `docs/research/`), the specs for the superseded chart workflow, e2e design and lite harness, the release-integration proposal
  (replaced by the scripted and live e2e in `tests/e2e/`), and `ai-sdlc-map.html` (a rendering of the checklist).

## Sources

Anthropic AI-native SDLC playbook (16 plays); Fowler: *Harness engineering*, *Sensors for coding agents*, Jain *Are harnesses worth
the cost?*; Devin: DeepWiki, Memory, index-repo; Claude Code docs (`https://code.claude.com/docs/en/overview`). Raw notes:
`docs/research/raw/`. Findings: `docs/research/2026-10-17-findings.md`. Gap analysis:
`docs/research/2026-10-17-playbook-gap-analysis.md`. Sensor catalogue and Jain anatomy: `docs/research/sensor-catalogue.md`.

## Open

- Run the first honest paired eval; the brief that does not state the contract is the known next fix.
- Re-fetch the secondhand claims before leaning on them: Jain's exact results, the ETH Zurich AGENTS.md study, Bugbot figures.
- Confirm `PostModelSwitch` data and whether the hook input carries the model name.
- Specmatic: needs Java and the bundled jar's licence is unconfirmed; packs ship zero-dependency contract tools meanwhile.
