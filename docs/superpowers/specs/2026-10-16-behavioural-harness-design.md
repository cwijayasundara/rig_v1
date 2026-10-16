# Behavioural harness: registry, stack packs, slim lifecycle

Date: 2026-10-16. Status: draft for review. Branch base: `e2e-live-under-20min`.

## 1. Goal

Rebuild rig as a language-independent behavioural harness on native Claude Code primitives.
An inner loop of guides and sensors steers the agent. An outer loop of evaluation proves the harness lifts a model.
It is not a copy of any one published harness. It draws on:

- the Anthropic AI-native SDLC playbook: plan acceptance and a production gate, skills advise and hooks enforce, fast hooks scoped to the change;
- Fowler, *Harness engineering*: guides before, sensors after, computational before inferential;
- Fowler, *Sensors for coding agents*: the sensor catalogue and cadences (in-session, CI, drift), the feedback-overload warning;
- Jain, *Are harnesses worth the cost?*: contracts with validated examples as the behavioural backbone, a hidden acceptance suite, cadence that depends on model grade.

Research behind this spec: `reports/rig harness fit and simplification.md` and `reports/rig behavioural harness design.md`.

## 2. Decisions taken

| Question | Decision |
|---|---|
| Language support | Core is language-free. Per-language defaults ship as JSON stack packs that `rig init` copies into the repo. |
| What a contract is | Any frozen executable spec the repo declares: OpenAPI or AsyncAPI with examples, Playwright or component specs, golden or CLI snapshot tests, public-API fixture tests. |
| Lifecycle | Kept and slimmed: intent, spec, plan, change record and evidence. Tiers, slices, points and spend removed. |
| Shape | One registry file per target repo, Claude Code hooks plus git hooks, one CLI entry `rig check <cadence>`. |

## 3. The registry: `.rig/sensors.json`

Replaces `SensorConfig` in `scripts/model.ts`. Four parts plus a policy.

```jsonc
{
  "stack": "java-maven",
  "gates": { "plan": true, "merge": true },
  "contracts": {
    "files": ["api/openapi.yaml", "contracts/examples/**"],
    "validate": "specmatic examples validate --spec api/openapi.yaml",
    "run": "specmatic test --spec api/openapi.yaml"
  },
  "models": { "build": "sonnet", "evaluate": "opus" },
  "sensors": [
    { "id": "types", "cmd": "mvn -q compile", "cadence": "edit", "blocks": true, "count": "exit",
      "guide": "Code must compile before the turn ends." },
    { "id": "secrets", "builtin": true, "cadence": "edit", "blocks": true,
      "guide": "Never write credentials into the repo; read them from the environment." }
  ],
  "policy": { "haiku": "continuous", "sonnet": "continuous", "opus": "final", "default": "continuous" }
}
```

### 3.1 Sensor fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique, kebab-case. |
| `cmd` | unless `builtin` | Shell command run from the repo root. `{files}` is replaced by the touched files when the cadence is `edit`; a command without `{files}` runs whole-repo. |
| `builtin` | no | `true` for sensors implemented in core (section 3.2). |
| `cadence` | yes | One of `edit`, `turn`, `commit`, `ci`, `nightly`. A sensor also runs at every later cadence: an `edit` sensor runs at turn, commit and ci too. `nightly` runs only in the nightly workflow. |
| `blocks` | yes | `true` blocks the hook or gate; `false` reports a warning. |
| `count` | for `cmd` | `exit`, `lines`, or `json:<path>`, as in today's `templates/stacks.json`. Non-exit counts are ratcheted against the base branch: a rise is a finding. |
| `guide` | yes | One sentence telling the agent what the sensor expects. Rendered into CLAUDE.md (section 5). |
| `timeoutMs` | no | Default 60 000 at edit and turn, 600 000 at commit and ci. |

### 3.2 Built-in sensors (language-free, no tool needed)

New: `model-role` (section 3.5, warns).
Kept from `scripts/sensors.ts`: `secrets`, `test-tamper`, `suppression`, `harness-tamper`, `size`, `layering` (regex on import lines), `rules` (`.rig/rules.json`), `red-proof`, `traceability`.
Removed: `tier`, `adhoc`, `unscoped`, `contract-impact` (consumer-repo grep; may return later).
New rule in `test-tamper`: a diff that lowers the assertion count in a frozen contract or example file is a block.

### 3.3 Policy

`policy` maps a model family to `continuous` or `final`.

- `continuous`: every cadence runs in-session.
- `final`: at `edit` and `turn`, only `secrets` and `harness-tamper` run. Everything else waits for `commit`.
- CI always runs every cadence up to `ci`, whatever the policy.

