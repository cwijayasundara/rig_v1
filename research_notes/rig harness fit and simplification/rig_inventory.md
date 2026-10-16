# rig harness: quantified inventory (as of 2026-10-16, branch e2e-live-under-20min)

Scope: local repo only, read-only. Every number below comes from a command run in this session (commands quoted in the notes where it matters). Where a number is an approximation (static grep counts), it is marked.

Path convention: `R` = `/Users/chamindawijayasundara/Documents/learning_101/rig_v1`.

---

## 0. Headline numbers

| Measure | Value | Source |
|---|---|---|
| Authored TypeScript, harness (scripts/ + hooks/) | 7,840 lines (scripts 7,125 across 43 modules; hooks 715 in ts/tsx) | `wc -l` below |
| Authored TypeScript, incl. types/index.d.ts | 7,868 lines | `wc -l types/index.d.ts` = 28 |
| Spec / test TypeScript | 10,149 lines in 52 `scripts/*.spec.ts` + 719 in `tests/register.test.ts` | `wc -l` |
| Skill markdown | 595 lines in 22 `skills/*/SKILL.md` (range 9 to 60) | `wc -l` |
| Agents | 5 files, 115 lines | `wc -l agents/*` |
| Hook events registered | 7 (5 blocking/injecting, 2 async observational, 1 skill-failure) | `hooks/hooks.json` |
| CLI subcommands (`sdlc.ts` dispatch table) | 40 keys (`ship` is an alias of `pr`) | `grep -cE` on `COMMANDS` |
| Mod (UI) slash commands | 8 `registerCmd` names | `hooks/register.ts` |
| Tests that pass here | 861 (scripts specs, 110.6 s) + 16 (e2e unit) = 877 | run below |
| Brain (rig-brain plugin) authored TS, non-test | 1,570 lines; 146 static test cases; 5 skills (35 lines) | `cat ... wc -l` |
| Git | 596 commits, all within the last 14 days (first 2026-10-03) | `git log` |

Key answer to "how many moving parts": a user needs roughly six nouns (intent, change, tier S/M/L, gate/approval, sensors.json, `.rig/` evidence) and about 22 `/rig:*` commands to drive the loop. Behind them sit 5 agents, 7 hook events, 40 CLI subcommands, 8 mod commands, and ~43 script modules. The user-visible surface is 22 + 8 commands; the rest is wired automatically.

---

## 1. Top-level layout

### 1.1 Root listing and file counts

Command: `ls -la` plus `wc -l` on the top-level docs, and `find <dir> -type f | wc -l` per directory.

```
README.md 638 lines (74,364 bytes)     DESIGN.md 165     ROADMAP.md 56     CHANGELOG.md 138 (5 version headings)
package.json 23                         SECURITY.md 11,650 bytes           LICENSE, CLAUDE.md 3,046 bytes
skills: 22 files   scripts: 96 files (43 modules, 52 specs, tsconfig.json)   hooks: 7 files
agents: 5          templates: 17        workflows: 1      guides: 3      types: 1
tests: 52 files (incl. .DS_Store and fixtures)   brain: 338 files (83 excluding node_modules)   docs: 11
```

Non-authored or non-harness material at the root:
- `.claude-plugin/types/` holds 21,872 lines of `.d.ts` (`claude-code/index.d.ts` 15,990; `claude-code-tools` 5,483; `claude-code-mcp` 269). Not counted as authored code.
- `docs/stuff.eml` is 22,605 lines (an email export) and sits inside `docs/`, which totals 27,145 lines. It is not referenced by anything.
- `docs/ai-sdlc-map.html` (719 lines) and `docs/ai-sdlc-checklist.md` (676 lines) are reference material.
- `reports/` is an empty directory. `research_notes/` is untracked (git status at start was clean; `git status --short` now shows only `research_notes/`).

### 1.2 package.json

```
"name": "rig-plugin", "private": true, "type": "module", "engines": {"node": ">=22.18"}
scripts:
  test          = node --test scripts/*.spec.ts && typecheck:mod && test:e2e:unit && test:e2e:fast && claude plugin test . && test:brain
  typecheck     = tsc -p scripts/tsconfig.json
  typecheck:mod = tsc -p tsconfig.json
  test:brain    = npm ci --prefix brain && npm test --prefix brain
  validate      = claude plugin validate .claude-plugin/plugin.json
  test:e2e      = node tests/e2e/run.mjs --driver live
  test:e2e:fast = node tests/e2e/run.mjs --driver scripted
  test:e2e:unit = node --test tests/e2e/lib/*.test.mjs tests/e2e/driver/*.test.mjs
devDependencies: @types/node ^24, typescript ^5.9, yaml ^2.9
```

