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

rig makes Claude Code work like a careful engineer and adds as little code of its own as it can ([docs/GOAL.md](docs/GOAL.md)). It is a **behavioural harness**. Work starts from a stated intent with numbered, testable behaviours. A person approves the plan, and the approval freezes the contracts. Deterministic sensors check every edit, turn, commit and PR. Every decision is a file committed to the repo, and every approval is a person's. rig follows [the AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook) and uses what Claude Code already provides (plan mode, subagents, `/code-review`, `/security-review`, worktrees) wherever it can. [DESIGN.md](DESIGN.md) gives the evidence and reasoning behind each choice.

## The big picture

Work moves through an optional outer loop (a sprint) and an inner loop (one change), on top of a code wiki and a learning loop. Greenfield and brownfield are not separate modes: they are only where you enter.

```
┌─ CHART · per sprint, optional ─────────────────────────────────────────────────────┐
│ PRD ─► /rig:chart <N> ─► /rig:testplan <N> ─► {{ /rig:approve chart-<N> }} ─► ready │
│        intents (≤ 2 engineer-days each), architecture, ADRs, test plan, all traced │
└────────────────────────────────────────────────────────────────────────────────────┘
                                         │ one intent at a time (or any ad-hoc task)
                                         ▼
┌─ BUILD · per change ───────────────────────────────────────────────────────────────┐
│ /rig:start ─► /rig:plan ─► {{ /rig:approve <slug> }} ─► /rig:build ─► /rig:test ─►  │
│ /rig:pr (one advisory review) ─► CI rig-check ─► merge                             │
└────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─ RUN ──────────────────────────────────────────────────────────────────────────────┐
│ production gate (managed hook) ─► deploy                                           │
└────────────────────────────────────────────────────────────────────────────────────┘

 ALONGSIDE: /rig:wiki (a cited, hash-checked code map) · /rig:learn and /rig:rule
            (repeated mistakes become lessons and rules, each one applied by a person)
 GOVERNANCE: human gates, sensors, git hooks and CI, the same in every loop
```

- **Chart** turns a sprint's PRD into the work that feeds Build. The architect runs `/rig:chart <N>` and gets intents (each at most two engineer-days, with a brief), an updated `architecture.md` and ADRs. The QA lead runs `/rig:testplan <N>` and gets the test plan, the cases and the data. Every intent, behaviour and case traces to a PRD requirement, which `sdlc.ts chart check <N>` checks with no model call. A person approves the whole set once with `/rig:approve chart-<N>`. `sdlc.ts ready` then lists the intents whose dependencies have shipped.
- **Build** takes one change at a time from `/rig:start` to a merged PR. A person approves the spec and plan once. `/rig:pr` refuses without that approval and a fresh, passing `verify.json`.
- **Run** deploys behind a production gate, which the platform team installs as a managed hook.

## Greenfield and brownfield

```
 time ─────────────────────────────────────────────────────────────────────────────────►
 empty repo   /rig:init greenfield "<stack and goal>" ─► walking skeleton ─► first change
                                        │
                      code now exists: from here on everything is brownfield
 existing     /rig:init (scouts, sensors, baseline, wiki proposal) ─► /rig:start
 repo
```

- **Only an empty repo is greenfield.** `/rig:init greenfield` scaffolds a skeleton that builds and passes one test.
- **After the first merge, the repo is brownfield.**
- **An existing repo joins at `/rig:init`.** Init learns the stack and the real commands. The baseline records the checks that already fail (`knownRed`), so rig never blames that debt on new work. Init also proposes a code wiki.
- **Small work never needs a sprint.** A bugfix, chore or one-off feature goes straight to `/rig:start`. Its type (feature, bugfix, refactor or chore) is recorded in `intent.md` and decides how its new tests are proved against the base.
- **Either kind of repo can chart a sprint.** On a repo with code but no `architecture.md`, the architect reads the code before it charts.

