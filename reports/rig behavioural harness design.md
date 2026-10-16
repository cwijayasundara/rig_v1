# Rebuilding rig around contracts, not process

The behavioural harness Naresh Jain describes is small and specific: an application brief, machine-readable contracts with examples, a contract-test command the agent runs itself, and a hidden acceptance suite that judges the result. rig already holds about a third of it, namely the opt-in `behavioral` block (`validate`, `run`, `files`, `cadence`), its test-tamper and harness-tamper sensors, and a hidden shop acceptance test. rig lacks the three things that make the harness work. It has no contract tooling, so `validate` and `run` are whatever shell commands a repo writes. It has no brief template and no guide-sensor sync rule that a machine can check. It has no evaluation harness, so nothing shows that any of it lifts a Claude model. The recommended plan keeps the guardrail core and replaces the tier, change-record, spend, UI and brain layers with one vendored script (`.rig/bin/rig.mjs`), one registry (`.rig/sensors.json` in which every sensor carries its own guide sentence), three hook entries, a base-branch CI check, and a roughly 300-line eval runner. Cadence is set by model grade: Haiku and Sonnet get continuous sensors, Opus gets one final gate, and CI always runs everything. This is a judgment call, because Jain's evidence covers two OpenAI models on one Java task, and the eval runner is the condition for shipping any of it. Estimated size is 1,000 to 1,300 lines of runtime script, against about 7,100 lines of harness TypeScript plus 3,086 lines of `brain/` today (this and all rig measurements below are from earlier notes in the repo at branch `e2e-live-under-20min`, not independently re-measured here).

## How Jain's harness is built, and what it does not publish

Jain's study ran 10 paired runs per model, with and without a harness, on one greenfield Spring Boot backend-for-frontend, and scored every attempt against **178 hidden functional checks** ([Fowler, Are harnesses worth the cost?](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html)). The harness has four parts. The first is the application brief, roughly 1,300 to 1,500 words. It covers context and intent, out-of-scope items, an orchestration diagram and responsibilities table, technology constraints, the client HTTP interface (exact operations, status codes, shared shapes), the downstream API, the Kafka message interface, resiliency rules, the timeout default, and the required tests ([application brief](https://martinfowler.com/articles/are-harnesses-worth-the-cost/application-brief.html)). It also carries explicit non-goals such as "Do not add operations or response statuses not listed here."

The second part is the guides. The agent receives the brief, baseline repo instructions, OpenAPI specs for both HTTP boundaries, an AsyncAPI spec for the Kafka events, request-response examples for timeouts, malformed payloads, retries and Kafka acknowledgements, an API-development skill, and helper scripts for scaffolding evidence and for build and test commands. The third part is the sensors: Specmatic generates contract checks "deterministically from supplied specifications," stands in for the downstream API and the broker so failures and recovery sequences can be injected, and returns test results, CTRF reports and API-coverage reports to the agent. The skill tells the agent to preserve those inputs, investigate failures, and correct "the implementation or execution setup rather than weaken the expectations." The fourth is the outer loop: each attempt ran in an isolated Docker container, the evaluator used its own downstream fixtures and message capture instead of the app's development tests, and "the inner harness never had access to the evaluation suite's answer key."

Three details matter for rig and are easy to misread. First, the sensors did **not** run after every edit; the article says the loop "depended on the agent invoking these tools during development." Cadence was per attempt, a scenario rerun per fix, and the full suite once at the end. Second, the sync rule is concrete but narrow: an `examples validate` command checks the example payloads against the specs before any test runs, and the tests are generated from the same specs, so guide and sensor share one source. Third, the results depend on model grade. The stronger model (Sol) passed 10 of 10 with and without the harness, and the harness cost about 7 times more (~$2.68 against ~$0.41). The cheaper model (Luna) went from 3 of 10 to 10 of 10 at ~$0.27 against ~$0.09, and ended up cheaper per run than unharnessed Sol. The author concludes that "what changes with model capability is not whether independent sensors are needed, but when they run," and proposes, without measuring, a final-gate-only mode for frontier models.

The limits are real. Only 10 runs per arm, one Java service, low reasoning effort, no way to separate guides from sensors, costs that exclude the human work of writing contracts, and no Claude model measured under a harness. The article does not publish filenames, the exact test command, an attempt cap, or Specmatic command lines; those are inferences in this report. The notes also record that the article was read through a summarising fetch, so quotes are high-confidence but not byte-checked, and the attribution to Naresh Jain comes from the request rather than the fetched text.

## The outer-loop sensor catalogue, and what each costs a TypeScript agent