Runtime dependencies: none (the README says "zero-dependency Node"; `package.json` has no `dependencies`). `yaml` is dev-only.

### 1.3 Plugin manifests and CI

- `.claude-plugin/plugin.json`: `rig` 0.6.0. `.claude-plugin/marketplace.json` lists two plugins: `rig` (source `./`) and `rig-brain` (source `./brain`, 0.3.0).
- `brain/.claude-plugin/plugin.json`: `rig-brain` 0.3.0.
- `.claude/settings.json` (project, for working on rig itself): `model: sonnet`, `ENABLE_STOP_REVIEW=0`.
- `.github/workflows/ci.yml` (61 lines): jobs `core` (ubuntu, macos, windows x node 22.18 and 24: typecheck and spec tests), `e2e-fast` (ubuntu, macos), `brain` (ubuntu, macos), and `dogfood` with `if: false` (disabled, because rig is not run on its own repo).

---

## 2. Stated purpose (verbatim, first paragraphs)

README.md, first paragraph after the banner:

> rig turns Claude Code into a disciplined engineering team member. It covers the whole life of a product: a product owner's PRD, the sprint's architecture, intents and test plan, each intent built, reviewed and merged, the deploy, and the watch that feeds production problems back in as new intents. It follows [the AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), keeps every decision in files committed to the repo, and leaves every approval to a person. It adds very little of its own and relies on what Claude Code already provides. [DESIGN.md](DESIGN.md) gives the evidence and reasoning behind each choice.

DESIGN.md, opening:

> Why the harness is shaped the way it is, and what each part costs. Per-release changes are in CHANGELOG.md ... Code is the reference for behaviour.

README "How the harness is put together", opening:

> rig is a **thin control layer** around Claude Code. It owns five things (the artifact chain from PRD to merged change, human gates, guardrails, routing and budgets, measurement) and borrows everything else (plan mode, `/code-review`, `/security-review`, `/goal`, worktrees) from Claude Code itself.

ROADMAP.md, opening: the wiki (about 2,700 lines) and learn loops (about 520 lines) were removed in v0.4.x and returned as the `rig-brain` plugin.

Tension to note for the reviewer: the README's "adds very little of its own" sits next to 7,840 authored TS lines plus 595 lines of skill prompts, and the proposal (section 2.2 below) found that the rig repo itself was being built with superpowers defaults.

---

## 3. Named stages, loops and tiers

### 3.1 Three loops (README "one product, three loops")
- PLAN (per sprint): PRD, `/rig:chart`, architecture, ADRs, intents, test plan, one gate per sprint.
- BUILD (per change): intent, design or plan, build, test, sensors, PR, review, merge.
- RUN (per production): production gate, rollback rehearsal, rig-watch bands, incidents, triage, DORA. Feeds new intents back in.

### 3.2 Stage graph per change type (`scripts/graph.ts` lines 16 to 23)
```
greenfield: intent design build test sensors pr pr-review
feature:    intent design build test sensors pr pr-review
bugfix:     intent plan diagnose test sensors pr pr-review
incident:   intent plan diagnose test sensors pr pr-review
refactor:   intent plan build test sensors pr pr-review
migration:  intent plan build test sensors pr pr-review
chore:      intent build test sensors pr pr-review
spike:      intent notes
```
Stages are dropped by tier: `spec` is removed for S (non-greenfield) and M (non-greenfield); `plan` is removed for bugfix/incident below L; `pr-review` is removed for S and M when `prReviewAvailable()` (CI runs it).

### 3.3 Tiers (DESIGN.md section 4, and `scripts/levels.ts`)
| Tier | Rule of thumb | Human gates |
|---|---|---|
| S | <= 3 files, no contract or data change | none |
| M | <= 15 files or touches a contract | design (once, with the intent) |
| L | auth, payments, data, security, public API, > 15 files | spec, plan, design |

Greenfield is always treated as L for routing (`route()` in routing.ts). Test levels: unit always; acceptance for L and greenfield; api when contracts name an endpoint; integration when the plan spans more than one top-level module.

### 3.4 Gates and approvals
`/rig:approve <slug> design|spec|plan|impact|tier|full-route|budget` and `/rig:approve chart-N`. Chart approval hashes every chart file (`scripts/chart.ts`), so an edit makes it stale. Only a human can approve (`SDLC_HUMAN` env, `scripts/hooks.ts`).

---

## 4. Model routing (scripts/routing.ts, lines 25 to 40)

Table `TABLE[role][tier]` (verbatim semantics):

