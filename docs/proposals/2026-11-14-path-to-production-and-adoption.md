# rig: where it stands, how it compares, and the path to production and mass adoption

2026-11-14. Sources: `main` at 7324485 (v0.10.0 + 15 commits: C1–C6 of `docs/superpowers/2026-11-12-three-gates-to-strong.md`),
`eval/results/`, `docs/feedback/`, `research_notes/`, `reports/`, and the public sources in §3. An independent Fable 5.2 evaluator
reviewed the first draft against the code: 13 findings, all applied (§9).

## 1. Verdict

rig already implements most of the mechanisms in your brief, deterministically, and in places goes further than any public
harness:
- the PRD ledger with a weakening check;
- approval hashes that go stale and approvals bound to the head SHA;
- frozen contracts and frozen tests, with a separate test writer;
- hidden holdout cases;
- mutation score on changed lines on eight stacks;
- base-branch CI judging with merge-queue handling and a revert-rate breaker;
- test-tamper and harness-tamper sensors;
- seeded-defect audits of human reviewers.

Three things stand between rig and production:
1. **Proof that it pays.** No eval has shown a lift.
2. **A computed picture of a brownfield codebase and its blast radius.** Today the blast radius is whatever the model declares.
3. **A reviewer's surface a non-author can trust in five minutes.**

It is also hard to adopt: 17 skills, about 11 new words, a 533-line README, about 10.6k lines of non-test TypeScript, and
1,274 commits since 2026-10-03 (about 30 a day). The path below spends money on measuring first. It builds one new capability (the
code graph and impact analysis) and a reviewer page, and it asks the owner to decide where your brief and cost pull apart.

## 2. Scorecard against your brief

**Strong** = deterministic and enforced in CI by default. **Partial** = present but model-asserted, opt-in, tier-gated or unmeasured.
**Gap** = absent.

