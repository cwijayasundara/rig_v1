# Rebuilding rig as a behavioral harness (Jain) on native Claude Code primitives

Conventions: **[Fact]** = quoted or read from a source or the repo. **[Inference]** = my reasoning, not stated by a source. Source URLs: J = https://martinfowler.com/articles/are-harnesses-worth-the-cost.html ; B = https://martinfowler.com/articles/are-harnesses-worth-the-cost/application-brief.html ; S = https://martinfowler.com/articles/sensors-for-coding-agents.html ; H = https://martinfowler.com/articles/harness-engineering.html ; HK = https://code.claude.com/docs/en/hooks ; P = prior review `/Users/chamindawijayasundara/Documents/learning_101/rig_v1/reports/rig harness fit and simplification.md`. Web quotes came through a summarising fetch tool (small model), so wording is high-confidence but not byte-checked. Date of tool/version checks: 2026-10-16 (`npm view`).

Important repo fact up front: rig already contains a "lite" behavioral block (commit f71de1d). `scripts/model.ts:31` defines `BehavioralConfig = { validate?, run?, files, cadence: 'final'|'continuous' }`; `scripts/check.ts:316-326` runs it at ship/CI from the base config; `scripts/verify.ts:87-101` runs `validate` first ("the guide/sensor sync step"); `scripts/slicecheck.ts:21-26` runs it per slice when cadence is continuous; `guides/contracts.md` rule 8 says specs/examples are "guide and sensor". It is one global switch, buried inside a tier/change/slice state machine. The redesign keeps its ideas and removes the machine around it.

---

## 1. Jain's anatomy as a checklist

### Takeaway
Jain's harness is brief -> machine-readable contracts + examples (guides) -> computational contract sensors (inner loop), with cadence set by model capability, judged by an independent hidden acceptance corpus (outer loop). The sync rule is: sensors are generated from the same specs the guides hand the agent, and the agent may not weaken them.