The mapping of Claude grades to policies is an assumption until section 9's evaluation measures it.

### 3.4 Knowing which model is running

Claude Code hook inputs do not carry the model, except `SessionStart`, which may omit it after `/clear` or recovery, and there is no `$CLAUDE_MODEL` (Claude Code hooks reference). `$ANTHROPIC_MODEL` does not follow `/model`. rig therefore records the model itself, per `session_id`, in `.rig/state/model.json`:

1. `PostModelSwitch` hook: writes `to_model` on every `/model` change.
2. `SessionStart` hook: writes `model` when present.
3. Fallback when neither has written: the `model` of the last assistant message in `transcript_path`. Verified on 2026-10-16: the transcript records it on every reply and reflects a mid-session switch.
4. Last resort: the pinned `model` in `.claude/settings.json`, else `policy.default`.

For tool events fired inside a subagent, the common `agent_id` and `agent_type` fields identify the subagent; its model is the one recorded for that agent at launch (section 3.5).

### 3.5 Model roles

```jsonc
"models": { "build": "sonnet", "evaluate": "opus" }
```

- **build** runs the main thread and every implementer: intent, spec, plan, code, tests. Default `sonnet` (Sonnet 5.5).
- **evaluate** runs the inferential sensors and the merge-gate review. Default `opus` (Opus 5.5). It never writes code.
- rig ships one agent, `agents/evaluator.md`, with `model: opus` in its frontmatter and read-only tools. The `pr` skill launches it once per change.
- A `PreToolUse` hook on `Agent` records each launch's `tool_input.model` against its agent, and a `PostToolUse` hook records `resolvedModel`. A launch whose resolved model differs from its role is a warning at the next prompt.
- `SessionStart` and the `model-role` built-in sensor warn when the main thread is not on the `build` model. Warning, not block: a person may choose another model deliberately.

These roles apply to target repos that rig drives. The rig repository itself may be built on any model.

## 4. Stack packs

Location in rig: `templates/stacks/<stack>.json`. Shape:

```jsonc
{
  "stack": "rust",
  "markers": ["Cargo.toml"],
  "sensors": [ /* registry sensor entries without builtins */ ],
  "contracts": { "files": [], "validate": "", "run": "" }
}
```

Packs to ship: `node`, `angular`, `python`, `go`, `rust`, `java-maven`, `java-gradle`, `dotnet`.

Each pack covers, where the ecosystem has a tool: compile or typecheck, lint, unit tests, dependency or layer rules, duplication, coverage, mutation testing, dependency audit.
Examples per stack (to be confirmed per tool when the pack is written):

| Concern | node / angular | go | rust | java | dotnet |
|---|---|---|---|---|---|
| types | `tsc --noEmit` | `go vet` | `cargo check` | `mvn -q compile` | `dotnet build` |
| lint | ESLint | golangci-lint | clippy | Checkstyle | `dotnet format --verify-no-changes` |
| layers | dependency-cruiser | go-arch-lint | cargo-deny / module tests | ArchUnit test | NetArchTest test |
| duplication | jscpd | jscpd | jscpd | jscpd | jscpd |
| mutation (nightly) | Stryker | go-mutesting | cargo-mutants | PIT | Stryker.NET |
| audit | `npm audit` | govulncheck | cargo-audit | OWASP dependency-check | `dotnet list package --vulnerable` |

`rig init` detects the stack from `markers`. When several match, it asks. It copies the pack into `.rig/sensors.json`; the team owns the file after that.
Unknown stacks get an empty `sensors` list plus built-ins, and init tells the person which concerns are unfilled.

**Contract tool across stacks.** Specmatic is the default `validate` and `run` for HTTP and event services in every pack. The npm package `specmatic` (2.55.3, MIT wrapper) bundles `specmatic.jar` and launches it with `java`, so it needs a Java runtime on `PATH` and is independent of the project's language. `rig init` checks `java -version` and, when Java is missing, leaves `contracts.validate` and `contracts.run` empty and says why. Projects without an HTTP or event interface declare their own contract commands (section 6). The licence of the bundled jar itself is to be confirmed before it is a default.

## 5. Guides and sensors in sync

`rig sync` renders every sensor's `guide` into a managed block in the target's CLAUDE.md:

```
<!-- rig:guides start hash=<sha of rendered lines> -->
- Code must compile before the turn ends. [sensor:types]
<!-- rig:guides end -->
```

`rig sync --check` fails when:

1. a sensor has an empty `guide`;
2. a line in the block names a sensor that is not in the registry;
3. the block's content does not match its hash (hand edit);
4. a behaviour in the brief (section 6) has no test named for it (the traceability sensor).