| Role | S | M | L |
|---|---|---|---|
| scout | haiku low | haiku low | haiku low |
| researcher | haiku low | haiku low | haiku low |
| architect | main thread | main thread | opus high |
| implementer | haiku medium | sonnet medium | sonnet high |
| slice-review | sonnet high | sonnet high | sonnet high |
| reviewer | sonnet medium | sonnet high | opus high |
| referee | sonnet medium | sonnet medium | sonnet high |
| triage | haiku low | haiku low | haiku low |

Floors (`FLOOR`): reviews never go below sonnet; code above S never goes below sonnet; architect at L never below opus. Retry steps raise effort, then model. Repos may override via `routing` in `.rig/sensors.json`, clamped by floors. Under budget pressure (`tight`), review effort drops one step.

Agent frontmatter (the default when no route applies), verified:
```
agents/architect.md:  tools: Read, Grep, Glob, LSP, Write, Edit   model: claude-opus-5-5    effort: high
agents/implementer.md: tools: Read, Grep, Glob, LSP, Edit, Write, Bash  model: claude-sonnet-5-5  effort: medium
agents/researcher.md: tools: WebFetch, WebSearch   model: claude-haiku-5-5   effort: low
agents/reviewer.md:   tools: Read, Grep, Glob, LSP, Bash   model: claude-opus-5-5   effort: high
agents/scout.md:      tools: Read, Grep, Glob, LSP, Bash   model: claude-haiku-5-5   effort: low
```
Note: `routing.ts` and the agent defaults disagree for reviewer at S and M (routing says sonnet; agent says opus). The route overrides the agent file, per DESIGN.md section 3, so the agent default is effectively only a fallback.

Main-thread policy: no skill sets `model:` (README "What is in the box"). `templates/settings.json` (65 lines) pins the haiku, sonnet and opus aliases and sets `ENABLE_STOP_REVIEW=0`.

---

## 5. Spend governance (budget, metrics)

- Config: optional `budget` block in `.rig/sensors.json` (`teamMonthlyUsd`, `changeUsd` per tier, `warnAt` [50, 80, 100], `downshift`). Every field optional.
- Levels: notice at 50%, tight at 80%, over at 100%. Budgets never pause or block work (README and DESIGN section 6 say so). The runaway guard is separate (`ratchet.usd`).
- Downshift under tight/over: review effort one step down; an Opus main loop moves to Sonnet once per session.
- Storage: each clone publishes one rollup per month to `refs/rig/spend` (`<YYYY-MM>/<id>.json`). Team totals sum those files.
- Scripts that carry this: `spend.ts` 330 lines, `metrics.ts` 336 lines, `scorecard.ts` 106 lines, `ratchet.ts` 186 lines (autonomous ratchet with caps and stall detection), `points.ts` 63 lines (story points S 5, M 7, L 11), `timing.ts` 30 lines. Governance bucket total: 1,284 lines (see 6.2).
- Metrics: `metrics` reports "the playbook's 12 leading and lagging metrics" plus cost per change, stage and agent (DESIGN section 7).
- The README flags an open item: "Setup caveat, pending a person's check on a scratch repo: that GitHub accepts pushes to `refs/rig/spend`". Unverified.

---

## 6. Code inventory

### 6.1 Scripts (scripts/*.ts, excluding specs), lines each

Command: `wc -l $(ls scripts/*.ts | grep -v '\.spec\.ts$')` (43 modules, total 7,125). Largest first:

```
 500 core.ts        500 sdlc.ts (CLI entry)     466 check.ts       452 model.ts       385 sensors.ts
 363 hooks.ts       336 metrics.ts              330 spend.ts       306 pr.ts          305 preflight.ts
 210 graph.ts       189 configparse.ts          186 ratchet.ts     176 quality.ts     175 githooks.ts
 174 evals.ts       165 vendor.ts               128 diffs.ts       126 verify.ts      115 inbox.ts
 110 scopes.ts      110 routing.ts              106 scorecard.ts   100 runs.ts        98 toolchain.ts
  93 chart.ts        89 watch.ts                83 chartcheck.ts   81 context.ts      66 basetree.ts
  63 points.ts       61 checkpoint.ts           61 testkit.ts      59 stale.ts        55 initbaseline.ts
  51 stamp.ts        48 shards.ts               47 brainsource.ts  37 flow.ts         34 levels.ts
  31 slicecheck.ts   30 timing.ts               25 slices.ts
```
Spec files: 52 in `scripts/` (10,149 lines). Largest specs: `check.spec.ts` (58 static tests), `sdlc.spec.ts` (55), `sensors.spec.ts` (46), `pr.spec.ts` (44), `githooks.spec.ts` (40).