The step-by-step guides are under [User guide](#user-guide).

## Who does what

| Role | In rig | Their gate |
|---|---|---|
| Product owner / BA | Writes `.rig/product/brief.md` and `.rig/product/prd/sprint-<N>.md` | Reviews the chart branch |
| Architect | `/rig:chart <N>` | `/rig:approve chart-<N>` (a person, after review) |
| QA lead | `/rig:testplan <N>` | Reviews the chart branch |
| Engineer | `/rig:start`, `/rig:plan`, `/rig:build`, `/rig:test`, `/rig:pr` | `/rig:approve <slug>` for each change; `/rig:waive` |
| Reviewer / code owner | Reviews PRs | Approves any PR that adds or edits an `approval.json`, or adds waiver rows |
| Platform team | Managed settings, CI required checks, CODEOWNERS, the production gate | Owns the harness itself (`/rig:rule`, `/rig:learn` proposals) |

A model never approves. Every gate is a command the person types (`SDLC_HUMAN` is set only from the person's own prompt). CI treats an `approval.json` that a PR adds or edits as a human row, which needs GitHub approval from someone other than the PR's author.

## Where everything lives

| Path | Holds | Written by |
|---|---|---|
| `.rig/changes/<slug>/` | One change: `intent.md`, `spec.md`, `plan.md`, `approval.json`, `evidence/runs.jsonl`, `verify.json`, `pr.md`, `review.md` | `/rig:start` through `/rig:pr` |
| `.rig/product/` | `brief.md`, `prd/sprint-<N>.md`, `intents/<slug>.md`, `architecture.md`, `adr/`, the test plan, cases and data | people (brief, PRD), `/rig:chart`, `/rig:testplan` |
| `approval.json` (per change and per chart), `.rig/waivers.jsonl` | Every human decision, with the hashes of the files it covered | `/rig:approve`, `/rig:waive` (people only) |
| `.rig/sensors.json`, `.rig/rules.json`, `.rig/guides/` | The sensor registry (commands and built-ins, cadences, guides, contracts, gates, policy, `knownRed`) and regex rules | `/rig:init`, then reviewed edits |
| `.rig/wiki.json`, `.rig/wiki/` | The code wiki: page list, generated pages, hash state | `/rig:wiki` |
| `.rig/lessons.md`, `.rig/learn/` | Active one-line lessons (at most 30); mined candidates and proposals | a person, from `/rig:learn` proposals |
| `.rig/bin/`, `.claude/` | The vendored harness, so the repo needs no plugin | `/rig:init` (`init --full`, i.e. `vendor --standalone`) |

All of it is committed: the repo is the record. CI (`rig-check`) re-judges it with the base branch's own checker. Machine-local state (`.gate`, `.baseline`, `unresolved.json`, `gates.jsonl`) is gitignored in `.rig/.gitignore`.

## Status

As of 2026-10-17. `.claude-plugin/plugin.json` says **0.6.0**; the last git tag is `v0.4.1`. Everything since is on `main` under *Unreleased* in [CHANGELOG.md](CHANGELOG.md). The measured progress against the goal is in [docs/GOAL.md](docs/GOAL.md).

| Area | State | Evidence |
|---|---|---|
| Inner loop: start, plan, approve, build, test, PR; human gates; frozen contracts | Done | DESIGN.md §4; e2e S2, S3 |
| Sensor registry with per-model policy (continuous or final) | Done | e2e S5; `npm run eval` |
| Outer loop: PRD to traced intents, architecture, ADRs, test plan; one approval per sprint | Done (b07c0dc) | e2e S6; `npm run eval:chart` |
| Code wiki | Built; not yet shown to beat native Read/Grep | `npm run eval:wiki` |
| Learning loop (`/rig:learn`) | Built; first live pass promising (0/3 repeats with the loop against 3/3 without), one of the two passes needed | `npm run eval:learn` |
| Run loop: production gate | Shipped as a managed-only hook | e2e S4, SECURITY.md |
| Git hooks: `pre-commit`, `pre-push`, wired at session start | Covered by tests that drive real `git`. There is no bypass guard: CI plus branch protection is the boundary | DESIGN §9, [SECURITY.md](SECURITY.md) |
| CI evals and a PR review loop; Maintain (drift bands, scheduled scans) | Not started | docs/GOAL.md |
| Windows | **Not supported.** The hook scripts are POSIX `sh` and the Windows CI jobs are red | SECURITY.md |

**Quality gates on `main`:** `npm test` (567 spec tests, the e2e unit tests and the scripted e2e phases), `npm run typecheck` and `claude plugin validate`.

## How the harness is put together

rig is a **thin control layer** around Claude Code. It owns what Claude Code does not provide: the artifact chain from intent to a merged change, human gates, the sensor registry, traceability from PRD to test, and the CI judge. It borrows everything else. The table in [docs/GOAL.md](docs/GOAL.md) lists, for each need, what is native and what rig owns.

### Core design principles

These are the principles, and [DESIGN.md](DESIGN.md) §2 gives the reason for each:

- Native features first.
- State lives in files.
- People approve; a model never approves its own work.
- Scripts decide; models only advise.
- Local checks equal CI.
- Loops are bounded.
- Cadence follows the model's grade.
- Every step ends with the next command.

### The layers

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │ YOU            /rig:start  /rig:approve  /rig:waive                    │  intent, approval
 ├────────────────────────────────────────────────────────────────────────┤
 │ SKILLS (13)    start plan build test pr · chart testplan · wiki learn  │  the stages: prompts
 │                rule init · approve waive (human only)                  │
 ├────────────────────────────────────────────────────────────────────────┤
 │ AGENTS (2)     architect (Opus, charts a sprint)                       │  small fresh contexts
 │                evaluator (Opus, reviews each sprint chart)             │
 ├────────────────────────────────────────────────────────────────────────┤
 │ HOOKS          session-start · prompt-submit · post-edit · stop        │  guardrails: run in
 │                + model recording (agent launch/done, /model switch)    │  -p and CI, zero tokens
 │                + git: pre-commit · pre-push (any editor or agent)      │
 ├────────────────────────────────────────────────────────────────────────┤
 │ SCRIPTS        sdlc.ts → check · sensors · verify · chart · wiki ·     │  the deterministic brain
 │                learn · pr …                                            │
 ├────────────────────────────────────────────────────────────────────────┤
 │ EVIDENCE       .rig/changes/<slug>/  .rig/product/  approvals, waivers │  committed; read by
 │                                                                        │  CI (`rig-check`)
 └────────────────────────────────────────────────────────────────────────┘
```

Dependencies point downward and evidence flows upward. Skills never decide anything the scripts can compute. The scripts are plain Node TypeScript with no build step and no runtime dependencies.

### Command graph: the lifecycle of one change

`{{ }}` marks a **human gate**; everything else is a command.

```
 /rig:init                       once per repo (greenfield scaffold, or brownfield scouts + baseline)
     │
     ▼
 /rig:start "task"               write intent.md and spec.md (## Behaviours B1, B2…)
     │  or /rig:start .rig/product/intents/<slug>.md   (a charted intent: its behaviours carry over)
     ▼
 /rig:plan                       write plan.md (files, interfaces, a test per behaviour, contracts)
     │
     ▼
 {{ /rig:approve <slug> }}       approval.json: hashes of spec.md, plan.md and the contract files
     │
     ▼
 /rig:build                      on sdlc/<slug>: one failing test per behaviour, then the code
     │
     ▼
 /rig:test                       sdlc.ts verify → verify.json: every commit and ci sensor,
     │                           contracts, traceability, red-proof
     ▼
 /rig:pr                         a clean-context reviewer agent + /security-review on the delta, fix, then commit on sdlc/<slug>,
     │                           push, open the PR (or stay local-only); review.md rides in the PR
     ▼
 CI: rig-check  (base branch's checker)  ─►  merge

 Human-only, off the main path:
   {{ /rig:waive <sensor> <file|*> <reason> }}  when a sensor finding should not block
   {{ someone other than the author approves }}  when a PR adds or edits an approval.json
```

`/rig:build` continues into `/rig:test`, and `/rig:test` into `/rig:pr`, in the same turn when each one passes.

A change's status comes from which of its files exist: spec, plan, approve, build, pr, review, shipped. The active change is recorded in `.rig/state/active`. `approval.json` goes stale when `spec.md`, `plan.md` or a frozen contract file changes. With `"gates": {"plan": false}` in `.rig/sensors.json` the plan gate is off; otherwise verify and CI report a non-waivable `plan-gate` block. When no change is active, only the sensors run.

### Command atlas

**Drive the work** (the model runs these)

| Command | Use it when | Cost |
|---|---|---|
| `/rig:init [--quick \| --defaults] [greenfield "<stack and goal>"]` | First time in a repo. Writes CLAUDE.md, `.rig/`, the README block, and vendors the harness. | tokens, once |
| `/rig:start "<task>" \| <slug> \| .rig/product/intents/<slug>.md` | Any new task, a charted intent, or resuming a change. Writes `intent.md` and `spec.md`. | tokens |
| `/rig:plan` | Writing `plan.md` for a specced change. | tokens |
| `/rig:build` | Approved spec and plan: build test-first. | tokens |
| `/rig:test` | After the build: run `verify` and record `verify.json`. | mostly zero-token |
| `/rig:pr` | Ship: a clean-context reviewer agent (diff and intent only) and native /security-review on the delta, builder triage, fixes, then one commit, push and PR. | tokens |
| `/rig:chart <N>` | Architect: the sprint's PRD becomes intents, architecture and ADRs on branch `rig/chart-<N>`. | tokens (Opus) |
| `/rig:testplan <N>` | QA lead: the sprint's test plan, cases and data. | tokens |
| `/rig:wiki init \| build \| status \| refresh \| verify` | Build and keep the code wiki current. `status` is free and only warns. | tokens, bounded by `--max-usd` |
| `/rig:learn [--max-usd <N>]` | At sprint close: mine recurring review findings and waivers into proposed lessons and rule promotions. | tokens |
| `/rig:rule "<what recurs>"` | The agent made the same mistake twice: promote it to a regex rule, or to one line of CLAUDE.md's `## Things Claude gets wrong`, which you add. | tokens |

**Decide: human only** (the model cannot invoke these and cannot set `SDLC_HUMAN`)

| Command | Authorises |
|---|---|
| `/rig:approve <slug>` | `spec.md`, `plan.md` and the contract files, as written. Goes stale if any of them changes afterwards. |
| `/rig:approve chart-<N>` | A sprint's PRD, intents, architecture, ADRs, test plan and the contract files its intents name, as written. Refused while a blocking finding stands; goes stale when any of them changes. |
| `/rig:waive <sensor> <file\|*> <reason>` | One sensor finding on the active change. |

**The script underneath** (`node .rig/bin/sdlc.ts <cmd>`): `status`, `new`, `activate`, `approve`, `chart check|report <N>`, `ready`, `run`, `verify`, `pr`, `check`, `check-file`, `diff`, `baseline`, `sensors`, `secrets`, `waive`, `sync`, `vendor`, `hooks`, `hook <event>`, `wiki`, `learn mine|replay|check|status`. Skills and CI call these, and so can you.

### Sensors, policy and guides

Computational sensors run at zero tokens and only one inferential review runs per change. `sdlc.ts check` is the single entry point, so a local check and CI give the same verdict.

- **Config** is `.rig/sensors.json`, a registry, which `init --stack` writes from the detected stack pack (`templates/stacks/`: node, python, go, rust, java-maven, java-gradle, dotnet, angular). Its keys:
  - `sensors`: each one has a `cmd` or a `builtin`, a `cadence` (edit, turn, commit, ci or nightly), `blocks`, `count`, one `guide` sentence and an optional `timeoutMs`.
  - `paths`, `contracts`, `gates`, `models` (build, evaluate, design) and `policy`.
  - `knownRed`: the sensor ids that were already failing at the baseline.

  `.rig/rules.json` holds the regex rules.
- **Built-in sensors:** test-tamper, suppression, layering, size, secrets, rules, harness-tamper, traceability and red-proof. Each registry command sensor (`unit`, `lint`, …) also reports under its own id, and `/rig:waive <id>` waives any one of them.
- **Policy: cadence follows the model's grade.** `policy` maps a model family to `continuous` or `final`. The defaults are Haiku and Sonnet `continuous`, Opus `final`. Under `continuous`, every turn sensor runs at Stop. Under `final`, only the always-on built-ins run in session, and the rest wait for commit. Commit and CI always run everything. Moving a family to `final` counts as weakening the harness, so CI flags it.
- **Contracts** (`contracts.files`, `validate`, `run`) are frozen when the plan is approved. `verify` runs `validate` (the examples against the specs) before `run`.
- **Stop cap:** the Stop hook blocks a turn at most 2 times. After that, the findings go to `.rig/unresolved.json` and CI refuses them, so a loop cannot wedge a session. A finding that is already red on the base is treated as known-red rather than blamed on the change.
- **Guides** (contracts, engineering, testing) are copied to `.rig/guides/`, and `sync` writes the guides block into CLAUDE.md. A guide is injected the first time the session touches a matching path.

### What fires when

| Moment | Hook | What happens, at zero tokens |
|---|---|---|
| Session opens | `session-start` | Injects the active change, its next command, the policy for this model and the guides that apply. Wires the git hooks unless opted out. |
| You submit a prompt | `prompt-submit` | Snapshots the tree as the turn baseline, so Stop judges exactly this turn's diff, and records `/rig:approve` and `/rig:waive` from the person's own prompt. |
| After an edit | `post-edit` | Rejects secrets and plans containing code, runs the file's sensors against the turn baseline, and injects a matching guide once per session. |
| An agent launches or finishes, or `/model` switches | `agent-launch`, `agent-done`, `model-switch` | Records which model did what, which also selects the policy. |
| A turn ends | `stop` | Runs the sensors on the turn's diff. Blocks at most 2 times, then records `unresolved.json`. |
| You commit | git pre-commit | Runs the built-in sensors and every edit-, turn- and commit-cadence sensor on the staged diff. Warnings print with their fix text; blocks refuse the commit. During a merge or rebase, the command sensors are skipped. |
| You push | git pre-push | Runs every sensor up to the ci cadence on the branch's commits, against their merge-base with the trunk (as CI does). |
| A PR opens | CI `rig-check` | The base branch's checker re-judges the PR and runs the human-approval check on any `approval.json` it adds or edits. |

**Safety.** No hook runs on Bash. `permissions` deny rules and CI protect the evidence files, and CI recomputes every verdict with the base branch's checker. A shell script can still write a file locally, so CI plus branch protection is the real boundary.

### Code wiki and learning loop

- **Wiki.** `/rig:wiki init` proposes `.rig/wiki.json` (at most 30 pages) for a person to edit. `/rig:wiki build --max-usd <N>` writes pages in which every line is one sentence ending in a citation such as `[src/a.ts#f]`. A script validates the citations, and a clean-context reviewer drops claims the cited code does not support. `status` lists pages whose cited code changed, and only warns. `refresh` rebuilds only the stale pages. Never edit a page by hand.
- **Learning.** `sdlc.ts learn mine` finds review findings and waivers that recur in at least 2 changes. `/rig:learn` proposes delta edits to `.rig/lessons.md` (ADD, MERGE, RETIRE, PROMOTE) in `.rig/learn/proposal.md`. A rule is proposed only after `learn replay` shows it fires on the changes that earned it and on no others. A person applies the proposal in a PR. Add `@.rig/lessons.md` to CLAUDE.md so the lessons load each session.

## Install

The harness lives in each repo it runs on, so a repo never depends on the plugin and you install nothing globally. You need the plugin only to initialise a repo and to upgrade it, and you load it per project.

**Requirements:** Node 22.18 or later, `git`, a POSIX shell, and Claude Code 2.1.251 or later. macOS and Linux are supported; Windows is not. `/rig:pr` and the CI approval check use the GitHub CLI `gh`, which is optional otherwise.

1. **Load the plugin for this project only.** Start Claude Code from the project root with the plugin directory:

   ```bash
   cd /path/to/your/project
   claude --plugin-dir /abs/path/to/rig_v1
   ```

   That session is all `/rig:init` needs. After init, the harness lives in the project's own `.claude/` and `.rig/`, so later sessions need no flag. If you want the plugin itself on every session in this project (for central upgrades), install it at project scope:

   ```bash
   claude plugin marketplace add cwijayasundara/rig_v1 --scope project
   claude plugin install rig@rig --scope project
   ```

   Never run either command without `--scope project`: their default is user scope, which enables rig in every repo.
2. **Initialise** with `/rig:init` (see the user guide below for greenfield and brownfield). It writes a compact CLAUDE.md, `.rig/` and a rig block in `README.md`, and copies the harness into the repo with `init --full`:
   - skills to `.claude/skills/rig-*`, named `rig:x`;
   - agents to `.claude/agents/rig-*`;
   - hooks and [`templates/settings.json`](templates/settings.json) merged into `.claude/settings.json` (Sonnet main thread, Opus advisor off, Haiku 5.5 general subagents, subagents kept in the foreground, `ENABLE_STOP_REVIEW=0`);
   - scripts to `.rig/bin`.

   It also wires the git hooks. On your yes, and only when the repo has a remote, it adds `.github/workflows/rig-check.yml` and `REVIEW.md`.
3. **Commit** `README.md`, `.rig/`, `.claude/` and `CLAUDE.md`. Anyone who clones the repo, and any cloud session, then runs the harness with no install. A teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once. To opt out of the git hooks, run `hooks uninstall`, which sets `rig.githooks = off`.

**Init modes.** By default init asks its questions. `--quick` takes every recommended answer, and adds the CI workflows when `origin` exists. `--defaults` takes the same answers, skips the workflows, and is meant for unattended runs. Init warns when the session's main model is Opus, because Sonnet does init at a fraction of the cost.

**Upgrade** by re-running `node <plugin>/scripts/sdlc.ts vendor --standalone` from a newer plugin and committing. `.rig/bin/VERSION` records the version. Re-running `/rig:init` replaces only the README block between the `<!-- rig:begin -->` and `<!-- rig:end -->` markers.

**With and without the plugin.** A standalone repo has everything that decides what may happen: skills, agents, hooks, sensors, gates and the CI check. When the plugin is also loaded, its hooks step aside in a standalone repo, so no hook runs twice. In a standalone repo, `init --full` allows the project's own `node .rig/bin/sdlc.ts …` calls, so subagents can run the recorder without a prompt.

## User guide

Path A (greenfield) and path B (brownfield) differ only in the first hour; after that the work is the same. Path A can also start from a sprint PRD, which is path C applied to an empty repo. Paths C and D add the sprint loop and the learning loop to either one.

### Before any path

1. Keep a checkout of this repo where you can reach it, or use its GitHub `owner/repo`.
2. From the project root, run `claude --plugin-dir /abs/path/to/rig_v1`. If the repo has no commits, make a first commit, because ship and CI need a base.

### Path A: greenfield, one change at a time

An empty repo has two ways in. You can start from the first feature (steps 1 to 5 below), or start from a **sprint-wise PRD**, which activates the outer loop ([chart](#path-c-a-sprint-from-a-prd-greenfield-or-brownfield)) so that a whole sprint is broken into traced intents before any code is written. Either way the change itself runs the same lifecycle, and you can mix them: the PRD for the planned work, plain `/rig:start` for a one-off fix.

#### Start from a sprint PRD (activates the outer loop)

```
 empty repo ──► /rig:init greenfield "<stack and goal>"      skeleton + sensors, commit
                 ▼
        product owner + BA write  brief.md  and  prd/sprint-0.md        (FR-n / NFR-n ids)
                 ▼
 architect  /rig:chart 0     ─► intents (≤ 2 days each) + architecture.md + ADRs, checked by script
 QA lead    /rig:testplan 0  ─► plan.md + cases.md + data/, every case traced to a requirement
                 ▼                                    all on branch rig/chart-0
        architect + QA lead + PO review ─► {{ /rig:approve chart-0 }} ─► merge
                 ▼
        sdlc.ts ready ─► /rig:start .rig/product/intents/<slug>.md ─► plan ─► build ─► test ─► pr
                 ▼
        sprint 1: PRD again (same FR ids, "Changes since last sprint") ─► chart 1 ─► …
```

1. **Init with the goal.** `/rig:init greenfield "<stack and goal from the PRD>"`, then commit `README.md`, `.rig/`, `.claude/` and `CLAUDE.md`. `/rig:chart` refuses to run until `.rig/sensors.json` exists.
2. **Write the inputs.** The product owner and BA write `.rig/product/brief.md` ([`templates/brief.md`](templates/brief.md)) and `.rig/product/prd/sprint-0.md` ([`templates/prd-format.md`](templates/prd-format.md)). Give every requirement an id (`FR-1`, `NFR-1`) with Given/When/Then acceptance criteria, set `engineers:` in the frontmatter to the number of people building in parallel, and leave `## Open questions` as `none` when they are settled. Ids stay stable across sprints.
3. **Chart sprint 0.** The architect runs `/rig:chart 0`. The `architect` agent (Opus) writes `.rig/product/intents/<slug>.md` files, each at most 2 engineer-days with a `prd:` list, `depends:` and numbered behaviours, plus the first `architecture.md` and ADRs. Sprint 0 always has a `walking-skeleton` intent that every other intent depends on, so the first merge proves the build, test and deploy path end to end. A script (`sdlc.ts chart check 0`, no model call) blocks any intent that traces to no requirement, any requirement with no intent, and any intent over 2 days; the architect gets one fix round. The result is committed on `rig/chart-0`.
4. **Test plan.** The QA lead runs `/rig:testplan 0`. A Sonnet agent writes `plan.md`, `cases.md` and synthetic `data/`; every requirement gets at least one case, and a case for a boundary intent reuses that intent's contract examples.
5. **Approve once.** The architect, QA lead and product owner review the branch. One of them types `/rig:approve chart-0` themselves; it is refused while any blocking finding stands, and it goes stale if the PRD, architecture, ADRs, test plan or an intent is edited afterwards. Merge the branch.
6. **Build the intents.** `node .rig/bin/sdlc.ts ready` lists the intents whose dependencies have shipped. Each engineer runs `/rig:start .rig/product/intents/<slug>.md` in their own checkout, then `/rig:plan` (the mini design), the approval, `/rig:build`, `/rig:test` and `/rig:pr`. The intent's behaviours arrive in `spec.md` with the same B-numbers, so the hidden acceptance is known up front. Start the `walking-skeleton` first; the rest can run in parallel.
7. **Watch and close.** `node .rig/bin/sdlc.ts chart report 0` shows requirement-to-intent-to-case-to-test progress at any time. When the sprint ends, run `/rig:wiki refresh --max-usd <N>` and `/rig:learn`.
8. **Next sprint.** Write `prd/sprint-1.md` with the same requirement ids and a `## Changes since last sprint` section, then run `/rig:chart 1`. The architect now updates the existing `architecture.md` instead of starting one.

Small work during a sprint (a hotfix, a chore) still goes straight to `/rig:start` without a chart.

#### Start from the first feature (no PRD)

```
 empty repo ──► /rig:init greenfield "<stack and goal>"
                 │  walking skeleton + one passing test, lint, CLAUDE.md, README.md, sensors
                 ▼
          commit README.md .rig/ .claude/ CLAUDE.md
                 ▼
          /rig:start "first feature" ─► /rig:plan ─► {{ /rig:approve <slug> }} ─► /rig:build ─► test ─► pr
```

1. **Init with the goal:** `/rig:init greenfield "a REST API in Node with Postgres"`. Init asks up to three questions (stack, deployment target, test framework), each with a recommended default. It scaffolds the smallest skeleton that builds, with one smoke test and `test`, `test-fast` and `lint` commands. Then it writes `CLAUDE.md`, a new `README.md`, `.rig/sensors.json` from the stack pack, and the baseline.
2. **Optional:** write `.rig/product/brief.md` from [`templates/brief.md`](templates/brief.md) (context, non-goals, architecture, constraints). `/rig:start` reads the brief and keeps each change inside its non-goals.
3. **Commit** `README.md`, `.rig/`, `.claude/` and `CLAUDE.md`.
4. **First change:** run `/rig:start "add user signup"`, then `/rig:plan`. Read `spec.md` and `plan.md` in `.rig/changes/<slug>/`, then type `/rig:approve <slug>` yourself.
5. **Build:** run `/rig:build`. It works test-first on `sdlc/<slug>` and continues through `/rig:test` and `/rig:pr`. Review the PR and `review.md` (the native review's findings), then merge.

### Path B: brownfield, one change at a time

```
 existing repo ──► /rig:init
                    │  3 Haiku scouts: stack and module map · real commands · conventions and gotchas
                    │  CLAUDE.md (≤ 120 lines; an existing one gets a proposed diff)
                    │  sensors from the stack pack, adjusted to the real commands
                    │  baseline: already-failing sensors → knownRed
                    │  README.md rig block (in place) · wiki.json proposal
                    ▼
             commit ─► (optional) /rig:wiki build --max-usd <N>
                    ▼
             /rig:start "fix: X" ─► plan ─► {{ approve }} ─► build ─► test ─► pr
```

1. **Init:** run `/rig:init`. Three parallel scouts map the stack and find the real build, test and lint commands and the repo's conventions. Init runs the fast test command once to make sure it works. It writes a `CLAUDE.md` of at most 120 lines; an existing CLAUDE.md gets a proposed diff, never an overwrite.
2. **Accept the sensors.** Init shows `.rig/sensors.json` with each command adjusted to what the scouts found, and writes it when you say yes. A command that cannot run (a missing tool) is left out and named, with how to enable it. Declare `contracts.files` if the repo has OpenAPI, AsyncAPI or other frozen specs.
3. **Accept the baseline.** Sensors that already fail go into `knownRed`, so rig never blocks on debt it did not create. Init reports the counts.
4. **README and wiki.** Init writes the rig block into the existing `README.md` between markers and leaves the rest of the file untouched. It proposes `.rig/wiki.json` and stops there. Edit the page list, then run `/rig:wiki build --max-usd <N>` if you want the code map.
5. **Commit** `README.md`, `.rig/`, `.claude/` and `CLAUDE.md`.
6. **Pick the first change by type.** A bug is `/rig:start "fix: ..."`, which starts with a failing test. A cleanup is a refactor, whose tests must pass on the base before and after. A one-liner is a chore.

### Path C: a sprint from a PRD (greenfield or brownfield)

```
 /rig:init (A or B first) ─► write brief.md + prd/sprint-<N>.md
     ▼
 /rig:chart <N>  ─► /rig:testplan <N>      on branch rig/chart-<N>
     ▼
 architect, QA lead and product owner review the branch ─► {{ /rig:approve chart-<N> }} ─► merge
     ▼
 node .rig/bin/sdlc.ts ready  ─►  /rig:start .rig/product/intents/<slug>.md  (per engineer, in parallel)
```

1. **Init first.** `/rig:chart` stops if `.rig/sensors.json` is missing. For an empty repo, init greenfield with the stack and goal from the PRD.
2. **Write the inputs.** The product owner and BA write `.rig/product/brief.md` and `.rig/product/prd/sprint-<N>.md` from [`templates/prd-format.md`](templates/prd-format.md), giving each requirement an FR or NFR id.
3. **Chart.** The architect runs `/rig:chart <N>`. The `architect` agent (Opus) writes the intents, each at most 2 engineer-days with `depends:` and a `prd:` list, plus `architecture.md` and the ADRs. Then `chart check <N>` runs with one fix round, and the result is committed on `rig/chart-<N>`.
4. **Test plan.** The QA lead runs `/rig:testplan <N>` and gets the plan, the cases and the data, each case traced to a requirement.
5. **Approve once.** After review, a person runs `/rig:approve chart-<N>`. The approval is refused while a blocking finding stands, and goes stale on any edit. Merge the branch.
6. **Build the intents.** `node .rig/bin/sdlc.ts ready` lists the intents whose dependencies have shipped. Each engineer runs `/rig:start .rig/product/intents/<slug>.md` in their own checkout. The intent's behaviours carry into `spec.md` with the same B-numbers, and from there the change follows path A or B.
7. **Close the sprint.** Run `/rig:wiki refresh --max-usd <N>` and `/rig:learn`, then apply the learn proposal in a PR.

### Path D: keep the harness learning

When a review finding or a waiver recurs, run `/rig:learn` (or `/rig:rule "<what recurs>"` for a single rule). Both only propose: a person applies every lesson and rule, and `sdlc.ts learn check` must then pass.

### Parallel work

Separate changes run side by side, each in its own checkout or worktree on its own `sdlc/<slug>` branch. That is how a team builds a sprint's ready intents in parallel.

## Team rollout

1. Onboard as above and commit; teammates need nothing else. Make `rig-check` a required check. Add CODEOWNERS entries for `.rig/**` and the workflows. Add `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) or `ANTHROPIC_API_KEY` for CI review.
2. Read [SECURITY.md](SECURITY.md) before rollout. The hooks are guardrails; the boundary is CI plus branch protection, code-owner review and managed settings. A PR that adds or edits an `approval.json`, or adds waiver rows, fails `rig-check` until someone other than its author approves the head commit.
3. For the platform team, `templates/managed-settings.json` and `templates/production-gate.sh` hold the playbook's managed settings and the production gate as a managed-only hook.

**The Opus advisor is off.** In the v0.3 trials, an Opus advisor on the main thread was the largest single cost, about a third of each run. The settings template turns it off with `"env": { "CLAUDE_CODE_DISABLE_ADVISOR_TOOL": "true" }`. Remove that line to opt back in. The template also sets `ENABLE_STOP_REVIEW=0`, so the security-guidance plugin does not run an Opus review on every Stop. The rule is one review per change, at `/rig:pr`.

## Cloud sessions

Long builds belong in a Claude Code cloud session (claude.ai/code or `claude --cloud`), which keeps running while your laptop sleeps. A standalone repo runs there as it is: `claude --cloud "/rig:build — continue through /rig:pr"`. The result comes back as a pushed branch or PR, and `--teleport` brings the session back to your machine. Approve the spec and plan locally and push before starting the cloud build, because `/rig:approve` has not been tried in a cloud session.

## What is in the box

| Part | Role |
|---|---|
| `skills/` (13) | The stages, run by the main thread (Sonnet). Only `/rig:learn` pins a model, because a model switch re-reads the whole conversation uncached. |
| `agents/architect.md` | Opus. Charts a sprint; never edits source code. |
| `agents/evaluator.md` | Opus. Reviews each sprint chart in `/rig:chart`; a change's diff goes to the clean-context reviewer in `/rig:pr`. |
| `hooks/hooks.json` | Session start, prompt submit, post-edit and Stop guardrails, plus model recording. None runs on Bash, and all of them hold in `-p`. |
| `scripts/*.ts` | Zero-dependency Node with no build step. The main files: `sdlc` (the CLI), `core` (paths, change state, approvals), `model` (the pure diff, config and glob model), `registry` (sensors.json and policy), `sensors` (the pure sensors), `check` (one entry point for Stop, git hooks and CI), `hooks`, `verify`, `pr`, `chart` / `chartcheck`, `wiki` / `wikicite`, `learn*`, `vendor`, `githooks`. |
| `guides/` | Short per-area guides (contracts, engineering, testing). |
| `templates/` | Stack packs, `settings.json`, `rig-check.yml`, `REVIEW.md`, the brief, PRD, intent, architecture and test-plan formats, `readme-rig.md`, and the managed settings and production gate. |
| `eval/` | The eval runner: paired arms, hidden acceptance, dollars per accepted task. |

## Develop

Work on rig itself is routed by superpowers, not by rig; see [CLAUDE.md](CLAUDE.md).

```bash
npm run typecheck                            # scripts only (what CI runs)
npm test                                     # spec files, e2e unit tests, scripted e2e
claude plugin validate .claude-plugin/plugin.json
```

### End-to-end acceptance test

`tests/e2e/` is the one integration test. It scaffolds a throwaway repo, installs the harness into it, and plays the person who approves. Its phases:

- **S0 install:** registry, vendored harness, git hooks, guides block.
- **S1 product brief.**
- **S2 greenfield change.**
- **S3 follow-on change,** with a stale-approval check and the contract stage.
- **S4 local deploy gate.**
- **S5 policy:** the same change under the continuous and the final policy.
- **S6 sprint chart:** charts a sprint, approves it and starts an intent.

S2 and S3 also pass a hidden HTTP acceptance test that imports no source.

```bash
npm run test:e2e         # live: real Claude Code (claude-haiku-5-5 by default), costs money, --cap USD (default 6), --minutes (default 20)
npm run test:e2e:fast    # a fake model plays the skills from fixtures: $0, about 30 s; runs in npm test and CI
npm run test:e2e:unit    # the route runner, contract tool, stack probe, live driver accounting, eval tests
npm run test:e2e:stacks  # one tiny repo per stack pack; skips a missing toolchain
node tests/e2e/run.mjs --driver live --phase S3 --cap 20   # one phase (its prerequisites run first)
```

### Evaluation

Each part of rig has an eval arm in `eval/`, and a part is cut when native covers it or its eval shows no lift after two passes. The metric is dollars per accepted task. Live evals cost money and a person runs them by hand, never in CI; the dry runs replay fixtures at $0.

```bash
npm run eval:dry                                       # the main pipeline from fixtures: $0; runs in CI
npm run eval -- --arms all --runs 10 --cap-total 300   # rig arms against bare Haiku, Sonnet and Opus
npm run eval:chart                                     # chart quality against an answer key
npm run eval:wiki                                      # wiki accuracy and staleness against native Read/Grep
npm run eval:learn                                     # learning loop on against off
node eval/report.mjs eval/results/<date>.jsonl --out eval/results/<date>.md
```