It runs at SessionStart as a warning, at commit as a block, and in CI from the base branch.
Finding 4 is the exception (step 5a): a brief behaviour with no test is always a warning, so a product can ship one change at a time.
What blocks is the change's own traceability: every B-number in the change's `spec.md` needs a test, at commit, verify and CI.
The cost: a brief behaviour no change spec ever claims can stay untested, visible only as a warning.
Text outside the block belongs to the team and is never touched.
The three long guides in `guides/` stay as path-triggered, once-per-session injections.

## 6. Contracts

- **Declared** in `contracts.files` (globs).
- **Frozen** at plan approval: `approval.json` records a hash per contract file. A diff to a frozen file before merge is a `harness-tamper` block unless a human runs `rig waive <file> --reason`.
- **Validate before run.** If `validate` is set it runs first; on failure `run` is skipped and the validate output is the finding.
- **Cadence.** `run` joins the `turn` cadence only when the turn's diff touches source covered by a contract or a contract file. It always runs at `commit` and `ci`.
- **Brief.** `.rig/product/brief.md`, from `templates/brief.md`, with headings: context and intent; non-goals; architecture; constraints; interfaces; behaviours (B-numbers); tests required. Non-goals are phrased as explicit prohibitions ("Do not add operations not listed here").

## 7. Inner loop: hooks

| Event | Cadence | Behaviour |
|---|---|---|
| `PostToolUse` on `Write\|Edit\|MultiEdit` | `edit` | Edit sensors on the touched files plus built-ins on the diff. Blocks go to stderr with exit 2. First edit of a file matching a guide's trigger injects that guide once. |
| `Stop` | `turn` | Turn sensors on the turn's diff. `decision: block` with findings, at most two attempts, then a system message. |
| git `pre-commit` / `pre-push` | `commit` | Installed by `rig init`. Primary commit gate; covers headless runs and Bash commits. |
| `SessionStart` | none | Registry summary, current change, `sync --check` as a warning. |
| `PostModelSwitch` | none | Records `to_model` for the session (section 3.4). |
| `PreToolUse` / `PostToolUse` on `Agent` | none | Records each launch's requested and resolved model (section 3.5). |
| `UserPromptSubmit` | none | Kept. Snapshots the tree so Stop diffs exactly this turn. Records a typed `/rig:approve` or `/rig:waive` with `SDLC_HUMAN=1` before the model sees the prompt, which is what makes gates human-only. Re-offers last turn's warnings once. |

Removed hooks: `SubagentStart`, `SubagentStop` (fed the UI only), `PostToolUseFailure` (skill-load fallback, not needed with 7 skills).

**Feedback shape** (all cadences): sensor id, its guide sentence, the first 20 lines of output, the rerun command. Non-blocking warnings are re-offered once at the next prompt and then dropped.
A command sensor's finding carries its registry id as its sensor name, so a waiver names one sensor. The ids `commands`, `config`, `contracts`, `unscanned`, `plan-gate`, `human-approval` and `sync` are reserved for harness findings.

## 8. Slim lifecycle

Files under `.rig/changes/<slug>/`. Status is derived from which files exist.

| Step | File | Who |
|---|---|---|
| intent | `intent.md` | agent |
| spec | `spec.md` with behaviours | agent |
| plan | `plan.md` | agent (plan mode or writing-plans) |
| plan gate | `approval.json` (hashes of spec, plan, contract files) | human, `rig approve` |
| build | diff, `evidence/` | agent |
| verify | `verify.json` (all commit and ci sensors pass) | `rig verify` |
| merge gate | PR, CI recompute from base, one `/code-review` (advisory) | human |

Kept: approvals go stale on hash change; `rig waive` is human-only and recorded; CI judges with the base branch's checker and registry.
Changed: review findings advise and never block on their own.
Removed: tiers, type-by-tier routing (replaced by the two roles in section 3.5), gates per tier, slices, checkpoint, ratchet rounds, points, value, budget, spend ledger, metrics, scorecard, timing.

Skills (7): `start` (intent and spec), `plan`, `build`, `test`, `pr`, `rule`, `init`.
Deleted skills: architecture, chart, codebase-design, decompose, design, diagnose, incident, intent, metrics, next, pr-review, prototype, sensors, spec, testplan.
Deleted elsewhere: `brain/`, `hooks/` mod UI, `agents/` (all five; replaced by one `evaluator.md`), `workflows/`, CI templates other than `rig-check.yml` and a new `rig-nightly.yml`.

## 9. Outer loop: evaluation

`eval/run.mjs` in the rig repo, reusing `tests/e2e/driver/live.mjs`.

