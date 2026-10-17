# rig: an AI-native SDLC harness for Claude Code

```
              ██████╗ ██╗ ██████╗
              ██╔══██╗██║██╔════╝
              ██████╔╝██║██║  ███╗
              ██╔══██╗██║██║   ██║
              ██║  ██║██║╚██████╔╝
              ╚═╝  ╚═╝╚═╝ ╚═════╝

        plan ─────► build ─────► run
          ▲                       │
          └─────── intent ◄───────┘

    an AI-native SDLC harness for Claude Code
```

rig turns Claude Code into a disciplined engineering team member. It covers the whole life of a product: each intent built, reviewed and merged, and the deploy. It follows [the AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), keeps every decision in files committed to the repo, and leaves every approval to a person. It adds very little of its own and relies on what Claude Code already provides. [DESIGN.md](DESIGN.md) gives the evidence and reasoning behind each choice.

rig is being rebuilt as a behavioural harness (docs/superpowers/specs/2026-10-16-behavioural-harness-design.md); sections below describe what remains.

## The big picture: one product, two loops

A product moves through two loops that share one record. Greenfield and brownfield are not separate products or modes: they are where you enter the loops.

```
┌─ BUILD · per change ─────────────────────────────────────────────────────────────────┐
│ intent → spec → plan → approval.json → build → verify.json → PR                      │
│ /rig:start ─► /rig:plan ─► {{ /rig:approve }} ─► build ─► test ─► /rig:pr ─►         │
│ CI rig-check ─► merge                                                                │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─ RUN · always ───────────────────────────────────────────────────────────────────────┐
│ production gate ─► deploy                                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘

 GOVERNANCE: human gates, sensors and CI, the same in every loop.
```

- **Chart** (per sprint, optional) turns a large PRD into the work that feeds Build: the architect runs `/rig:chart <N>` and gets intents (each at most two engineer-days, each with a brief) and an updated architecture; the QA lead runs `/rig:testplan <N>` for the test plan, cases and data. Every intent, behaviour and case traces to a PRD requirement, checked by `chart check <N>` with no model call. A person approves the set once with `/rig:approve chart-<N>`; `ready` lists the intents engineers can start, and `/rig:start .rig/product/intents/<slug>.md` begins one. Files live under `.rig/product/`; the design is `docs/superpowers/specs/2026-10-17-sprint-outer-loop-design.md`.
- **Build** takes one change at a time from `/rig:start` to a merged PR. The person approves the spec and plan once; `/rig:pr` refuses without that approval and a fresh passing `verify.json`.
- **Run** deploys behind a production gate.

## Greenfield and brownfield, in harmony

```
 time ─────────────────────────────────────────────────────────────────────────────────────►
 empty repo   /rig:init greenfield ─► walking skeleton first ─► first changes
                                        │
                      code now exists: from here on everything is brownfield
 existing     /rig:init (stack, baseline) ─► /rig:start
 repo
```

- **Only an empty repo is greenfield.** `/rig:init greenfield` scaffolds a skeleton that builds and tests.
- **From the first merge on, the repo is brownfield.**
- **An existing repo joins at `/rig:init`.** It learns the stack and commands, and a baseline records the debt rig must not blame on new work. From then on it takes changes through `/rig:start`.
- **Small work never needs a sprint.** A bugfix, chore or one-off feature goes straight to `/rig:start`; its type (feature, bugfix, refactor or chore) is recorded in `intent.md`.

## Who does what

| Role | In rig | Their gate |
|---|---|---|
| Engineer | `/rig:start "<task>"`, then `/rig:plan` | `/rig:approve <slug>` for each change |
| Reviewer / code owner | Reviews PRs | Approves any PR that adds or edits an `approval.json`, or adds waiver rows |
| Platform team | Managed settings, CI required checks, CODEOWNERS | Owns the harness itself (`/rig:rule`) |

A model never approves: every gate is a person's command (`SDLC_HUMAN` is set only by the person's own prompt), and CI treats an `approval.json` a PR adds or edits as a human row that needs independent GitHub approval from someone other than its author.

## Where everything lives