| # | Your requirement | rig today | Grade | Gap that matters |
|---|---|---|---|---|
| 1 | PRD → list[intent], nothing dropped, NFRs included | `/rig:chart`; ledger `requirements.md` maps every PRD line to an intent, a case or out-of-scope; `prd check/coverage/gaps`; `chart check` blocks on unmapped rows; an NFR needs a case that could fail | Strong | The same model builds the ledger and charts, so an implicit requirement it misses is invisible to both |
| 2 | An evaluator on every step | Opus `evaluator` in chart, conversion and test-plan modes; plan mode only when `weight` says full (`skills/plan/SKILL.md:24`); `approve --check` weakening check is deterministic | Partial | No evaluator on `architecture.md` as its own artifact. No measured miss rate for any evaluator (the shop_app "ids are never reused" weakening passed chart) |
| 3 | Intents, architecture, test plan, cases and **test data** trace to the PRD | Ledger ids cited in intents, behaviours, cases and holdouts; `approval.md` AC table | Strong for intents and cases; Partial for data and architecture | Test data is checked only by the evaluator's "cases" category; ADRs cite PRD rows by convention, not by a check. The trace stops at the test: no code hunk → behaviour link |
| 4 | Per-intent mini design aligned to the product architecture | `/rig:plan`: files, interfaces, a test per behaviour, contracts, inside the spec's `## Blast radius`; `layers` sensor (dependency-cruiser) | Partial | Alignment with the ADRs is prose; only layering is computed |
| 5 | Predictable code, unit and integration tests | Separate test writer, `tests-freeze`, red-proof, test-tamper, holdout cases, `mutation-diff` with `minScore` 0.8 | Strong | No integration-test tier in the stack packs with its own sensor |
| 6 | One PR per intent; inner loop in "auto" | `/rig:build` → `/rig:test` → `/rig:pr` in one turn; `queue` detects file overlap | Partial | Two sessions in separate worktrees already run safely side by side (the scripted "parallel instances" journey, 17/17 checks), but a person has to start each one. Lanes in the implementation plan are checked (`scripts/chartcheck.ts:387-423`) but nothing runs them automatically |
| 7 | Outer-loop human gate with evidence of completeness | `/rig:approve chart-N` refuses while a blocking finding stands; C5 `approval.md` and check questions | Strong | Markdown only. A 40-row ledger needs a filterable page |
| 8 | Human approval per PR; trust in agent code, linked to the PRD | PR body: behaviours, blast radius, tier, revert, what the checks would miss, evidence, C6 questions; seeded audits; approval bound to head SHA (`scripts/check.ts:363,378`) | Strong **only when `humanApproval.everyTier` is on**, which defaults to false (`scripts/registry.ts:56`) | Reviewer still reads a raw diff, with no per-hunk "serves B3 ← AC-2.1 ← PRD line 41" |
| 9 | Agent PR review: approved / not approved with reasons | Clean-context Opus reviewer → `review.md`; `claims stamp`; `ai-review` CI check | Partial | **Tier 0 gets no agent review** (`skills/pr/SKILL.md:12`). No verifier pass on findings; no published precision/recall |
| 10 | Security review before the PR | `sast` (semgrep, commit, blocking), `audit` (ci), `secrets` built-in, all 8 packs; Opus security agent | Partial | **The Opus security agent runs only at tier 2.** `audit` does not block; the semgrep ruleset is `p/default`, unpinned |
| 11 | Generator reviewed by a higher model; Haiku where it fits | `sensors.json.models` (build, evaluate, design) accepts any id (`scripts/registry.ts:191`) | Partial | The roles do not drive the agents. Opus is hard-coded in `agents/evaluator.md` and `skills/pr/SKILL.md:14-15`, and `model-role` only warns (`scripts/modelstate.ts:104-110`). There is no `read` role. GOAL.md:43 says Sonnet reviews the diff; GOAL.md:53 and README say Opus |
| 12 | Deterministic sensors on every edit (clean code, SRP, nothing broken) | Registry with edit/turn/commit/ci/nightly cadence; built-ins (size, layering, suppression, test-tamper, harness-tamper, rules, traceability, red-proof, scope); `duplication` (jscpd), `layers`, `coverage`, knownRed baseline | Strong | Missing: complexity, dead code, public-API diff, affected-tests-only runs |
| 13 | Extremely fast and cheap | Reviews gated by tier; light plans; briefs ≤ 60 lines | **Gap** | rig+Haiku is $0.087 and 8.2 min; bare Haiku is $0.032 (2.7x cheaper) and bare Sonnet is $0.212 but 0.9 min (9x faster), all at the same pass rate (`eval/results/2026-10-31-delta.jsonl`). No rig+Sonnet arm exists, so the cost of Sonnet builds is unmeasured. Real sprints: $24 and $35, 6 and 10 h wall for two small sprints |
| 14 | Brownfield: deep-wiki code map, investigation, blast radius before coding | `/rig:init` runs 3 Haiku scouts; `/rig:wiki` writes cited, hash-checked prose; the scope sensor enforces the declared blast radius | **Gap** | Nothing in `scripts/` computes reverse dependencies or impact. The wiki "is not yet shown to beat native Read/Grep" (tied 6/6) |
| 15 | Greenfield and brownfield both | `/rig:init greenfield`, walking skeleton; brownfield init with knownRed | Strong | — |
| — | **Proof it beats plain Claude Code** | `eval:ablate`, `eval:journey`; `ablation.json` is `[]`, `journey-baseline.json` and `triage.json` are `{}` | **Gap** | GOAL.md's own definition of "production ready" is a measured lift |

## 3. How it compares

### 3.1 Anthropic's `code-modernization` plugin

`research_notes/Code modernization plugin vs rig/plugin_design.md` covers it in depth. What makes it coherent, and what to take:

| Their choice | Why it works | rig today | Take it? |
|---|---|---|---|
| One front door (`/modernize`, ≤ 2 questions → `INTENT.md`); every command ends with the next; `status` shows where you are, what is stale and the next command | You can follow the journey without learning it | `sdlc status` and next-command lines, but 17 skills as entry points | **Yes**: one `/rig` front door |
| A computed map: a script writes `topology.json`, an interactive `TOPOLOGY.html` renders it, analyst agents then describe each node | The map is data first and prose second, so the prose cannot invent an edge | Wiki is prose with citations; no graph | **Yes**: the brownfield gap (§5, Phase 2) |
| Rules as Given/When/Then cards with `file:line` and P0–P2 priority, a second agent re-checking each card, a human pane per flagged rule (Right / Wrong / Not sure) | A person reviews only what is uncertain, one item at a time | Chart approval is one bundle plus ≤ 3 C5 questions | **Yes**: per-row ledger review, limited to proposed and weakened rows |
| `verify`: clean run, old vs new on the same inputs, ≥ 10 invented inputs, a canary break that must turn tests red, P0 "named, not run" check; PROVEN / PARTLY / NOT PROVEN per module | Evidence a non-author can read | `verify.json`, red-proof, mutation, the "named is not ran" check (already taken in 0.8.0) | Mostly taken. Take the per-unit verdict word and an HTML proof page |
| Workflow scripts for fan-out (sharded rule mining) | Breadth at low wall-clock | none | **Yes**, for the code map and for parallel intents |
| Hooks only observe; no `model:` pins | Simpler | rig gates by hooks, scripts and CI | **No**: deterministic gating is rig's moat |

