# Gap analysis: the AI-native SDLC playbook against rig (now, and with the sprint outer loop)

Date: 2026-10-17. Playbook: <https://claude.com/resources/articles/the-ai-native-sdlc-playbook> (16 plays in six stages; re-read today).
"Now" = main at f7e15da. "With A" = after `docs/superpowers/specs/2026-10-17-sprint-outer-loop-design.md`.

Coverage: **full** = the play's artefact and checks exist and are tested; **partial** = some of it; **none** = absent.

| # | Play (stage) | Native Claude Code does | rig now | With A | Gap and thin fix |
|---|---|---|---|---|---|
| 1 | Capture as `intent.md` (Plan) | intent template skill, claude.ai | full (`start` writes `intent.md`) | full, and sprint intents trace to PRD ids | none |
| 2 | Requirements and design, `spec.md` (Design) | org skills | full (`spec.md` with B-numbers) | full, plus PRD, architecture, ADRs | none |
| 3 | Plan mode, `plan.md` (Build) | plan mode | full (`plan` + approval hash gate) | full | none |
| 4 | Auto mode | auto mode, worktrees | native only | native only | none needed |
| 5 | CLAUDE.md (Build) | `/init`, memory | partial: generated guide block; "mistake twice → CLAUDE.md" is manual (`/rig:rule`) | partial | project C automates the proposal; a person still approves |
| 6 | Skills as institutional knowledge | skills | partial: 9 rig skills, `policy-security.md` template | partial | teams write their own; no gap in rig |
| 7 | Hooks as build-time guardrails | hooks | full (edit/turn/commit cadences, tested) | full | none |
| 8 | Parallel sessions and subagents | worktrees, subagents | partial: `evaluator` only | partial → `architect`; `rig next` + `depends` let engineers work in parallel | none beyond A |
| 9 | Feedback loop, failing test first | verification commands | full (sensors, red-proof, tamper) | full | none |
| 10 | **Continuous evals in CI** | `claude -p`, `claude plugin eval` (early access) | **partial**: `eval/run.mjs` by hand, not in CI; no incident → eval | partial (A adds a chart-quality eval, by hand) | **Gap E:** `eval` workflow on changes to `CLAUDE.md`, `.claude/**`, rig files and nightly, small fixed budget; incident → new eval case |
| 11 | AI in the PR review loop | managed Code Review, `claude-code-action`, `@claude` | partial: `evaluator` once per PR, `REVIEW.md` template; no `@claude` comment handling | partial | **Gap F:** one workflow using `claude-code-action`; metric: comments resolved without a human |
| 12 | Hooks as approval gates | `PreToolUse`, managed settings | full (`production-gate.sh`, managed settings, e2e S4) | full | none |
| 13 | CI/CD integration | `claude -p` in pipelines | partial: `rig-check.yml` deterministic gate; no triage | partial | **Gap F:** triage step in the same workflow |
| 14 | **Closing the loop (Maintain)**: bands, detection script, `intent.md` from a breach | scheduled workflows, Agent SDK | **none** (watch, triage, incident, metrics deleted 2026-10-16) | none, but breach → `intent.md` can land in `.rig/product/intents/` | **Gap D:** one deterministic detection script + `bands.yaml` + a scheduled routine |
| 15 | Recurring codebase scans | Claude Security, `/security-review`, routines | none | none | **Gap D:** a scheduled routine template; no new code |
| 16 | Claude on call (Tag) | Claude Tag, Slack, MCP | none | none | native; lessons file comes from project C |

Measurement: the playbook gives leading and lagging indicators per play. Today rig measures eval cost and acceptance. A adds trace coverage,
estimate vs actual, rework (chart staleness) and chart cost. Still unmeasured: first-pass CI success, time at gates, share of review comments
resolved without a human, repeat-mistake rate. Most come from git, PR metadata and CI logs without new telemetry (a small `rig report`).

## Baseline today

- `npm run typecheck`: no errors printed. `npm test`: the tail I read shows e2e stages S3, S4 (9/9) and S5 (6/6) passing; I did not see a final
  total line, so I cannot state that the whole suite passes. Check before building.
- Eval pilot 2 (n = 1 per arm, 2026-10-16): every arm scored 1/3 on the hidden acceptance. Haiku with rig cost $0.50 and about 5.9M input tokens;
  Haiku bare cost $0.02 and about 0.39M. No lift yet; the scores are held back by what the brief does not state (known next fix).
  So there is **no evidence yet that the harness lifts a model**. It cannot be called production ready before the first real pass.

## Verdict

The sprint outer loop plus the raised cap is **necessary but not sufficient**.
- It completes Plan, Design and Build (plays 1–9, 12), and adds what the playbook lacks: PRD-scale decomposition with machine-checked traceability.
- The playbook's Maintain stage (plays 14–16) is not covered at all, and Test/Deploy are partial (10, 11, 13).
- Production-ready also needs: the eval passing a first honest pass with a lift (or a decision to cut), and the baseline suite confirmed green.

## Size

Cap 5,000; today 3,869; headroom 1,131 lines. Estimates (scripts, skills, templates, agents, workflows):
A about 800; D about 200; E about 150 (workflow plus case format); F about 80 (workflow); B and C each about 400 to 600 if rebuilt as before
(old `brain` source was about 1,570 lines, `code_wiki` and `memory` combined). A + D + E + F is about 1,230, already over the headroom.
So B and C must be rebuilt much thinner (skills, `.claude/rules` and one script each), or the cap revisited per project. Decide when each spec is written.

## Suggested order

A (outer loop) → fix the eval brief and run the first real pass → E and F (CI evals, PR review loop) → B (index) → D (Maintain) → C (learning loop).
Each ends with its measurement; a part with no lift after two passes is a candidate for removal.