| Path | Holds | Written by |
|---|---|---|
| `.rig/changes/<slug>/` | One change: `intent.md`, `spec.md`, `plan.md`, `approval.json`, `evidence/runs.jsonl`, `verify.json`, `pr.md` | `/rig:start` through `/rig:pr` |
| `approval.json` (per change), `.rig/waivers.jsonl` | Every human decision, with the hashes of what it covered | `/rig:approve`, `/rig:waive` (people only) |
| `.rig/sensors.json`, `rules.json`, `guides/` | The sensor registry (commands and built-ins, cadences, guides), contracts, gates | `/rig:init`, then reviewed edits |
| `.rig/bin/`, `.claude/` | The vendored harness, so the repo needs no plugin | `/rig:init`, `vendor --standalone` |

Everything above is committed: the repo is the record, and CI (`rig-check`) re-judges it with the base branch's own checker.

## Status

As of 2026-10-11. `.claude-plugin/plugin.json` says **0.6.0**; the last git tag is `v0.4.1`. Everything built since 0.6.0 is on `main` and listed under *Unreleased* in [CHANGELOG.md](CHANGELOG.md).

| Area | State | Evidence |
|---|---|---|
| Lifecycle: start, plan, approve, build, verify, PR; human gates | Rebuilt as the slim lifecycle on this branch | [DESIGN.md](DESIGN.md) §4 |
| Greenfield end to end (install, brief, greenfield change, a follow-on change with the contract stage, deploy gate, policy) | The one integration test: scripted in CI; the live lane is the release acceptance run | `npm run test:e2e:fast`, `npm run test:e2e` |
| Run loop: production gate | Shipped; the production gate is covered by e2e S4 | DESIGN, SECURITY.md |
| Git hooks: `pre-commit`, `pre-push`, session-start wiring | Merged and covered by tests that drive real `git`. **Not yet trialled live.** No bypass guard: CI plus branch protection is the boundary | DESIGN §9, [SECURITY.md](SECURITY.md) |
| Windows | **Not supported.** Its CI jobs are red, and the hook scripts are POSIX `sh` | SECURITY.md |

**Quality gates on `main`:** `npm test` (about 390 specs, the e2e unit tests and the scripted e2e phases), `npm run typecheck` and `claude plugin validate` pass locally. In CI trust the Linux and macOS jobs and the dogfood check; the Windows jobs fail for the reason above. Open items are in [DESIGN.md](DESIGN.md) §10.

## How the harness is put together

rig is a **thin control layer** around Claude Code. It owns three things (the artifact chain to a merged change, human gates and guardrails) and borrows everything else (plan mode, `/code-review`, `/security-review`, `/goal`, worktrees) from Claude Code itself.

### Core design principles

Thin layer with built-ins first; state lives in files; humans gate and models never self-approve; deterministic checks decide and models advise; local equals CI; bounded loops; every step ends with the next command. [DESIGN.md](DESIGN.md) §2 gives each one and its reason.

### The layers

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ YOU            /rig:start  /rig:plan  /rig:approve                    │  intent, approval
 │                /rig:waive                                             │
 ├────────────────────────────────────────────────────────────────────────┤
 │ SKILLS (9)      start plan build test pr rule init approve waive      │  the stages: prompts
 ├────────────────────────────────────────────────────────────────────────┤
 │ AGENT (1)       evaluator: advisory review, once per change           │  small fresh context
 ├────────────────────────────────────────────────────────────────────────┤
 │ HOOKS          session-start · prompt-submit · post-edit · stop       │  guardrails: run in
 │                + git: pre-commit · pre-push (any editor or agent)     │  -p and CI, zero tokens
 ├────────────────────────────────────────────────────────────────────────┤
 │ SCRIPTS        sdlc.ts → check · sensors · verify · runs …            │  the deterministic brain
 ├────────────────────────────────────────────────────────────────────────┤
 │ EVIDENCE       .rig/changes/<slug>/ (intent spec plan approval.json   │  committed; read by
 │                evidence/runs.jsonl verify.json pr.md)                 │  CI (`rig-check`)
 └────────────────────────────────────────────────────────────────────────┘