Fowler's sensors article supplies the catalogue and the warnings ([Fowler, Sensors for coding agents](https://martinfowler.com/articles/sensors-for-coding-agents.html); [Harness engineering](https://martinfowler.com/articles/harness-engineering.html)). It names a type checker, ESLint with custom self-correction messages, Semgrep, dependency-cruiser for layer rules, a test suite with coverage, incremental mutation testing with Stryker, GitLeaks in a pre-commit hook, an LLM security review, an LLM data-handling review, a dependency-freshness report, and a modularity-and-coupling review built from a TypeScript-compiler CLI plus an LLM pass. Computational sensors are "deterministic and fast" and suited to every change; inferential ones are slower, costlier and non-deterministic, "not on every commit." The article's own cautions shape the plan: lint rule sets produced "feedback overload for the agent, sending it into a spiral of over-engineered refactorings"; coverage "tells us that a line was executed, but not that its impact was verified"; mutation testing "is quite resource intensive," so the author triggered it manually; and coupling data alone was not useful to the model. The tools below are the Node mapping, with the status checks from the notes' npm lookups on 2026-10-16.

| Sensor | Node/TS tool | Cadence | Mode | Note |
|---|---|---|---|---|
| Lint, changed file | `eslint` | edit | advise | Named in the article; keep to one fast pass |
| Types | `tsc --noEmit` incremental | turn, commit, CI | block | Inference; article names no tool |
| Fast tests | `vitest related` or `node --test` | turn | block | Inference |
| Contract tests | Specmatic (npm wrapper 2.55.3), or Schemathesis, Prism, or Ajv plus supertest | turn when `src/http` or contracts change; commit; CI | block | Jain's tool; JVM requirement unverified |
| Tamper, suppression, secrets, frozen files | rig's existing diff sensors | turn, commit, CI | block | Reuse from `scripts/sensors.ts` |
| Regression suite | `npm test` | commit, CI | block | |
| Coverage floor | `c8 --check-coverage` | CI | block | Weak signal alone |
| Dependency rules and cycles | dependency-cruiser 18.6.0 | commit, CI | block in CI | Replaces rig's regex `layering` |
| Duplication | `jscpd` | CI | advise | Neither article names it; inference |
| Mutation | `@stryker-mutator/core` 10.0.0, `--incremental` | CI on changed files; nightly full | block below `thresholds.break` in CI | Named in the article |
| Dead code, audit, freshness | `knip`, `npm audit`, Dependabot | nightly | advise | |
| Coupling and modularity | dependency-cruiser metrics plus one LLM pass | nightly | advise | Run the LLM pass more than once |
| LLM review | built-in `/code-review`, once per PR | CI final | advise | Matches the repo's one-review-per-change rule |

Against this catalogue rig has, as built-in sensors, test-tamper, suppressions, regex secrets, regex layering, size, harness-tamper, traceability, red-proof and contract-impact. As repo-declared commands it has lint, types, `npm audit`, `madge --circular` and Semgrep, listed in `templates/stacks.json`. It lacks mutation testing, coverage enforcement (only a lowered-threshold text diff), duplication, real dependency-rule linting, contract tests and architecture fitness tests. rig also ships sensors the catalogue does not ask for (size limits, line length, tier checks, retired-identifier greps). The plan keeps the diff-level tamper sensors, which defend against an agent weakening its own judge, and drops the rest from the default set. This follows Fowler's own warning that each new rule set surfaced "new supposed issues."

## What rig implements today, measured against Jain

The `behavioral` block is real and correctly shaped but thin plumbing. It runs `validate` before `run` at `/rig:test`, at pre-push, and in CI from the base-branch config; folds the declared files into the spec, plan and design approval digests so edits make an approval stale; treats removing or weakening the block as harness tamper; and can run per slice when `cadence` is `continuous` (`scripts/verify.ts:87-114`, `scripts/check.ts:317-325`, `scripts/core.ts:200`, `scripts/slicecheck.ts:21-26`). That is Jain's validate-before-run and frozen-expectations rule, expressed as config. The gaps against Jain are structural rather than cosmetic:

- **No contract tooling and no brief.** rig never parses specs, ships no template or skill that writes the block, and `grep behavioral templates skills/init` returns nothing. Nothing in `/rig:init` produces a brief or a contract.
- **No feedback during editing under the default cadence.** With `cadence: "final"` nothing runs at Stop or per edit, so a behavioural failure first appears at verify. The block is also one global switch, not tied to model grade.
- **Freeze depends on approval gates.** `gates.S` defaults to empty, so for tier S no approval digest covers the frozen files, and tier L gets no per-slice run.
- **Coarse results.** `verification.md` gets one `behavioral` row, so a failing behaviour is not named at the gate.
- **No measurement.** The lite spec puts N-run reliability evals and cost-per-accepted-change reporting out of scope, and nothing in `tests/e2e` exercises the block.

