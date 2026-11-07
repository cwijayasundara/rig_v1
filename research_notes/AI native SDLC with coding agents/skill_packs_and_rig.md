# Skill packs and rig: behavioural harnesses for coding agents, compared

Retrieved 2026-11-07. Local rig_v1 read at HEAD `a00474f` (2026-11-07). External pages were fetched on that date; most pages carry no visible publication date, so "current as of Nov 2026" means "fetched on that date", not "dated Nov 2026". Each claim is tagged: **[fact]** = stated in the cited source; **[inference]** = my reading of the mechanism; **[unverified]** = seen only in a search snippet or not confirmed.

## Key findings

- rig_v1's own cost record is the strongest evidence in this set. One week of building rig cost about $997 of recorded spend; 68% of it was Opus; the causes were an always-on Opus security review on every Stop, an implement-plus-review subagent loop on an Opus coordinator, 20 user-scope plugins, and hand-backs that re-fired Stop hooks. The rig plugin's own hooks were ruled out as the cause (no model calls). [fact]
- rig's own evals do not show it beats a bare model. Rig+Haiku cost $0.087 and took 8.2 min per small task; bare Haiku $0.032 and 2.4 min; bare Sonnet $0.212 and 0.9 min. All arms passed the small task. [fact] This is the most useful honest negative result in the set.
- The packs split into two control styles. Deterministic: rig (hooks, scripts, tests, CI, human-only approvals bound to hashes) and ub-mode (external CRAP, duplication and mutation gates). Prompt-based: superpowers, pstack, mattpocock/skills, Spec Kit, Kiro steering. Most prompt-based packs state rules in SKILL.md text and do not measure whether the agent followed them.
- The main token cost mechanisms, in order of evidence strength: a standing per-turn context tax from installed skills and plugins [fact, Claude Code docs]; a fresh subagent context per task and per review [fact, superpowers SKILL.md]; Opus used as coordinator or advisor [fact, rig docs]; multi-model review passes [fact, pstack SKILL.md].
- No pack in this set publishes a measured cost or time comparison against a bare model, except rig (which shows no lift). Claims that superpowers cuts tokens by 14% or 50% are third-party and unverified. The question "why does pstack burn tokens and time" cannot be answered with measured data from these sources; the answer below is mechanism-level inference.

---

## 1. rig_v1 (local: `/Users/cwijayasundara/Documents/learning_101/rig_v1`, remote: https://github.com/cwijayasundara/rig_v1)

### 1.1 Identity and state

- Self-description: "an AI-native SDLC harness for Claude Code" and a "behavioural harness" where work starts from an intent with numbered testable behaviours, a person approves, and the approval freezes contracts. [fact] `/Users/cwijayasundara/Documents/learning_101/rig_v1/README.md` (top section, "The path", "Is it worth using?").
- Remote README matches; GitHub About calls it "sdlc: a thin AI-native SDLC harness" (name drift). Remote shows about 1,205 commits. [fact] https://github.com/cwijayasundara/rig_v1
- Version: `.claude-plugin/plugin.json` says 0.7.0; README Status says last git tag is `v0.4.1`, the rest is "Unreleased" in `CHANGELOG.md`. [fact] `/Users/cwijayasundara/Documents/learning_101/rig_v1/.claude-plugin/plugin.json`, `README.md` "Status".
- The repo itself says rig is **not** enabled on its own repo (no `.rig/` here). Its `CLAUDE.md` replaces what rig would enforce with a model table and a one-review rule. [fact] `/Users/cwijayasundara/Documents/learning_101/rig_v1/CLAUDE.md`, `/Users/cwijayasundara/Documents/learning_101/rig_v1/.claude/settings.json` (`"model": "sonnet"`, `ENABLE_STOP_REVIEW=0`).

### 1.2 Architecture

**Hooks (deterministic, no model call).** `hooks/hooks.json` wires six events to `scripts/sdlc.ts hook <event>`: `UserPromptSubmit` (prompt-submit), `Stop` (timeout 90 s), `SessionStart` (startup|resume|clear|compact), `PostToolUse` on `Write|Edit|MultiEdit` (post-edit, 75 s) and on `Agent` (agent-done), `PreToolUse` on `Agent` (agent-launch), and `PostModelSwitch` (model-switch). No hook runs on Bash. [fact] `/Users/cwijayasundara/Documents/learning_101/rig_v1/hooks/hooks.json`; the plugin description says "no hook runs on Bash".

**Skills (17).** `skills/`: app, approve, arch, autonomy, build, chart, init, learn, plan, pr, rule, start, test, testplan, upgrade, waive, wiki. [fact] Directory listing of `/Users/cwijayasundara/Documents/learning_101/rig_v1/skills/`.