- Task: the shop brief, scored by the hidden acceptance suite.
- Arms, 10 runs each: Haiku with rig (continuous), Haiku bare, Sonnet bare, Opus bare, Haiku with rig (final).
- Recorded per run: accepted (yes/no), checks passed, input and output tokens, USD, minutes, tamper findings.
- Output: `eval/results/<date>.md` table, committed.
- Run by hand; estimated $100 to $300 per pass. Not in CI.
- Rule: a sensor, guide or gate that shows no lift over Haiku bare, after two passes, is a candidate for removal.

Step 6 notes: a rig arm runs the brief as two rig changes (S2, S3) with the operator approving; a bare arm gets BRIEF.md and one session. Checks passed = npm test + hidden acceptance (import) + hidden acceptance (HTTP); tamper findings = test-tamper + suppression, judged commit by commit over the run. Arms measure rig as a whole; per-component lift needs ablation arms.

## 10. Tests

### 10.1 Specs (`npm test`)

- Registry: schema validation, defaults, `count` parsing, cadence inclusion, policy resolution.
- Stack packs: every `templates/stacks/*.json` validates against the pack schema; marker detection.
- Sync: each of the four failure conditions in section 5.
- Contracts: freeze, stale on change, waive, validate-before-run ordering, run only on relevant diffs.
- Core neutrality: a spec fails if any core script outside `templates/stacks/` contains a language or tool name from a deny list (`mvn`, `cargo`, `dotnet`, `npm`, `eslint`, `tsc`, `pytest`, `go test`, ...).
- Size: `scripts/size.spec.ts` cap lowered to 3 000 lines of non-spec scripts.

### 10.2 E2e (`tests/e2e`)

- **Keep** `phases/s0-install.mjs`, updated for the new skill list and hooks.
- **Replace** `phases/s1-chart.mjs` and `prd/shop-app-sprint-0.md` with a brief stage (next bullet) and `prd/shop-brief.md` in the new template.
- **Remove** `phases/s5-wiki-evals.mjs` (brain is deleted).
- **Cut** `phases/s4-deploy-maintain.mjs` down to the deploy gate; drop the watch and triage assertions in `assert/maintain.mjs`.
- **Keep** `phases/s3-delete.mjs`, minus tier assertions.
- **Add** a brief stage: write `.rig/product/brief.md` from the template, run start and plan, assert `approval.json` hashes after a scripted approve.
- **Keep** `phases/s2-greenfield.mjs`, without tier assertions; assert `verify.json` and a clean `sync --check`.
- **Add** a contract stage: the shop app gets `api/openapi.yaml` and examples. Assert validate runs before run, and a scripted edit that weakens a frozen example is blocked.
- **Add** a policy stage: the same scripted change under `continuous` and `final`; assert which sensors fired.
- **Add** an HTTP variant of `acceptance/shop.mjs` that does not import source paths.
- **Add** stack fixtures: tiny repos for node, go, java-maven, dotnet, rust under `tests/e2e/fixtures/stacks/`. Each runs `rig init` and `rig check commit`; skipped when the toolchain is absent.
- Budgets unchanged: scripted e2e free; live e2e under 20 minutes and $6.

Step 5b notes: the shop's contract commands are its own zero-dependency script (Specmatic waits on Java and its licence, §14); stack fixtures run as `npm run test:e2e:stacks` and their own CI job, not in `npm test`.

## 11. Rollout

Each step lands with `npm test` green.

1. Registry type, parser and stack packs, with an adapter that reads the old config so nothing breaks yet.
2. Hooks and `rig check <cadence>` on the registry; model recording (3.4), model roles and `agents/evaluator.md` (3.5); policy resolution.
3. Contracts, freeze and sync.
4. Deletions (lifecycle, skills, brain, UI, agents, workflows) and removal of the old-config adapter.
5. E2e rewrite and stack fixtures.
6. Eval runner and a first results pass.

## 12. Out of scope

Monorepo scopes and sparse base; consumer-repo contract impact; spend tracking (use `/cost`); dashboards; any memory or wiki layer; migrating existing target repos beyond re-running `rig init`.

## 13. Resolved questions

- **Model in hooks:** not carried by most events; rig records it from `PostModelSwitch`, `SessionStart` and the transcript (section 3.4).
- **Specmatic runtime:** needs Java on `PATH`; usable from every stack (section 4).
- **Sonnet's cadence:** `continuous`, same as Haiku (person's decision, 2026-10-16).

## 14. Open items

- Confirm the bundled `specmatic.jar` licence.
- Confirm with a spec that `PostModelSwitch` fires for `/model` and for a settings-pinned model at start.
