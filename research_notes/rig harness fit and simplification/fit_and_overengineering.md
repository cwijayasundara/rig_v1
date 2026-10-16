# rig harness: fit for purpose and over-engineering, mapped to the four reference sources

Method note: source quotes below come from WebFetch (a summarising model), so quotes are as returned by the fetcher, not verified verbatim against the pages. All four URLs fetched successfully; no mirrors needed. Repo paths are relative to /Users/chamindawijayasundara/Documents/learning_101/rig_v1 (repo snapshot: branch e2e-live-under-20min, 596 commits, 2026-10-03 to 2026-10-16, plugin 0.6.0).

Sources:
- [AI-native SDLC playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) (P)
- [Harness engineering](https://martinfowler.com/articles/harness-engineering.html) (H)
- [Sensors for coding agents](https://martinfowler.com/articles/sensors-for-coding-agents.html) (S)
- [Are harnesses worth the cost](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html) (C)

## Which components would the four sources actually ask for, and which are inventions?

### Takeaway
The sources ask for: a short CLAUDE.md, plan-then-build, a few advisory skills each backed by a deterministic hook, fast computational sensors in-session, one verification gate, a human release gate, and a steering loop that improves the harness when mistakes repeat. rig contains all of those (its core is genuinely source-aligned), but it surrounds them with roughly 7,100 lines of scripts for things no source requires: tiers, story points, spend budgets with downshift, a sprint "chart" outer workflow, a TUI mission-control, a wiki and a memory plugin, and 5 CI workflow templates. Inference: about 55-65% of the non-test code is process/UI/telemetry the sources do not ask for.

### Cited Findings
Sizes (measured, `wc -l`): non-spec `scripts/*.ts` 7,125 lines (41 files; `scripts/check.ts` 466, `core.ts` 500, `sdlc.ts` 500, `model.ts` 452, `sensors.ts` 385, `hooks.ts` 363, `metrics.ts` 336, `spend.ts` 330, `pr.ts` 306, `preflight.ts` 305); spec files 10,149 lines across 52 files (`scripts/*.spec.ts`); `skills/*/SKILL.md` 22 files, 595 lines; `hooks/*` mod 715 lines; `agents/` 5 files; `templates/` 17 files (CI workflows `rig-review.yml` 154, `rig-watch.yml` 217, `rig-spec.yml` 137, `rig-triage.yml` 103); `brain/` plugin src 3,086 lines + 1,549 spec lines; `tests/e2e` 1,565 lines of .mjs. `scripts/size.spec.ts` caps the harness at 11,000 lines ("the harness is at most 11000 lines"), CHANGELOG notes the cap was once 6,060 (it has since grown).

Component-by-component table (verdict key: CORE = sources ask for it; OPT = useful but optional; INV = invention, no source requires it; DUP = duplicates a native feature):

| Component (path) | What it does | Principle that justifies it (source) | Verdict |
|---|---|---|---|
| Stop/PostToolUse gate: `hooks/hooks.json` -> `scripts/sdlc.ts hook stop/post-edit`, `scripts/check.ts`, `scripts/sensors.ts` | Runs fast commands (typecheck/tests) on the turn's diff, secret scan, blocks the turn on failure | S: "Sensors that run continuously alongside the agent to provide fast feedback"; P: "Always give Claude a way to verify its own work"; P: hooks are "the deterministic layer" | CORE |
| Test-tamper / suppression sensors (`TAMPER_PATTERNS`, `SUPPRESSIONS`, `loweredThresholds` in `scripts/sensors.ts`) | Block skipped tests, lowered coverage thresholds, `@ts-ignore` | P: "protect tests from being edited during fixes"; H: feedback so the agent does not repeat mistakes | CORE (the clearest source match) |
| Permission deny/ask rules for evidence files (`templates/settings.json`, 25 deny rules) | Stop model editing `.rig/*` evidence | P: hooks/permissions as deterministic layer | OPT (needed only because rig invents evidence files) |
| Verification before "done": `scripts/verify.ts`, `scripts/runs.ts`, `skills/test/SKILL.md`, stamp/`.gate` | Records test runs, writes `verification.md`, refuses ship on stale stamp | P: "Make 'done' include passing checks"; C: "one final verification gate" for frontier models | CORE (but the stamp/recorder machinery is heavier than needed; `npm test` in a Stop or pre-push hook gives the same) |
| `skills/start`, `intent`, `design`, `spec`, `plan` + `templates/*-format.md` | Capture intent.md, design.md/plan.md with gates | P: "Intent is captured once ... as a version-controlled artifact"; "Nothing is implemented without an accepted plan"; "Requirements and design collapse into one session" | CORE idea, DUP in practice: Claude plan mode / superpowers brainstorming + writing-plans do this; rig has 5 skills where P collapses to ~2 (intent+plan) |
| `skills/build`, `test`, `agents/implementer.md` | Slice loop, per-slice record, fix rounds capped by ratchet | P: plan then build; H: feedback loop | DUP: superpowers executing-plans / TDD / `/goal`; the ratchet (`scripts/ratchet.ts` 186, `runs.ts`, `checkpoint.ts`) is rig-specific bookkeeping |
| `skills/pr`, `pr-review`, `agents/reviewer.md`, `workflows/review.js`, `templates/rig-review.yml` (154 lines) | Ship gate, PR, review with confidence >= 80 filter, referee | P: "Claude both gives and receives reviews"; "Findings do not approve or block a PR on their own" | OPT / DUP: built-in `/code-review`, `/security-review`; rig's reviewer *blocks* via ratchet, which P says findings should not do on their own |
| Human gates: `/rig:approve`, `/rig:waive`, approval digests (`scripts/core.ts`, `gate` logic) | Hash artifacts, stale approval on edit | P: "The agent does everything up to the production gate and nothing past it"; "Keep code-owner approval required" | CORE (release gate) but over-extended: P wants one production gate + CODEOWNERS; rig adds design/spec/plan/chart/tier/impact/budget approvals |
| `rig-check` CI + base-branch checker (`templates/rig-check.yml`) | Recompute verdicts in CI from the base branch's config | P: branch protection is the boundary; H: constraints at the right layer | CORE |
| `guides/engineering.md`, `testing.md`, `contracts.md` path-injected on first touch | Feedforward rules | H: guides are feedforward, "steer the agent before it acts"; P: CLAUDE.md "under a page" | CORE-ish; DUP of path-scoped CLAUDE.md rules/skills |
| Tiers S/M/L, type x tier routing (`scripts/routing.ts` 110, `levels.ts`, tier sensor in `sensors.ts`) | Ceremony scaled by risk, picks model per role | None of the four sources mention tiers. C supports choosing model/harness weight by model grade | INV (tiers) / OPT (model routing; Claude Code subagent `model:` field + CLAUDE.md table does it) |
| Spend governance: `scripts/spend.ts` 330, `metrics.ts` 336, `scorecard.ts`, `timing.ts`, `points.ts` (story points), `refs/rig/spend` git ref, budgets, downshift | Team/month budgets, cost per point | C reports cost but prescribes no budget system. P lists metrics only loosely | INV (the author's own cost pain; a `/cost` habit plus one pinned model would do) |
| Sprint chart: `skills/chart`, `architecture`, `decompose`, `testplan`, `scripts/chart.ts`, `chartcheck.ts`, `inbox.ts`, `templates/prd-format.md` etc. | PRD -> architecture, ADRs, intents with `depends`, test plan, trace report, one chart approval | P: "The product owner reviews that spec, but doesn't write it" (only loosely) | INV / OPT (a planning product layer, not a coding harness) |
| Mod UI: `hooks/band.tsx`, `mission.tsx`, `register.ts`, `shared.ts` (715 lines), `/rig:map`, `/rig:status`, `/rig:story`, `/rig:run` | Subway-map band, gauges, sparklines | No source asks for a UI. README itself says "nothing essential depends on the optional mod" | INV (self-declared non-essential) |
| `scripts/preflight.ts` 305, `toolchain.ts`, `initbaseline.ts`, `vendor.ts` 165, `githooks.ts` 175, `skills/init` (60 lines) | Host readiness probes, vendoring standalone copy, git hooks | S: "a pre-commit hook can be a good way to force a sensors check" (githooks only) | githooks CORE; preflight/vendor/toolchain OPT |
| Quality/ratchet/levels/scopes: `quality.ts` 176, `ratchet.ts` 186, `scopes.ts` 110, `stale.ts`, `shards.ts`, `basetree.ts`, `affected` sparse base | Compare lint/type/audit counts to base, monorepo scoping | S: sensors on a "slower cadence to detect drift"; H: keep quality left | OPT (drift sensors are source-aligned; the sparse-checkout base measurement is engineering for a monorepo case) |
| Evals: `scripts/evals.ts` 174, `skills/diagnose` incident->eval, `rig-watch.yml` 217 (control-band / Western Electric rules, `docs/ai-sdlc-map.html`) | Incident-to-eval, post-deploy monitoring | P: "Monitoring can trigger new work. Findings re-enter the loop as new intent" | OPT (maintain stage; P asks for the idea, not a 217-line workflow) |
| `rule` skill + `rules.json`; `incident`, `next`, `metrics`, `sensors`, `prototype`, `codebase-design` skills | Regex rules, incident records, router, metrics | H: "iterate on the harness" when issues recur | `rule`: CORE (steering loop). `next`: only needed because of the state machine. `prototype`/`codebase-design`: DUP of vocabulary skills; OPT |
| `agents/scout.md`, `researcher.md` (haiku) | Cheap read-only search | P: subagents "scoped helper with its own context window"; CLAUDE.md role table | DUP: built-in Explore agent |
| `agents/architect.md`, `reviewer.md` (opus) | Plan and review on Opus | C: stronger model only where it pays | OPT; Claude Code `Plan` agent and `/code-review` exist |
| `brain/` plugin (3,086 src + 1,549 spec lines): code_wiki, memory (`memory/dream.ts`, `capture.ts`, `trigger.ts`) | DeepWiki-style wiki; "dream" memory distillation | None of the four sources. H mentions only generic guides | INV + DUP: Claude Code auto-memory (`~/.claude/projects/.../memory/MEMORY.md` is in use in this very repo), CLAUDE.md, `/init`. brain/README states its own kill rule: "If memory does not help on at least 4 of 5 tasks, drop its SessionStart hook" |
| 5 agents + 22 skills + 7 hook entries (`hooks/hooks.json`: UserPromptSubmit, Stop, SessionStart, PostToolUse, SubagentStart, SubagentStop, PostToolUseFailure) | Wiring | P: hooks "keeping them fast and scoped" | Stop+PostToolUse are CORE; Subagent{Start,Stop} async lane hooks exist only for the band's timing UI (INV) |
| e2e suite `tests/e2e` + `run.mjs` (live ~14-16 min, ~$1.20) | Installs rig into a sandbox, drives a shop-app build | H: sensors that never fire may mean "weak detection" so exercising them is sound | CORE as a test of the harness itself, but it tests rig's process (phases s0-s5 including wiki/evals), not output quality |

### Inferences
- Of the 22 skills, ~6 map directly onto the playbook stages (intent, design/plan, build, test, pr, pr-review); the other ~16 are routing, chart, ops, or vocabulary. (Inference from the skill list in `skills/` vs P's six stages.)
- The "five things" rig says it owns (`README.md` line 135: "artifact chain ... human gates, guardrails, routing and budgets, measurement") exceed what the sources prescribe; only guardrails and a thin artifact chain are required.
- The README claims "thin control layer" while the repo carries a stated 11,000-line production cap and 10k lines of specs; by Fowler's usage (C does not call its own harness thin; it "describes a substantial setup") "thin" is the author's word, not the source's.

### Gaps
- I did not read every script body; verdicts on small scripts (`stale.ts`, `shards.ts`, `slices.ts`, `points.ts`) rest on names, size, and README/DESIGN descriptions.

## Where does rig re-implement what Claude Code or superpowers already provide?

### Takeaway
Roughly half of the lifecycle skills and a third of the scripts duplicate native features: plan/spec/design vs plan mode and superpowers brainstorming/writing-plans; build/test vs executing-plans/TDD/verification-before-completion; review vs `/code-review` and `/security-review`; band/map vs the status line and mod API; brain memory vs auto-memory; scout vs Explore. The repo's own CLAUDE.md already admits superpowers is the thing used to build rig itself.

### Cited Findings
- rig's own CLAUDE.md: "rig is **not** enabled on its own repo ... superpowers routes the work." The author builds the harness with superpowers, not rig (`CLAUDE.md`).
- DESIGN.md principle 1: "Thin layer, built-ins first. Own five things ... Plan mode, `/code-review`, `/security-review`, `/goal` and worktrees are Claude Code's." (`DESIGN.md` section 2) yet rig ships its own `pr-review` + `agents/reviewer.md` + `workflows/review.js` + `rig-review.yml`, and its own plan/spec/design skills and templates.
- `.claude/settings.json` in this repo pins `"model": "sonnet"` and `ENABLE_STOP_REVIEW=0`, i.e. native settings do the routing and review-throttling work here.
- `docs/proposals/2026-10-08-why-slow-and-the-fix.md` section 3.2 recommends building rig with superpowers `executing-plans` and one `/code-review`; section 3.2 says that "is rig's own `build` rule for tiers S and M" (so the author already sees the two as equivalent).
- Duplicate map: `skills/plan|spec|design|intent` <-> plan mode + superpowers:brainstorming/writing-plans; `skills/build` <-> superpowers:executing-plans, subagent-driven-development, test-driven-development; `skills/test` <-> superpowers:verification-before-completion; `skills/pr-review`, `agents/reviewer.md` <-> `/code-review`; `skills/diagnose` <-> superpowers:systematic-debugging (rig even says it folded "diagnosing-bugs feedback loop" in, commit 9b962dd); `skills/prototype`, `codebase-design` <-> generic design vocabulary skills; `agents/scout` <-> Explore agent; `hooks/band.tsx` + `mission.tsx` <-> status line / `/cost`; `brain/memory` <-> auto-memory + CLAUDE.md + `/init`; `scripts/context.ts` <-> `/context` and `/compact`.
- Things not natively provided (genuine value-add): path-triggered guide injection on first touch, test-tamper/suppression/threshold-lowering sensors, evidence deny rules, base-branch CI checker (`rig-check`), human-only approve/waive skills with staleness hashing.

### Inferences
- Because rig is explicitly not used on its own repo, the author has had no dogfooding feedback on whether rig's own build/plan skills beat superpowers (inference from `CLAUDE.md` and memory note "No dogfood on the harness repo").

### Gaps
- No side-by-side of rig's plan/build skills vs superpowers on the same task exists in the repo.

## Does rig enforce what the Fowler articles say matters, or add process artifacts?

### Takeaway
Enforcement of fast computational sensors, deterministic hooks, constraints-in-CI and verification-before-done is real and strong. But the enforcement surface is dominated by process artifacts (intent.md, tiers, change records, approvals, ratchet.json, events.jsonl, ship.json, STATE.md, spend ledgers) that no source requires, and the one thing C says is the cost driver (continuous harness on a strong model) is exactly rig's default design.

### Cited Findings
- H: "Computational checks (tests, linters, type checkers) are 'deterministic and fast, run by the CPU'"; inferential ones "slower and more expensive". rig matches: `hooks/hooks.json` has no model-calling hook ("No hook runs on Bash"; `DESIGN.md` principle 5 "Deterministic checks decide; models advise"). Strong alignment.
- H: "Run fast checks before integration and expensive ones after" (keep quality left). rig: `fast` vs `full` commands in `.rig/sensors.json`, Stop-gate on diff only, `verify` stamp at ship, CI recompute. Aligned.
- S: noise and "feedback overload for the agent" can cause "over-engineered refactorings"; sensors need suppression. rig has `waive`, `fixtures`, reasoned suppressions (`REASONED` regex in `scripts/sensors.ts`). Aligned, but rig adds many sensors (size, layering, tier, scopes, quality counts, contract consumers, test-tamper), raising the noise risk S warns about. Whether they are noisy is not measured in the repo (inference).
- S: "Sensors that run on a slower cadence to detect drift"; rig `rig-watch.yml`, `quality.ts`, `ratchet`. Aligned.
- H: "should not necessarily aim to fully eliminate human input ... direct human attention to where it matters". rig adds human gates for design/spec/plan/chart/tier/impact/budget/waive, so its human attention is spread across many gates (inference; compare README "Which gates a change actually meets", S none, M design, L spec+plan+design).
- P: "Findings do not approve or block a PR on their own." rig's ratchet makes reviewer findings block slices and PR nodes (`skills/build/SKILL.md` "loops implementer -> sensors -> reviewer until no critical or high finding remains"), a stronger stance than P.
- P: "Keep it under a page" for CLAUDE.md; rig's per-session load: 22 skill descriptions (4,718 chars of description lines) plus 5 agents, plus on first touch of source the 29-line `guides/engineering.md` etc.; each invoked skill is 17-60 lines but each repeats ~6 lines of boilerplate (`allowed-tools` with the long `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts` prefix repeated, the "Models:" paragraph copied verbatim into build, test, plan, etc.). The long command prefix appears ~10+ times in a single skill (`skills/build/SKILL.md`).
- H: "Sensors cannot guarantee correctness when the human has not clearly stated what they want." rig's answer is intent/spec artifacts, which is source-aligned, but then multiplies them (intent, design, spec, plan, chart, testplan, ADR, PRD).
- DESIGN.md section 4 describes plans with "no code" and 120-line status warnings: bounded-context discipline backed by a measured finding (880 KB of plans for 12.8k LOC), a good local steering-loop example (H: "iterate on the harness").
- v3 notes in `ROADMAP.md`: wiki and learn loops were "built, then removed ... to keep the harness lean", then the wiki returned as `brain/`. The author has already cut once and re-added; "learn" has the entry test "at least 30 shipped changes" and the repo "had one" (`ROADMAP.md`).

### Inferences
- rig's core gate (Stop hook + secret/tamper sensors + CI recompute) could be ~1,500-2,000 lines; the remaining ~5,000 lines of scripts are state-machine, budgets, scoring, scopes (inference from file sizes above).
- Because skills are "advisory" (P) and rig's skills are long procedural instructions to run ~15 different `sdlc.ts` subcommands, compliance depends on the model following precise multi-step text. The CHANGELOG is full of fixes of the form "the model rewrote X / ended turn early / ran on wrong branch / found by the live e2e" (e.g. entries on `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`, `sdlc/<slug>` branch, `## Files` table), which is evidence that process complexity itself generates failure modes that need more harness to fix.

### Gaps
- No sensor false-positive/noise rate is recorded anywhere I found.

## Evidence of cost in the repo

### Takeaway
The "$1k and 3 hours per change" was not caused by rig's hooks; the repo's own proposal shows it came from global plugins (security-guidance Opus review on every Stop, 20 user-scope plugins, 57k-token system prompt) and an SDD subagent loop on an Opus coordinator. rig's remedies are mostly settings and discipline that need no harness. But rig itself is a large artifact whose build consumed that spend, and its own runtime overhead is non-trivial in design (many state files, ~$1.20 / 14-16 min per live e2e on Haiku).

### Cited Findings
- `docs/proposals/2026-10-08-why-slow-and-the-fix.md` section 1: recorded spend "$878 (31 sessions)" main plus "$119 (688 sessions)" background = ~$997; Opus 5.5 share "$679 of $997 (68%)"; a single build session "$30.75, 2h51m", 22 subagents, mean context 249k tokens, system prompt 56.7k tokens before work.
- Same doc: "The rig plugin's own hooks are not the cause." Root causes: security-guidance Opus reviews (119, 92, 23, 131, 75, 100 sessions on successive days), SDD loop with `SendMessage` hand-backs re-firing Stop hooks, 20 user-scope plugins, `harness@harness-local` (a different harness plugin) also enabled.
- Same doc, section 2.6: rig's Stop hook costs "seconds, not dollars" (no model call).
- `DESIGN.md` section 1: earlier "Prism" build cost "$525-554 for 785M tokens", 57% of spend was cache reads of long contexts; spend on turns >150k context was 50%; "Opus subagent vs Sonnet subagent, per run: $2.83 vs $0.36"; "Plans written ... 880 KB for 12.8k LOC".
- `CLAUDE.md` of this repo: "one week of building this repo cost $1k and 3 hours per change" and target "at most 4 subagent launches, under 45 minutes, under $8" per Spec-2-sized change.
- `CHANGELOG.md` (Unreleased): "Timed live runs: 16.0, 15.1 and 13.8 min, about $1.20 each" for the e2e on `claude-haiku-5-5`; default time budget 20 min (`run.mjs --minutes`).
- `package.json` `npm test` chains: all spec files, mod typecheck, e2e unit, e2e fast scripted, `claude plugin test .`, and `npm run test:brain` (which does `npm ci`).
- Hook counts (rig core, `hooks/hooks.json`): 7 event registrations; synchronous per turn: UserPromptSubmit, Stop (90 s timeout), SessionStart (10 s), PostToolUse on Write|Edit|MultiEdit (15 s). With rig-brain enabled, `brain/hooks/hooks.json` adds 2 commands each on SessionStart, UserPromptSubmit, PostToolUse(edit), Stop plus Bash PostToolUse and PostToolUseFailure = 10 hook commands, each a Node process spawn. Combined: up to ~14 hook command spawns across a turn with edits.
- Context load: ~595 lines of skill text exist; skill descriptions alone are 4,718 characters (about 1.2k tokens) always in the listing; plus agent listings; skill bodies load on invocation (each repeats the ~25-token `sdlc.ts` path many times).
- C: harness overhead is real: for Sol (stronger model) the harness "used about 10.5 times as many tokens, took nearly 3 times as long, and cost about 7 times more" with no acceptance change; recommendation: "one final verification gate" for frontier models. [Source C](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html)

### Inferences
- The proposal is an honest diagnosis: the headline cost is plugin hygiene, not harness design. But the line "it exists because one week of building this repo cost $1k" in `CLAUDE.md` conflates building the harness with running it; no evidence in the repo gives rig's per-change run cost on a target repo other than the $1.20 e2e (inference).
- Per-change artifacts mean extra tokens: every skill ends with "run `sdlc.ts next --json`" and parses output, adding tool-call round-trips even though scripts are free (inference from `skills/build`, `test`, `plan`).

### Gaps
- No measured per-change token/dollar cost of rig-on vs rig-off on a real repo; `metrics` exists but headless runs "record usd 0" (`DESIGN.md` section 7).

## Is there evidence the harness improves output quality (a Haiku-vs-Opus style effect)? What is the smallest harness delivering the SDLC loop and sensors?

### Takeaway
No. I found no baseline-vs-harness comparison anywhere in the repo. The e2e tests check that rig's process runs to completion and that a hidden acceptance suite passes, but with rig always on, so they cannot show a lift. The only quality-uplift evidence is Fowler's (C), and C itself says it should not be generalised and that a strong model gets no benefit.

### Cited Findings
- C: "Luna went from '3 of 10 unharnessed runs' to 'all 10 with the harness'"; for Sol "all 10" with or without; harnessed Luna "33% less per run ($0.273 vs $0.406)" than unharnessed Sol. The article presents this as "a hypothesis" about "smaller, cost-optimized models".
- C limitations: "10 paired runs per model on 1 greenfield Java service"; costs "exclude the upfront effort of authoring, reviewing, and maintaining the contracts, examples, assertions, and harness"; it "cannot isolate their individual contributions" of guides versus sensors.
- C's harness was contracts/API specs/examples/mock-based contract checks. rig's own `docs/superpowers/specs/2026-10-15-lite-behavioural-harness-design.md` cites this ("33% less per run than an unharnessed frontier") and added an opt-in `behavioral` block (`CHANGELOG.md`). That one feature is the piece most directly derived from C, and it is opt-in, with "no new dependency, skill, agent" (plan `docs/superpowers/plans/2026-10-15-lite-behavioural-harness.md`).
- The e2e default live model is `claude-haiku-5-5` (`CHANGELOG.md` e2e entry; `tests/e2e/run.mjs`), the closest the repo gets to a "small model + harness" claim. The hidden acceptance test is `tests/e2e/acceptance/shop.mjs`. grep for "unharnessed", "baseline run", "without the harness", "lower-grade" across `README.md`, `DESIGN.md`, `ROADMAP.md`, `CHANGELOG.md`, `docs/`, `tests/e2e/lib`, `brain/evals` found only the citation of C above. No run with the harness removed exists.
- The only A/B-shaped evals are rig-brain's: `brain/evals/wiki-search.json` ("Paired runs (with the wiki index injected vs without) ... if the index does not cut Glob/Grep calls on at least 4 of 5 questions ... remove the UserPromptSubmit hook") and `brain/evals/memory-recall.json`. Defined, but I found no recorded results in the repo (inference from absence in file listing; `tests/e2e/phases/s5-wiki-evals.mjs` only builds/seeds them).
- `tests/fixtures/live-trial/runs.jsonl` is a record of one 2026-10-03 trial's test runs (failing assertions), not a comparison.
- H: "A sensor that never fires may mean either high quality or weak detection" - rig has e2e assertions for hook behavior (`tests/e2e/assert/hooks.mjs`), partially addressing it.
- C on Sol: running the harness throughout "added overhead without a detected acceptance benefit"; recommends a final gate for frontier models. rig's defaults run the whole pipeline continuously even on Opus tier L.

### Inferences (smallest harness that still delivers the SDLC loop + sensors)
Proposed minimal core, estimates are mine from file sizes:

KEEP (about 2,500-3,500 lines total after trimming):
1. `CLAUDE.md` template under a page (P) plus 3-4 path-scoped guides (`guides/engineering.md`, `testing.md`, `contracts.md`; ~80 lines).
2. One hook set: `hooks/hooks.json` reduced to `Stop` (+ optional PostToolUse edit) calling a slimmed `scripts/check.ts` + `scripts/sensors.ts` + `scripts/model.ts` config parse (fast command, secret scan, test-tamper, suppressions, threshold-lowering). Roughly 1,200 lines from today's check/sensors/model/hooks/core.
3. Git hooks (`scripts/githooks.ts`, 175 lines) and CI `templates/rig-check.yml` (49 lines) with base-branch checker, for the "local equals CI" backstop.
4. Verification gate: keep `scripts/verify.ts` (126) + `runs.ts` (100), drop stamp/shards/scopes if not monorepo.
5. Human gates reduced to one approval before build and the merge (P's plan gate and production gate): keep `approve`/`waive` skills and digest logic from `core.ts`.
6. Skills reduced to about 6: `start` (intent+plan), `build`, `test`, `pr`, `rule`, `init`. Use native `/code-review` for review and plan mode for planning.
7. Optional behavioural block (from C) for small-model repos.

DELETE or move out of core (estimated lines removed from non-spec production code):
- `brain/` entirely (wiki + memory): ~3,086 src + 1,549 spec = ~4,600 lines; replace with CLAUDE.md + auto-memory.
- Mod UI: `hooks/band.tsx`, `mission.tsx`, `register.ts`, `shared.ts`, `driver.ts`, `gates.ts` (715 lines) and `types/index.d.ts`; drop SubagentStart/Stop hooks.
- Spend/metrics/scoring: `spend.ts` 330, `metrics.ts` 336, `scorecard.ts` 106, `timing.ts` 30, `points.ts` 63, `context.ts` 81, `stale.ts` 59 = ~1,000 lines; use `/cost`, one pinned model in `.claude/settings.json`.
- Chart/sprint layer: `chart.ts` 93, `chartcheck.ts` 83, `inbox.ts` 115, `skills/{chart,architecture,decompose,testplan}` (~134 lines), format templates: ~450 lines.
- Routing/tiers: `routing.ts` 110, `levels.ts` 34, tier sensor parts, `ratchet.ts` 186, `checkpoint.ts` 61, `slices.ts`/`slicecheck.ts` 56: ~450 lines. Replace by a model table in CLAUDE.md (already done in this repo's `CLAUDE.md`).
- Scopes/sparse base/preflight/toolchain/vendor/initbaseline: `scopes.ts` 110, `basetree.ts` 66, `shards.ts` 48, `preflight.ts` 305, `toolchain.ts` 98, `vendor.ts` 165, `initbaseline.ts` 55: ~850 lines (keep only if monorepo/standalone installs matter).
- Maintain/ops: `rig-watch.yml` 217, `rig-triage.yml` 103, `rig-spec.yml` 137, `rig-rehearse.yml` 30, `watch.ts` 89, `evals.ts` 174, `skills/{incident,metrics,next,diagnose,sensors,pr-review,prototype,codebase-design}`: about 900 lines (scripts/workflows) + ~190 lines of skill text.
- Duplicated agents: `scout`, `researcher`, `architect`, `reviewer`, `implementer` (115 lines): use built-in Explore/Plan/general-purpose agents.
- Matching specs would shrink proportionally: about 6,000-7,000 of the 10,149 spec lines.

Estimated net: production scripts 7,125 -> ~2,000-2,500 (removal about 4,600-5,100 lines), skills 595 -> ~200 lines, mod 715 -> 0, brain ~3,086 -> 0, templates ~800 -> ~250. Total removal on the order of 9,000-10,000 production lines and 6,000-7,000 spec lines. These are estimates (inference), not measured.

Replace with native: plan mode and superpowers brainstorming/writing-plans for plan/spec/design; superpowers executing-plans + TDD + verification-before-completion for build/test; `/code-review` + `/security-review` for review (already the repo's own CLAUDE.md rule); `/context` + `/compact` + `/cost` for context/spend; auto-memory/CLAUDE.md for memory; worktrees for branch isolation.

### Gaps
- To justify any of rig's uplift claim, the author needs a small A/B: same task set, Haiku with and without rig's guides+sensors vs Opus bare, like C's paired runs (10 runs per arm, a hidden acceptance suite, tokens and cost recorded). The repo already has the pieces (`tests/e2e/acceptance/shop.mjs`, scripted/live drivers). Not found: any run of that kind.
- C's own caveat applies: one greenfield Java service, 10 runs, so even a replicated result is weak evidence.
- Whether the sprint chart, tiers, or budgets improve outcomes for a team cannot be judged from the sources; they are product decisions, not harness-engineering requirements.