### Cited Findings
- Brief: the example brief has nine parts: Context and intent; Solution architecture (responsibilities and boundaries, a diagram); Technology and delivery constraints; Client-facing HTTP interface (exact operations, status codes, shared data shapes, examples); Downstream (Order API) interface; Kafka message interface; Resiliency and business behavior (retries, throttling, downstream validation); Connectivity timeouts (configurable, default 500 ms); Tests ("automated tests covering the contracts, resiliency, downstream validation, and Kafka publication rules") — [B](https://martinfowler.com/articles/are-harnesses-worth-the-cost/application-brief.html)
- Contracts as guides: "The guides included OpenAPI and AsyncAPI specifications that expressed the interface agreements in machine-readable form" — [J](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html)
- Contract sensors: "The behavioral checks produced computational feedback without an LLM judging correctness." "Contract checks were generated deterministically from supplied specifications." — [J]
- Delivery: "An agent plugin supplied the skill and MCP tools, accompanied by the contracts and examples"; helper scripts for scaffolding, config tools wiring contracts to app and mocks; "Test results, CTRF reports, and API coverage reports returned those observations to the agent"; the agent "invoked the harness through the project's test command." Tool used: Specmatic; "equivalent contract-testing and service virtualization tools could provide the same capabilities." — [J]
- Skill instruction: "map the application's components and link each required behavior to its downstream interactions and verification checks"; "preserve those inputs and the skill's verification helpers, investigate failures, and correct the implementation or execution setup rather than weaken the expectations"; "Before implementing the service, the agent read the specifications and examples alongside the brief." — [J]
- Cadence (inner loop): "The feedback loop depended on the agent invoking these tools during development; it did not run automatically after every code edit." — [J]. Consequence: "Sensor results feed back to the agent as executable attention" and "become the basis for accepting the work". — [J]
- Cadence by model: cost-optimized: "run a behavioral harness throughout development"; frontier: "run the automated tests once as a deterministic final verification gate before acceptance"; "What changes with model capability is not whether independent sensors are needed, but when they run." The final-gate mode "is proposed as the next comparison. The article did not measure it." — [J]
- Outer loop: each attempt in an isolated Docker container with fresh workspace; two conditions differ only in what the agent could use in development; "the same corpus of 178 combined functional checks" (invalid inputs, downstream failures, recovery sequences, produced messages); "The evaluation harness controlled its own downstream fixtures and message capture rather than relying on the application's development tests"; "the inner harness never had access to the evaluation suite's answer key"; 10 paired runs per model; costs are "API-equivalent estimates based on recorded token use and model prices". — [J]
- Limits: one greenfield Java service, low reasoning effort, cannot isolate guides vs sensors; "The checks can enforce only the expectations humans encode." — [J]
- Vocabulary: guides = feedforward "anticipate the agent's behaviour and aim to steer it before it acts"; sensors = feedback "observe after the agent acts and help it self-correct"; computational = "deterministic and fast, run by the CPU", inferential = LLM review/judge, "more non-deterministic"; "The human's job in this is to steer the agent by iterating on the harness." — [H](https://martinfowler.com/articles/harness-engineering.html)
- Measured results (10 runs each): Sol+harness 11.3M tokens / 19m53 / ~$2.68 / 10 of 10; Sol bare 1.08M / 6m51 / ~$0.41 / 10 of 10; Luna+harness 22.9M / 35m / ~$0.27 / 10 of 10; Luna bare 5.86M / 15m56 / ~$0.09 / 3 of 10 — [J]

### Inferences (the checklist)
Each item = what it must contain in a rig-installed project.

| # | Component | Must contain | Test of "done" |
|---|---|---|---|
| 1 | **Brief** | The nine headings above, adapted; every externally visible behavior has an ID (B1..Bn); every timeout/retry/limit is a number; stack and delivery constraints named | A human can point at a brief line for any hidden acceptance check; no "TBD" |
| 2 | **Contracts** | Machine-readable interface for each boundary (OpenAPI for HTTP, AsyncAPI for messages; Node-native alternative: zod schemas exported to OpenAPI) plus named examples for success, each error status, each downstream failure | Spec lints clean; every operation+status in the brief appears in the spec; examples validate against schemas |
| 3 | **Guides** | Short imperative lines in CLAUDE.md (feedforward), the brief and contracts imported into context, and a skill that tells the agent how to run the sensors and to fix the implementation, never the expectations | Each line is paired with a sensor (section 4) |
| 4 | **Sensors** | Computational first; each has a command, a cadence, a block/advise flag, and a one-line fix hint; results are machine-parsable (exit code + short text) | Fails on a seeded defect; passes on the reference solution |
| 5 | **Cadence** | Which sensors run at edit / turn / commit / CI / nightly, and how that changes with model grade | Config, not code; the hook reads it |
| 6 | **Evaluation** | Hidden acceptance corpus outside the repo and outside the agent's reach, same corpus across arms, isolated workspace per attempt, tokens/USD/minutes recorded, N>=10 per arm | Harness arm vs bare arm vs bigger-model arm are comparable |
| 7 | **Steering loop** | When a failure repeats, a human adds/changes a guide+sensor pair (rig's `rule` skill) | Every harness change is a guide+sensor pair |

### Gaps
- The fetch tool did not return the full article text; the exact table of CTRF / API-coverage outputs and the Specmatic configuration are not described in the sources I could read.
- Jain never ran Haiku, Sonnet or Opus under the harness (only exploratory unaided runs); there is no Claude-family cadence evidence. The user's premise "cadence by Haiku/Sonnet/Opus" is a mapping of "cost-optimized vs frontier" onto Claude grades (my inference, also made in P).

---

## 2. Target-repo layout

### Takeaway
Six artifacts, each backed by one principle. Everything else in today's `.rig/` (changes, chart, spend, tiers, waivers dirs) is removed.

### Cited Findings (principles used to justify files)
- "Before implementing the service, the agent read the specifications and examples alongside the brief." — [J]
- "Sensor results become the basis for accepting the work." — [J]
- Claude Code hooks: `PostToolUse` fires after a tool (exit 2 "Shows stderr to Claude; the tool already ran"); `Stop` exit 2 "Prevents Claude from stopping, continues the conversation"; `stop_hook_active` is true when already continuing from a stop hook; `PreToolUse` supports `if: "Bash(git commit *)"` and `permissionDecision: deny`; handler types command/http/mcp_tool/prompt/agent; hooks may live in skill frontmatter — [HK](https://code.claude.com/docs/en/hooks)
- Existing rig fact: settings hooks in `hooks/hooks.json` register UserPromptSubmit, Stop, SessionStart, PostToolUse (Write|Edit|MultiEdit), SubagentStart/Stop, PostToolUseFailure(Skill); its description says "No hook runs on Bash". `tests/e2e/driver/live.mjs:7` notes `claude -p` never trusts the workspace. DESIGN.md principle 6: "CI judges a PR with the base branch's checker and config, so a PR cannot weaken its own judge." — repo

### Inferences (proposed layout)

```
<target repo>/
  CLAUDE.md                      # <= ~40 lines. Contains: `@.rig/brief.md`, then a managed block
                                 #   <!-- rig:guides:begin --> ... <!-- rig:guides:end -->  rendered from sensors.json
  .rig/
    brief.md                     # application brief, Jain's headings (template below); human-owned
    contracts/
      openapi.yaml               # HTTP boundary   (Node alternative: src/contracts/*.ts zod -> generated openapi.yaml)
      asyncapi.yaml              # only if the app publishes/consumes messages
      examples/*.json            # named request/response/failure examples, referenced by the specs
    sensors.json                 # the single registry: sensors + guide text + cadence + block/advise + grade policy
    bin/rig.mjs                  # ONE vendored script: run --at <cadence>, sync [--check], stamp. (~300 lines target)
  .claude/
    settings.json                # 3 hook entries + deny rules for frozen files + pinned `model`
    skills/rig-verify/SKILL.md   # how to run sensors; "fix implementation, never expectations"
    skills/rig-brief/SKILL.md    # interview -> brief.md + contract stubs (human approves)
  .dependency-cruiser.cjs, stryker.config.json, eslint.config.js, vitest/node:test config   # tool configs, frozen
  .github/workflows/rig-ci.yml   # recompute from BASE branch's sensors.json + rig.mjs; runs --at ci
```
Hidden acceptance suite is NOT here (it lives in the rig repo `eval/`; section 6).

| File | Principle that justifies it | Native feature |
|---|---|---|
| `.rig/brief.md` | "the agent read the specifications and examples alongside the brief" [J]; "The checks can enforce only the expectations humans encode." [J] | CLAUDE.md `@` import keeps it in context (inference: documented Claude Code memory import) |
| `.rig/contracts/` | "specifications that expressed the interface agreements in machine-readable form" [J]; "Contract checks were generated deterministically from supplied specifications" [J] | plain files; deny-edit rule |
| CLAUDE.md managed block | guides = "steer it before it acts" [H] | native memory file |
| `.rig/sensors.json` | "Sensor results feed back to the agent as executable attention" [J]; cadence is the variable ("when they run") [J] | read by hooks |
| `rig.mjs` | "Contract checks were generated deterministically" [J]; "deterministic and fast" [H] | invoked from hooks / git hook / CI |
| `rig-verify` skill | "preserve those inputs and the skill's verification helpers ... rather than weaken the expectations" [J] | skill (advisory); hooks are the deterministic layer behind it (P quoting Anthropic playbook: "A skill is an advisory control while a hook is the deterministic layer behind it") |
| `rig-ci.yml` | "Retain an independent acceptance check even when a model passes consistently" [J] | GitHub Actions; base-branch config (reuse `templates/rig-check.yml` idea) |

Hook mapping per cadence:

| Cadence | Claude Code event | Command | On failure |
|---|---|---|---|
| `edit` | `PostToolUse`, matcher `Write\|Edit\|MultiEdit` | `node .rig/bin/rig.mjs run --at edit --file "$path"` (reads `tool_input.file_path` from stdin) | exit 2 -> stderr shown to the agent (cannot undo the edit) |
| `turn` | `Stop` | `rig.mjs run --at turn`; honour `stop_hook_active`; cap at 2 consecutive blocks then hand off | exit 2 keeps the agent working |
| `commit` | git `pre-commit` hook (portable, works in `-p` and for humans; repo already has `scripts/githooks.ts`) and optionally `PreToolUse` with `if: "Bash(git commit *)"` returning `permissionDecision: "deny"` | `rig.mjs run --at commit` | deny / non-zero |
| `ci` | GitHub workflow on `pull_request` | `rig.mjs run --at ci --config-from origin/$BASE` | required check |
| `nightly` | scheduled workflow (or the built-in `schedule` skill) | `rig.mjs run --at nightly` | opens an issue; never blocks a PR |

Rationale for git pre-commit over Bash PreToolUse as the primary commit hook [Inference]: hooks.json explicitly says "No hook runs on Bash" (so that work "in -p and CI" is unaffected), and `live.mjs:7` shows `-p` workspaces are untrusted; the Bash `if` matcher is documented as best-effort ("when Claude Code can't determine the commands a Bash input runs, it runs the hook regardless"), so it is not a hard gate. Keep PreToolUse as an optional extra for interactive sessions.

Brief template headings (`.rig/brief.md`), adapted from [B]:
1 Context and intent; 2 Solution architecture (responsibilities and boundaries, diagram); 3 Technology and delivery constraints (runtime, framework, start command, env vars, health endpoint, README); 4 Client-facing interface (link to `contracts/openapi.yaml`; list operation IDs and status codes in prose); 5 Downstream interfaces (links to specs or mocks); 6 Message interface (AsyncAPI); 7 Resiliency and business behavior (each rule gets an ID `B<n>`, with numbers); 8 Timeouts and configuration; 9 Tests (which contracts/behaviors need automated tests); **10 Behavior map (rig addition)**: table `B<n> -> contract operation/example -> sensor id`, mirroring Jain's skill instruction to "link each required behavior to its downstream interactions and verification checks". `rig.mjs sync --check` verifies every B-id in the table exists in the brief and every referenced example file exists.

Files deleted from today's `.rig/` model: `.rig/changes/<slug>/*`, tier/intent/spec/plan/design artifacts, waivers.jsonl, spend ledger, chart, wiki. Human exceptions become a plain code review of `sensors.json` diffs (base-branch rule).

### Gaps
- I did not verify whether Claude Code `permissions.deny` `Edit(path)` rules also block the `Write` tool and Bash redirects; treat deny rules as a speed bump and rely on CI-from-base for enforcement.
- Whether `claude -p` runs project settings hooks without a trust prompt in a given environment is not confirmed here; rig's e2e driver passes `--settings` explicitly (`tests/e2e/driver/live.mjs:25-27`), which is the safe route for the eval arms.

---

## 3. Sensor set for a TypeScript/Node target

### Takeaway
Inner loop: four cheap computational sensors plus a contract test; outer loop/CI: full regression, coverage floor, mutation, dependency rules, duplication, structure, and a single LLM review that advises only. Keep the edit tier minimal to avoid feedback overload.

### Cited Findings
- Cadences in S: "Sensors that run continuously alongside the agent to provide fast feedback" vs "Sensors that run on a slower cadence to detect drift that accumulates over time"; mutation testing: "In my setup I didn't run it continuously ... but triggered incremental runs manually." Tools in S: dependency-cruiser (structural rules), Stryker (mutation), ESLint, Semgrep, GitLeaks, dependency freshness. — [S](https://martinfowler.com/articles/sensors-for-coding-agents.html)
- Feedback overload: "I also discovered new supposed issues in the code every time I activated a new set of rules." "So I worry about feedback overload for the agent, sending it into a spiral of over-engineered refactorings." Max-lines rules "showed some signs of tension". Suppressions to be "manageable, visible and reviewable"; "Looking at the exceptions AI created (suppressed warnings, increased thresholds) was a good point to start my code review." — [S]
- Existing rig sensors: test-tamper (skip/only/x-prefix, deleted tests, lowered thresholds) `scripts/sensors.ts:7-70`; suppressions (`eslint-disable`, `@ts-ignore`, `istanbul ignore`...) `sensors.ts:15-19`; secrets `sensors.ts:~140`; `size`, `layering`, `rules`, `retired identifiers`, `harness-tamper` also exist. `templates/stacks.json` already lists for node: eslint, tsc, `npm audit`, `madge --circular`, semgrep.
- Tool status via `npm view` on 2026-10-16: specmatic 2.55.3 (modified 2026-10-05, "Node wrapper for Specmatic"); @stryker-mutator/core 10.0.0 (2026-08-14); dependency-cruiser 18.6.0 (2026-10-11); jscpd 5.4.1 (2026-10-09); knip 6.41.0 (2026-10-09); c8 12.0.0 (2026-07-16); @redocly/cli 2.64.0 (2026-10-15); openapi-backend 5.22.0 (2026-10-16; "Build, Validate, Route, Authenticate and Mock using OpenAPI definitions"); @stoplight/prism-cli 5.16.0 (2026-07-17); dredd 14.1.0 (last modified 2023-02-13 -> stale); schemathesis is not on npm (E404) but PyPI shows 4.31.1 with very many releases (active, Python, run via uvx/pipx); `zod-to-openapi` 0.2.1 is deprecated, `@asteasolutions/zod-to-openapi` 9.1.0 (2026-07-19) is the maintained one. — npm registry / PyPI queries (npmjs.com/package/<name>)

### Inferences (sensor table)
Block = prevents Stop/commit/merge; advise = reported to the agent (or PR comment) but does not stop. Tool choices are my recommendation.

| id | Cadence | Tool / command | Block? | Paired guide line (rendered into CLAUDE.md) |
|---|---|---|---|---|
| `lint-file` | edit | `eslint --no-warn-ignored <file>` (changed file only, <2 s) | advise | "Keep ESLint clean in the files you touch; do not add disable comments." |
| `types` | turn, commit, ci | `tsc --noEmit` incremental (`tsc -b`) | block (turn+) | "Types must compile; never use `any`/`@ts-ignore` to get past an error." |
| `unit-changed` | turn | `vitest related <changed>` or `node --test` for changed files | block | "Write a failing test before the code; keep tests that exist." |
| `contract` | turn (if `src/http` or contracts changed), commit, ci | Specmatic contract tests vs `.rig/contracts/openapi.yaml` (mark: Specmatic npm is a Node wrapper; it is Jain's tool; whether it needs a JVM at runtime is NOT verified here; inferred from the product being JVM-based). Alternatives: Schemathesis (Python; property-based, active), Prism as validation proxy/mock (maintained, less active), `@redocly/cli lint` for the spec itself, Ajv + hand-written supertest for a zero-dependency fallback. Avoid Dredd (stale since 2023). openapi-backend is a runtime router/validator for the app, not a sensor. | block | "Every status code and shape in `.rig/contracts/` must be what the app returns; fix the app, never the contract." |
| `tamper` | turn, commit, ci | reuse `testTamper` (`sensors.ts`) + lowered thresholds | block (not waivable in CI) | "Never skip, delete or weaken a test; never lower a threshold." |
| `suppress` | turn, commit, ci | reuse `suppressions` (needs `-- reason`) | advise at turn, block in ci if unreasoned | "A suppression needs a reason after `--`; fix the cause first." |
| `secrets` | turn, commit, ci | reuse `secretsInDiff` (or gitleaks) | block | "No secrets in code; read from env." |
| `frozen` | turn, commit, ci | git diff touches `.rig/brief.md`, `.rig/contracts/**`, `.rig/sensors.json`, tool configs without a human-approved base | block | "Brief, contracts and sensor config are read-only; ask the person." |
| `regression` | commit, ci | full test suite (`npm test`) | block | "Run the full suite before you commit." |
| `coverage` | commit (advise), ci | `c8 --check-coverage --lines N --branches N` | block in ci | "Cover each behavior B<n> with a test that names it." |
| `deps-rules` | commit, ci | `depcruise src --config .dependency-cruiser.cjs` (layering, no cycles, no deep imports) | block in ci | "Respect module boundaries in the brief's Solution architecture." |
| `dup` | ci | `jscpd src --threshold 3` | advise | "Extract repeated blocks; no copy-paste across modules." |
| `mutation` | ci (incremental on changed files), nightly (full) | `stryker run --incremental`, `thresholds.break` | block on ci only when score < break; nightly advise | "Tests must assert outcomes, not just execute lines." |
| `arch` | ci | dependency-cruiser rules double as structural tests; optionally Semgrep rules | block | (same as `deps-rules`) |
| `dead-code` / `audit` | nightly | `knip`, `npm audit` | advise | "Remove unused exports and dependencies." |
| `llm-review` | ci (final gate only) | built-in `/code-review` (or `claude -p "/code-review"` in the workflow); one pass on `git diff main...HEAD` | advise | none needed; "Review findings guide a human, they do not approve or block alone" (P quoting Anthropic playbook) |

Sizing note [Inference]: five sensors at edit/turn (lint-file, types, unit-changed, contract, tamper/suppress/secrets/frozen counted as one diff pass) keep the loop below the point S warns about. Do not port rig's `size`, line-length, layering-by-tier and `rules` sensors into the default set; add them only when a measured repeat failure demands (S: each new rule set surfaced "new supposed issues").

### Gaps
- Specmatic licensing/edition (open-source vs commercial features), runtime requirements (JVM), and OpenAPI-test-generation scope were not verified.
- No data on false-positive rates of these tools on agent-written code; S reports only anecdotes.
- ArchUnit-style TS structural test libraries were not researched; dependency-cruiser covers module-dependency rules only.

---

## 4. Guides <-> sensors sync mechanism

### Takeaway
Make `sensors.json` the single source of truth: each sensor carries its guide sentence, CLAUDE.md's managed block is generated from it, and `rig sync --check` fails in the harness's own specs and in CI when either side is orphaned or stale.

### Cited Findings
- "Contract checks were generated deterministically from supplied specifications"; "The agent was instructed to preserve those inputs ... rather than weaken the expectations." — [J]
- Existing partial implementation: `validate` in `BehavioralConfig` checks examples against specs before `run` (`scripts/verify.ts:87-101`); `guides/contracts.md` rule 8: "Specs and examples are guide and sensor"; guides are path-injected via frontmatter `paths:` (`guides/testing.md`). `scripts/sensors.ts:297-301` detects weakened behavioral config (harness-tamper).
- H (via P): guides and sensors must not contradict each other. — [P](file) summarising [H]

### Inferences (the rule)
`sensors.json` entry:
```json
{ "id": "contract", "cmd": "npx specmatic test --contract .rig/contracts/openapi.yaml --port 3000",
  "at": ["turn", "commit", "ci"], "when": ["src/http/**", ".rig/contracts/**"],
  "mode": "block", "fix": "fix the app; the contract is read-only",
  "guide": "Every status code and body shape in .rig/contracts/ must match what the app returns; fix the app, never the contract." }
```
Rules, all computational, enforced by `rig.mjs sync --check`:
1. Every sensor has a non-empty `guide` (<= 160 chars, imperative) or an explicit `"guide": null` plus `"why": "<reason>"` for pure hygiene sensors (kept rare and visible).
2. CLAUDE.md block between `rig:guides:begin/end` equals the render of all guides ordered by id, each line prefixed `[sensor:<id>]`. Hand edits inside the block fail the check; `rig.mjs sync` rewrites it.
3. Any bullet in the block lacking a `[sensor:<id>]` tag, or tagged with an id absent from `sensors.json`, fails (a guide with no sensor).
4. Every B-id in the brief's Behavior map names a sensor id or contract example that exists; every contract operation+status appears in the brief (or the spec says `x-rig-internal: true`). Examples validate against schemas (the existing `validate` idea).
5. Guides outside the block (project-specific prose) are allowed but capped at ~20 lines, since "A skill is advisory, a hook is the deterministic layer" (P quoting the Anthropic playbook): the block is the enforceable part.

Enforcement points (native): `SessionStart` hook runs `sync --check` (cheap, prints a warning into context via additionalContext, per HK); `rig-ci.yml` runs it from the BASE branch (so a PR cannot loosen it); rig's own spec suite has one spec that runs `sync --check` against the shipped template `templates/sensors.json` and CLAUDE.md template (fails if a template sensor lacks a guide). The `frozen` sensor protects `sensors.json` from agent edits; humans change a guide and its sensor in the same commit, and `sync` makes drift impossible to merge. The steering loop (H: "The human's job ... is to steer the agent by iterating on the harness") becomes: failure repeats -> add sensor + guide pair in one PR.

### Gaps
- Whether pairing every sensor with a guide is net-positive is untested; S asks which guides can be deleted once sensors are trusted (via P). `"guide": null` with a reason is the escape hatch.

---

## 5. Cadence by model grade

### Takeaway
Declare a grade policy in `sensors.json`; the hook resolves the session's model to a grade and filters sensors by `at`. Unknown model -> cheap policy (fail toward more checking).

### Cited Findings
- "When a cost-optimized model produces inconsistent results, run a behavioral harness throughout development"; for frontier, run tests "once as a deterministic final verification gate before acceptance"; "What changes with model capability is not whether independent sensors are needed, but when they run." — [J]
- Cost evidence: on the frontier model the harness cost ~7x ($2.68 vs $0.41) with the same 10/10; on the cheap model it lifted 3/10 to 10/10 at ~$0.27 vs $0.09. — [J]
- Existing rig: one global `behavioral.cadence: 'final'|'continuous'` (`scripts/model.ts:31, 367-370`); `sensors.ts:301` forbids lowering continuous -> final from a PR; `scripts/routing.ts` pins models by role/tier. Hooks docs list `PreModelSwitch`/`PostModelSwitch` events; I could not confirm a `model` field in the common hook input (the excerpt showed `session_id, transcript_path, cwd, permission_mode, hook_event_name` only). — [HK]

### Inferences
`sensors.json` policy block:
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
Hook decision (in `rig.mjs run --at <x>`): (1) resolve the model id from, in order, env `ANTHROPIC_MODEL`, the repo's pinned `model` in `.claude/settings.json` (the CLAUDE.md of this repo already says to pin models), else unknown [Inference: because the hook input's model field is unverified; a `SessionStart` hook may record the model into a state file if the field exists, or via `PostModelSwitch`]; (2) map by substring (`haiku`/`sonnet`/`opus`) to a grade; (3) look up `policy.cadence[grade][at]`; if false, exit 0 immediately (zero cost); (4) otherwise run sensors whose `at` includes this cadence. Final gate for frontier = all `turn`+`commit` sensors run once at `commit` (git pre-commit) and again in CI, which is Jain's "run the automated tests once as a deterministic final verification gate". CI always runs everything regardless of grade ("Retain an independent acceptance check"). The `frozen` and `tamper` sensors stay on at `commit` for every grade. A PR may not change `policy` toward less checking (reuse `sensors.ts` harness-tamper logic, generalized). Sonnet is placed with Haiku as a conservative guess; Jain has no data for it [Inference]; the eval (section 6) is exactly what would move Sonnet to `frontier`.

### Gaps
- Model detection in hooks is unresolved; verify against the full hooks reference (the `SessionStart` and common-fields sections were not in the part of the page I could read).

---

## 6. Evaluation harness (outer loop)

### Takeaway
A single ~200-line runner that, for each arm and run, copies a fresh starter into an isolated directory, runs `claude -p` with a given model/settings, then executes hidden acceptance checks the agent never saw, recording acceptance, tokens, USD and minutes.

### Cited Findings
- Jain's protocol and metrics: section 1 above (isolated workspace per attempt, same hidden corpus, 10 paired runs, tokens/time/estimated cost, accepted runs) — [J]
- Repo: `tests/e2e/acceptance/shop.mjs` (80 lines) says "Hidden acceptance for the shop lane. Lives outside the sandbox repo, so the model never sees it." It exports `PROMISES.shop(repo)` and `PROMISES.remove(repo)` returning `true` or a failure string; it dynamically imports `src/catalog/products.js`, `src/cart/cart.js`, `src/orders/orders.js`, `src/http/handler.js` and checks `package.json` has no runtime dependencies (`shop.mjs:1-40`). `tests/e2e/run.mjs` (131 lines) drives rig phases S0-S5 through `driver/live.mjs`, which spawns `claude -p ... --output-format stream-json --verbose --permission-mode acceptEdits --model <m> --settings <f> --max-budget-usd <n> --setting-sources project,local [--plugin-dir]` (`live.mjs:25-27`). The prior live run took ~14-16 minutes and ~$1.20 on Haiku (P).

### Inferences
**Reuse of `shop.mjs` [Inference]:** keep it as the hidden suite, with one change: it hard-codes module paths under `src/`, so either (a) the starter brief must state those paths (acceptable but couples the test to layout, which Jain avoided by testing through HTTP and "its own downstream fixtures"), or (b) better, add `PROMISES.shopHttp(repo)` that runs the brief's start command, then drives the same promises over HTTP (the handler's `{method,path,body}` shape maps directly to requests). The oracle (`tests/e2e/lib/oracle.mjs`) and `Checks` helper can be reused for reporting. Starter = `brief.md` + `contracts/` (derived from the shop PRD under `tests/e2e/prd`, which should be converted into the nine-heading brief) in an empty git repo.

**Arms** (N >= 10 each; fixed task; same brief text in every arm):

| Arm | Model | Harness | Sensors cadence |
|---|---|---|---|
| A1 | haiku | rig (brief+contracts+guides+hooks) | continuous (economy) |
| A2 | haiku | bare (brief only, no hooks, no sensors, no contracts-as-tools) | none |
| A3 | sonnet | bare | none |
| A4 | opus | bare | none |
| A5 | haiku | rig | final gate only (`edit/turn` off, `commit/ci` on) |
| A6 (optional, Jain's untested case) | opus | rig | final gate only |
| A7 (optional, isolates guides vs sensors, which J says it cannot) | haiku | guides only / sensors only | - |

Fairness [Inference]: bare arms receive the identical brief and the contracts as plain files (so only the sensors/hooks/skill differ); state this in the report. Models set by `--model`; reasoning effort held constant.

**Record per run** (JSON line): arm, run id, accepted (pass count / total, plus all-pass boolean), hidden-check failures list, tokens (input, output, cache read/write), USD (from the CLI result's cost fields; label as API-equivalent as J does), wall minutes, number of turns, sensor invocations and blocks, tamper/frozen findings (gaming signal), final diff size. Report: per arm acceptance rate with counts, median USD and minutes, and USD per accepted run (the metric that makes cheap-plus-harness vs strong-bare comparable; J's Luna+harness ~$0.27 vs Sol bare ~$0.41).

**Script shape** (`eval/run.mjs`, rig repo, not shipped to targets):
```js
// node eval/run.mjs --arms A1,A2,A3,A4,A5 --runs 10 --cap 3 --out eval/out
for (const arm of ARMS) for (let i = 0; i < runs; i++) {
  const dir = mkIsolatedCopy('eval/starter', arm)          // fresh repo, git init, copy brief+contracts
  if (arm.harness) installRig(dir, arm.policy)             // writes .rig/, .claude/settings.json hooks, CLAUDE.md
  const t0 = Date.now()
  const res = claudeP(dir, PROMPT, { model: arm.model, settings: arm.settings, maxBudgetUsd: cap })  // reuse live.mjs arg shape
  const acc = await hiddenAcceptance('tests/e2e/acceptance/shop.mjs', dir)   // outside dir; agent never sees it
  append('eval/out/results.jsonl', { arm: arm.id, i, ...acc, ...usageFrom(res), minutes: (Date.now()-t0)/6e4, ...sensorStats(dir) })
}
summarise('eval/out/results.jsonl')                          // table + USD per accepted run
```
Run in parallel at modest concurrency in Docker or separate temp dirs (J used Docker containers); run the acceptance step after the agent process exits, from a different cwd, with the suite copied in only at that moment. Rough cost [Inference, from P's $1.20/Haiku-run figure and typical Opus/Haiku price ratio]: Haiku arms ~$1-3 per run, Sonnet/Opus bare perhaps $2-8 per run, so 50-60 runs is on the order of $100-300 and under 3 hours wall with parallelism. Treat as an estimate; set `--max-budget-usd` per run.

### Gaps
- The CLI's exact JSON cost/usage field names for `-p --output-format json` were not verified here; `live.mjs` already parses the stream-json and should be the reference.
- N=10 on one task type is weak evidence (J's own caveat); do not generalize to other briefs.

---

## 7. Reuse / new / delete, by file (line counts are `wc -l` where I measured them; the rest are estimates)

### Takeaway
Roughly 1,300-1,600 lines of runtime script plus ~300 of eval; about 90% of today's 7,100 harness lines and the whole UI/spend/brain surface go.

### Cited Findings
Measured sizes: `scripts/check.ts` 466, `scripts/sensors.ts` 385, `scripts/model.ts` 452, `scripts/verify.ts` 126, `scripts/runs.ts` 100, `scripts/hooks.ts` 363, `scripts/githooks.ts` 175, `scripts/core.ts` 500, `scripts/sdlc.ts` 500, `scripts/slicecheck.ts` 31, `scripts/spend.ts` 330, `scripts/metrics.ts` 336, `hooks/*` (7 files), `tests/e2e/acceptance/shop.mjs` 80, `tests/e2e/run.mjs` 131; total scripts 18,077 incl. specs; 22 skills; 5 agents; `brain/` 3,086 source lines (P).

### Inferences

| File / area | Fate | Notes | Est. lines kept/new |
|---|---|---|---|
| `scripts/sensors.ts` | **Reuse partly** | keep `testTamper`, `loweredThresholds`, `suppressions`, `secretsInDiff`, `harnessTamper`; drop `layering`, `size`, `rulesSensor`, `retiredIdentifiers`, `contractsFromPlan`, `behaviourIds`, `tierFromDiff` | 385 -> ~200 |
| `scripts/model.ts` | **Rewrite smaller** | new schema: `sensors[]`, `policy`; drop tier/spend/chart/quality-by-tier parsing; keep `FileDiff`, glob helpers, `SECRET_PATTERNS` | 452 -> ~150 |
| `scripts/check.ts` | **Replace** | by `run --at <cadence>`: select sensors by `at`/`when`/policy, run, print concise findings | 466 -> ~150 |
| `scripts/verify.ts` + `runs.ts` | **Reuse** | exit recording/stamp of last run; `validate` becomes `sync --check` | 226 -> ~120 |
| `scripts/githooks.ts` | **Reuse** | pre-commit running `--at commit` | 175 -> ~90 |
| `scripts/hooks.ts`, `hooks/hooks.json` | **Shrink** | keep PostToolUse edit, Stop, SessionStart; drop UserPromptSubmit, SubagentStart/Stop, PostToolUseFailure(Skill) | 363 -> ~80 |
| `scripts/core.ts` | **Salvage** | git diff parsing only | 500 -> ~100 |
| `scripts/sync.ts` | **New** | render guides, check rules 1-5, brief B-id map | ~120 |
| `scripts/slicecheck.ts`, `flow.ts`, `sdlc.ts` state machine, `scopes`, `preflight`, `toolchain`, `vendor` (keep a tiny copy step), `ratchet`, `routing`, `tier`, `levels`, `stale`, `stamp`... | **Delete** | tiers, changes, slices | -3,500 or more |
| `scripts/spend.ts`, `metrics.ts`, `scorecard.ts`, `timing.ts`, `points.ts` | **Delete** | replaced by `/cost` and the eval harness's own recorder (P) | -~1,000 |
| `hooks/band.tsx`, `mission.tsx`, `driver.ts`, `register.ts`, `gates.ts`, `shared.ts` (mod) | **Delete** | UI | -715 |
| `brain/` | **Delete** | | -3,086 (+1,549 specs) |
| `skills/` (22) | **Keep/new 3**: `rig-verify` (new, ~25 lines), `rig-brief` (new, ~40), `rule` (keep); fold `test` guidance into CLAUDE.md block; `design` -> `rig-brief` | delete the other ~19 and `agents/` (use built-in Explore/Plan, `/code-review`) | ~100 |
| `guides/contracts.md`, `engineering.md`, `testing.md` | **Fold into sensors.json `guide` fields** | rules without a sensor are dropped or get one | -3 files |
| `templates/stacks.json` | **Reuse** as sensor presets (node preset gets contract, mutation, depcruise, jscpd) | | ~+40 |
| `templates/rig-check.yml` (103-217 lines) | **Reuse idea, rewrite** as `rig-ci.yml`: base-branch `rig.mjs` and `sensors.json`, `run --at ci`; add `rig-nightly.yml` | -> ~70 + ~40 |
| other `templates/*.yml` (rehearse, review, spec, triage, watch) | **Delete** except optionally review calling `/code-review` | |
| `tests/e2e/acceptance/shop.mjs` | **Reuse** (add HTTP variant) | 80 -> ~140 |
| `tests/e2e/driver/live.mjs` (`claude -p` arg shape, cost capture), `lib/checks.mjs`, `lib/sandbox.mjs` | **Reuse** pieces in `eval/` | ~80 |
| `tests/e2e/run.mjs`, phases S0-S5 | **Keep as a separate smoke test of install only, or delete** | -131 + phases |
| `eval/run.mjs`, `eval/report.mjs`, `eval/starter/` | **New** | ~200 + ~60 + brief/contracts |

Net [Inference]: runtime ~`rig.mjs` bundle 1,000-1,300 lines (below P's 2,000-2,500 target, because tiers and change records are also removed here), specs ~1,500 (rig's current ~1.4 test lines per code line would give more; keep the ratio lower on purpose), eval ~300.

### Gaps
- I did not read `core.ts`, `hooks.ts`, `githooks.ts` bodies; "salvage" estimates are based on file size and the grep hits shown above.

---

## 8. Risks and mitigations

### Takeaway
The four risks are real and each has a source-backed mitigation; the biggest unmitigated one is that the evidence base (one Java task, OpenAI models) does not transfer automatically to Claude, so the eval is a condition of shipping.

### Cited Findings
- Sensor noise / feedback overload: "I worry about feedback overload for the agent, sending it into a spiral of over-engineered refactorings"; new rule sets surfaced new issues each time — [S]
- Gaming: agent allowed to suppress, with the aim of keeping suppressions "manageable, visible and reviewable"; "Looking at the exceptions AI created (suppressed warnings, increased thresholds) was a good point to start my code review." — [S]. Skill told the agent to "correct the implementation or execution setup rather than weaken the expectations" — [J]. Evaluation isolation: "the inner harness never had access to the evaluation suite's answer key." — [J]
- Contract drift / incomplete specs: "The checks can enforce only the expectations humans encode"; "Review and maintain those expectations alongside the implementation, and use human review to address gaps in coverage"; "A less complete brief could affect both the unaided implementation and the quality of the contracts and examples" — [J]
- Cost: the harness added ~10.5x tokens / ~7x USD for the frontier model with no acceptance gain — [J]. Inferential sensors are "more non-deterministic" and GPU-run — [H]. Repo's own history: 68% of $997 weekly spend was Opus; security-review hooks firing on every Stop were the largest single item (`docs/proposals/2026-10-08-why-slow-and-the-fix.md` section 1-2.1).
- Cadence caveat: "The feedback loop depended on the agent invoking these tools ... it did not run automatically after every code edit" — [J]; i.e. continuous per-edit is not what Jain tested.

### Inferences (risk -> mitigation in this design)

| Risk | Mitigation |
|---|---|
| Feedback overload | Edit tier limited to one fast advisory lint; blocking set small; sensors added one at a time, each only when a failure repeats (steering loop); Stop blocks capped at 2 per turn then hand off to a human (rig already has bounded loops, DESIGN.md principle 8); mutation, duplication, dead-code kept off the agent loop (CI/nightly, as in S); no size/line-length rules by default |
| Agent games sensors (skips tests, loosens thresholds, edits contract, edits `sensors.json`) | `tamper`, `suppress`, `frozen` sensors; permissions deny on frozen paths; CI uses BASE branch's `rig.mjs` and `sensors.json` (DESIGN.md principle 6); tamper not waivable in CI (`check.ts:114-118`); suppression and threshold diffs surfaced in PR summary as the human review starting point [S]; hidden acceptance corpus lives outside the repo; the A/B eval records frozen-file and tamper findings as a gaming metric |
| Contract drift (spec vs code, spec vs brief, spec incomplete) | Contract tests generated from the spec each run (spec -> code direction enforced); `sync --check` ties brief B-ids to contract examples; examples validated against schemas; spec lint (`@redocly/cli`); spec is human-owned, so incompleteness is a human review item, as J says; consider zod -> OpenAPI generation (`@asteasolutions/zod-to-openapi`) if code-first teams want one source |
| Cost of inferential sensors | Zero inferential sensors in the loop; one `/code-review` in CI, advisory, once per PR (matches CLAUDE.md "one review per change"); pin cheap reviewer model; no Stop-hook LLM review; frontier models get final-gate cadence so the harness's 7x overhead is not paid for nothing |
| Harness overhead on a strong model | Grade policy (section 5) plus the A5/A6 arms measure it directly |
| Evidence does not transfer to Claude/Node/brownfield | Eval is a ship condition: if A1 (Haiku+rig) does not beat A2 (Haiku bare) on accepted rate, cut the feature, per P ("a feature that cannot show a lift should be cut rather than defended"); J itself warns against extrapolating to other briefs, languages, legacy code, vague requirements |
| Brief/contract authoring cost | Not counted in J's economics ("excludes the cost of writing and maintaining the contracts" per P); track author minutes separately in the eval write-up; `rig-brief` skill drafts, human approves |

### Gaps
- No measured false-positive rate or developer-time cost of authoring briefs/contracts exists in any source I read.
- Whether Claude-family agents game contract tests the same way (e.g. special-casing example payloads) is unmeasured; mitigated only by hidden acceptance cases that differ from visible examples (design the hidden suite with inputs not present in `examples/`) [Inference].