### 3.2 Other harnesses (from their public docs, 2026-11-14)

| Harness | Decomposition | Verification | Brownfield map | Human gates | Lesson for rig |
|---|---|---|---|---|---|
| GitHub Spec Kit | constitution → specify → plan → tasks → implement → converge | `converge` loops to a report; otherwise agent and CI | none | review between commands | Simplicity and agent-agnostic reach win adoption |
| Kiro (AWS) | `requirements.md` → `design.md` → `tasks.md`; tasks form a dependency graph and run in **waves**; "Analyze Requirements" finds ambiguity and gaps | agent hooks; no mutation, no hidden tests | steering files | a review panel per phase | Wave execution and a requirements-gap analyser; IDE-grade review UX |
| BMAD Method | role agents (product, architecture, UX, dev, test); BMad Loop runs an epic unattended | test-architect role (inferential) | an existing-codebase guide | informal | Same shape as your outer loop; rig is deterministic where BMAD is prompts |
| Tessl | a registry for skills and plugins: versions, governance scoring, evals with and without a skill, observability | skill evals | cross-repo drift findings | policies, RBAC | A possible distribution and eval channel for rig's skills, not a rival loop |
| Devin DeepWiki | — | — | generated wiki with diagrams and source links, steered by `.devin/wiki.json` (30-page cap), Q&A, MCP | — | The bar for "deep wiki". rig's `wiki.json` has the same shape and more trustworthy pages, but no graph, no diagrams and no Q&A |
| Aider | — | — | **repo map**: tree-sitter symbols, graph-ranked, token-budgeted | — | The cheapest proven codebase view; the model for `sdlc map` |
| Factory droids | delegate → diff → merge; orchestrated parallel workstreams | diff review | org context via connectors | PR | Integrations and parallelism |
| Superpowers | brainstorm → worktree → plan → execute → TDD → review → finish | TDD, two-stage review per task | none | design, "go", finish | rig builds on it; keep one review per change, not per task |
| Anthropic internal code review | parallel bug-hunting agents; **verifier agents vote per finding**; only agreed findings posted | blocking security review; incidents become a daily eval; false-alarm rate on known-clean PRs | — | **risk-scaled**: low tier none once green, medium one, high two; an agent's approval never counts; approval bound to one commit | rig already binds approval to the SHA, handles the merge queue and has a revert breaker. Missing: the verifier vote, incident rate, and the breaker raising approvals on tiers above 0 |

**Where rig is behind:** onboarding and review UX (Kiro, code-modernization), a computed code map (code-modernization, DeepWiki,
Aider), parallel execution (Kiro waves, Factory) and integrations (Factory). The gating is GitHub-only (`gh`), while Spec Kit
and BMAD run anywhere.

## 4. What stands between rig and production (ranked)

1. **No measured lift.** On every task tried, the bare model passes. The tasks are too easy for rig to help: small, single-session,
   no cross-file contract, no PRD ambiguity. The defects that escaped in the shop_app runs (a weakened rule, lost updates under
   concurrency, option parsing) are the kind of task rig needs to be measured on.
2. **Brownfield blast radius is asserted, not computed.** The scope sensor enforces what the spec declares. Nothing checks that the
   declaration covers the callers, contracts and tests the change affects. This is where a harness can most plausibly beat a bare
   model.
3. **Your brief and the defaults disagree.** You want an evaluator on every step, a security review before every PR and a human on
   every PR. Today tier 0 gets no agent review, tier 0–1 no security agent, and `everyTier` is off. Those defaults were set for cost.
   Which way to go is your decision (§8), and the eval should inform it.