Only `sdlc.ts` is a CLI entry. `testkit.ts` is imported only by specs (42 spec imports).

### 6.2 Functional buckets (my grouping of the 43 modules, lines from `wc -l`)

| Bucket | Modules | Lines | Share |
|---|---|---|---|
| Core lifecycle, gates, sensors, CLI | sdlc core check sensors model graph hooks githooks diffs runs verify pr routing levels quality preflight vendor configparse scopes basetree shards stamp toolchain checkpoint slices slicecheck flow initbaseline testkit | 5,333 | 75% |
| Governance: spend, metrics, ratchet, evals, points | spend metrics scorecard ratchet points timing evals stale | 1,284 | 18% |
| Plan loop (sprint chart, intent inbox) | chart chartcheck inbox | 291 | 4% |
| Run loop (watch bands) | watch | 89 | 1% |
| Context sensor and rig-brain bridge | context brainsource | 128 | 2% |
| Sum | | 7,125 | 100% |

Note: `testkit.ts` (61 lines) is counted in the core bucket but is spec-only.

### 6.3 Hooks and mod (UI), `hooks/`

```
hooks/band.tsx 158   hooks/register.ts 296 (the mod entry)   hooks/shared.ts 126
hooks/mission.tsx 88  hooks/gates.ts 35   hooks/driver.ts 12  hooks/hooks.json 27
```
TS/TSX in hooks: 715 lines. Mod registrations found by grep: `registerCmd` for `status`, `approve`, `waive`, `sensors`, `story`, `run`, `map` (SDLC map), `metrics-pane`. Also `cmdNames('status'|'approve'|'waive'|'run'|'story')`. The band shows tokens, dollars, context and spend level. Toasts fire on budget tight (register.ts line 212).

The mod is optional by design: DESIGN.md section 3 says "nothing essential depends on it". The mod's own test file, `tests/register.test.ts` (719 lines, 47 static tests), could not run here: it imports `claude-code`, which is not in `node_modules` (error: `Cannot find package 'claude-code'`). Under `npm test` it runs via `typecheck:mod` / `claude plugin test`, not via `node --test` on the spec glob. Not a failure of the harness logic; a runner environment fact.

### 6.4 Skills (22 SKILL.md)

| Skill | Lines | `sdlc.ts` mentions | Agent-name mentions |
|---|---|---|---|
| architecture | 33 | 4 | 10 |
| build | 30 | 9 | 5 |
| chart | 23 | 6 | 7 |
| codebase-design | 9 | 0 | 2 |
| decompose | 49 | 5 | 7 |
| design | 29 | 6 | 3 |
| diagnose | 18 | 4 | 1 |
| incident | 25 | 2 | 0 |
| init | 60 | 10 | 6 |
| intent | 34 | 0 | 0 |
| metrics | 17 | 2 | 0 |
| next | 21 | 4 | 0 |
| plan | 24 | 6 | 6 |
| pr | 18 | 6 | 2 |
| pr-review | 29 | 9 | 4 |
| prototype | 13 | 2 | 0 |
| rule | 24 | 2 | 0 |
| sensors | 24 | 5 | 2 |
| spec | 22 | 4 | 5 |
| start | 43 | 9 | 2 |
| test | 22 | 7 | 2 |
| testplan | 28 | 4 | 3 |
| **Total** | **595** | **106** | |

Every skill's `allowed-tools` includes `Bash(node ... sdlc.ts *)`, so each skill is a prompt that calls the CLI. 15 of 22 skill files list `Agent` in their allowed-tools (`grep -l Agent skills/*/SKILL.md | wc -l` = 15). `pr-review` also allows `Workflow` (see 6.6).

The README's "SKILLS (20)" count disagrees with the 22 directories. DESIGN.md section 3 lists 18 skill names and omits chart, architecture, decompose and testplan.

### 6.5 Agents, templates, guides, workflows, types

- Agents: 5 files, 115 lines (architect 15, implementer 27, researcher 15, reviewer 37, scout 21 per wc listing).
- Templates: 17 files, 1,130 lines. Largest: `rig-watch.yml` 217, `rig-review.yml` 154, `rig-spec.yml` 137, `rig-triage.yml` 103, `prd-format.md` 64, `settings.json` 65, `managed-settings.json` 53, `readme-rig.md` 50, `rig-check.yml` 49.
- Guides: `guides/engineering.md` 29, `guides/contracts.md` 23, `guides/testing.md` 26. Injected on first touch of a matching path (`scripts/hooks.ts` `guidesFor`).
- Workflows: `workflows/review.js` (179 lines), used by `skills/pr-review/SKILL.md`.
- Types: `types/index.d.ts` (28 lines), referenced from `plugin.json`.