```

Dependencies point downward and evidence flows upward. Skills never decide anything the scripts can compute. The scripts are plain Node with no build step and no dependencies.

### Command graph: the lifecycle of one change

`{{ }}` marks a **human gate**; everything else is a command.

```
 /rig:init                       once per repo (greenfield scaffold, or brownfield baseline)
     │
     ▼
 /rig:start "task"               write intent.md and spec.md (## Behaviours B1, B2…)
     │
     ▼
 /rig:plan                       write plan.md
     │
     ▼
 {{ /rig:approve <slug> }}       approval.json: hashes of spec.md, plan.md and the contract files
     │
     ▼
 /rig:build ─► /rig:test         evidence/runs.jsonl
     │
     ▼
 sdlc.ts verify                  verify.json: every commit and ci sensor, contracts, traceability, red-proof
     │
     ▼
 /rig:pr                         commit on sdlc/<slug>, push, open the PR (or stay local-only);
     │                           one advisory evaluator review
     ▼
 CI: rig-check  (base branch's checker)  ─►  merge

 Human-only, off the main path:
   {{ /rig:waive }}  when sensors need a waiver
   {{ someone other than the author approves }}  when a PR adds or edits an approval.json (checked in CI)
```

Status comes from which files exist: spec, plan, approve, build, pr, review, shipped. The active change is in `.rig/state/active`. `approval.json` goes stale when `spec.md` or `plan.md` change, and `/rig:pr` refuses without a current approval and a fresh passing `verify.json`. With `"gates": {"plan": false}` in `.rig/sensors.json` the plan gate is off; otherwise verify and CI report a non-waivable `plan-gate` block. Work with no change gets the sensors only.

### How command names are spelled

One spelling for every command.

Skills and the human commands are spelled `/rig:x` in every install mode: a standalone repo names its vendored skills `rig:x`, the same as the plugin. `/rig-approve` is also accepted when typed, because the prompt hook reads both.

**One approval per change.** `/rig:start "<what you want>"` writes intent.md and spec.md, and `/rig:plan` writes plan.md. The person types `/rig:approve <slug>`; a hook records it from their own prompt, even in a session started before the harness was installed.

### Human steps and automatic steps

| Step | Who | What happens |
|---|---|---|
| `/rig:init`, `/rig:start`, `/rig:plan` | the person | scaffold; write `intent.md` and `spec.md`; write `plan.md` |
| `/rig:approve <slug>` | the person | one approval covers `spec.md`, `plan.md` and the contract files |
| Review of the PR | the person | the next human step after the PR is raised |

### Command atlas: when to reach for each

**Drive the change** (the model runs these)

| Command | Use it when | Cost |
|---|---|---|
| `/rig:init` | First time in a repo. Writes CLAUDE.md, `.rig/`, and vendors the harness. | tokens, once |
| `/rig:start "<task>"` | Any new task, or to resume one by slug. Writes `intent.md` (type: feature, bugfix, refactor or chore) and `spec.md`. | tokens |
| `/rig:plan` | Writing `plan.md` for a specced change. | tokens |
| `/rig:build` | Approved spec and plan: build it. | tokens |
| `/rig:test` | After build: run the tests. | mostly zero-token |
| `/rig:chart <N>` | The architect: a sprint's PRD becomes intents with a brief each, the updated architecture and ADRs. Ends at a branch for review. | tokens |
| `/rig:testplan <N>` | The QA lead: the test plan, cases and data for the sprint, each case traced to a requirement. | tokens |
| `/rig:pr` | Ship: needs a current approval and a fresh passing `verify.json`; commits on `sdlc/<slug>`, pushes, opens the PR or stays local-only, with one advisory evaluator review. | tokens |

**Decide, human only** (the model cannot invoke these and cannot set `SDLC_HUMAN`)

| Command | Authorises |
|---|---|
| `/rig:approve <slug>` | `spec.md`, `plan.md` and the contract files as written. Stale if the spec or plan change afterwards. |
| `/rig:approve chart-<N>` | A sprint's PRD, intents, architecture, ADRs, test plan and the contract files its intents name, as written. Refused while a blocking finding stands; stale when any of them changes. |
| `/rig:waive <sensor> <file\|*> <reason>` | One sensor finding on the active change. |

**Improve the harness itself**

| Command | Use it when |
| `/rig:rule "<what recurs>"` | The agent made the same mistake twice: promote it to a mechanical rule, or, when no pattern can catch it, to one line of CLAUDE.md's `## Things Claude gets wrong`, which you add. |

**The script underneath** (`node .rig/bin/sdlc.ts <cmd>`): `status`, `check`, `check-file`, `diff`, `run`, `verify`, `pr`, `secrets`, `waive`, `approve`, `sync`, `vendor`, `hooks`, `hook <event>`. Skills and CI call these; so can you.

### Policy skills

Policy skills live at `.claude/skills/policy-<area>/SKILL.md` with an `owner` and a `source`; `init --full` scaffolds `policy-security`. Claude Code loads them as project skills. rig itself does not check them: approval reads only `spec.md`, `plan.md` and their open questions.

### Parallel work

Separate changes can run side by side, each in its own checkout on its own `sdlc/<slug>` branch: that is how a team builds changes in parallel.

### What fires when (the automatic edges)

| Moment | Hook | What happens, at zero tokens |
|---|---|---|
| Session opens | `session-start` | Injects the active change, its next command and the guides that apply. |
| You submit a prompt | `prompt-submit` | Snapshots the tree as the turn baseline, so Stop judges exactly this turn's diff. |
| After an edit | `post-edit` | Rejects secrets and plans containing code, runs the file's sensors against the turn baseline, and injects a matching guide once per session. |
| A turn ends | `stop` | Runs the sensors on the turn's diff; blocks at most 2 times, then records `unresolved.json`. |
| You commit | git pre-commit | The staged diff goes through the built-in sensors and every edit-, turn- and commit-cadence sensor; warnings print with their fix text, blocks refuse the commit (during a merge or rebase the command sensors are skipped). |
| You push | git pre-push | The branch's commits (against its merge-base with the trunk, as CI) go through every sensor up to the ci cadence; warnings print with their fix text. |
| A PR opens | CI `rig-check` | The base branch's checker re-judges; human-approval check on an added or edited `approval.json`. |

**Safety.** No hook runs on Bash. Evidence is protected by `permissions` deny rules and by CI, which recomputes every verdict from the base branch's checker. A shell script can still write a file locally; CI plus branch protection is the boundary.

## Install

The harness lives in each repo it runs on, so a repo never depends on the plugin, and you install nothing globally. You need the plugin only to initialise a repo and to upgrade it, and you load it per project.

**Requirements:** Node 22.18 or later (the scripts run as plain TypeScript with no build step), `git`, a POSIX shell (the git hooks are `sh`) and Claude Code 2.1.251 or later. macOS and Linux are supported; Windows is not (see Status). The GitHub CLI `gh` is used by `/rig:pr` and the CI approval check, and is optional otherwise.

1. **Load the plugin for this project only. Do not install it globally.** rig is a per-project tool: nothing goes in `~/.claude`, so it cannot fire in repos that never opted in. Start Claude Code from the project root with the plugin directory:

   ```bash
   cd /path/to/your/project
   claude --plugin-dir /abs/path/to/rig_v1
   ```

   That session is all `/rig:init` needs. After init the harness lives in the project's own `.claude/` and `.rig/` (step 2), so later sessions need no flag.
   If you want the plugin itself (central upgrades) on every session in this project, install it at project scope, which writes to the project's `.claude/settings.json` instead of your user settings:

   ```bash
   claude plugin marketplace add cwijayasundara/rig_v1 --scope project
   claude plugin install rig@rig --scope project
   ```

   Avoid `claude plugin install rig@rig` without `--scope project`: the default scope is user-level, which enables rig everywhere. Never run `claude plugin marketplace add` without `--scope project` (its default is user scope).
2. In the repo, make a first commit if it has none, then run `/rig:init`. It writes a compact CLAUDE.md, `.rig/` (sensors, guides, the checker CI runs) and copies the harness into the repo (`vendor --standalone`): skills to `.claude/skills/rig-*`, agents to `.claude/agents/rig-*`, hooks to `.claude/settings.json`, scripts to `.rig/bin`. It offers the CI check and [`templates/settings.json`](templates/settings.json) (Sonnet main thread, advisor off, Haiku 5.5 general subagents).
   Run `node .rig/bin/sdlc.ts hooks install` (or let the first Claude Code session do it) to wire the git hooks; they cover editors and other agents. `--no-verify` still works for a person; CI is the floor. To opt out, run `node .rig/bin/sdlc.ts hooks uninstall`: it sets `rig.githooks = off`, so session start no longer wires them, until `hooks install`.
3. Commit `.rig/`, `.claude/` and `CLAUDE.md`. Anyone who clones the repo, and any cloud session, now runs the harness with no install. In the repo the commands are `/rig:start`, `/rig:plan` and so on.

**Where things live.** Change artifacts, approvals, waivers and run records go in `.rig/`, not `.claude/`, for two reasons. Claude Code treats `.claude/` as protected, so writes there prompt and fail in headless runs. And these files are evidence the `rig-check` CI gate reads, so they are meant to be committed. Machine-local state (`.gate`, `.baseline`, `unresolved.json`) is already in `.rig/.gitignore`.

**Upgrade** by re-running `node <plugin>/scripts/sdlc.ts vendor --standalone` from a newer plugin and committing; `.rig/bin/VERSION` records the version in the repo. To keep a repo on the plugin instead (central upgrades, no copy), tell onboarding the team installs the plugin.

**With and without the plugin.** A standalone repo has everything that decides what may happen: skills, agents, hooks, sensors, gates and the CI check. `/rig:approve` and `/rig:waive` are skills only the person can invoke: the model cannot call them, and it cannot set `SDLC_HUMAN` itself. The plugin's own hooks step aside in a standalone repo, so none runs twice.

## User guide: from an empty repo to a merged change

Paths A (greenfield) and B (brownfield) are the two ways in: they differ in the first hour and are identical afterwards.

### Before any path

1. Keep a checkout of this repo somewhere `/rig:init` can reach, or use its GitHub `owner/repo`. Nothing is installed globally.
2. From the project root, open Claude Code with rig loaded for that project only: `cd /path/to/project && claude --plugin-dir /abs/path/to/rig_v1`. Make a first commit if the repo has none.

### Path A: greenfield (nothing exists yet)

```
 empty repo ──► /rig:init greenfield "<stack and goal>"
                 │  scaffolds a walking skeleton + one passing test, writes CLAUDE.md
                 ▼
          commit .rig/ .claude/ CLAUDE.md
                 ▼
          /rig:start "first feature"  ──►  plan  ◆ approve  ──►  build ► test ► pr
```

1. **Init with the goal.** Run `/rig:init greenfield "a REST API in Node with Postgres"`. It asks up to three questions (stack, deployment target, test framework), scaffolds the smallest skeleton that builds, adds a lint config and `test`, `test-fast` and `lint` commands, then writes `CLAUDE.md` and the sensors.
2. **Commit** `.rig/`, `.claude/` and `CLAUDE.md`.
3. **Start the first change:** `/rig:start "add user signup"`. A change meets one human gate: read the spec and plan, then `/rig:approve <slug>` yourself. The model cannot approve.
4. **Build it:** `/rig:build` and `/rig:test`, then `/rig:pr`, which needs a fresh passing `verify.json`.

### Path B: brownfield (existing code)

```
 existing repo ──► /rig:init
                    │  reads the stack, commands and conventions
                    │  verifies the fast test command, proposes sensors, records a baseline
                    ▼
             commit
                    ▼
             /rig:start "fix X" ──► plan ──► build ► test ► pr
```

1. **Init.** Run `/rig:init`. It maps the stack, finds the real build, test and lint commands, and collects conventions. It writes a `CLAUDE.md` of at most 120 lines (an existing one gets a proposed diff, never an overwrite).
2. **Accept the baseline.** Failing checks it finds go into `knownRed`, so rig never blocks on debt it did not create. It reports the counts.
3. **Pick the first change by type:** a bug is `/rig:start "fix: ..."` (failing test first); a cleanup is a refactor; a one-liner is a chore.


## Team install

1. Onboard as above and commit; teammates need nothing else. To upgrade a repo, run `claude plugin marketplace update rig`, re-run `vendor --standalone` and commit. Releases are tagged (`v0.3.7`), and CHANGELOG.md records what each one changed.
2. Read [SECURITY.md](SECURITY.md) before rollout. The hooks are guardrails; the boundary is CI plus branch protection, code-owner review and managed settings. A PR that adds or edits an `approval.json`, or adds waiver rows, fails `rig-check` until someone other than its author approves the head commit.

**Opus advisor: off.** In the v0.3 trials an Opus advisor on the main thread was the largest single cost, about a third of each run. A user-level `advisorModel` still applies to every project, so the template turns the advisor off with `"env": { "CLAUDE_CODE_DISABLE_ADVISOR_TOOL": "true" }`. Remove that line to opt back in.

## Cloud sessions

Long builds belong in a Claude Code cloud session (claude.ai/code or `claude --cloud`). It keeps running while your laptop sleeps. In the Prism build, the laptop sleeping accounted for most of the 3 days. A standalone repo runs there as it is: `claude --cloud "/rig:build — continue through /rig:pr; commit on the branch"`. The result comes back as a pushed branch or PR, and `--teleport` brings the session back to your machine. Approve the spec and plan locally and push before the cloud build: `/rig:approve` has not been tried in a cloud session.

## Guides and sensors

Computational sensors run on the hot path at zero tokens; one inferential review runs per change. `sdlc.ts check` is the single entry point, so local equals CI.
- **Config** is `.rig/sensors.json`, a registry (spec §3): `sensors` (each a `cmd` or a `builtin`, a `cadence` of edit, turn, commit, ci or nightly, `blocks`, `count`, one `guide` sentence, optional `timeoutMs`), `paths` (`tests`, `testSupport`, `fixtures`, `ignore`), `contracts` (`files`, `covers`, `validate`, `run`), `gates`, `models`, `policy` and `knownRed` (sensor ids). `init --stack` writes it from the detected stack pack. A file in the pre-registry format (`fast`/`full`/`levels`/`scopes`…) is a config error: rewrite it with `init --stack`. `.rig/rules.json` holds regex rules.
- **Sensors:** test-tamper, suppression, layering, size, secrets, rules, harness-tamper, traceability and red-proof, plus each registry command sensor under its own id (`unit`, `lint`, …) and config findings. `/rig:waive <id>` waives one of them.
- **When they fire:** on each edit (secrets, tamper and guide context, from the post-edit hook), at Stop (the turn's diff), in `verify` (traceability, red-proof), and in CI.
- **Stop cap:** a turn is blocked at most 2 times, then the findings go to `.rig/unresolved.json` and CI refuses them, so a loop cannot wedge a session. Findings that are red on the base are treated as known-red rather than blamed on the change.
- **Waivers** come only from the person (`/rig:waive`). Evidence files (`approval.json`, waivers, `runs.jsonl`, `verify.json`, `pr.md`, `.gate`) are written only by sdlc.
- **Guides** (contracts, engineering, testing) are copied to `.rig/guides/` by init and injected on first touch of a matching path.
- **CI:** `sdlc.ts vendor` copies the checker into `.rig/bin`; copy `templates/rig-check.yml` and require `rig-check`. CI runs the base branch's checker and config.

**Build to PR.** `/rig:start` writes `intent.md` and `spec.md`, `/rig:plan` writes `plan.md`, and the person approves once (`/rig:approve <slug>`). Build, test, verify and the PR then run; in a standalone repo `init --full` allows the project's own `node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts …` calls, so subagents (which skill `allowed-tools` do not cover) run the recorder without a prompt; with the plugin alone, declared commands prompt unless Claude Code runs in auto mode or you add your own `permissions.allow` rules. Humans keep approvals and waivers. `sensors.json` keys: `gates` (`"gates": {"plan": false}` turns the plan gate off). Run builds in Claude Code's sandbox.

## What is in the box

| Part | Role |
|---|---|
| `skills/` (9) | The stages, run by the main thread (Sonnet 5.5; the Opus advisor is opt-in, see below). No skill sets `model:`, because a model switch re-reads the whole conversation uncached. Subagents start with their own small contexts. |
| `agents/evaluator.md` | The one agent: an advisory review, once per change, in `/rig:pr`. |
| `hooks/hooks.json` | Four blocking or injecting settings hooks, none on Bash, which also hold in `-p`. `session-start` injects session context; `prompt-submit` records the turn baseline; `post-edit` rejects secrets and plans that contain code and runs the file's sensors against that baseline (exit 2), injecting a matching guide once per session; `stop` runs the quality gate on the turn's diff (the sensors on the diff, the turn-cadence command sensors keyed by a stamp of the whole tree, so a tree that already passed them skips them). |
| `scripts/*.ts` (about 25, not counting specs and testkit) | Zero-dependency Node, no build step (the list names the main ones; the rest include `lifecycle`, `pr`, `verify`, `vendor`, `basetree`, `githooks`, `stamp`, `sync`, `contracts` and `lifecycle`): `core` (paths, change state, approvals), `model` (pure diff, config and glob model), `sensors` (the pure sensors), `diffs` (baselines and git diffs), `runs` (captured exit codes), `check` (one `check` entry point for Stop, git hooks and CI), `hooks` (hook decisions and the Stop gate), `sdlc` (the CLI). |
| `guides/` | Short per-area guides (contracts, engineering, testing) injected when a matching file is touched. |
| `templates/rig-check.yml` | The required CI check, judged by the base branch's vendored checker. |
| `templates/managed-settings.json`, `templates/production-gate.sh` | For the platform team's managed settings: the playbook's p.42 example plus rig's own rules, and the p.41 production gate as a managed-only hook (see SECURITY.md). |

The settings template sets `ENABLE_STOP_REVIEW=0`: the security-guidance plugin otherwise runs an agentic Opus review of the whole diff on every Stop and SubagentStop, on top of rig's evaluator. One review per change, at the PR node (`/rig:pr` or `/security-review`), is the rule; the plugin's commit and push reviews stay.

Artifacts live in **`.rig/`** at the repo root and are committed; `gates.jsonl` is gitignored. They are not under `.claude/`, which Claude Code protects: writes there always prompt, or are denied in headless runs, and allow rules can't change that.

## Develop

```bash
npm run typecheck                            # scripts only (what CI runs)
node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts
npm test                                     # all of the above
claude plugin validate .claude-plugin/plugin.json
```

### End-to-end acceptance test

`tests/e2e/` is the one integration test. It scaffolds a throwaway repo and installs the harness into it; the test itself plays the person who approves (`approve <slug>` with SDLC_HUMAN=1). Phases: S0 install (registry, vendored harness, git hooks, guides block), S1 product brief, S2 greenfield change, S3 follow-on change (with a stale-approval check and the contract stage: a weakened frozen example is refused, validate runs before run), S4 local deploy gate, S5 the same change under the continuous and the final policy. S2 and S3 also pass a hidden HTTP acceptance that imports no source. Stack fixtures (node, go, rust, java-maven, dotnet) run separately and skip a missing toolchain. `npm run test:e2e:fast` runs in `npm test` and CI; the live run stays under 20 minutes and $6.

```bash
npm run test:e2e         # the acceptance test: real Claude Code (claude -p, claude-haiku-5-5 by default), costs money, --cap USD (default 6), fails over --minutes (default 20)
npm run test:e2e:fast    # a fake model plays the skills from fixture files: $0, about 30 s; runs in npm test and CI; never the acceptance result
npm run test:e2e:unit    # the route runner, the contract tool, the stack probe and the live driver's budget accounting
npm run test:e2e:stacks  # stack fixtures: onboard a tiny repo per pack, check --at commit blocks a broken edit; skips a missing toolchain
node tests/e2e/run.mjs --driver live --phase S3 --cap 20   # one phase (its prerequisites run first)
```

**Evaluation** (`eval/`, spec §9). Does rig lift a model? Five arms build the shop brief: Haiku with rig (continuous policy), Haiku bare, Sonnet bare, Opus bare, Haiku with rig (final policy). A bare arm gets `BRIEF.md` and one session; a rig arm runs the brief as two rig changes with the runner approving each plan. Every run is scored the same way: `npm test`, the hidden acceptance (import and HTTP), and rig's tamper sensors over the run's commits. Each run records accepted, checks passed, tokens, USD, minutes and tamper findings. Live evals cost money and are run by hand, never in CI. A sensor, guide or gate with no lift over Haiku bare after two passes is a candidate for removal.

```bash
npm run eval:dry                                            # the whole pipeline replayed from fixtures: $0; runs in CI
npm run eval -- --arms all --runs 10 --cap-total 300        # a full pass: 50 runs, $100-300; --arms a,b and --results FILE split it across processes
node eval/report.mjs eval/results/<date>.jsonl --out eval/results/<date>.md   # the committed results table
```