4. **Cost and wall-clock.** Intents run one at a time, every stage takes many model turns, and two small sprints took 6 and 10 hours
   of wall time.
5. **Concept and surface load.** 17 skills; "/rig:start asks a lot of questions" (20 over two sprints); "decision making shifted from
   BA to developer" (feedback_2).
6. **Churn.** About 30 commits a day; the size cap was raised 7 times; v0.8.0 and v0.10.0 were tagged a day apart.
7. **Reach.** GitHub only; one maintainer; no support or upgrade story for external teams.

## 5. The path

Each phase has an exit gate that is a number and a kill rule, both set before it starts. Order: measure the bare models first (cheap),
build the one missing capability, then measure rig, then freeze.

### Phase 0 (week 1): settle the defaults to your brief, and simplify the entry

- **Decide the brief-vs-cost defaults (§8 D1).** The recommendation is a client profile with `everyTier: true`, the security agent
  on every PR that touches code, and the code reviewer at every tier. Run the cheaper tier-gated defaults as an eval arm against it.
- **Make model roles real.** `sensors.json.models` gains a `read` role. The evaluator agent and the `/rig:pr` reviewer and security
  briefs take their model from `evaluate`, not hard-coded `opus` (frontmatter plus skill text). `model-role` blocks on a mismatch at
  ship. Then Fable 5.2 or Opus 5.5 is one config line. Fix GOAL.md:43.
- **One front door.** `/rig` with no argument reads `sdlc status` and runs the next step. `/rig <PRD>` charts and `/rig "<task>"`
  starts a change. The skills stay as sub-steps. The README teaches the front door, `approve` and `waive`.
- **Profiles that match the brief.** Today there are only `full | core`, and `core` drops chart, wiki, arch and testplan
  (`scripts/profile.ts:6-7`), which removes your outer loop. Add one `sprint` profile = core + chart + testplan + arch + wiki, with
  the client defaults above. Do not add more profiles until a team asks.
- **No freeze yet.** Keep patching `release/0.10` (create it), but do not call anything stable until Phase 3 passes.

**Exit:** the defaults and roles are decided and specced, `npm test` passes. **Kill:** none, this is configuration.

### Phase 1 (weeks 1–3): the hard eval set, bare arms only

- Reference repo: a public brownfield project (10–50k lines, a supported stack, good tests). Write **6 tasks to start**, each with
  hidden acceptance tests and a seeded trap from the known failure classes: a rule weakened on the way to the spec, a caller outside
  the obvious files, a concurrency rule, an option-parsing edge, an NFR with a number. Write one PRD spanning 4–6 intents.
- Run the bare arms only: bare Sonnet, and bare Sonnet + superpowers, n = 3. These are cheap (about $0.2–1 per task-run).
- Metrics: accepted rate on hidden tests, **escaped defects per accepted task** (the trap shipped), $ per accepted task, wall time.

**Exit:** the bare arms let at least 1 trap in 3 through, so rig has room to win. **Kill:** if the bare arms catch every trap, the
tasks are too easy; write harder ones before spending on rig arms. Budget: ≤ $150.

### Phase 2 (weeks 2–6): compute the code map and the blast radius

The one new capability, and the one most likely to produce a lift.

- **`sdlc map`** (deterministic, zero tokens) writes `.rig/map/graph.json`: files, exported symbols, import edges, test → source
  edges, contract files, owners (CODEOWNERS), churn from git. Use existing tools, not new parsers:
  - TypeScript: the compiler API or dependency-cruiser (already in the `layers` sensor);
  - Python: `ast`;
  - Go: `go list -deps -json`;
  - Rust: `cargo metadata`;
  - Java: `jdeps`;
  - .NET: Roslyn;
  - fallback: tree-sitter symbols, as Aider's repo map does.

  Take test → source edges from per-test coverage only where the stack makes it cheap. Otherwise use import reachability from
  test files. Monorepos need a stack per package, but the registry has one `stack` today (`scripts/registry.ts:23`), so
  scope v1 to single-stack repos. Dynamic call edges stay out of v1.