### 6.6 Totals (authored, non-test)
- TypeScript: scripts 7,125 + hooks 715 + types 28 = 7,868.
- Skill markdown: 595.
- Agent markdown: 115. Template markdown and config: 1,130 (mixed yml, json, md, sh).
- Guides: 78. Workflow JS: 179.

---

## 7. What a target repo gets when rig is installed

From `skills/init/SKILL.md` (60 lines), `scripts/initbaseline.ts` (55), `scripts/vendor.ts` (165, `VENDORED` list at line 8), and `templates/readme-rig.md`:

- `.rig/bin/sdlc.ts`, `.rig/bin/VERSION` (vendored copy of the scripts, `vendor --standalone`).
- `.rig/mod/` (types, hooks.json, plugin.json, for the optional UI).
- `.rig/sensors.json` (config: fast, full, levels, quality commands, gates, routing, budget, bands). Written by init; 9 references in scripts.
- `.rig/rules.json` (policy rules).
- `.rig/product/` (PRD, architecture, ADRs, test plan). `.rig/intent/` (the inbox). `.rig/changes/<slug>/` (intent.md, design.md or plan.md, runs, verification.md, pr.md, ship.json). `.rig/templates/`. `.rig/githooks/` (pre-commit, pre-push).
- `.claude/skills/rig-*` and `.claude/agents/rig-*` when vendored standalone (DESIGN section 3).
- README block: the `templates/readme-rig.md` text, wrapped in `<!-- rig:begin -->` and `<!-- rig:end -->`, written into the repo's own README by the init skill (init SKILL.md step 6). The block is about 50 lines and includes a user-guide table and an architecture diagram.
- Policy skill: `.claude/skills/policy-security/SKILL.md` from `templates/policy-security.md`, scaffolded by `sdlc.ts init --full` (`scaffoldPolicy()` in sdlc.ts).
- CI: `rig-check.yml` (required), `rig-review.yml`, `rig-triage.yml`, `rig-watch.yml`, `rig-rehearse.yml`, `rig-spec.yml`, `rig-check`.
- `.claude/settings.json` from `templates/settings.json` (65 lines).
- Git hooks: `pre-commit`, `pre-push`, installed by `sdlc.ts hooks install`.

Change records are per change: `.rig/changes/<slug>/` (see README layers diagram). Chart records are per sprint: `.rig/product/` plus `chart-N` approval.

---

## 8. Dependencies between pieces

### 8.1 Who calls the CLI
- Skills: all 22 declare `sdlc.ts` in `allowed-tools`. 106 mentions in total (table 6.4).
- Hooks: `hooks/hooks.json` routes all 7 hook events to `sdlc.ts hook <name>` (prompt-submit, stop, session-start, post-edit, subagent-start, subagent-stop, skill-failed).
- Mod: `hooks/register.ts` and `hooks/gates.ts` call `sdlc.ts status`, `approve`, `waive`, `sensors`, `run`, `impact-status`, `log-usage`.
- Settings template and CI templates (rig-check, rig-review, rig-triage, rig-watch): call the vendored `sdlc.ts`.
- e2e tests: call `sdlc.ts` through `tests/e2e/lib/sandbox.mjs`.

### 8.2 Script import graph (non-spec imports; counted with `grep -lE "from ['\"]\./<name>\.ts['\"]"`)

```
core.ts          imported by 35 modules (+3 specs)
model.ts         26 (+8 specs)
check.ts         17
graph.ts         12
runs.ts          11
ratchet.ts        9 (+1 spec);   diffs.ts 9 (+1 spec)
stamp.ts          8
routing.ts        6 (+2 specs)
inbox.ts          4;   quality.ts 4;   sensors.ts 4 (+3 specs)
spend.ts          5;   scopes.ts 5
... 1 importer each for: basetree? (3), chartcheck, checkpoint, configparse, flow, hooks, initbaseline, levels, metrics, pr (+1 spec), shards, slicecheck, stale, timing, toolchain, vendor, verify, watch, ...
sdlc.ts          entry; imports graph, model, core and others (no importers)
testkit.ts       imported by 42 specs only
```
No module in `scripts/` is unimported: each non-entry, non-test module has at least one importer. Concentration: `core.ts` and `model.ts` are the hubs (35 and 26 importers).

### 8.3 Which CLI subcommands have no caller outside tests and docs

