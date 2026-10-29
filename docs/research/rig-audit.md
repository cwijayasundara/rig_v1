# rig audit: what exists today vs production-harness themes

Audit date 2026-10-21, main at e5c55d7, read-only, no web. Sources: README, DESIGN, ROADMAP, CHANGELOG, docs/GOAL.md, docs/research/*, docs/proposals/*, skills/, agents/, hooks/, scripts/ (about 11.1k lines incl. specs), templates/, eval/, tests/e2e, and the memory notes. Claims are from reading file headers and sampling code; a few "built" items are unmerged (flagged).

## 0. What rig is

A thin Claude Code plugin ("behavioural harness"). It owns an artifact chain (`.rig/changes/<slug>/intent.md -> spec.md -> plan.md -> approval.json -> verify.json -> pr.md/review.md`), human-only gates, a sensor registry (`.rig/sensors.json`) and a base-branch CI judge. Everything else is delegated to native Claude Code (plan mode, `/code-review`, `/security-review`, worktrees). Principles: DESIGN.md s2, docs/GOAL.md "rules that keep it thin".

## 1. Lifecycle, end to end (skills/*, 13 skills; 2 agents)

| Stage | Command | Who/what | Deterministic part |
|---|---|---|---|
| Setup | `/rig:init [--quick\|--defaults] [greenfield "<goal>"]` | Sonnet; 3 Haiku Explore scouts (brownfield) write CLAUDE.md (<=120 lines); greenfield scaffolds walking skeleton | `sdlc.ts init --stack` (detect pack, write sensors.json), `init --full` (vendor to `.claude/` and `.rig/bin`, git hooks, settings merge), baseline -> `knownRed` |
| Outer loop (optional, per sprint) | `/rig:chart <N>` then `/rig:testplan <N>` then `/rig:approve chart-<N>` | architect agent (Sonnet, `agents/architect.md`), QA general-purpose (Sonnet), `evaluator` agent (Opus, chart mode) | `chart check <N>` traces PRD requirement -> intent -> behaviour -> test case (scripts/chartcheck.ts); `ready` lists intents whose deps shipped; `chart report` |
| Inner loop | `/rig:start` -> `/rig:plan` -> `/rig:approve <slug>` (human) -> `/rig:build` -> `/rig:test` -> `/rig:pr` | skills = prompts | approval hashes spec/plan/contracts (scripts/lifecycle.ts); `verify` writes `verify.json` tied to tree stamp; `pr` refuses without current approval + fresh pass |
| Merge | CI `rig-check` (templates/rig-check.yml) | base-branch checker and config judge the PR | `check --at ci`, human-approval check for PR-added approval.json, wiki status (warn), `learn check` |
| Run | production gate (templates/production-gate.sh, managed-settings.json) | platform team installs as managed hook | e2e S4 |
| Alongside | `/rig:wiki init\|build\|status\|verify\|refresh`, `/rig:learn`, `/rig:rule`, `/rig:waive` (human), `/rig:approve` (human) | | wiki.ts, learn*.ts |

`/rig:build` chains to `/rig:test` then `/rig:pr` in one turn (Skill allow-rules in templates/settings.json). Recorded owner decision (auto-inner-loop memory): exactly two human touchpoints in the inner loop, approve then typing `/rig:build`, plus merge; PR auto-fixes every `## Findings` item; never add a second review or extra stops.

Script CLI (`scripts/sdlc.ts`): status, new, activate, approve, chart, ready, run, verify, pr, check, check-file, diff, baseline, sensors, secrets, waive, sync, vendor, hooks, hook, wiki, learn.

## 2. Mods (hooks/hooks.json, handlers in scripts/hooks.ts, modelstate.ts) and git hooks

Per memory "mods-not-hooks": call hooks.json events "mods"; never propose cutting one. Zero tokens, no mod calls a model, none on Bash.
- SessionStart: injects active change, next command, model policy, applicable guides; wires git hooks.
- UserPromptSubmit: snapshots tree as turn baseline; records `/rig:approve`/`/rig:waive` from the person's own prompt (sets SDLC_HUMAN).
- PostToolUse Write|Edit: rejects secrets and code-in-plan, runs file's edit-cadence sensors, injects guide once.
- PostToolUse/PreToolUse Agent, PostModelSwitch: record which model did what (selects continuous vs final policy).
- Stop: runs turn-cadence sensors on the turn's diff; blocks max 2 times then writes `unresolved.json` (CI refuses it).
- Mod module `hooks/dashboard.tsx`: journey band (read-only; reads `sdlc.ts status --journey --json`, spend, next command). GOAL.md scope 7 says "not started" but the file and scripts/journey.ts exist; status doc is stale or the work is partial.
- Git hooks (scripts/githooks.ts, `.rig/githooks`, POSIX sh): pre-commit (staged diff, 600 s budget), pre-push (vs merge-base, ci cadence). No bypass guard; CI plus branch protection is the boundary (DESIGN s9).

## 3. Sensors (scripts/sensors.ts, registry.ts, check.ts, templates/stacks/*.json)

Built-in ids (registry.ts BUILTIN_IDS): secrets, test-tamper, suppression, harness-tamper, size (default 400 lines/file, 500 diff, 160 chars), layering, rules (regex from `.rig/rules.json`), red-proof, traceability, model-role. Plus reserved: contracts, plan-gate (non-waivable), human-approval, sync (non-waivable), unscanned, config, commands.
Command sensors per stack pack (8 packs: node, python, go, rust, java-maven, java-gradle, dotnet, angular), cadence edit/turn/commit/ci/nightly. Node pack: lint (edit), types + unit (turn), layers = dependency-cruiser (commit, blocks), duplication = jscpd (commit, advisory), coverage c8 80% (ci, advisory), audit (ci, advisory), mutation = stryker (nightly, advisory). Other packs map `layers` to ArchUnit/ArchitectureTest (Java), `Category=Architecture` tests (.NET), go-arch-lint, cargo-deny, import-linter.
Policy: Haiku/Sonnet `continuous`, Opus `final`; hypothesis from Jain study, no Claude measurement (GOAL rule 5). `knownRed` baseline stops blaming new work for old debt. Per-sensor ids waivable by a person.

## 4. Enforced deterministically vs by prompt only

Deterministic (scripts, CI, permissions, zero tokens):
- Approval is person-only (SDLC_HUMAN from prompt; skills `approve`/`waive` are disable-model-invocation); hashes go stale on spec/plan/contract change; PR adding approval.json needs independent GitHub approval.
- Evidence files protected by `permissions.deny` (Edit/Write), `ask` rules on sensors.json, rules.json, settings, `.rig/bin`, githooks, guides, workflows, CODEOWNERS. Caveat: shell can still write; CI recomputes.
- Contracts frozen at approval; weakening a frozen example refused; validate-before-run.
- Test-tamper, suppression, secrets, size, layering, harness-tamper, traceability (B-numbers -> test names), red-proof (new test fails on base).
- Plans may not contain code (post-edit check). plan-gate. sync check (guide block vs registry).
- Chart traceability (`chart check`), `ready` ordering, wiki citation/hash validation, learn replay gate.
- CI uses base branch's checker + config; `harness-tamper` not waivable at CI.
Prompt-only (skill text, no script enforcing):
- Brief <= 60 lines, "run subagents foreground", model-per-role (CLAUDE.md table; settings sets main model Sonnet, advisor off), Sonnet generate / Opus review split (set in agent frontmatter; mod only records).
- Quality of intents, architecture, ADRs, test plan; "one review per change"; `/code-review` and `/security-review` run inside `/rig:pr` text; review-finding auto-fix; the greenfield walking skeleton; CLAUDE.md "Things Claude gets wrong" (manual, via `/rig:rule`).
- No guard against `--no-verify` or `hooks uninstall` by the model (explicitly removed; DESIGN s8-9).

## 5. Themes

### (a) Canonical implementations / reference patterns
Exists: `guides/{contracts,engineering,testing}.md` injected on first touch of a matching path; `templates/{intent-format,architecture-format,testplan-format,prd-format,brief}.md`; `.rig/lessons.md` (<=30 one-line lessons, branch rig/learn); greenfield "walking skeleton" intent; stack packs encode canonical commands; `tests/e2e/fixtures/{shop,stacks}` are reference repos (testbeds, not shipped as patterns).
Weak/missing: no golden-path exemplar code per stack ("copy this controller/test/module"); engineering.md is generic prose; no `.claude/rules` with `paths:` generated per slice (GOAL table says guide injection should become native `.claude/rules`, `sync` still writes a CLAUDE.md block). Jain's finding that the brief + OpenAPI/AsyncAPI + examples is the guide is recorded (sensor-catalogue.md); intent briefs gained `## Design` and `### Failure behaviour` (A/B: failure cases 9.3 -> 16.0, $1.09 -> $1.29, n=3, Opus).
Constraints: GOAL rule 1 (native first), rule 4 (measure then keep).

### (b) Architectural enforcement
Exists: Architecture table in brief (`| Part | Responsibility | Must not |`), per-intent `## Design`; built-in regex `layering` sensor (needs `options.layers`; no stack pack or init populates it, so it is inert by default); real layer linters wired in packs at commit cadence and blocking (dependency-cruiser, ArchUnit, import-linter, go-arch-lint, cargo-deny, .NET arch tests) but they only run `if config exists` and rig does not generate the config (Java pack guards with `grep ArchitectureTest`); size limits; duplication (advisory); chart `architecture.md` + ADRs; frozen contracts.
Weak/missing: no generator for dependency-cruiser/ArchUnit rules from `architecture.md` Parts table (the table is prose, not machine-read); no structural/fitness tests scaffolded; sensor-catalogue.md lists "architecture fitness tests, dead code (knip), coupling" as "not yet in rig"; no taste/style invariants beyond regex rules; one-at-a-time rule: add a sensor only after a repeated failure plus an eval arm (Fowler steering loop).

### (c) Deterministic scaffolding
Exists: `init --stack` (detect pack -> sensors.json), `init --full` vendoring, baseline capture, `new` / `activate` (change dir), `chart` templates, README block from `templates/readme-rig.md`, `rig-check.yml`, `REVIEW.md`, `settings.json`, `production-gate.sh`, `managed-settings.json`, `sync` (guides block), `wikigen` computed layer (non-LLM) + LLM prose.
LLM steps: CLAUDE.md content, greenfield skeleton, intent/spec/plan, architecture, test plan, wiki prose, lessons.
Missing: no code generators (module/endpoint/test skeleton from contract), no codegen from OpenAPI, no slice scaffold (`rig new-slice`), contract sensors ship empty (`contracts.run`/`validate` blank in packs; Specmatic blocked on Java and unconfirmed jar licence; the e2e uses a zero-dependency tool tests/e2e/fixtures/tooling/scripts/contract.mjs).

### (d) Vertical slices / per-slice scoping and context
Exists: the "intent" is the slice: <= 2 engineer-days, own brief, behaviours B1..Bn, dependencies (`ready` computes order), `kind: boundary` with named Contract/Example files; per-change dir is the memory; active change in `.rig/state/active`; `paths` in registry and `{files}` scoping of edit sensors; Stop judges only this turn's diff via baseline snapshot; briefs <= 60 lines; guides injected per matching path; wiki pages (<= 30) scoped by `paths`.
Weak/missing: slice is a work unit, not a code boundary: no per-slice directory ownership, no per-slice sensor set, no scope guard keeping a change inside its slice's files (an old `scopes`/`scopeLimit`/`affected` config was deleted in the rebuild; those keys now error); no automatic per-slice context pack beyond guides + intent brief; parallel work across slices relies on native worktrees (no rig helper).

### (e) Repo as system of record / progressive disclosure
Exists: everything is committed (`.rig/**`); CLAUDE.md <= 120 lines generated by init, `## Review` rules and `## Things Claude gets wrong`; `sync` keeps guide text and sensor registry from one source (`sync --check`, non-waivable); `.rig/guides/` injected on first touch; `.rig/wiki/` cited pages (every line one sentence + `[path#symbol]`, script validates citations, Sonnet reviewer drops unsupported claims, symbol-hash staleness, warn-only); README block in the target repo; `.rig/product/` (brief, prd, intents, architecture, adr, testplan); `docs/` in this repo.
Weak: no AGENTS.md support (CLAUDE.md only); no nested CLAUDE.md or `.claude/rules` generation; wiki not shown to beat native Read/Grep (6/6 tie, ~1 search saved; `eval:wiki` not run; on branch `rig/wiki`, not merged per memory 2026-10-17, README says "built"); index-on-init (GOAL scope 3) not done; CI refresh PRs out of v1; memory/dream design still open.
Constraint: Devin DeepWiki has no refresh mechanism, so freshness goes beyond Devin; cut wiki if it does not beat native by 2 of 8 or is not cheaper at a tie.

### (f) Entropy control / drift GC / slop detection
Exists (partial): knownRed baseline; size cap per file/diff; duplication (jscpd, advisory); suppression sensor; test-tamper; harness-tamper; wiki staleness (warn); chart staleness; mutation (nightly cadence slot, advisory); `learn mine` finds recurring review findings and waivers; regex `rules.json` promotion via `/rig:rule` and `/rig:learn` with a replay gate; `unresolved.json`.
Missing: Maintain stage (playbook plays 14-16) not started: no detection script, no `bands.yaml`, no scheduled routine, no breach -> `intent.md`, no recurring dead-code/dependency/doc-drift scan, no scheduled `/security-review`; nightly cadence has no runner (CI template has no nightly job); no ratchet for count-type sensors ("carried: count ratchets for lines/json sensors"); watch/triage/incident/metrics/scorecard were deleted 2026-10-16 (4a). Memory note: no pruning without evidence, so rebuilding is allowed; native routines/`/loop`/`/security-review` preferred over new code (GOAL scope 5).

### (g) Outer/inner loops, review, evals, CI
Exists: see s1. Review: one native `/code-review` + `/security-review` on the delta in `/rig:pr`, confidence < 80 dropped, review.md rides in the PR, auto-fix loop; evaluator agent (Opus) reviews charts only (commit fb533a2); `templates/REVIEW.md` for managed Code Review; CI `rig-check` required check. Evals: `eval/run.mjs` (paired arms: haiku-rig, haiku-bare, sonnet-bare, opus-bare, haiku-rig-final; hidden acceptance, USD/min/tokens/tamper), `chart.mjs` (A/B), `wiki.mjs`, `learn.mjs`, `report.mjs`, `score.mjs`; results in eval/results. Tests: `npm test` = 567 spec tests + e2e unit + scripted e2e S0-S6 with floors; stack fixtures (node/go/rust/java/dotnet) in CI job `e2e-stacks`; live e2e not run since rebuild.
Evidence: pilot 2 (n=1/arm) 0/1 accepted on every arm; haiku-rig $0.50 vs haiku-bare $0.02: no demonstrated lift, "the first honest pass is the next gate" (GOAL). Learn first pass: seeded mistake recurs 3/3 baseline vs 0/3 with loop, $0.33 (one of two passes).
Missing: CI evals (play 10: eval workflow on changes to CLAUDE.md/.claude/rig files + nightly; incident -> eval case) and PR review loop (play 11/13: `claude-code-action`, `@claude` triage) not started; no deploy/rollback stage beyond the production-gate hook; Windows unsupported; Specmatic gates.

### (h) Junior vs senior support
Exists: roles table in README (PO/BA, Architect, QA lead, Engineer, Reviewer/code owner, Platform team) each with a gate; person-only approve/waive; independent GitHub approval for PR-added approval rows; CODEOWNERS recommended for `.rig/**`; `--quick`/`--defaults` init modes; every step ends with the next command (journey dashboard shows where you are); per-model policy; `/rig:rule` and `/rig:learn` require a person to apply; managed settings and production gate for platform team.
Missing: no experience-level concept (no tiers: `new --tier` was removed; tiers, budgets, story points are Not Goals); no differentiated gates (e.g. junior needs reviewer sign-off on plan, senior can self-approve); no onboarding artifact for a new engineer other than README block + wiki (unproven); no explanation mode / teach-back; waiver reasons are free text, no waiver aging or rate dashboard (GOAL mentions gate-friction signals only as future: time-to-approve, re-approvals); approvals store hashes only, no approver identity beyond git/GitHub.
Constraint: "models never self-approve"; no auto-approval; no spend ledgers or tiers (GOAL Not goals).

### (i) Observability / cost / time
Exists: model recording per agent launch/switch (`modelstate.ts`), `runs.jsonl` evidence per change, `gates.jsonl` (local), `journey` status + dashboard band with context tokens and live USD (2 s timer; whether `$.session.usage()` includes subagent cost unverified), context sensor warnings (first call > 25k, turn > 150k per proposal 2026-10-08; check whether still present: no scripts/context.ts in tree now), `eval/report.mjs` cost per arm and model mix, `--max-usd` on wiki and learn, `ENABLE_STOP_REVIEW=0`, advisor off, Sonnet main, Haiku subagents, project-scope plugins, Stop cap 2, tree-stamp skip.
Cost targets: <= 45 min and <= $8 for a Spec-2-sized change, first-call context < 20k; no automated measurement of those targets in CI.
Missing: no `rig report` for first-pass CI success, time at gates, share of review comments resolved without human, repeat-mistake rate (listed as unmeasured in the gap analysis); chart-level estimate-vs-actual from git deferred; no cost/time telemetry persisted per change (spend ledgers are a Not Goal; use `/cost`, status line).

## 6. Decisions already recorded that constrain proposals

1. Thin layer, native first; new code needs: no native equivalent, must be deterministic outside the model, or minimum glue (GOAL rules 1-2).
2. No pruning without evidence; cut only when native covers it or own eval (eval/) shows no lift after two passes. Metric: dollars per accepted task. Do not cite source silence as reason to cut.
3. Mods, not hooks: keep every hooks.json event working.
4. Models advise, scripts decide; no mod/hook calls a model; humans gate; no auto-approval, no Bash hook, no model self-approval.
5. Auto inner loop: exactly two stops (approve, then `/rig:build`), one review per change, auto-fix findings.
6. Fix the harness not its output (target repos regenerated, never hand-patched); no `--no-verify`.
7. Do not run rig on rig_v1 itself (no `.rig/` here, superpowers routes work; dev on Opus is allowed per memory).
8. Size budget: harness cap 6000 lines (raised by the person), scripts cap lower; B/C (index, learn) must be thin; 3000-line target retained as aspiration.
9. No state machine reimplementing playbook stages; status derives from files. No spend ledgers, tiers, budgets, story points.
10. Wiki: cited, hash-checked, warn-only, judged by `eval:wiki`; native search showed no lift so no search index. Learning loop: committed one-line lessons, human-applied; cut if no lift after two passes.
11. Specmatic blocked (Java + licence); zero-dependency contract tools meanwhile. Windows unsupported.
12. Agreed order of future work: index on init, CI evals + PR review loop (gaps E, F), Maintain (gap D), learning loop; first honest paired eval is the gate before more features.
13. No `design.md` per change (removed in 4b); don't reintroduce.

## 7. Headline gaps vs the nine themes (facts only, not proposals)

- Strong: (g) inner/outer loop and local-equals-CI; (h) human gates; (c) config scaffolding; contracts frozen.
- Partial: (a) guides but no golden examples; (b) linters wired but rules not generated and builtin layering inert; (d) slice = intent, not code boundary; (e) wiki built, unproven, unmerged/ambiguous; (i) cost visible in-session, nothing persisted.
- Absent: (f) Maintain/drift GC; CI evals; PR triage; role/experience differentiation; AGENTS.md; code generators.
- Evidence gap: no measured lift of the harness yet (pilot 2 n=1); live e2e and `eval:wiki` not run.