rig's e2e suite does contain two useful pieces for the outer loop. `tests/e2e/acceptance/shop.mjs` is a hidden acceptance suite that "lives outside the sandbox repo, so the model never sees it," and `tests/e2e/driver/live.mjs` already spawns `claude -p` with `--model`, `--settings`, a budget cap and stream-json output. What it lacks is Jain's protocol: it runs one scripted lane on one model, has no bare arm, and records no tokens or dollars per accepted run. The hidden suite also imports module paths under `src/`, which couples it to layout; Jain's suite tested through the interface instead.

The earlier review (reports/rig harness fit and simplification.md) already concluded that rig's guardrail core is sound and that the tiers, spend tracking, UI and brain layers are not justified by any source. It also found that the cost article never tested Haiku, so any claim that a harness lets a small Claude model match a larger one is unproven. This design takes both findings as settled and builds the behavioural harness on the reduced base.

## The revised plan: one registry, three hooks, one eval runner

### Target-repo layout and what runs where

```
<target repo>/
  CLAUDE.md                     # <= ~40 lines: `@.rig/brief.md` + a generated guides block
  .rig/
    brief.md                    # application brief (template below), human-owned
    contracts/openapi.yaml      # HTTP boundary (zod -> openapi via @asteasolutions/zod-to-openapi is an option)
    contracts/asyncapi.yaml     # only if the app publishes or consumes messages
    contracts/examples/*.json   # success, each error status, each downstream failure
    sensors.json                # single registry: sensors, guide text, cadence, mode, grade policy
    bin/rig.mjs                 # ONE vendored script: run --at <cadence>, sync [--check]
  .claude/settings.json         # 3 hook entries, deny rules on frozen paths, pinned model
  .claude/skills/rig-verify/    # how to run sensors; "fix the implementation, never the expectations"
  .claude/skills/rig-brief/     # interview -> brief + contract stubs; a person approves
  .dependency-cruiser.cjs, stryker.config.json, eslint.config.js   # tool configs, frozen
  .github/workflows/rig-ci.yml  # runs rig.mjs and sensors.json from the BASE branch
```