Grep across `hooks/`, `skills/`, `agents/`, `templates/`, `workflows/`, `guides/`, `brain/skills/`, `tests/e2e/` (docs and specs excluded):
- `stamp`: dispatch only. The module (`stamp.ts`) is live: imported by 8 modules and listed in `vendor.ts` VENDORED.
- `points`: dispatch only. The module is live: imported by 3 modules.
- `scope-drift`: called only by `tests/e2e/assert/change.mjs` (line 115).
- `check-file`: dispatch and `check.ts` usage string only; no hook or skill caller found.
- `evals`: called from README and `tests/e2e/phases/s5-wiki-evals.mjs` (comments), not from a skill.
- `log-usage`, `impact-status`, `waive`: called from the mod (`hooks/`), so they are live.

Candidates for dead CLI surface: `scope-drift`, `check-file`. Candidates for "manual only" (live module, CLI only for humans): `stamp`, `points`.

### 8.4 Skills, agents, templates referenced by nothing

- Agents: all 5 referenced (reviewer 44 mentions, architect 53, implementer 34, scout 23, researcher 12 across the repo).
- Templates: all 17 referenced at least once. Lowest: `policy-security.md` (1, from sdlc.ts), `architecture-format.md` (3), `testplan-format.md` (3), `readme-rig.md` (3).
- Skills: no skill is unreferenced. Skills with the fewest references: `codebase-design` (9 lines, 0 sdlc mentions, 2 agent mentions), `intent` (34 lines, 0 sdlc mentions, reached through `/rig:intent` and the start skill), `prototype` (13 lines). Reachability by name is through `/rig:<name>`; `sdlc.ts skill <node>` (`cmdSkill`, sdlc.ts line 332) is the stage-to-skill lookup, and I did not check whether every skill is reachable through it.
- Guides, workflow, types: all referenced.
- Non-harness files with no references: `docs/stuff.eml` (22,605 lines), `reports/` (empty), `.DS_Store` files.

### 8.5 Brain plugin boundaries
- `scripts/brainboundary.spec.ts` (3 static tests) enforces no imports either way.
- Brain files: 83 (excluding node_modules). Authored TS 1,570 lines. Skills 5 (`memory-dream`, `memory-find`, `memory-forget`, `wiki-find`, `wiki-refresh`; 35 lines). Agent `wiki-writer.md`. Template `rig-wiki.yml`. Hooks `hooks/hooks.json`. Evals 2 JSON files. Docs: 4 spec and plan files (`docs/specs`, `docs/superpowers/plans`).
- `brain/` markdown total 4,304 lines (includes the docs and README 73 lines).

---

## 9. The mod / pane / band / map UI

- `hooks/register.ts` (296 lines) registers commands: `status`, `approve`, `waive`, `sensors`, `story` (active story: node, rounds, cost by node), `run` (drive a change to the next gate; `/rig:run stop` pauses), `map` ("mission control: the SDLC map, where you are, tokens and dollars"), `metrics-pane`.
- `band.tsx` (158 lines): the band above the prompt (context and spend level; budget level colours).
- `mission.tsx` (88 lines): the mission pane with a budget line.
- `shared.ts` (126 lines), `gates.ts` (35 lines, impact gate dialog), `driver.ts` (12 lines).
- The `chart` (sprint chart, `scripts/chart.ts`, 93 lines) is planning, not UI. The README's "plan ▸ build ▸ run" banner is a header graphic in `/rig:map` (per commit 5409399).
- Mod tests: `tests/register.test.ts` (719 lines, 47 static cases), not runnable here (see 6.3).

---

## 10. The e2e test (tests/e2e/)

Header of `tests/e2e/run.mjs` (131 lines):
> The one integration test: `node tests/e2e/run.mjs [--driver scripted|live] [--phase S0|S1|S2|S3|S4|S5] [--cap USD] [--model MODEL] [--minutes N] [--live-evals] [--keep] [--out DIR]`. S0 installs the harness into a throwaway shop-app repo, S1 charts sprint 0 from the PRD and this test approves it, S2 builds the shop greenfield, S3 lands the delete-item change on top, S4 exercises the local deploy and maintain gates, S5 builds the code wiki and seeds (live: runs) the evals. Scripted is $0 and gates CI; live drives real `claude -p` sessions (default model claude-haiku-5-5) and is the release acceptance run; it fails when the whole run takes longer than --minutes (default 20) of wall clock.

