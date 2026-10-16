# rig inner loop today: guides, sensors, and the opt-in behavioural block

Scope: local read of `/Users/chamindawijayasundara/Documents/learning_101/rig_v1` on branch `e2e-live-under-20min`. No files were modified. Paths below are repo-relative unless absolute. Line numbers were read from the working tree on 2026-10-16. Each claim cites file:line. Quoted code is kept short.

Terminology used here:
- **Sensor**: a deterministic check that returns findings (`Finding` type, `scripts/model.ts:14`).
- **Guide**: markdown text injected into the agent's context (`guides/*.md`).
- **Quality category**: a repo-declared shell command (lint, types, deps, coupling, complexity, security, perf). rig does not implement these tools; it runs the command and counts findings (`scripts/model.ts:20`, `scripts/quality.ts:14-37`).

---

## Takeaway

rig already has a dense set of **diff-level sensors** (test tamper, suppressions, secrets, layering by regex, size, harness tamper, traceability, red-proof, contract-impact) plus **command sensors** that the repo declares (lint, types, deps, coupling, security, tests, levels) and ratchets against the base branch. Feedback reaches the agent at four points: a per-edit PostToolUse check (exit 2), an end-of-turn Stop gate (`decision: block`, up to 2 attempts), a pre-commit and pre-push git hook, and CI (`rig-check`). Guides are injected lazily on first edit of a matching file.

The **behavioural block** is a thin opt-in: two shell commands (`validate`, `run`), a glob list of frozen files, and a cadence flag. It freezes spec/plan/design approvals against edits to those files, runs `validate` before `run`, and records the result as a `behavioral` level. It does not generate examples, mocks, or contract tests, does not run at Stop or per edit under `cadence: "final"`, and is not exercised by the e2e suite.

Absent against the Fowler-style catalogue: mutation testing, coverage threshold enforcement (beyond a lowered-threshold text diff), duplication (jscpd), dependency-rule linting (dependency-cruiser / eslint-plugin-boundaries; rig only has a regex `layering` sensor), contract tests (OpenAPI / Specmatic / Pact), and architecture fitness tests. Lint, types, dependency audit, coupling (madge, node only), complexity (radon, python only), and security (semgrep/bandit/gosec) exist only as declared commands in `templates/stacks.json`.

---

## 1. Built-in sensors (scripts/sensors.ts, scripts/check.ts, scripts/model.ts)

The pure sensor functions live in `scripts/sensors.ts`. `runChecks` in `scripts/check.ts:289-316` composes them. Every sensor is pattern-based (regex on added diff lines) or a structural diff/config comparison. None uses an AST, and none is language-specific beyond the pattern tables.

Sensor-name registry: `scripts/model.ts:9-12`
```
export const SENSOR_NAMES = [
  'test-tamper', 'suppression', 'layering', 'size', 'secrets', 'rules', 'contract-impact', 'harness-tamper',
  'traceability', 'red-proof', 'unscanned', 'adhoc', 'commands', 'config', 'tier', 'unscoped', 'behavioral',
]
```
Note: `quality.<category>`, `human-approval` and `invariant` are emitted too but are not in this list (`scripts/quality.ts:17`, `scripts/quality.ts:146`, `scripts/check.ts:436`).

Composition: `scripts/check.ts:295-305`:
```
const findings: Finding[] = [
  ...testTamper(pattern, config),
  ...suppressions(pattern, config),
  ...layering(pattern, config),
  ...size(diffs, config, fileLines(...), point),
  ...secretsInDiff(pattern),
  ...rulesSensor(pattern, i.rules),
  ...contractFindings({ ...i, point }),
  ...harnessTamper(diffs, { point, toolEdited: i.toolEdited, before: i.before, after }),
]
```
`pattern = withoutFixtures(diffs, config)` (`scripts/check.ts:294`) drops files listed in `sensors.json` `fixtures` from the pattern sensors only (`scripts/sensors.ts:57-59`).

### 1.1 Per-sensor inventory