**Agents (2).** `agents/architect.md` (charts a sprint) and `agents/evaluator.md` (sprint chart review; a change's diff is reviewed by a clean-context Opus reviewer plus an Opus security agent in `/rig:pr`). [fact] `DESIGN.md` line 38.

**Sensors and gates.** A sensor registry in `.rig/sensors.json` (commands and built-ins, each with a cadence). Cadence follows model grade: Haiku and Sonnet run in-session sensors continuously, Opus keeps only built-ins in session, and commit, CI and nightly sensors run in full for every model. [fact] `DESIGN.md` line 31; `README.md` "Words you will see" table.

**Change records.** `.rig/changes/<slug>/` holds `intent.md`, `spec.md`, `plan.md`, `approval.json`, `evidence/runs.jsonl`, `verify.json`, `pr.md`, `review.md`. [fact] `README.md` "Where everything lives". Human approval is `approval.json` with hashes of covered files; `SDLC_HUMAN` is set only from the person's own prompt; a model cannot approve or waive. [fact] `README.md` "Who does what".

**Risk tiers and autonomy rungs.** Tier 0/1/2 per PR (tier 2 for always-human paths, tier 1 for one-way doors or missing review, else 0). Autonomy rung 0-3; rung 3 lets a trusted author's tier-0 PR pass with no person, unless a revert-rate breaker trips (`risk.maxRevertRate` 0.1 over `risk.window` 20). [fact] `README.md` "Words you will see" and "Who does what".

**Charts (outer loop).** `/rig:chart <N>` turns a PRD into intents (at most 2 engineer-days each), architecture, ADRs and a test plan, traced by a script; one human approval `approve chart-<N>`. [fact] `README.md` "The big picture"; `docs/HISTORY.md` chart entry (around line 120-130).

**Intent map (newest, 2026-11-07).** `intent-map.md` for an opted-in change. Every sentence becomes a row of kind `formal` (checker, planted-bug per clause), `empirical` (Given/When/Then scenario, recorded by the script, not the agent) or `not-promised`. The PR body is a receipt printed from that table. Built and merged 2026-11-07; oracle `eval/intent-map.mjs`, port `scripts/intentmap.ts`. The design cites PDD Kit (https://githubnext.com/projects/pdd-kit/) and a Microsoft Research post (https://www.microsoft.com/en-us/research/blog/formally-verifying-agent-written-full-stack-web-apps-with-pdd-kit/). [fact] `docs/superpowers/specs/2026-11-07-intent-map-design.md` lines 1-25; `git log` shows `e2ccffc`, `fc971ec`, `445b6b7`, `69728b8`.

**E2E journey.** `npm run e2e` runs `/rig:init --quick`, a greenfield charted sprint and a brownfield sprint 2 in a throwaway Python repo; a Sonnet inspector checks rubrics; violations go to `violations.md`, triage decisions to `tests/e2e/journey/triage.json`. Estimate $11-15, hard cap $20, under a 20-minute deadline, started by a person. `npm run e2e:scripted` replays recorded snapshots at $0 in `npm test`. [fact] `README.md` "Verification" and the `npm` commands block near line 497-527.

**Evals.** `eval/` holds the paired runner and per-part arms (wiki, learn, chart, journey, intent-map, ablation) with results under `eval/results/` (e.g. `2026-10-31-*.jsonl`). The stated rule: "each part of rig has an eval arm... a part is cut when native covers it or its eval shows no lift after two passes. The metric is dollars per accepted task." [fact] `README.md` "Verification" (around line 507); `eval/` directory listing.

**Scripts.** `scripts/` holds `sdlc.ts`, the CLI, and many paired `*.ts` and `*.spec.ts` modules (e.g. `intentmap.ts`, `chart.ts`, `journey.ts`, `risk.ts`, `learn.ts`, `route.ts`). The CLI is the enforcement surface; skills and CI call it. [fact] `README.md` "The script underneath" (around line 286).

**Core principles** (as stated): native features first; state lives in files; people approve, a model never approves its own work; scripts decide, models only advise; local checks equal CI; loops are bounded; cadence follows the model's grade; every step ends with the next command. [fact] `README.md` "Core design principles". `DESIGN.md` gives the reason for each.

### 1.3 Deterministic vs prompt-based (rig)

| Control | Type | Where |
|---|---|---|
| Per-edit check, end-of-turn gate, session start, model recording | Deterministic (scripts, no model) | `hooks/hooks.json`, `scripts/sdlc.ts` |
| Sensors (lint, tests, layering, size, test-tamper, secrets) | Deterministic | `.rig/sensors.json` (per repo) |
| Approval and waiver | Deterministic check on a human-only record | `approval.json`, `SDLC_HUMAN` |
| CI `rig-check` and branch protection | Deterministic | `templates/rig-check.yml` |
| Plan, spec, interview, design | Prompt-based (skills) | `skills/start`, `skills/plan`, `skills/chart` |
| Review of a PR | Model-based (advisory, one per change) | `agents/evaluator.md`, `/rig:pr` |
| Intent-map scenarios | Deterministic recording of agent-run commands | `scripts/intentmap.ts` |

Caveat: `scripts/claims.ts` is advisory only (it reports where `review.md` or `plan.md` disagree with the tree). [fact] `README.md` "Words you will see" and the command list.

### 1.4 Cost history: the 2026-10-08 proposal and its fix

**Document location.** The proposal the brief and `CLAUDE.md` cite, `docs/proposals/2026-10-08-why-slow-and-the-fix.md`, is **not in the working tree** (`docs/proposals/` holds only `2026-11-03-prd-sufficiency-and-provenance.md`). It was compressed into `docs/HISTORY.md` and the full text was deleted in commit `98c05e2`. The original is recoverable with `git show 81aa700:docs/proposals/2026-10-08-why-slow-and-the-fix.md`. `CLAUDE.md` line 5 and `docs/GOAL.md` line 27 point to the deleted path. [fact] Verified by `git log --all` and `git show` in the repo; `docs/HISTORY.md` lines 20-30.

**Headline numbers (from the recovered proposal; self-reported, transcripts not re-checked here).** [fact, as stated by the proposal]
- Recorded spend, main sessions, 7 days: $878 (31 sessions). Background security-review sessions: $119 (688 sessions, 4.5 API-hours). Total about $997.
- Opus share: $679 of $997 (68%).
- Build session `eda1a927` ("start Spec 2" to "merge to main"): $30.75, 2h51m wall-clock, 304 main-thread calls, mean context 249k tokens, 22 sequential subagents, 75M cache-read tokens.
- First call of a fresh session: 56.7k tokens (skill listing 36,054 B; deferred tools 36,535 B; agent listing 16,863 B; MCP instructions 6,589 B; superpowers injection 3,673 B). Source: 20 plugins enabled at user scope.
- "3 hours per change" in `CLAUDE.md` is anchored on that single build session (2h51m), not an average across changes. [inference from the proposal's own numbers]

**Causes, by cost (as the proposal ranks them).**
1. `security-guidance` plugin ran an agentic Opus review, two passes (review plus refute), on every Stop, SubagentStop, `git commit` and `git push`. Sessions per day: 119, 92, 23, 131, 75, 100 (10-03 to 10-08). The same diff was reviewed three times in one hour. No "already reviewed this hash" guard.
2. superpowers subagent-driven loop (implement plus review per task) on an Opus coordinator. Hand-backs delivered as `SendMessage` user turns re-fired every Stop hook (and the security review).
3. 20 user-scope plugins, each in every session's context.
4. Another `harness@harness-local` plugin globally enabled (its agents and skills were in every prompt).
5. `alwaysThinkingEnabled`, `advisorModel: "opus"`, effort high.
- Ruled out: rig's own hooks ("cost seconds, no model").

**Fix and targets.** [fact]
- Settings: `ENABLE_STOP_REVIEW=0`; keep only superpowers, code-review, typescript-lsp at user scope; first call under 20k tokens; main thread Sonnet, thinking off.
- Build rules: one review per change on `git diff main...HEAD`; implement inline or one Sonnet implementer per independent group; no `SendMessage` hand-backs; `/compact` before 100k; briefs of 60 lines or fewer.
- Harness: `rig init` writes `ENABLE_STOP_REVIEW=0`; context sensor (warn over 25k on first call, over 150k per turn); count background `sdk-py` sessions in metrics; cache the `fast` typecheck by tree hash and use incremental `tsc`; pin role models.
- Targets: first call under 20k; mean context under 100k; background reviews 0; subagent launches at most 4 per 9-task plan; under 45 min and under $8 per Spec-2-sized change.

**Outcome (as recorded, partly unverified).** [fact unless marked]
- Rules landed in `CLAUDE.md` (model table, one review per change, 60-line briefs, project-scope plugins). `scripts/routing.ts` deleted in `1f7d519`; the `CLAUDE.md` table is now the only place roles are pinned.
- Harness-side items (context sensor, metrics count of background sessions, typecheck cache) have **no matching commit found**; `docs/HISTORY.md` lists them as unverified. [fact of absence in the log I searched; I did not exhaustively audit `git log`]
- Rig's `DESIGN.md` lines 7-16 record a separate earlier build cost: the "Prism" build cost about $525-554 for 785M tokens. Per run, an Opus subagent cost $2.83 vs $0.36 for Sonnet; retries and fix waves $64; security-guidance auto-reviews $79 (14%); cache rebuilds after idle $49. [fact]
- Opus advisor: "about a third of each run", so the settings template turns it off (`CLAUDE_CODE_DISABLE_ADVISOR_TOOL`). [fact] `README.md` line ~450; `DESIGN.md` line 79.

### 1.5 What rig measured about its own value

- Small task (B8, B9 added to a built shop, n=3 per arm): rig+Haiku $0.087, 8.2 min; plain Haiku $0.032, 2.4 min; plain Sonnet $0.212, 0.9 min. All four arms passed every run. [fact] `README.md` "Is it worth using?" (table) and "Status" table row "Whether rig beats a bare model".
- Harder tasks built to find a bare-model failure: `pricing` (bare Haiku 4/4, bare Sonnet 4/4); `contract` (bare Haiku 4/4, low-effort Haiku 5/5, bare Sonnet 3/4; the one miss left out a contract example). Across the three tasks, 1 of 27 runs failed. [fact] `README.md` line ~61 and "Status" table.
- Conclusion stated by the repo: "rig gives no better code and no speed"; rig buys "a trail and a set of gates". [fact] `README.md` "Is it worth using?"
- Still open per the repo: a lift on a model that fails bare, on work that drifts across sessions, or on requirements the brief does not state. [fact] `README.md` "Status".

### 1.6 Lessons (rig_v1)

- Cost lived in the harness-around-the-harness (duplicate reviews, global plugins, Opus coordinator), not in rig's own deterministic hooks. Measure the environment before blaming the pack.
- Hand-backs and per-task review multiply turns; one review per change is the cheapest enforced control.
- A process pack needs its own eval with a dollars-per-accepted-task metric, or it cannot show value. rig has one and reports a negative result.
- Documents that rules cite must exist. `CLAUDE.md` and `docs/GOAL.md` cite a deleted proposal path; the cost record is only in git history.

---

## 2. mattpocock/skills (https://github.com/mattpocock/skills)

- **Philosophy.** Small, composable skills "meant to be adapted rather than adopted whole"; "work with any model"; four themes: alignment before building (grilling), shared language (`GLOSSARY.md`, ADRs), feedback loops (tests, types, browser; red-green-refactor), design care (deep modules). [fact] README via the fetched page at https://github.com/mattpocock/skills.
- **Layout.** `skills/engineering/<name>/SKILL.md` and `skills/productivity/<name>/SKILL.md`. [fact]
- **Skills named.** Engineering user-invoked: `ask-matt`, `grill-with-docs`, `triage`, `improve-codebase-architecture`, `setup-matt-pocock-skills`, `to-spec`, `to-tickets`, `implement`, `implement-spec`, `wayfinder`, `retro`. Model-invoked: `prototype`, `diagnosing-bugs`, `research`, `tdd`, `domain-modeling`, `codebase-design`, `code-review`, `pr`, `wizard`. Productivity: `grill-me`, `handoff`, `teach`, `to-questionnaire`, `wait-what`, `grilling`, `writing-for-agents`. [fact] same page.
- **TDD.** `tdd` is red-green-refactor, one vertical slice at a time. `diagnosing-bugs` is a gated loop ending in a regression test. [fact]
- **Planning.** `grill-me` and `grill-with-docs` resolve design branches before work; `to-spec`, `to-tickets`, `wayfinder` produce specs, tickets and decision maps. [fact]
- **Review.** `code-review` checks the diff on Standards and Spec axes "as parallel sub-agents so neither pollutes the other". [fact]
- **Subagents.** `implement-spec` runs implementer subagents "across the ready frontier"; `research` runs as a background agent. [fact]
- **Hooks.** None mentioned on the page; a `.claude-plugin` directory exists, contents not read. [fact of absence on the fetched page]
- **Control type.** Prompt-based. No deterministic gates described.
- **Cost.** One token claim: a shared glossary means the agent "spends fewer tokens on thinking". No figures. [fact, unquantified]
- **Anti-pattern watch.** `implement` closes with `/code-review` and `implement-spec` fans out subagents: an implement-plus-review pattern at each unit could recreate the review-per-task cost seen in rig's proposal. [inference]

---

## 3. pstack / poteto-mode (https://github.com/cursor/plugins/tree/main/pstack)

- **What it is.** Plugin of skills, subagents and playbooks for Cursor, also installable in Claude Code. Manifest `pstack/plugin.json`; README `pstack/README.md`. [fact]
- **Philosophy.** "If you want to go fast, go deep first"; "the goal is not to maximize loc". The README says "i don't believe in planning", and `poteto-mode` covers planning only when asked. [fact] README quoted on the fetched page.
- **Entry point.** `skills/poteto-mode/SKILL.md`: `disable-model-invocation: true` (the user must trigger it), roughly 130 lines, routes tasks to one of 23 playbooks in `skills/poteto-mode/playbooks/`. [fact]
- **Principles.** 24 short rules in `skills/principle-<name>/SKILL.md`, e.g. `principle-prove-it-works`, `principle-fix-root-causes`, `principle-sequence-verifiable-units`, `principle-test-behavior-not-implementation`. Rule: "Read the leaf skill in full for any principle you apply"; "Cite only principles whose leaf SKILL.md you read this session." [fact]
- **Other skills.** `setup-pstack` (picks models per role), `poteto-help`, `how`, `why`, `recall`, `teach`, `architect`, `arena`, `swarm`, `prototype`, `interrogate` (multi-model review), `no-comments`, `blast-radius`, `benchmark-checklist`, `tdd`, `create-verification-skill`, `create-formal-verification-skill`, `statechart`, `unslop`, `technical-writing`, `bro`, `reflect`, `correct`, `automate-me`. [fact]
- **Subagents.** `agents/poteto-agent.md` (delegate for code-writing; "Never spawn a poteto-agent to run the playbook itself") and `agents/comment-sicko.md` (read-only comment reviewer). Defaults include `run_in_background: true`, file pointers instead of inlined context, an explicit model per role; "Fresh subagents by default"; resume only when the work "strictly needs state". [fact] `skills/poteto-mode/SKILL.md` "Subagents" section.
- **Review.** "Contested design → the interrogate skill (multi-model adversarial) before shipping"; "A second opinion is the same prompt against a different model. Agreement is high-signal." Interrogate keeps "only findings a run proves". [fact]
- **Loops and autonomy.** "Don't stop" / "run until done" keeps going; irreversible writes (force-push, deploy, data deletion, customer messages) always pause; an Autonomous run playbook handles "/loop until X" tasks; Orchestrate covers multi-day programs. [fact]
- **Hooks.** None confirmed from the fetched pages. [unverified]
- **TDD.** `tdd` is for bug fixes "when there's a cheap local test path", test written first. [fact]
- **Porting.** A third-party port, `potetos-for-everyone` (https://pi.dev/packages/potetos-for-everyone?name=cursor), says on Claude Code it activates poteto-mode on session startup, `/clear` and compact, and adds subagents. [unverified: search snippet only]. A Pi port reports it disables model invocation for most playbooks and keeps 5 that cost about 400 prompt tokens. [unverified: search snippet only]

**Why it burns tokens and time (inference, no measured data found).**
- Every task triggers a playbook plus a read of each applied principle's leaf file, so context grows before work starts. [inference from the SKILL.md rules]
- Review is multi-model by design: `interrogate` and `second opinion` run the same prompt on other models. Each is a full extra context and a turn. [inference]
- Subagents default to fresh contexts with background runs, each re-reading poteto-mode and its principles (the poteto-agent description says it "reads poteto-mode in full" before any work). That is a per-launch fixed cost. [fact on the description; inference on total cost]
- Autonomy phrases keep runs going for hours ("can make Cursor work for many hours"). That is run length, not cost per run. [fact on the phrase, from the fetched page]
- Gap: I found no measured token or wall-clock figure for pstack. The only quantitative claim located is a search-snippet headline "pstack: the skills behind 10,000 agent runs" (https://cursor.com/hi/lp-team/lauren), which is usage volume, not cost. [unverified]

---

## 4. ub-mode (https://github.com/unclebob/ub-mode)

- **Philosophy.** An agent skill that enforces disciplined engineering, "loosely based on portions of" poteto-mode/pstack, "reduced and paired with deterministic quality-gate tools". [fact] README via the fetched page.
- **Install.** Copy `SKILL.md` to an agent skills directory (e.g. `~/.claude/skills/ub-mode/SKILL.md`); invoke `/ub-mode`. MIT. [fact]
- **Principles.** Phase 1 "First Make it Work": Laziness Protocol, Foundational Thinking, TDD, Redesign From First Principles, Attack the Premise, Subtract Before You Add, Outcome-Oriented Execution, Build the Lever, architecture guidance. Phase 2 "Then Make it Right": Fix Root Causes, Sequence Work into Verifiable Units, Test Behavior (Not Implementation). Phase 3 "Practice": Keep a Log, Guard the Context Window, Worktree Cleanup, small ordered commits. [fact]
- **Gates (external tools).** Crapper (CRAP score below 10 per function), Dryer (structural duplication below 0.8), Mutator (kill surviving mutants, delete dead code). Companion repos `crapper`, `dryer`, `mutator`, `uml-viewer`. [fact] README.
- **Control type.** Prompt-based skill plus external deterministic tools. The fetched README does not say the skill wires these gates into a hook or CI step. [fact of absence]
- **Gap.** `SKILL.md` on `main` returned HTTP 404 to WebFetch, so the enforcement mechanics, subagent use and context rules are **unverified**. Repo stats quoted from the fetch: 7.2k stars, 407 forks, 6 open issues. [fact as reported by the fetch]
- **Cost.** No claims. "Guard the Context Window" is listed as a practice with no figures. [fact]

---

## 5. obra/superpowers (https://github.com/obra/superpowers)

- **Philosophy.** Four stated principles: test-driven development ("Write tests first, always"), systematic over ad-hoc ("Process over guessing"), complexity reduction, evidence over claims ("Verify before declaring success"). [fact] README.
- **Mandatory workflows.** "The agent checks for relevant skills before any task." Described as "Mandatory workflows, not suggestions." [fact] README.
- **Skills and what they enforce.** brainstorming (intent before building); using-git-worktrees; writing-plans (2-5 minute tasks with exact file paths and verification steps); executing-plans (inline, one final review); subagent-driven-development (fresh subagent per task, two-stage review); test-driven-development (RED-GREEN-REFACTOR, watch the test fail); requesting-code-review; receiving-code-review; verification-before-completion; finishing-a-development-branch; plus systematic-debugging, dispatching-parallel-agents, writing-skills. [fact] README table.
- **Delivery.** Plugin per harness. The bootstrap (`using-superpowers`) is injected through the native `SessionStart` hook (Muse section); the Pi extension re-injects after compaction. Hermes has no post-compaction hook, so "a very long session that compacts over its first turn loses the bootstrap." [fact] README.
- **Subagent-driven development (raw SKILL.md, roughly 330 lines).** [fact] `https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md`:
  - Per task: one fresh implementer, then one fresh task reviewer; "Never skip the task review"; self-review never replaces it.
  - Fix loop: rounds 1-3 resume the same implementer with a scoped re-review; past a round cap, open findings are adjudicated and logged.
  - One broad whole-branch final review, then one fix wave.
  - "Costs a fresh context per task and per review"; "Turn count beats token price" (cheap models can take 2-3x the turns); anything pasted into a dispatch prompt stays in the controller's context, so pass artifacts as files.
  - Model guidance: least powerful model for mechanical tasks, standard for integration, most capable for architecture and the final review; set the model explicitly because an omitted one inherits the session's, "often the most capable and most expensive".
- **Discrepancy to note.** The README says subagent-driven development runs "two-stage review (spec compliance, then code quality)". The SKILL.md says it "does not use separate spec and quality reviewers. The task reviewer returns both verdicts." Either the README or the skill is out of date; I did not resolve which. [fact, both sources cited]
- **Control type.** Prompt-based. The SessionStart hook is deterministic injection of text, not enforcement.
- **Cost and speed evidence.** The README calls subagent-driven "most thorough" and executing-plans "cheapest". [fact]
  - A third-party test (search summary only, not fetched) reports about 14% fewer tokens on average, with simple tasks costing more. [unverified]
  - An SSD Nodes guide says a one-line fix does not need a design doc, worktree and review subagent. https://www.ssdnodes.com/learn/superpowers-plugin-for-claude-code [unverified: search summary only]
  - A search summary of a mirror of an HN post titled "Superpowers 6" says review subagents "sometimes ran a lot of git commands". [unverified: search summary only]
  - HN thread on the author's post (435 points, 231 comments on the archive listing): https://blog.fsck.com/mentions/mentions/2025-10-11-hn-superpowers/archive.html. I did not read the comments, so I cannot say what HN said about token use. [unverified]

---

## 6. Others worth noting

### 6.1 GitHub Spec Kit (https://github.com/github/spec-kit)

- **Philosophy.** "Spec-Driven Development": "define what to build and why, then turn the specification into a plan, tasks, and working code". Methodology in `spec-driven.md`. [fact]
- **Workflow (hyphenated names on the fetched page).** `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`; repeat implement and converge "until convergence reports Converged"; run one at a time and review each. The brief's dotted names (`/speckit.constitution`) do not match the fetched README. [fact]
- **Verification.** Bug-fix flow verdicts `verified`, `partial`, `failed`; only `verified` counts. [fact]
- **Hooks.** "Extension hook" (run before or after Spec Kit commands) and "Extension runtime event" (react to lifecycle events). Subagents not mentioned. TDD not mentioned. [fact]
- **Control type.** Prompt-based steps with user review between steps; extension hooks available. No cost claims. [fact]
- **Anti-pattern watch.** An unbounded "repeat until Converged" loop has no stated round cap on the fetched page, unlike rig's "loops are bounded" rule. [inference]

### 6.2 BMAD method (https://github.com/bmad-code-org/BMAD-METHOD)

- **Philosophy.** Agile method for AI-driven development; process size scales with the work; developer stays in control by making decisions explicit and carrying them forward. [fact]
- **Structure.** `skills/`, `docs/`, `docs-site/`, `tools/`, `AGENTS.md`, `CONTRIBUTING.md`, `action.yml`, `.github/`. Modules include BMad Method (core), BMad Builder, BMad Test Architect (enterprise testing), BMad Loop (unattended epic build, verify, retro). [fact]
- **Gaps.** The fetched page does not name the analyst, PM, architect, SM, dev or QA personas, nor PRD or story artifacts. TDD not mentioned. Hooks and subagents not mentioned. No cost claims. [fact of absence]
- **Release.** V7 preview targeted for mid-November 2026 "and it might be sooner"; v6.12 installed via npm; V7 uses the Skills CLI or plugin marketplaces. [fact, a forward-looking statement]

### 6.3 Kiro steering and hooks (https://kiro.dev/docs/steering/)

- **Steering.** "persistent knowledge about your project through markdown files". Workspace `.kiro/steering/`; global `~/.kiro/steering/`; workspace wins on conflict; team steering via MDM or Group Policy. [fact]
- **Foundation files.** `product.md`, `tech.md`, `structure.md`, included in every interaction by default. [fact]
- **Inclusion modes** (YAML front matter): `always` (default), `fileMatch`, `manual` (`#name`), `auto` (matched on description). In CLI V1/V2 only `always` loads automatically. Custom agents must list steering in `resources`. [fact]
- **AGENTS.md** supported at global, workspace root and subdirectories. [fact]
- **Hooks.** Described only as "Automate agent actions based on events", with a link to the Hooks docs. Event types and whether they are deterministic are not on this page. [fact of absence]
- **Spec workflow.** Not described on this page (requirements.md, design.md, tasks.md not confirmed). [fact of absence]
- **Control type.** Steering is standing prompt context, so it is a per-turn token cost in `always` mode, the same mechanism as the 56.7k first-call context in rig's proposal. [inference]

### 6.4 Claude Code plugins and marketplaces (https://code.claude.com/docs/en/plugins)

- **Components.** Skills (`SKILL.md`), agents (subagent definitions), hooks (lifecycle commands), hooks modules (JavaScript, "mods"), MCP servers. Manifest `.claude-plugin/plugin.json`. [fact]
- **Context cost (documented).** "for each skill, agent, and command that Claude can invoke on its own, the name and description are in Claude's context on every turn ... The full text of a skill or agent loads only when it's used." Enabled plugins count "even in sessions where nothing from the plugin runs." [fact]
- **Processes.** MCP servers run alongside each session where the plugin is enabled; hooks fire at their events. [fact]
- **Scopes.** User (every project on this machine), project (committed `.claude/settings.json`), local (this repo only). [fact]
- **Marketplaces.** `.claude-plugin/marketplace.json` catalog; official marketplace shows a "Context cost" estimate in `/plugin` before install; a measurement guide exists at https://code.claude.com/docs/en/plugins/measure.md (linked, not fetched). [fact]
- **Relevance.** This page is the first-party statement of the cost mechanism that rig's proposal measured. [inference]

---

## 7. Comparison table

| Pack | Process encoding | TDD | Planning | Review | Deterministic controls | Subagents | Hooks | Cost evidence |
|---|---|---|---|---|---|---|---|---|
| rig_v1 | Intent, charts, change records, approval files, intent map | Red-proof (new tests must fail on base), test-tamper check | Human approval of spec and plan, hashed; chart approval | One reviewer per change (Opus), security agent, CI `rig-check` | Hooks, scripts, sensors, CI, human-only approvals | Architect, evaluator agents; subagent launch hook | Six events via `scripts/sdlc.ts` | Measured: $0.087 vs $0.032 vs $0.212; $997/week history |
| mattpocock/skills | Grill, glossary, ADRs, spec, tickets | `tdd`, `diagnosing-bugs` | `grill-me`, `to-spec`, `wayfinder` | `code-review` on two axes, parallel | None described | `implement-spec`, `research` | None mentioned | None |
| pstack / poteto-mode | Playbooks, 24 principles | `tdd` for bug fixes | "don't believe in planning" | `interrogate` multi-model; `no-comments` | Principles self-cited | `poteto-agent`, `comment-sicko` | Not confirmed | None measured |
| ub-mode | 3-phase principles | Listed as principle | Sequence into verifiable units | Crapper, Dryer, Mutator gates | External tools | Not confirmed | Not confirmed | None |
| superpowers | Mandatory skills, plan files, ledger | RED-GREEN-REFACTOR enforced by skill text | brainstorming, writing-plans | Fresh task reviewer per task, final review | SessionStart injection (text) | Fresh implementer and reviewer per task | SessionStart | Third-party only, unverified |
| Spec Kit | constitution, specify, plan, tasks, implement, converge | Not mentioned | Plan and tasks steps | User reviews each step | Extension hooks | Not mentioned | Extension hooks | None |
| BMAD | Agile phases, modules | Not mentioned | Scales with work size | "Build and verify" loop; Test Architect module | Not confirmed | Not confirmed | Not confirmed | None |
| Kiro | Steering markdown, specs (unconfirmed) | Not confirmed | Not confirmed | Not confirmed | Hooks (undescribed) | Custom agents | Hooks | None |
| Claude Code plugins | Packaging format | n/a | n/a | n/a | Hooks, MCP | Agents | Hooks | Documented: names and descriptions on every turn |

---

## 8. Cross-cutting analysis

### 8.1 Where the cost comes from (mechanisms, with sources)

1. **Standing context.** Every enabled skill and agent description is in context every turn, and the full text loads when used (Claude Code plugins docs, section "What an enabled plugin adds to your sessions"). rig's first call was 56.7k tokens with 20 plugins. Target was under 20k. [fact]
2. **Fresh context per task and per review.** superpowers: "Costs a fresh context per task and per review". rig's build session: 22 sequential subagents, 75M cache-read tokens. [fact]
3. **Expensive coordinator.** Opus as main thread: rig 68% of spend on Opus; Opus subagent $2.83 vs Sonnet $0.36 per run (DESIGN.md line 13). [fact]
4. **Duplicate reviews.** security-guidance two-pass Opus review on every Stop and commit; same diff reviewed three times in an hour (rig proposal section 2.1). [fact]
5. **Re-fired hooks.** A `SendMessage` hand-back is a user turn that re-fires every Stop hook (rig proposal 2.2). [fact]
6. **Multi-model and background passes.** pstack's `interrogate` and "second opinion"; rig's Opus security agent in `/rig:pr`. [fact on design; cost unmeasured for pstack]
7. **Ceremony on small tasks.** rig: about 3x the cost of plain Haiku on a task plain Claude passes. superpowers' own guide says executing-plans is "cheapest". [fact]

### 8.2 Deterministic vs prompt-based (summary)

- Deterministic in this set: rig (hooks, scripts, CI, hashed approvals, sensors); ub-mode's external gates (CRAP, duplication, mutation); Spec Kit and Claude Code extension hooks; superpowers' SessionStart injection (deterministic delivery, not deterministic checking).
- Prompt-based: mattpocock/skills, pstack, superpowers' "mandatory" workflows, Kiro steering, BMAD. Their enforcement is what the agent chooses to do. pstack's "cite only principles whose leaf SKILL.md you read" is a self-report, not a check.
- rig's `scripts/claims.ts` is advisory, so the one place rig admits its own check is soft. [fact]

### 8.3 Common patterns

- File-based state as the record: rig `.rig/changes/`; superpowers' ledger file that "survives context compaction"; Kiro steering files; Spec Kit spec files. [fact]
- Model per role, pinned: rig `CLAUDE.md` table; superpowers' model selection guidance; pstack `setup-pstack`. [fact]
- Fresh subagent with file pointers, not pasted text: superpowers "pass artifacts as files"; pstack "file pointers instead of inlined context"; rig briefs at most 60 lines. [fact]
- Human-only gates: rig `SDLC_HUMAN`; pstack "always pause" for irreversible writes. [fact]
- Cadence by model grade: rig `.rig/sensors.json` continuous (Haiku, Sonnet) vs final (Opus). [fact]
- Bounded loops: superpowers fix-loop round cap; rig "loops are bounded". [fact]

### 8.4 Anti-patterns (with evidence)

1. **Over-orchestration.** rig's build: 22 subagent launches for 9 tasks; target was 4. [fact]
2. **Review-per-task.** superpowers' subagent-driven loop: two fresh subagents per task plus fix rounds. rig's proposal section 2.2 cites this as the main multiplier. [fact]
3. **Opus everywhere.** Opus coordinator, Opus advisor on every run (about a third of cost in rig's v0.3 trials). [fact]
4. **Context bloat.** 20 user-scope plugins; skill and agent listings ~36k and ~17k bytes. [fact]
5. **Overlapping review systems.** Two review plugins on the same Stop event. rig's proposal calls this "the single biggest waste found". [fact]
6. **Unbounded convergence loops.** Spec Kit "repeat until Converged" with no stated cap. [inference from the fetched page]
7. **Autonomy phrases that extend runs.** pstack "Don't stop" / "run until done" keeps the agent going for hours. [fact on phrasing; inference on cost]
8. **Ceremony on trivial work.** rig's own evaluation shows 3x cost and 3x time for no quality gain on tasks plain Claude passes. [fact]

### 8.5 Building trust in agent output (what each pack does)

- **Evidence over claims.** superpowers' principle and verification-before-completion; pstack "prove it works" and "interrogate keeps only findings a run proves"; rig's `verify.json`, `evidence/runs.jsonl`, and the intent-map receipt where the script records scenario results, "the agent does not". [fact]
- **Adversarial checks on the check.** rig: red-proof (new tests fail on base), test-tamper, planted-bug per clause in the intent map; ub-mode: mutation testing. These test the tests. [fact]
- **Separation of author and approver.** rig: approvals are human-only and hashed; CI treats approval files as human rows needing another GitHub approver. [fact]
- **Honest measurement.** rig reports its own negative result and cuts parts with no lift. No other pack in this set reports a comparable result. [fact]
- **Gap.** None of the prompt-based packs provide a deterministic check that the agent actually followed its process. Trust rests on the agent's self-report there. [inference]

---

## 9. Gaps and unverified items

- **Missing document.** `docs/proposals/2026-10-08-why-slow-and-the-fix.md` is deleted; the cited path in `CLAUDE.md` and `docs/GOAL.md` is dead. Content recovered from `81aa700`. Transcript evidence it cites (`~/.claude/projects/...`) is not local and was not re-checked.
- **"3 hours per change"** is anchored on one build session (2h51m), not an average. [inference]
- **rig harness-side fixes** (context sensor, background-session metrics, typecheck cache) have no matching commit found in my check. Not audited exhaustively.
- **ub-mode `SKILL.md`** returned 404 on `main`. Enforcement mechanics unverified.
- **pstack cost**: no measured figure found. The 10,000-runs title and the Pi-port token numbers are search snippets, not fetched sources.
- **superpowers cost claims** (14% fewer tokens, 50% fewer, HN comments) are third-party or unread. The README-vs-SKILL.md review-stage discrepancy is unresolved.
- **BMAD** personas, artifact names, and the V7 status are not confirmed from the fetched page.
- **Kiro** hook event types and spec workflow are not on the fetched page.
- **Spec Kit** command names differ between the brief (dotted) and the README (hyphenated).
- **Hacker News**: only one thread is located (superpowers, 2025) and its comments were not read. No HN discussion of pstack or ub-mode was located.
- **Dates**: fetched pages carry no reliable publication dates; "current as of Nov 2026" is the retrieval date.
- Not fetched: the Claude Code plugin measurement page (https://code.claude.com/docs/en/plugins/measure.md); the Spec Kit extension API page; Kiro Hooks and Specs pages; the BMAD `skills/` contents; the mattpocock `.claude-plugin` contents.

---

## 10. Sources

Local (rig_v1, absolute paths):
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/README.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/CLAUDE.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/DESIGN.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/docs/HISTORY.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/docs/GOAL.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/docs/superpowers/specs/2026-11-07-intent-map-design.md`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/hooks/hooks.json`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/.claude/settings.json`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/.claude-plugin/plugin.json`
- `/Users/cwijayasundaragmail.com/Documents/learning_101/rig_v1/skills/` and `agents/` (directory listings)
- `git show 81aa700:docs/proposals/2026-10-08-why-slow-and-the-fix.md` (recovered; deleted in `98c05e2`)
- Commits `e2ccffc`, `fc971ec`, `445b6b7`, `69728b8`, `a00474f` (`git log`)

Remote and web:
- https://github.com/cwijayasundara/rig_v1
- https://github.com/mattpocock/skills
- https://github.com/cursor/plugins/tree/main/pstack
- https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md (fetched via WebFetch; the URL is the raw file)
- https://cursor.com/hi/lp-team/lauren (search title only)
- https://pi.dev/packages/potetos-for-everyone?name=cursor (search snippet only)
- https://github.com/unclebob/ub-mode
- https://github.com/obra/superpowers
- https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md
- https://www.ssdnodes.com/learn/superpowers-plugin-for-claude-code (search snippet only)
- https://blog.fsck.com/mentions/mentions/2025-10-11-hn-superpowers/archive.html (HN listing; comments not read)
- https://github.com/github/spec-kit
- https://github.com/bmad-code-org/BMAD-METHOD
- https://kiro.dev/docs/steering/
- https://code.claude.com/docs/en/plugins
- https://githubnext.com/projects/pdd-kit/ (cited in rig's design doc; not fetched)
- https://www.microsoft.com/en-us/research/blog/formally-verifying-agent-written-full-stack-web-apps-with-pdd-kit/ (cited in rig's design doc; not fetched)