What it exercises:
- Phases: `tests/e2e/phases/s0-install.mjs` (33 lines), `s1-chart.mjs` (57), `s2-greenfield.mjs` (57), `s3-delete.mjs` (65), `s4-deploy-maintain.mjs` (16), `s5-wiki-evals.mjs` (49).
- Assertions: `assert/onboarding.mjs` (88), `process.mjs` (58), `maintain.mjs` (54), `change.mjs` (148), `deploy.mjs` (65), `hooks.mjs` (29).
- Driver: `driver/scripted.mjs` (79), `driver/live.mjs` (57, spawns `claude -p` with `--max-budget-usd`, default total cap $6, 18-minute timeout per session), `live.test.mjs` (64 lines, 5 static tests).
- Lib: `sandbox.mjs` (97), `operator.mjs` (107, the human-approval simulator), `operator.test.mjs` (148 lines, 11 static tests), `oracle.mjs`, `checks.mjs`, `report.mjs`, `merge.mjs`, `gh-stub.sh`.
- Fixtures: `tests/e2e/fixtures/shop` (greenfield base), `remove` (delete-item), `chart` (.rig product, intent, ADR, testplan). PRD: `tests/e2e/prd/shop-app-sprint-0.md` (87 lines).

Cost and time (quoted from CHANGELOG.md line 8 and the commit b0dec52):
- "Timed live runs: 16.0, 15.1 and 13.8 min, about $1.20 each."
- Commit b0dec52 body: "The live run now completes S0-S3 in 13.8 min (was never reaching S3) and fails over --minutes (default 20)."
- README: "live /rig-chart passed 13/13 on 2026-10-11 for $1.37".
- Scripted run (`--driver scripted`) is $0 and is the one in CI (`e2e-fast`, ubuntu and macos).
- The live run is not in CI; it is run by a person.

Unit tests for the e2e harness: `node --test tests/e2e/lib/*.test.mjs tests/e2e/driver/*.test.mjs` gave 16 passing (run below).

Coverage: S0 to S5 cover install, chart, greenfield build, a follow-on delete change, deploy gate and maintain, wiki and evals. There is no e2e phase for the brownfield path, the mod UI, or the git hooks on a real push (README: git hooks "Not yet trialled live").

---

## 11. Tests: counts and runs (this session)

Commands and output:

```
$ node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts
ℹ tests 861
ℹ pass 861
ℹ fail 0
ℹ duration_ms 110640.103667
exit=0

$ node --test tests/e2e/lib/*.test.mjs tests/e2e/driver/*.test.mjs
ℹ tests 16
ℹ pass 16
ℹ fail 0
exit=0

$ node --disable-warning=ExperimentalWarning --test tests/register.test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'claude-code' imported from .../tests/register.test.ts
ℹ tests 1  ℹ fail 1  (module load failure, not a test failure)
```

Static counts (grep `^\s*(it|test)\(`, approximate, does not count table-driven cases):
- scripts specs: 900 lines matched across scripts specs, `tests/register.test.ts` (47) and e2e (11 + 5). Brain specs: 146.
- README claims "about 830 specs" (README "Status"). The run measured 861 passing.

Not run here: `npm run typecheck`, `npm run typecheck:mod`, `claude plugin test .`, `npm run test:brain`, `npm run test:e2e` (live, costs money), `npm run test:e2e:fast` (scripted, $0 but writes sandboxes).

---

## 12. Proposal: docs/proposals/2026-10-08-why-slow-and-the-fix.md (161 lines)

Read in full. Summary (verbatim-ish, numbers as the proposal states them):

Evidence: 736 transcript files, 2026-10-02 to 2026-10-08. Headline: $878 recorded main-session spend over 7 days (31 sessions); $119 in background security-review sessions (688 sessions); 68% of all recorded spend on Opus 5.5 ($679 of $997). Today's build session: $30.75, 2h51m wall clock, 304 main-thread calls, mean context 249k per call, 22 subagent launches, longest turn 85 minutes. First-call system prompt: 56.7k tokens.

Diagnosis, in order of cost:
1. The `security-guidance` plugin runs an agentic Opus security review on every Stop, every SubagentStop, and every git commit/push (two Opus passes each). 119 to 131 review sessions per day on several days. The same diff was reviewed three times in one hour.
2. The build ran through the superpowers subagent-driven-development loop (implement task, review task, hand back as a new user turn via SendMessage, next task) on an Opus coordinator holding about 250k tokens. Each hand-back re-fired every Stop hook.
3. The system prompt was 57k tokens: skill listing 36k bytes, deferred tool listing 36.5k bytes, agent listing 16.9k bytes, from 20 plugins enabled at user scope.
4. A different harness plugin (`harness@harness-local`) was enabled globally, adding agents, skills and Stop/PostToolUse hooks to every prompt.
5. Settings: `alwaysThinkingEnabled: true`, `advisorModel: opus`, `modelSettings.claude-opus-5.effortLevel: high`.
6. Rig's own hooks were not the cause. The proposal states they cost seconds and no model calls.