- **The wiki sits on the graph.** Pages describe nodes and clusters and cite graph nodes. A static `.rig/map/index.html` shows the
  topology and hot spots. This replaces, not adds to, the current wiki page planner.
- **`sdlc impact <slug>`** at plan time takes the plan's `## Files`. It returns reverse dependents to depth N, affected
  contracts, tests and owners. `approve` refuses a plan whose blast radius misses a computed dependent unless the plan gives
  a one-line reason. The scope sensor then enforces the union.
- **Affected tests at turn cadence.** Run only the tests reachable from the diff while the model works, and the full suite at commit
  and CI. This is the biggest wall-clock win on large repos.
- **Investigation for brownfield changes.** For a tier ≥ 1 change, `/rig:plan` first writes `investigation.md`: the current behaviour
  of the touched nodes, characterisation tests to add and the impact list. The evaluator reviews it with the plan.

**Exit:** on the reference repo, the computed blast radius contains ≥ 95% of the files the hidden acceptance tests show must change.
**Kill:** below 80% on two stacks → keep it as a warning, not an approval blocker.

### Phase 3 (weeks 5–8): rig arms, ablation, then freeze

- Arms: rig `sprint` profile with your brief's defaults; the same with tier-gated reviews (today's defaults); Opus vs Fable 5.2 as
  `evaluate`; rig without `impact`. n = 3, the same 6 tasks, then grow to 20 only if the signal is clear. Budget cap: $1,500,
  stopping early when the cost per arm projects over it.
- Run `npm run e2e` live ≥ 5 times and triage every alert into `triage.json`; set `journey-baseline.json` from it.

**Exit:** rig shows fewer escaped defects than bare Sonnet + superpowers, by more than run-to-run noise, at ≤ 3x its $ per accepted
task. Then tag the winning configuration as the first **stable** release, and run the adoption gate
(`2026-11-11-rig-readiness-and-adoption.md` §3b) on everything after it. **Kill:** no lift → cut to the floor (sensors, git hooks, CI,
approvals) plus whichever parts the ablation shows earn their cost, and publish the negative result.

### Phase 4 (weeks 8–12): speed, and the reviewer's surface

Only what Phase 3 kept.

- **Parallel intents.** Intents with no dependency and disjoint computed blast radius run at the same time, one worktree and one
  Sonnet implementer each, in Kiro-style waves from `implementation-plan.md`. Each still opens its own PR. Concurrency is capped
  in `sensors.json`. **Exit:** a 5-intent sprint goes from chart to last PR in under 2 h wall time and under $15, with no rise in
  escaped defects.
- **Fewer questions.** The BA answers at chart. `/rig:start` on a charted intent asks nothing (already true when `settled: yes`),
  and ad-hoc work gets at most 3 questions in one batch.
- **Haiku where it fits:** scouts, map node descriptions, PR-body drafting, turning sensor output into a fix list, the e2e actor.
- **One generated HTML page per gate**, published as a CI artifact and linked from the PR:
  - chart page: the ledger as a filterable table (PRD quote → intent → behaviours → cases → data → holdout), with filters for
    "agent supplied", "not covered" and "weakened", and a per-row Right / Wrong / Not sure stored in the approval row;
  - PR page: the diff annotated per hunk with the behaviour it serves (test → behaviour map plus graph edges), the impact list,
    the evidence and the C6 questions. A hunk that serves no behaviour is flagged.