Hooks map to cadence using native Claude Code events ([hooks reference](https://code.claude.com/docs/en/hooks)). A `PostToolUse` hook on Write, Edit and MultiEdit runs the `edit` cadence and returns exit 2 so stderr reaches the agent. A `Stop` hook runs the `turn` cadence, honours `stop_hook_active`, and caps consecutive blocks at two before handing off to a person, which mirrors rig's existing `MAX_BLOCKS = 2`. A git `pre-commit` hook runs the `commit` cadence; the notes prefer it over a Bash `PreToolUse` matcher because the Bash `if` matcher is best-effort and `claude -p` workspaces are untrusted (`tests/e2e/driver/live.mjs:7`). CI runs everything on every PR. A scheduled workflow runs the nightly set and opens an issue; it never blocks a PR. `SessionStart` runs `sync --check`. The notes did not verify whether `permissions.deny` blocks Write and Bash redirects, so deny rules are a speed bump and the base-branch CI check is the enforcement. That follows rig's existing principle that a PR cannot weaken its own judge.

### The guide-sensor sync rule

Jain's rule is that guide and sensor come from one source and the agent may not weaken it. The plan makes that a computational check. Each `sensors.json` entry carries a `guide` sentence of at most 160 characters:

```json
{ "id": "contract",
  "cmd": "npx specmatic test --contract .rig/contracts/openapi.yaml --port 3000",
  "at": ["turn", "commit", "ci"], "when": ["src/http/**", ".rig/contracts/**"],
  "mode": "block", "fix": "fix the app; the contract is read-only",
  "guide": "Every status code and body shape in .rig/contracts/ must match what the app returns; fix the app, never the contract." }
```

`rig.mjs sync` renders every guide into a block of CLAUDE.md between `rig:guides:begin` and `rig:guides:end`, each line tagged `[sensor:<id>]`, and `sync --check` fails on five conditions. A sensor has no guide and no written `"guide": null` plus `"why"`. The block differs from the render. A bullet in the block carries no tag or names an unknown sensor (a guide with no sensor). A behaviour ID in the brief's behaviour map names no existing sensor or example file. An example fails validation against its schema, which is the existing `validate` idea. Free-form guide prose outside the block is capped at about 20 lines. The check runs at `SessionStart`, in rig's own spec suite against the shipped templates, and in CI from the base branch. Frozen paths (`brief.md`, `contracts/**`, `sensors.json`, tool configs) are protected by the `frozen` sensor, so humans change a guide and its sensor in the same commit and drift cannot merge. The rule is an inference extending Jain and Fowler: neither article states a one-guide-per-sensor rule, and Fowler explicitly asks "what guides can we delete?" once sensors are trusted. The `"guide": null` escape hatch and the deletion question remain open.

### Cadence by model grade

The registry gets a policy block, and the hook resolves the session model to a grade by substring match.

```json
"policy": {
  "grades": { "haiku": "economy", "sonnet": "economy", "opus": "frontier" },
  "cadence": {
    "economy":  { "edit": true,  "turn": true,  "commit": true, "ci": true },
    "frontier": { "edit": false, "turn": false, "commit": true, "ci": true }
  },
  "default": "economy"
}
```

If the cadence flag is false the hook exits 0 at once, at zero cost. An unknown model falls back to economy, so uncertainty errs toward more checking. CI ignores grade, which implements Jain's "retain an independent acceptance check even when a model passes consistently," and `frozen` and `tamper` stay on at commit for every grade. A pull request may not change the policy toward less checking, which generalises rig's existing harness-tamper rule that already forbids lowering `continuous` to `final`. Placing Sonnet with Haiku is a conservative guess with no data behind it, and the eval below is what would move it. The notes could not confirm that hook input includes the model name, so the fallback order is `ANTHROPIC_MODEL`, then the pinned `model` in `.claude/settings.json`, then unknown.

### The evaluation harness

The eval lives in the rig repo, not in target repos. A runner of about 200 lines plus a 60-line report script copies a fresh starter (brief and contracts in an empty git repo) into an isolated directory per run, optionally installs rig with a given policy, runs `claude -p` with `--model`, `--settings` and `--max-budget-usd` (reusing the argument shape in `live.mjs`), then runs the hidden acceptance suite from a different working directory after the agent exits. It appends one JSON line per run with accepted flag and failing checks, tokens, dollars labelled API-equivalent as Jain labels them, wall minutes, turns, sensor invocations and blocks, tamper and frozen findings as a gaming signal, and diff size. The arms are Haiku with rig, Haiku bare, Sonnet bare, Opus bare, and Haiku with rig at final-gate cadence; Opus with rig at final-gate and a guides-only versus sensors-only split are optional and cover the two questions Jain left open. Every arm receives the identical brief, and bare arms get the contracts as plain files, so only the hooks, sensors and skill differ. The headline metric is dollars per accepted run, the figure that makes cheap-plus-harness comparable to strong-bare. The hidden suite should be rewritten to drive the app over its interface (`PROMISES.shopHttp`) and include inputs absent from `examples/`, so that special-casing the visible examples cannot pass. The cost estimate in the notes is on the order of $100 to $300 for 50 to 60 runs and under three hours with parallelism, extrapolated from the earlier ~$1.20 Haiku live run, and should be treated as an estimate.

### What to reuse, rewrite and delete

| Area | Fate |
|---|---|
| `scripts/sensors.ts` (385 lines) | Keep test-tamper, lowered thresholds, suppressions, secrets, harness-tamper (~200 lines); drop layering, size, rules, retired identifiers, behaviour-id and tier checks |
| `scripts/check.ts`, `model.ts` | Replace with `rig.mjs run --at` (~150 lines) and a smaller schema (~150 lines) |
| `scripts/verify.ts`, `runs.ts`, `githooks.ts` | Reuse for last-run stamps, `validate` becoming `sync --check`, and the pre-commit hook |
| `scripts/hooks.ts`, `hooks/hooks.json` | Shrink to edit, Stop and SessionStart; drop prompt-submit, subagent and skill-failure hooks |
| New | `sync` (~120 lines), `eval/run.mjs`, `eval/report.mjs`, `eval/starter/` |
| Tier, change-record, slice, ratchet, routing, scope and state-machine scripts | Delete (about 3,500 lines) |
| `spend.ts`, `metrics.ts`, `scorecard.ts`, `timing.ts`, `points.ts` | Delete (about 1,000 lines); the eval runner records its own cost |
| Mod UI (`band.tsx`, `mission.tsx`, and related; 715 lines) and `brain/` (3,086 lines plus specs) | Delete |
| 22 skills and 5 agents | Keep `rule`; add `rig-verify` and `rig-brief`; use built-in Explore, Plan and `/code-review` |
| `guides/*.md` | Fold into `guide` fields; a rule with no sensor is dropped or gets one |
| `templates/stacks.json` | Reuse as sensor presets; the node preset gains contract, dependency-cruiser, Stryker and jscpd |
| `templates/rig-check.yml` | Rewrite as `rig-ci.yml` plus a nightly workflow |
| `tests/e2e/acceptance/shop.mjs`, `driver/live.mjs`, `lib/checks.mjs` | Reuse inside `eval/`; keep e2e only as an install smoke test |

Adoption order follows the evidence. First write the brief template and the `rig-brief` skill, since without a brief nothing downstream is checkable. Then build `sensors.json`, `rig.mjs` and `sync`, ship the Node preset with the contract, types, tamper and frozen sensors, and gate the rest behind observed repeat failures. Then build the eval runner and run the Haiku-with-rig versus Haiku-bare comparison before adding mutation, duplication or coupling sensors. If rig does not beat bare on accepted rate or dollars per accepted run, cut the feature rather than defend it. Sensors enter one at a time, each justified by a failure that repeated, which is Fowler's steering loop and the main defence against feedback overload.

## Application brief template

Copy this to `.rig/brief.md`. It adapts the nine headings of Jain's brief and adds a tenth, a behaviour map, which `sync --check` verifies. Every externally visible behaviour gets an ID, every timeout, retry and limit is a number, and anything the agent must not add is stated as a non-goal.

```markdown
# <Application name>: application brief

## 1. Context and intent
<What this service is, who calls it, why it exists. One paragraph.>
Out of scope: <systems, tables, consumers this app does not own or build>.
Non-goals (hard rules): <e.g. "No in-memory product store." "Do not add operations or
response statuses not listed here." "Do not emit an event for an invalid downstream response.">

## 2. Solution architecture
<Diagram or ASCII flow.>
| Component | Responsibility | Owns data? |
|---|---|---|
| Client | | |
| This app | | |
| Downstream API | system of record | yes |
| Message topic | | |

## 3. Technology and delivery constraints
Runtime and framework: <e.g. Node 22, TypeScript, Fastify>
Start command: <npm start>   Test command: <npm run harness>
Configuration (env vars, with defaults): <DOWNSTREAM_URL, DOWNSTREAM_TIMEOUT_MS=500>
Deliverables: README, <GET /health> shallow readiness check with no side effects.

## 4. Client-facing interface
Contract: .rig/contracts/openapi.yaml (authoritative; this section only summarises).
| Operation | Success | Error statuses | Example file |
|---|---|---|---|
| POST /things | 201, or 202 + Link header on timeout | 400 | examples/post-things-*.json |
Shared shapes: <Thing, ThingBase, Error {code, message}>.

## 5. Downstream interface(s)
Contract: <.rig/contracts/downstream.yaml>. <Required headers, e.g. API key, idempotency key.>

## 6. Message interface (omit if none)
Contract: .rig/contracts/asyncapi.yaml. <When to publish, which fields, ack wait in ms,
headers that must or must not be present.>

## 7. Resiliency and business behaviour
Each rule has an ID and a number.
- B1: <Deferred POST: retry every 1 s, at most 10 attempts, same idempotency key.>
- B2: <GET on downstream timeout: 429 with Retry-After: 1. Unreachable downstream: 503.>
- B3: <Downstream response violating filter X: return 502; publish nothing.>

## 8. Timeouts and configuration
<Every timeout, interval and limit with unit and default.>

## 9. Tests required
<Which contracts and behaviours need automated tests; how failures are injected.>

## 10. Behaviour map (checked by `rig.mjs sync --check`)
| ID | Contract operation or example | Sensor |
|---|---|---|
| B1 | examples/post-things-timeout.json | contract |
| B2 | examples/get-things-429.json | contract |
| B3 | examples/downstream-bad-filter.json | contract |
```

## Conclusion

The central change in understanding is that the behavioural harness is not a thinner version of rig's process machinery; it is a different thing. Jain's harness has no tiers, change records, approvals or budgets. It is a brief, contracts that serve as both guide and sensor, a command the agent runs, and a hidden judge. The sub-claim that matters most for rig is the cadence finding: the harness paid for itself only on the model that needed it, so the right design makes sensor cadence a per-grade setting rather than a property of the harness. The registry-with-guide-per-sensor rule is the one part of this plan that goes beyond both articles, and it is where rig can add something rather than copy something.

Three things stay unresolved. There is no evidence for any Claude model under this harness, and no data on false-positive rates or on the human cost of writing briefs and contracts, which Jain excludes from his economics. Specmatic's runtime needs (the notes suspect a JVM) and licensing were not verified, so the contract-test row ships with a zero-dependency fallback of Ajv plus supertest. The eval runner is therefore the first thing to build after the brief template, because it decides whether the rest of the plan stays.