Fix:
- Settings now: set `ENABLE_STOP_REVIEW=0` (keep commit/push review), or run `/security-review` once per PR; move unrelated plugins to project scope (target first-call context < 20k); Sonnet main thread, advisor off, thinking off.
- Process now: one review per change on `git diff main...HEAD`, fixed in one wave; keep the coordinator small (no SendMessage hand-backs, foreground agents, `/compact` before 100k); parallelise independent tasks; briefs of 60 lines, not transcripts.
- In the harness (so target repos get the fast path): `rig init` writes `ENABLE_STOP_REVIEW=0`; a context sensor warns above 25k first-call tokens or 150k per turn; `metrics` counts background `sdk-py` sessions; cache the fast typecheck across turns and make tsc incremental; pin role models (Haiku reads, Sonnet writes, Opus only for tier L design or review, never coordinator).
- Targets: first-call context 56.7k to < 20k; mean main context 249k to < 100k; background review sessions per change 10 to 20 to 0; subagent launches per 9-task plan 22 to <= 4; Spec-2-sized change 2h51m to < 45 min and $31 + reviews to < $8.

Status (as far as this repo shows): the harness-side items are implemented. The context sensor is in `scripts/context.ts` (81 lines) with a mod hook; `ENABLE_STOP_REVIEW=0` is in `templates/settings.json` and `.claude/settings.json`; role pinning is `routing.ts`; `metrics` counts background sessions. The target numbers were not re-measured in this session.

---

## 13. Churn: git

Commands and output:

```
$ git log --oneline | wc -l
596
$ git log --reverse --format='%ad %h %s' --date=short | head -1
2026-10-03 20bf06d feat: sdlc plugin v0.1, a thin AI-native SDLC harness for Claude Code
$ git log --since='14 days ago' --oneline | wc -l
596
commits per day (2026-10-03 to 2026-10-16):
 108 10-03   74 10-04   21 10-05  104 10-06   70 10-07  103 10-08   77 10-09
  16 10-10   20 10-11    2 10-15    1 10-16
```
- 596 commits in 14 days, about 43 per day; 557 of them between 10-03 and 10-09.
- Last 7 days (10-10 to 10-16): 39 commits. Commits fell off sharply after 10-09.
- Tags: `v0.3.4`, `v0.3.5`, `v0.3.6`, `v0.3.7`, `v0.4.1` (last listed). `plugin.json` says 0.6.0. CHANGELOG has `Unreleased`, 0.6.0, 0.5.0, 0.4.1, 0.4.0.
- Observation, not verified: the README and DESIGN cite a 2026-09-30 to 10-02 build ("Prism") and releases back to 0.3.x, but `git log` starts at 2026-10-03. Either history was re-created or squashed; I did not check which.
- `git status --short` at the end of the session: only `?? research_notes/` (my output directory plus two other researchers' files).

---

## 14. Simplification signals for the reviewer

Facts only:
- 22 skills averaging 27 lines each; 40 CLI subcommands; 43 script modules averaging 166 lines; 8 mod commands; 7 hook events; 5 agents; 17 templates; 1 workflow; 3 guides.
- 75% of script lines (5,333 of 7,125) are the core lifecycle, gates and sensors bucket; 18% (1,284) is governance (spend, metrics, scorecard, ratchet, points, evals). The UI (mod) is 715 TS lines in hooks/ plus its 719-line test file. The plugin (brain) is 1,570 TS lines.
- Specs: 10,149 + 719 lines of tests against 7,840 lines of code, so tests are about 1.4 lines per code line.
- The mod is optional by design but carries 715 lines and 8 commands.
- Two scripts have only a CLI entry and no other caller (`scope-drift`, `check-file`), and two modules are live only via the CLI for humans (`stamp`, `points`).
- The skill and agent counts in README and DESIGN (20 skills, 18 names in DESIGN) do not match the 22 directories.
- Routing and the agent file disagree for the reviewer at tier S and M (routing sonnet, agent opus); the route wins in practice.
- `docs/stuff.eml` (22,605 lines) is unreferenced material in the repo.
- The harness repo is 2 weeks old by git and has 596 commits; 39 in the last 7 days.

Facts I did not establish: the number of runtime tokens or dollars a typical change costs now (the proposal's numbers are from 10-02 to 10-08 transcripts); whether the live e2e still passes on the current branch (no live run was done here, and it costs about $1.20 to $1.37 per run per the notes).