- **Verifier pass on review findings** (Anthropic's vote, one cheap pass): only confirmed findings block. Turn `reviewcases` into a
  CI eval with a recall threshold and publish precision and recall per release.
- **Breaker on every tier.** Extend the existing revert breaker (`scripts/reverts.ts:42`, tier 0 only) with an incident-rate input
  and let it raise required approvals on tiers 1 and 2. That is the safe route to relaxing `everyTier` later.

**Exit:** in a pilot, median human review time per PR falls (`report --github`) while the seeded-defect catch rate does not.

### Phase 5 (quarter 2): mass adoption

- **Distribution.** After Phase 3 passes, submit to the official plugin marketplace with `--scope project`. Consider Tessl's registry
  as a second channel for the skills and their evals.
- **Floor as a product.** The deterministic floor (sensors, git hooks, `rig-check`) judges any editor. Package it on its own so teams
  on other agents adopt the floor first.
- **Beyond GitHub.** A GitLab CI and Azure DevOps version of `rig-check` and the approval check (today `gh` only).
- **Integrations, with a threat model.** PRDs in from Jira, Linear, Confluence and Google Docs over MCP. They are untrusted input:
  the evaluator already reports injection-shaped text, and the chart must treat imported PRDs the same way. Telemetry stays opt-in
  and counts-only, like `human.jsonl`, with the data flows written down.
- **Docs.** A one-page quickstart, a 10-minute video of one brownfield change, the public reference repo with recorded sprints, and
  the eval results page, updated each release.
- **Release train.** One stable minor per quarter with a migration. Re-baseline the evals at every model release, since aliases such
  as `opus` drift. Run ablation and delete what the new model no longer needs.
- **Bus factor.** A second maintainer and a written support and upgrade policy before any external team depends on it.

**Exit:** three external teams run a full sprint on their own code with no help, and two keep using it.

## 6. Sensors worth adding (deterministic, zero tokens)

Already shipped in all 8 packs, so not listed here: `sast` (semgrep), `audit`, `duplication` (jscpd), `layers`, `coverage`,
`mutation-diff`.

| Sensor | Cadence | Tooling | Catches |
|---|---|---|---|
| `impact` | plan, ship | `sdlc map` graph | undeclared blast radius |
| `affected-tests` | turn | graph | breaks found fast in large repos |
| `complexity` | edit | eslint `complexity`, radon, gocyclo, or lizard for any stack | SRP drift that size misses |
| `dead-code` | ci | knip, vulture, deadcode, `cargo udeps` | leftovers from agent rewrites |
| `api-diff` | ci | api-extractor, `cargo semver-checks`, japicmp, oasdiff | unplanned contract change |
| `adr-conformance` | plan, commit | dependency-cruiser and semgrep rules generated from ADRs (forbidden imports, required wrappers) | code contradicting an ADR |

Also: pin the semgrep ruleset, and make `audit` blocking for new high-severity findings (knownRed keeps old ones warning).
Each new sensor ships with knownRed baselining, a guide sentence and a fixture that fails without it, and goes through the adoption
gate: it must show a catch on the eval set or it is not added.

## 7. What not to do

- Do not build a search index for the wiki. Native Read/Grep already tied; build the graph instead.
- Do not raise caps to make a check pass.
- Do not freeze a "stable" release before Phase 3 shows a lift.
- Do not relax `everyTier` on client work until the breaker covers every tier.

## 8. Decisions for you

- **D1 Brief vs cost.** Your brief asks for an agent review and a security review on every PR, a human on every PR, and an evaluator
  on every step. Today's defaults gate the first two by tier, leave the third opt-in and skip the plan evaluator on light changes.
  Recommended: make your brief the client default, run the tier-gated version as an eval arm, and let Phase 3 decide whether the
  skipped reviews ever caught anything.
- **D2 Evaluator model.** Opus 5.5 or Fable 5.2 as `evaluate`. Recommended: both as arms in Phase 3; pick on escaped defects per
  dollar.
- **D3 Reference repo.** A public project (cheaper, publishable) or a past client codebase (closer to real, unpublishable).
  Recommended: public.
- **D4 Phase 3 kill rule.** If rig does not beat bare Sonnet + superpowers on escaped defects, cut to the floor and publish? Recommended:
  yes.

## 9. Independent review

A Fable 5.2 evaluator read the first draft and the repo (read-only) and returned `changes-needed` with 13 findings. Applied:
- `sast`, `audit` and `duplication` already exist in all packs, so they were removed from §6 (they had been wrongly listed as
  missing);
- #9 and #10 regraded to Partial (tier-gated reviews), #8 to "Strong only with `everyTier`" and #11 to Partial (the roles do not
  drive the agents);
- SHA-bound approvals, merge-queue handling and the revert breaker are marked as existing;
- the Phase 0 profile contradiction is fixed (`core` drops the outer loop);
- the phases are reordered: measure first, freeze only after a lift;
- the Phase 1 and 3 budgets are capped;
- the cost multipliers and the commit, line and tag counts are corrected;
- added: test-data traceability, the GitHub-only gating, the PRD import threat model, monorepo limits, model alias drift, bus
  factor and a kill rule per phase.