| Sensor (sensor name) | What it detects | How | Severity | Where it runs |
|---|---|---|---|---|
| `test-tamper` | Deleted test files without a similar new file (>=60% line similarity) | diff: removed-line set vs new files (`scripts/sensors.ts:66-72`) | block | stop, commit, ship, ci |
| `test-tamper` | Added skip/focus lines: `it.skip/only/todo`, `xit`, `fit`, `@pytest.mark.skip`, `@unittest.skip`, `@Disabled`/`@Ignore`, `t.Skip`, RSpec `pending`/`skip` | regex `TAMPER_PATTERNS` (`scripts/sensors.ts:6-15`), comment lines excluded | block | same |
| `test-tamper` | Assertions removed across the test diff exceed assertions added | regex `ASSERTION` count (`scripts/sensors.ts:24`, `:79-83`) | block | same |
| `test-tamper` | Coverage/threshold number lowered in a config file (json/yaml/toml/... or `*.config.js`) | key match on `THRESHOLD_KEY` (`scripts/sensors.ts:25`, `:41-55`) | block | same |
| `test-tamper` | Snapshot file rewritten (`__snapshots__/`, `.snap`) | path match (`scripts/sensors.ts:27`, `:85-87`) | warn | same |
| `suppression` | Added lint/type suppression without a reason: `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, `# type: ignore`, `# noqa`, `pylint: disable`, `//nolint`, `@SuppressWarnings`, `rubocop:disable`, `pragma: no cover`, `istanbul ignore` | regex list `SUPPRESSIONS` (`scripts/sensors.ts:17-20`); reason required on the same line after `--` or `because` (`:22`, `:91-101`) | block | same |
| `layering` | Import of a banned module word inside a layer's files | regex: line must match `IMPORT_LINE` (`scripts/sensors.ts:103`) and contain the banned token as a whole word (`:104`); config `layers: [{from, mustNotImport, why}]` (`scripts/model.ts:318-322`) | block | same |
| `size` | File grew past `limits.fileLines` (default 400) from within-limit | line counts from working tree (`scripts/sensors.ts:121-131`) | block at edit/stop, warn at ship/ci | edit, stop, ship, ci |
| `size` | Branch diff exceeds `limits.diffLines` (default 500) | sum of added+removed lines (`scripts/sensors.ts:133-139`) | block (warn at stop) | stop, ship, ci |
| `size` | Added line over `limits.lineChars` (default 160) | length check (`scripts/sensors.ts:140-150`) | warn | stop, ship, ci |
| `unscanned` | Source file over 20 MB, not scanned | `oversize` flag from diff reader (`scripts/sensors.ts:122`) | block | same |
| `secrets` (diff) | Added line matches a secret pattern | `SECRET_PATTERNS` (`scripts/model.ts:99-112`: AWS key, private key, Anthropic/OpenAI/GitHub/Slack/Google/Stripe keys, JWT, Azure key, env-style secret, generic `password=`) (`scripts/sensors.ts:154-163`) | block | stop, ship, ci |
| `secrets` (file) | Same patterns scanned on a whole file after every Write/Edit; `rig:allow-secret` marker exempts a line | `scanSecrets` (`scripts/core.ts:340-348`), called from `hookPostEdit` (`scripts/hooks.ts:84`) | exit 2 at edit | PostToolUse |
| `rules` | Repo-declared regex rules in `.rig/rules.json` (`id`, `pattern`, `paths`, `message`, `why`, `action`) | `new RegExp(rule.pattern)` on added lines (`scripts/sensors.ts:165-176`) | rule's action (block or warn) | stop, ship, ci |
| `contract-impact` | A retired identifier (renamed or dropped column, field, RPC name) still referenced in a declared consumer repo | `retiredIdentifiers` (`scripts/sensors.ts:205-216`, tokens from removed lines and `RETIRE_PATTERNS` `:179-189`) then `git grep -w` per consumer (`scripts/check.ts:126-152`) | block; warn at stop when an approved impact covers it (`scripts/check.ts:154-185`) | stop, ship, ci |
| `contract-impact` | Consumer repo not checked out, so references cannot be verified | `missing` list (`scripts/check.ts:168-173`) | block (warn at stop) | same |
| `harness-tamper` | Protected files weakened: `.rig/sensors.json` limits raised, commands removed, layers dropped, gates removed, budgets raised, `behavioral` removed or its commands changed, etc. | `weakensConfig` (`scripts/sensors.ts:235-317`), `weakensRules` (`:319-325`); `PROTECTED` list (`:227`) | block at ship/ci; warn at stop, or block at stop when the file changed outside Write/Edit (`scripts/sensors.ts:349-352`) | stop, ship, ci |
| `harness-tamper` | Any protected file (CLAUDE.md, .claude/**, guides, rules, sensors, workflows, CODEOWNERS) changed | `isProtected` (`scripts/sensors.ts:229`); plain warn (`:360`) | warn | same |
| `traceability` | A behaviour id (B1, B2, ...) listed in the spec `## Behaviours` (or plan `## Slices`) has no changed test naming it | `behaviourIds`, `missingBehaviours` (`scripts/check.ts:253-260`, `scripts/sensors.ts:373-385`) | block | ship, ci |
| `red-proof` | Changed tests must fail on the base (feature/bugfix/incident/greenfield) or pass on the base (refactor) | runs the test command in a base worktree (`scripts/check.ts:211-237`, `:263-264`) | block | ship, ci |
| `tier` | Change tier is lower than the diff touches contracts or risky paths (`**/auth/**`, `**/payments/**`, `**/migrations/**`, ...) | path match (`scripts/check.ts:277-287`) | block | ship, ci |
| `adhoc` | Ad-hoc change now tier M/L with no plan; or a CI diff with no change record at tier M/L | `scripts/check.ts:245-251`, `:271-274` | block | ship, ci |
| `commands` | A declared command failed, timed out, or the budget ran out | `runDeclared` (`scripts/check.ts:57-91`); knownRed commands warn instead (`:82-87`) | block (warn if knownRed) | stop (fast), ship/ci (full) |
| `unscoped` | Changed file matches no scope; or the affected command failed | `scripts/check.ts:314-315`, `scripts/check.ts:63` | warn | ship, ci |
| `config` | `.rig/sensors.json` or `rules.json` parse error | `scripts/check.ts:435`, `scripts/hooks.ts:234` | block | stop, ship, ci |
| `behavioral` | `validate` exits non-zero, or `run` exits non-zero | `scripts/check.ts:317-325` | block | ship, ci only |

### 1.2 Command-declared quality categories (rig runs, does not implement)

`QUALITY_CATEGORIES = ['lint','types','deps','coupling','complexity','security','perf']` (`scripts/model.ts:20`, `:26`). Each is `{cmd, count}` where `count` is `exit`, `lines`, or `json:<path>` (`scripts/configparse.ts:5`, `:23-30`). The `sensors` node runs each category on the branch and on the base, and blocks when the branch count rises (`scripts/quality.ts:138-149`). Categories with no command are reported `unmeasured` (`scripts/quality.ts:142`). A tool that fails on the branch is `fail` and blocks (`scripts/quality.ts:136`).

Test-case count may not fall: `invariant` block (`scripts/quality.ts:150-153`).

Shipped command templates: `templates/stacks.json`:
- node (`:3-10`): levels `unit`/`integration` = `npm test`; lint `npx --no-install eslint . -f unix`; types `tsc --noEmit`; deps `npm audit --json`; coupling `madge --circular --json src`; security `semgrep scan --config auto`.
- python (`:12-21`): `pytest -q`; `ruff check`; `mypy`; `pip-audit`; complexity `radon cc -n C`; `bandit`.
- go (`:22-30`): `go test ./...`; `golangci-lint`; `go vet`; `govulncheck`; `gosec`.
- java-maven (`:31-38`): `mvn -q test`; checkstyle; dependency-check; semgrep.

Stop gate runs fast commands; ship runs full (`scripts/check.ts:289-316`, `scripts/quality.ts`). The sensors skill tells the agent to fix only findings and never edit `sensors.json` (`skills/sensors/SKILL.md:16-19`).

### 1.3 Test-run levels

`LEVELS = ['unit','integration','acceptance','api']` (`scripts/model.ts:25`). Declared commands in `sensors.json` `levels` (`scripts/configparse.ts:16-22`). `verify` runs the plan's `## Verification` commands and each required level's command, records exits, and writes `verification.md` (`scripts/verify.ts:76-126`). Undeclared required level blocks the test node (`scripts/verify.ts:58-64`).

### 1.4 `sensors.json` schema (no literal template file)

There is no `sensors.json` template file in `templates/`. The schema is defined by `DEFAULT_CONFIG` (`scripts/model.ts:66-97`) and the parsers `scripts/configparse.ts` and `parseConfig` in `scripts/model.ts`. `/rig:init` writes it by hand: `skills/init/SKILL.md:15` says `{"fast": {"test": "<fast test command>"}, "full": {"test": "<full test command>", "lint": "<lint command>"}}`, then `gates`, `value.rate`, and `consumers`. `skills/init/SKILL.md:46` says `levels` and `quality` are proposed from `templates/stacks.json`. Keys with defaults from `DEFAULT_CONFIG`:
- `fast`, `full`: name to command maps (`:67-68`)
- `tests`, `testSupport`, `fixtures`, `ignore` (`**/*.md`, lockfiles), `contracts` (`api/**`, `schema/**`, `migrations/**`, `**/*.proto`, `**/openapi.*`) (`:69-73`)
- `limits`: `{fileLines: 400, diffLines: 500, lineChars: 160}` (`:76`)
- `gates`: `{S: [], M: ['design'], L: ['spec','plan','design'], greenfield: [...]}` (`:80`)
- `levels`, `quality`, `ratchet`, `value`, `points`, `scopes`, `scopeLimit`, `ci`, `bands`, `routing`, `budget`, `behavioral` (`:81-96`). `behavioral: null` by default (`:93`).
- `knownRed` (`:77`), `layers` (`:75`), `consumers` (`:74`), `githooks: {prePush: 'ship', budgetMs: 300000}` (`:79`).

---

## 2. The "behavioural" block

### 2.1 Where it is defined and what it configures

Type: `scripts/model.ts:30-31`:
```
// Opt-in behavioural harness (lite spec 2026-10-15): the repo declares its own contract commands; rig runs and freezes them.
export type BehavioralConfig = { validate?: string; run?: string; files: string[]; cadence: 'final' | 'continuous' }
```
Parser: `scripts/model.ts:352-373`. Defaults `files: ['.rig/contracts/**']`, `cadence: 'final'` (`:357`). Rejects non-string commands, bad cadence, unknown keys, and a block with neither command (`:372`: `'behavioral needs at least one of validate or run'`).

Its three features, as coded:

**(a) Frozen inputs.** `scripts/core.ts:190-196` (`behavioralFiles`) returns the files matched by `behavioral.files` plus `.rig/changes/<slug>/behavioral/**`, read from git's file list (`ls-files --cached --others --exclude-standard`). `scripts/core.ts:200` folds their content hashes into the approval digest, but only for the `spec`, `plan` and `design` gates:
```
const suffix = (frozen => (frozen.length ? `\n${sha(...)}` : ''))(['spec', 'plan', 'design'].includes(gate) ? behavioralFiles(slug) : [])
```
Test: `scripts/graph.spec.ts:24` "behavioral files are frozen by the design approval: editing or adding one makes it stale".

**(b) validate-before-run.** `scripts/verify.ts:87-96`: `validate` runs first and is recorded; if it exits non-zero, `run` is skipped (`:101`) and the output says `[behavioral] examples do not match the specs: fix the examples or the specs`. `run` then runs (`:108-114`). A `behavioral` row is appended to the levels table from the latest recorded exits (`scripts/verify.ts:45-51`):
```
const status = v !== undefined && v !== 0 ? 'fail' : config.behavioral.run ? (r === undefined ? 'not-run' : r === 0 ? 'pass' : 'fail') : v === 0 ? 'pass' : 'not-run'
```
Ship and CI re-run both from the base config, validate first (`scripts/check.ts:317-325`): block with `examples do not match the specs` or `the behavioural suite failed`. The same two commands are excluded from `runDeclared` so they do not run twice (`scripts/check.ts:326`). Waiver is never allowed at CI (`scripts/check.ts:114`, `:118`).

**(c) Cadence.** `final` (default) runs only at verify and at ship/CI. `continuous` also runs in `checkSlice` (`scripts/slicecheck.ts:21-26`) when a slice touches `behavioral.files`, a contract, or a change-local behavioural file:
```
if (b?.cadence === 'continuous' && diffs.some(d => d.file.startsWith(`.rig/changes/${slug}/behavioral/`) || matchesAny(d.file, [...b.files, ...config.contracts]))) {
  if (b.validate && runCommand(b.validate, { timeoutMs: 60_000 }).exit !== 0) return { ok: false, why: 'behavioral validate failed: examples do not match the specs' }
```
`checkSlice` is for tier S/M only (`scripts/slicecheck.ts:13`: tier L is refused).

Harness-tamper for the block: removing it, changing `validate` or `run`, removing a `files` glob, or changing `continuous` to `final` is a weakening (`scripts/sensors.ts:297-302`).

Config-level skill text: `skills/design/SKILL.md:19` "When `behavioral` is declared in `sensors.json`, list each behaviour's contract/example file in `## Verification` alongside the B-number it pins." `skills/test/SKILL.md:19` "A `behavioral` failure is fixed by changing the implementation or the execution setup, never the examples or specs (changing them needs a person to re-approve the design)."

Guide line: `guides/contracts.md:16` "8. **Specs and examples are guide and sensor.** When `behavioral` is declared, keep the specs and examples it names in sync (`validate` checks them), and treat a red `run` as a bug in the code until a person says otherwise; those files are frozen by the design approval."

### 2.2 Where it is documented

- `docs/superpowers/specs/2026-10-15-lite-behavioural-harness-design.md`: status line 3 "implemented (uncommitted; `npm test` green 2026-10-15)". Sections: `## Lite budget` (line 12), `## Problem` (27), `## Design` (37) with `### 1` config block (39), `### 2` frozen inputs (58), `### 3` cadence (77), `### 4` skill lines (107), `### 5` out of scope (118), `## Verification` (129), `## Cost of adoption` (151).
- Plan: `docs/superpowers/plans/2026-10-15-lite-behavioural-harness.md`.
- `CHANGELOG.md:19`: "**Opt-in behavioural harness (lite).** A `behavioral` block in `.rig/sensors.json` (`validate`, `run`, `files`, `cadence`) lets a repo declare its own contract commands..."
- `DESIGN.md:85`: "`sensors.json` fast/full commands, tests, gates, levels, quality, limits, layers, contracts, ratchet, value, scopes, points, behavioral (opt-in)".

The spec's own source note (spec lines 5-11) credits Naresh Jain, "Are Harnesses Worth the Cost?" (martinfowler.com, 2026-10-13), and states the design goal in lines 4-9 ("for capable models the sensors should run once as a final gate, not continuously").

### 2.3 How it is turned on

Only by adding a `behavioral` key to `.rig/sensors.json`. Nothing in `templates/` or `skills/init` writes it. `grep -rn behavioral templates skills/init` returns nothing (only `skills/design` and `skills/test` mention it). The spec says it is opt-in: "No `behavioral` block in `.rig/sensors.json` means byte-identical behaviour to today" (`docs/superpowers/specs/2026-10-15-lite-behavioural-harness-design.md:14`).

Example in the spec (`docs/superpowers/specs/...design.md:42-48`):
```
"behavioral": {
  "validate": "<cmd that checks examples against the specs, exit != 0 on mismatch>",
  "run": "<cmd that runs the behavioural suite against the implementation>",
  "files": [".rig/contracts/**"],
  "cadence": "final"
}
```

### 2.4 What runs, and when

| Point | What runs | Source |
|---|---|---|
| `/rig:test` (verify) | validate, then run (recorded) | `scripts/verify.ts:87-114` |
| `check --at ship` (pre-push) | validate, then run, from the base config | `scripts/check.ts:317-325` |
| `check --at ci` | same, not waivable | `scripts/check.ts:317-325`, `:115-121` |
| `ratchet record build --checks` (S/M, cadence continuous, touched files) | validate, then run | `scripts/slicecheck.ts:21-26` |
| Stop hook | nothing | `scripts/hooks.ts:209-259` does not reference `behavioral` |
| PostToolUse (per edit) | nothing | `scripts/hooks.ts:81-100` |
| Approval (spec/plan/design gate) | digest includes the frozen files | `scripts/core.ts:200` |

### 2.5 What it does NOT do yet

Quoted from the spec's own scope (`docs/superpowers/specs/...design.md:118-124`): "No N-run reliability evals, cost-per-accepted-change reporting or automatic cadence switching ... No env-var seam sensor, wire-format sensor or async-flow templates ... No change to CI workflows, git hooks, the ratchet's nodes or round caps, or `levels` semantics."

From the code, the gaps are:
1. **No contract tooling.** rig does not run OpenAPI validation, Specmatic, Pact, or generate mocks. The spec says so: "No Specmatic, no contract-test generator, no mock server of rig's own" (spec line 17). `validate` and `run` are whatever shell command the repo writes.
2. **No example generation or drift detection beyond the repo's own command.** `validate` is the sync step (spec §3); rig does not parse specs (spec §1: "rig never parses the specs or examples").
3. **Not at Stop, not per edit, not per slice under `cadence: "final"`.** Behavioural failure is seen first at `verify` (the test node), not while the agent edits.
4. **Freeze depends on approval gates.** Frozen only for `spec`/`plan`/`design` (`scripts/core.ts:200`). `gates.S` defaults to `[]` (`scripts/model.ts:80`), so for tier S there is no approval whose digest covers the files (inference from the code). For tier M the default gate is `design` only.
5. **No tier L per-slice run.** Tier L gets only the verify-time run (spec §3; `scripts/slicecheck.ts:13`).
6. **No reliability or cost measurement.** Explicitly out of scope (spec §5).
7. **Not exercised by the e2e.** `grep -rn behavio tests/e2e` returns nothing. The spec says "No e2e phase is added ... a live behavioural trial belongs to the first target repo that declares the block" (spec `## Verification`).
8. **Two commands only.** No per-behaviour results: `verification.md` gets one `behavioral` row (`scripts/verify.ts:50`), so a failing B-number is not named by the gate. The B-number traceability (`scripts/check.ts:253-260`) is a separate check on test names.

---

## 3. `brain/contract/`

Path: `brain/contract/rig-0.6/`. Contents (all small):
- `brain/contract/rig-0.6/.rig/sensors.json`: `{ "ignore": ["src/gen/**"] }`
- `brain/contract/rig-0.6/.rig/bin/VERSION`: `0.6.0`
- `brain/contract/rig-0.6/.rig/changes/demo/intent.md`: a tier S demo change with a title.

It is a **compatibility fixture for the rig on-disk layout**, used by the rig-brain plugin's tests. `brain/code_wiki/contract.spec.ts:9-18` copies it into a temp repo and asserts `checkRig(dir)` returns `{ present: true, version: '0.6.0', supported: true }`, and that `loadConfig` reads `ignore`. Lines 22-29 cover unsupported old versions (`0.5.2`) and unreadable versions. The plan that created it is `brain/docs/superpowers/plans/2026-10-09-wiki.md:1598` (`contract/rig-0.6/.sdlc/...`, later renamed to `.rig/`).

It is **not** related to behavioural contracts, and it is **not** a plugin API contract. The word "contract" in rig's own config means something else: `sensors.json` `contracts` globs (`scripts/model.ts:40`, default `api/**`, `schema/**`, `migrations/**`, `**/*.proto`, `**/openapi.*` at `:73`), which mark API/schema files for the consumer-impact sensor. The brain spec test is `brain/code_wiki/contract.spec.ts`.

---

## 4. Guides

### 4.1 The three guides

Location: `guides/` (plugin copy). Copied into the repo's `.rig/guides/` on first use, only when absent (`scripts/sdlc.ts:98-101`). `.rig/guides/**` is protected (`scripts/sensors.ts:227`).

| File | Bytes / lines | Frontmatter `paths` (trigger) | Why (frontmatter) | Iron rules |
|---|---|---|---|---|
| `guides/contracts.md` | 1712 / 23 | `@contracts` | "a contract rename that passes locally can silently break consumers in other repos" | 8 rules: expand-migrate-contract; list consumers in plan `## Contracts`; additive first; version breaking changes; reversible migrations; update every consumer; document contracts; specs/examples under `behavioral` are guide and sensor (line 16) |
| `guides/engineering.md` | 2055 / 29 | `@source` | "agent-written code drifts toward god files, hidden coupling and copy-paste" | One reason to change; dependencies point inward; ... |
| `guides/testing.md` | 2096 / 26 | `@tests` | "agent-written tests often pass without proving anything" | Red first (`sdlc.ts run --expect-fail`); test behaviour not implementation; one reason to fail per test named with the B-number; edges and errors are behaviours |

Only the frontmatter (`name`, `paths`, `why`) and the body are read (`scripts/hooks.ts:30-39`).

### 4.2 Trigger mapping

`scripts/hooks.ts:34-37`:
```
const tokens = (data.paths ?? '').split(',').map(s => s.trim()).filter(Boolean)
const globs = tokens.flatMap(t => (t === '@source' ? ['**'] : t === '@tests' ? config.tests : t === '@contracts' ? config.contracts : [t]))
```
`@source` is further restricted to source files, not tests (`scripts/hooks.ts:45`). Tests come from `sensors.json` `tests` (default `**/test/**`, `**/*.spec.*`, ... `scripts/model.ts:69`); contracts from `contracts` (`scripts/model.ts:73`).

### 4.3 Injection points

- **SessionStart** (`hooks/hooks.json:11-13`, `scripts/hooks.ts:56-76`): injects only the guide names, not bodies (`scripts/hooks.ts:72`: `Guides (injected when you first touch matching files): ${guides.join(', ')}`). Also routing, active change, STATE.md (first 15 lines).
- **PostToolUse** on Write|Edit|MultiEdit (`hooks/hooks.json:14-16`, `scripts/hooks.ts:81-100`): on the first edit of a matching file in the session, the guide body is returned as `additionalContext` (`scripts/hooks.ts:92`, `:99`). Session memory is `readGate().guides[session]` (`scripts/hooks.ts:44`, `:47`). **Suppressed when the same edit has block findings or secret problems** (`scripts/hooks.ts:92`: `if (!problems.length && !edits) guide = guidesFor(...)`).
- Cleared on `compact` or `clear` (`scripts/hooks.ts:58-60`).

So guides are progressive disclosure: they enter context on first touch, once per session, and never on Bash-only work.

---

## 5. Fowler-style sensor catalogue: present or absent

| Sensor type | Status | Where / note |
|---|---|---|
| Lint (eslint etc.) | **Present, declared** | `quality.lint` command, counted by `lines`/`exit`/`json` (`scripts/quality.ts:20-37`); stacks: `templates/stacks.json:5,15,25,34`. rig does not install or configure eslint. Built-in `suppression` sensor blocks new eslint-disable lines without a reason (`scripts/sensors.ts:17-20`). |
| Typecheck | **Present, declared** | `quality.types`: `tsc --noEmit` (`templates/stacks.json:6`), `mypy`, `go vet`. Also `levels`/fast test commands. |
| Unit / regression test run | **Present** | `fast.test` at Stop, `full.test` at ship (`scripts/check.ts:289-316`, `scripts/check.ts:326`); levels `unit`/`integration`/`acceptance`/`api` in `verify` (`scripts/verify.ts:76-126`); red-proof on base (`scripts/check.ts:211-237`); test-count invariant (`scripts/quality.ts:150-153`); traceability B-numbers (`scripts/check.ts:253-260`). |
| Coverage threshold | **Absent (partial)** | No coverage command in any stack template (`templates/stacks.json` has none). Only `test-tamper` flags a lowered coverage/threshold number in a config file (`scripts/sensors.ts:25`, `:41-55`). A repo can declare coverage as a `quality` category by hand; rig does not ratchet a coverage percentage itself, though `count: json:<path>` could read one. |
| Mutation testing (stryker, etc.) | **Absent** | No occurrence in `scripts/`, `skills/`, `templates/`, `guides/`. |
| Dependency rules (dependency-cruiser, eslint-plugin-boundaries) | **Absent as a tool; partial as regex** | `layering` sensor (`scripts/sensors.ts:106-119`) bans words in import lines on diffs; config `layers` (`scripts/model.ts:318-322`). No module-graph analysis, no transitive check, no tool integration. |
| Madge / module cycles | **Present, declared, node only** | `quality.coupling`: `npx --no-install madge --circular --json src` (`templates/stacks.json:8`). Not in python/go/java templates. |
| Coupling / modularity metrics | **Partial** | Coupling via madge (above). Size as modularity: `size` sensor on file lines (400), diff lines (500), line width (160) (`scripts/sensors.ts:121-152`). Complexity via `radon` (python only, `templates/stacks.json:18`). `guides/engineering.md` asks for one-reason-to-change. |
| Duplication (jscpd) | **Absent** | No occurrence. |
| Secret scan | **Present (regex)** | `secretsInDiff` (`scripts/sensors.ts:154-163`), `scanSecrets` per file on every edit (`scripts/core.ts:340-348`, `scripts/hooks.ts:84`), `security` quality category with semgrep/bandit/gosec (`templates/stacks.json`). No gitleaks or trufflehog. |
| Test-tamper detection | **Present** | `testTamper` (`scripts/sensors.ts:61-89`), see 1.1. Stop-level check also catches harness edits via Bash (`scripts/sensors.ts:349-352`). |
| Suppression comments | **Present** | `suppressions` (`scripts/sensors.ts:91-101`). |
| Contract tests (OpenAPI, Specmatic, Pact) | **Absent as a sensor** | rig does not run any contract test tool. Closest: `contract-impact` (cross-repo retired-identifier grep, `scripts/check.ts:154-185`), `contracts` globs, and the `behavioral` hook where a repo's own contract commands run (section 2). |
| Structural / architecture tests (fitness functions) | **Absent beyond `layering`** | Only the regex `layering` sensor and `harness-tamper`. No ArchUnit-style or fitness-function runner. |
| LLM review | **Present, advisory** | `agents/reviewer.md` (model `claude-opus-5-5`, effort high, read-only tools, lines 1-12), launched at pr-review; CI `templates/rig-review.yml` lines 1-12: review model follows tier (S Sonnet medium, M Sonnet high, L Opus high), "advisory: a PR's own text can try to steer it". |
| Custom regex rules | **Present** | `.rig/rules.json` (`scripts/sensors.ts:165-176`, `scripts/model.ts:384-386`). No rules are shipped by default. |
| Dependency audit (npm audit, pip-audit) | **Present, declared** | `quality.deps` in stack templates (`templates/stacks.json:7,17,27,36`). |
| Commit/push hooks | **Present** | `.rig/githooks/pre-commit` runs `check --at commit`, pre-push runs `check --at push` (`scripts/githooks.ts:14-26`). |

---

## 6. The e2e target repo and acceptance

### 6.1 Stack and fixtures

- Stack: Node.js 22 ESM, no dependencies, `node --test`. Stated in the PRD `tests/e2e/prd/shop-app-sprint-0.md:8-12` ("a Node.js 22 ESM library ...") and `:72` ("Node.js 22, ESM, no dependencies, tests with `node --test`").
- Scaffold prompt for S0: `tests/e2e/phases/s0-install.mjs:7`:
  `'Node.js 22 ESM project named shop-app, no dependencies, tests with node --test. Scaffold ONLY the empty skeleton and one passing smoke test. Do not implement any shop behaviour: that arrives later as its own charted change.'`
- S0 writes sensors.json with only `fast`/`full` `npm test` (`tests/e2e/phases/s0-install.mjs:23`). So S0 has no `behavioral` block and no quality categories in the sandbox.
- Scripted fake model's reference implementation: `tests/e2e/fixtures/shop/src/{catalog,cart,orders,http}` and `tests/e2e/fixtures/shop/test/shop.test.js` (wired in `tests/e2e/phases/s2-greenfield.mjs:8`, `:30-35`). S3 fixture: `tests/e2e/fixtures/remove` (`tests/e2e/phases/s3-delete.mjs:5`).
- A separate `tests/fixtures/shop-app/` exists (package.json, src/, test/, README). No `tests/e2e` code references it (grep for `fixtures/shop-app` in `tests` and `scripts` returns nothing). Treat it as an unused sample.

### 6.2 Acceptance tests: `tests/e2e/acceptance/shop.mjs`

Hidden from the model: the header says "Lives outside the sandbox repo, so the model never sees it" (`tests/e2e/acceptance/shop.mjs:1`). `PROMISES.shop` (lines 19-42) checks, against the repo's modules:
- catalog rejects SKU `tea` with `/invalid sku/` (line 23) and price 0 (line 24);
- `subtotalCents()` equals 2550 for TEA x2, MUG x1, TEA x1 (line 26-27);
- `cart.add('NOPE-999')` throws `/unknown sku/` (line 28);
- `checkout(cart, {code:'SAVE10'}).totalCents === 2295` (line 30);
- `FREE` throws `/unknown discount/`; empty checkout throws `/empty/` (lines 31-32);
- handler: `GET /products` 200, `POST /cart` 201, `POST /checkout` total 900 for TEA x2, unknown SKU 400, unknown path 404 (lines 33-38);
- no `dependencies` in `package.json` (lines 39-40).

`PROMISES.remove` (lines 43-61) re-runs `shop` then checks `Cart.remove` and `DELETE /cart/<sku>` (200; absent SKU 400).

Each phase runs in a child process so Node's module cache does not serve stale code (`tests/e2e/acceptance/shop.mjs:64-75`).

### 6.3 Application brief handed to the agent

Yes, two layers:

1. **PRD** `tests/e2e/prd/shop-app-sprint-0.md` (87 lines, `status: accepted`). Written into the sandbox by S1 as `.rig/product/prd/sprint-0.md` (`tests/e2e/phases/s1-chart.mjs:9`), then charted by `/rig-chart`, approved by the test (not the model) (`tests/e2e/phases/s1-chart.mjs:15-16`). Its FRs contain explicit contracts and acceptance criteria. Example, quoted from `tests/e2e/prd/shop-app-sprint-0.md:30-32`:
   `- Contract: \`Catalog\` exported from \`src/catalog/products.js\` with \`add({ sku, name, priceCents })\`, \`get(sku)\` and \`list()\``
   `- Acceptance criteria: Given a product \`{ sku: 'TEA-001', name: 'Green tea', priceCents: 450 }\`, when it is added, then \`get\` and \`list\` return it; given a SKU that is not three capitals, a dash and three digits, when it is added, then it throws an error containing \`invalid sku\`; ...`
   NFRs (lines 64-66) include "money and quantities are validated integers; no float money anywhere" and "runtime dependencies | 0 (Node built-ins only)".

2. **Prompt to the S2 build** `tests/e2e/phases/s2-greenfield.mjs:13` (quoted in full):
   `'/rig-start A feature, tier M (one change of about six files; the person has decided the tier). Build the shop described in .rig/product/prd/sprint-0.md (the charted, approved walking-skeleton intent): a Catalog, a Cart, checkout with the SAVE10 and SAVE20 discount codes, and a transport-agnostic HTTP-style handler, exactly as the PRD FRs state. Include tests. Money is integer cents; no dependencies. Keep the implementation compact — the harness size sensor caps one change at 500 changed lines, so write only the four PRD modules and their tests, with no extra helper files.'`
   The S2 design text (`tests/e2e/phases/s2-greenfield.mjs:20-29`) is also seeded: the `## Contracts` list, `## Files`, `## Verification` (`- npm test`). That design is the approved plan in the scripted run; in live mode the model writes it.

The PRD's own spec text is a Fowler-style contract in prose, not a machine-readable contract (no OpenAPI or example file). It is not in `behavioral.files` (no `behavioral` block is set in the sandbox).

### 6.4 How e2e scores success

- Each check is `PASS` if the function returns `true`, else `FAIL` with a reason (`tests/e2e/lib/checks.mjs:8-15`). A thrown error is a FAIL.
- Acceptance is the hidden `shop` and `remove` oracles (`tests/e2e/acceptance/shop.mjs`, called from `tests/e2e/phases/s2-greenfield.mjs:55` and `tests/e2e/phases/s3-delete.mjs:46`).
- Harness conformance is checked against the harness's own oracle: `tests/e2e/lib/oracle.mjs` runs `loadConfig` and `requiredLevels` in a child, so assertions follow the vendored checker rather than restating it (`tests/e2e/lib/oracle.mjs:1-3`).
- Scripted runs fail if a group runs fewer checks than a floor (`tests/e2e/run.mjs:54-58`, `FLOOR`).
- Live runs add a wall-clock budget: `--minutes` default 20 (`tests/e2e/run.mjs:124-129`), and a spend cap `--cap` default $6 (`tests/e2e/run.mjs:33`, `tests/e2e/driver/live.mjs:16-21`).
- Live default model: `claude-haiku-5-5` (`tests/e2e/run.mjs:33`, `tests/e2e/driver/live.mjs:16`).
- Exit code: 1 if any check failed (`tests/e2e/run.mjs:64`).

---

## 7. Hook wiring and how failures reach the agent

### 7.1 Event table (`hooks/hooks.json`)

| Event | Matcher | Command (suffix) | Timeout | Line |
|---|---|---|---|---|
| UserPromptSubmit | none | `sdlc.ts hook prompt-submit` | 15 s | `hooks/hooks.json:5-7` |
| Stop | none | `sdlc.ts hook stop` | 90 s | `hooks/hooks.json:8-10` (timeout at :9) |
| SessionStart | `startup|resume|clear|compact` | `sdlc.ts hook session-start` | 10 s | `hooks/hooks.json:11-13` |
| PostToolUse | `Write|Edit|MultiEdit` | `sdlc.ts hook post-edit` | 15 s | `hooks/hooks.json:14-16` |
| SubagentStart | none, async | `sdlc.ts hook subagent-start` | 10 s | `hooks/hooks.json:17-19` |
| SubagentStop | none, async | `sdlc.ts hook subagent-stop` | 10 s | `hooks/hooks.json:20-22` |
| PostToolUseFailure | `Skill` | `sdlc.ts hook skill-failed` | 10 s | `hooks/hooks.json:23-25` |

`hooks/hooks.json:2`: "No hook runs on Bash." There is no PreToolUse hook in the plugin hooks file. The only pre-tool gate is the mod's `tool.call` handler in `hooks/gates.ts:17-35`, which asks the person before an edit that is part of a cross-repo contract impact, and only when the mod is installed.

Each hook is dispatched through `cmdHook` (`scripts/hooks.ts:358-363`) and skipped if the repo registers the same hook itself (`scripts/hooks.ts:345-356`).

### 7.2 How failures are surfaced

**Per edit (PostToolUse, exit 2 with stderr).** `scripts/hooks.ts:94-98`:
```
if (problems.length || edits) {
  process.stderr.write(`sdlc check failed, fix before continuing:\n${[...problems, edits].filter(Boolean).join('\n')}\n`)
  process.exitCode = 2
  return
}
```
Only `block` findings from `editFindings` are shown (`scripts/hooks.ts:91`), excluding `secrets` (covered by `scanSecrets`). Edits are judged against the turn baseline (`scripts/hooks.ts:78-79`), so debt that already existed is not blamed. `editFindings` is defined in `scripts/check.ts` (not reviewed in full here; called as `editFindings(rel)` at `scripts/check.ts:446` and `scripts/hooks.ts:91`).

**End of turn (Stop, JSON decision).** `scripts/hooks.ts:209-259`:
- Runs `runChecks` with `point: 'stop'`, `commands: 'fast'` unless the working-tree stamp already passed (`scripts/hooks.ts:228-233`).
- Skips when the diff hash matches a passed state (`scripts/hooks.ts:219-220`).
- First two failures: `out(JSON.stringify({ decision: 'block', reason: ... }))` (`scripts/hooks.ts:257`), so the agent is forced to continue. `MAX_BLOCKS = 2` (`scripts/hooks.ts:133`).
- After the second: `systemMessage` "unresolved after 2 attempts (.rig/unresolved.json). Ship and CI will refuse until they are fixed or the person waives them" and halt (`scripts/hooks.ts:250-254`).
- Warnings that do not block are passed as `systemMessage` (`scripts/hooks.ts:245-246`) and re-offered once at the next prompt (`scripts/hooks.ts:191-202`).
- Stop budget: `STOP_BUDGET_MS = 60_000` (`scripts/hooks.ts:134`).

**Next prompt.** Unshown warnings from the last turn are injected as `additionalContext` (`scripts/hooks.ts:200-202`).

**Pre-commit / pre-push (git).** `scripts/githooks.ts:14-26`: `pre-commit` runs `check --at commit`, `pre-push` runs `check --at push`; a broken hook warns and lets git continue. Pre-push uses `githooks.budgetMs` (default 300000, `scripts/model.ts:79`).

**CI.** `templates/rig-check.yml` runs `sdlc.ts check --at ci --base ... --config-from ...` (the "sdlc check" step, lines 44-49). Config and checker come from the base branch (`templates/rig-check.yml:2-3`, `:21-34`).

**Test node and quality node.** `verify` writes `verification.md` and exits 1 on a failed run (`scripts/verify.ts:125`). `quality` exits 2 on blocks (`scripts/quality.ts:175`), and `ratchet` records round counts (`scripts/quality.ts:167`).

### 7.3 Summary

Blocking channels: PostToolUse exit 2 with stderr (per edit, block findings only); Stop `decision: block` (end of turn, max 2 rounds); git hooks and CI exit codes (ship/CI). Advisory channels: Stop `systemMessage`, the next-prompt carry-over, the PostToolUse guide `additionalContext`.

---

## Key questions, answered

**What sensors does rig already have, and how is feedback delivered to the agent?**
Sixteen-plus built-in sensor names (section 1.1), plus command-declared quality categories and levels (1.2, 1.3). Per-edit feedback is exit 2 + stderr for block-severity findings (7.2). End-of-turn feedback is `decision: block` with the findings in `reason`, up to two rounds (7.2). Ship and CI are exit codes from `sdlc.ts check`.

**What exactly is the behavioural block today and how complete is it?**
Two optional shell commands plus a frozen file list and a cadence. It is complete as a plumbing layer: it freezes approvals, runs validate-then-run at verify, ship and CI, optionally at tier S/M slice record, and is protected against weakening. It is not a behavioural-testing system: it generates nothing, runs no contract tool, does not run at Stop or per edit, and is untested in e2e (section 2.5).

**What is missing versus the sensor catalogue above?**
Mutation testing, coverage threshold enforcement, duplication (jscpd), dependency-rule tooling (dependency-cruiser / eslint-plugin-boundaries; only the regex `layering` sensor exists), contract tests (OpenAPI / Specmatic / Pact), architecture or fitness tests. Lint, typecheck, audit, coupling and complexity exist only as commands a repo declares.

---

## Gaps in this research

- `scripts/check.ts` `editFindings` and `cmdCheck` (lines ~394-441) were not read in full. The claims about per-edit findings rely on their call sites.
- `brain/shared/rigcontract.ts` `checkRig` was not read; the brain/contract claim relies on its spec test.
- `tests/e2e/driver/live.test.mjs`, `tests/e2e/lib/operator.mjs` past line 25, and `tests/e2e/assert/*.mjs` were only sampled. The e2e scoring summary relies on `lib/checks.mjs`, `run.mjs` and the phase files.
- The Fowler article itself was not consulted (local-only task). The catalogue used is the one listed in the research brief.
- The `exit 2` semantics for PostToolUse (stderr shown to the model) are the harness's own intent per the code comment and call site, not verified against Claude Code docs.
