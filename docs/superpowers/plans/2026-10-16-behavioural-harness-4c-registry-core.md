# Behavioural harness step 4c: the core reads the registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans natively, see CLAUDE.md "One review per change") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every check reads `.rig/sensors.json` as a registry, directly. The old config shape, its parser and its adapter are deleted. The `behavioral` sensor becomes `contracts`. A spec keeps tool names out of core. Dead exports go, and the size cap is set to the real total.

**Architecture:**
- `loadConfig` returns `{ registry, rules, errors }`. An old-shape file is a config error that names the fix (`init --stack`).
- `runSensors` in `check.ts` replaces `runDeclared`. It walks `activeSensors(registry, cadence, 'continuous')`, builds each command with `commandFor`, and applies `blocks` and `knownRed` per sensor id.
- The built-in sensor functions take the `Registry`: paths from `registry.paths`, size limits and layers from the built-ins' `options`.
- After the switch, the adapter modules have no importers and are deleted.

**Tech Stack:** Node 22 native TypeScript, `node --test`, git. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`:
- §3: the registry, the sensor fields, the cadences.
- §10.1: the core-neutrality spec and the size cap.
- §11 step 4: removal of the old-config adapter.

The person decided on 2026-10-16:
- Step 4 is split into 4a, 4b and 4c (this plan).
- The cap is the measured total after a dead-code sweep. 3 000 stays a recorded target for later; no live feature is cut to reach it.

## Global Constraints

- Every non-spec script is at most 500 lines. The size cap only goes down.
- `noUnusedLocals` holds: `npm run typecheck` passes after every step that says to run it.
- `npm test` is green at the end of every task.
- Approvals and waivers stay human-only. CI judges with the base branch's checker and registry (`--config-from`).
- A spec test is deleted only when everything it asserts belongs to deleted code. Otherwise it is converted to a registry fixture.
- Out of scope: count-based ratchets for `lines` and `json:` sensors (they keep running on exit code) and the scripted e2e suite (step 5).

## Decisions this plan takes (flag in review if wrong)

1. **An old-shape `sensors.json` is a config error, not migrated.** The error reads: `.rig/sensors.json uses the pre-registry format; run sdlc.ts init --stack to write a registry (spec 2026-10-16 §3)`. Spec §12 puts migration beyond re-running init out of scope. `init --stack` on an existing old-shape file says to move it aside first.
2. **Cadence per firing point.**
   - Stop runs `turn`.
   - The pre-commit hook runs `commit`. Before this step it ran only the fast commands. Its budget becomes 600 000 ms, spec §3.1's commit default.
   - Pre-push, `verify` and CI run `ci`.
   - `nightly` never runs here.
3. **Red-proof runs the `unit` sensor's command.** `red-proof.options.sensor` can name another command sensor. With no such sensor, red-proof warns and skips, as it does today with no test command.
4. **Pre-push has no settings.** It always runs, inside a budget of 600 000 ms. `githooks.prePush` and `githooks.budgetMs` have no registry home and are gone.
5. **Contracts are declared only in the registry.** `contractGlobs` moves into `registry.ts`. The `.rig/changes/<slug>/behavioral/` folder convention is dropped: a contract file lives under `contracts.files`, or under the `.rig/contracts/**` default when commands are set.
6. **The `behavioral` finding becomes `contracts`.** That covers `SENSOR_NAMES`, the CI no-waiver rule and the messages.
7. **`new --tier` is gone.** Fixtures drop it.
8. **Core neutrality.** The spec denies tool and command names in non-spec scripts. Three pattern constants in `sensors.ts` (`TAMPER_PATTERNS`, `SUPPRESSIONS`, `CONFIG_FILE`) match language idioms in a diff, so they are data, not invocations. The spec strips those three constant bodies before scanning. Comments that name tools are reworded.

## Review Focus

1. A repo still on the old shape gets one clear config error at Stop, at commit and in `status`, never a crash. Test in Task 1.
2. A sensor marked `"blocks": false` warns at every cadence, a `knownRed` sensor that fails warns, and a `knownRed` sensor that passes is removed from `knownRed`, keyed by the sensor id. Test in Task 1.
3. A `{files}` sensor at `turn`, `commit` or `ci` runs on the whole repo (`.`). An edit-cadence `{files}` sensor in the PostToolUse hook still gets only the touched file. Test in Task 1.
4. Red-proof with no `unit` sensor warns instead of passing silently or crashing. Test in Task 1.
5. `--config-from <base>` at CI judges with the base's registry. If the base file is old-shape, CI reports that config error. It must not quietly use the PR's file. Test in Task 1.

---

### Task 1: The checks run on the registry

**Files:**
- Modify:
  - `scripts/check.ts`: `loadConfig`, `CheckInput`, `runSensors` replacing `runDeclared`, `builtinsApplied`, `proofOnBase`, `testCorpus`, `runChecks`, `cmdCheck`, `editFindings`.
  - `scripts/sensors.ts`: sensor functions take `Registry`; `weakensConfig` keeps only the registry path.
  - `scripts/model.ts`: `isTest(file, paths)` and `isSource(file, paths)` take `Paths`.
  - `scripts/registry.ts`: `contractGlobs` and `builtinOptions` live here; `RANK` is exported.
  - `scripts/contracts.ts`: imports `contractGlobs` from registry.
  - `scripts/lifecycle.ts`: `freezeRecord` lists files with `contractFiles()`.
  - `scripts/core.ts`: delete `behavioralFiles`.
  - `scripts/hooks.ts`, `scripts/verify.ts`, `scripts/githooks.ts`, `scripts/initbaseline.ts`, `scripts/sync.ts`, `scripts/pr.ts`, `scripts/sdlc.ts`, `scripts/stackinit.ts`: callers.
  - `scripts/testkit.ts`: a `registry()` fixture helper.
- Test: `scripts/registrycore.spec.ts` (new), plus every spec that writes an old-shape `sensors.json`. The inventory found these: check, sensors, githooks, gate, sdlc, initbaseline, seeded, contracts, overhead, sync, scopes, model, registry.

**Interfaces:**
- Produces:
  - `loadConfig(ref?): { registry: Registry; rules: Rule[]; errors: string[] }`, where `registry` is never null.
  - `CheckInput.config` is a `Registry`. The field keeps its name, so call sites change only their type.
  - `CheckInput.commands: 'fast' | 'full' | 'none'` keeps its values: `fast` runs cadence `turn`, and `full` runs `commit` at the commit point and `ci` elsewhere.
  - `runSensors(r: Registry, at: Cadence, slug: string | null, budgetMs: number, allowRatchet?: boolean, skip?: Set<string>): Finding[]`.
  - `isTest(file: string, paths: Paths): boolean` and `isSource(file: string, paths: Paths): boolean`, in model.ts with `Paths` imported as a type from registry.ts.
  - registry.ts: `contractGlobs(c: Contracts): string[]` (moved from contracts.ts) and `builtinOptions(r: Registry, id: BuiltinId): Record<string, unknown>`.
  - lifecycle.ts: `contractFiles(): string[]`, the git-listed files matching `contractGlobs` of the current registry.
  - testkit: `registry(v: { turn?: Record<string, string>; commit?: Record<string, string>; ci?: Record<string, string>; advisory?: string[]; knownRed?: string[]; contracts?: object; size?: object; layers?: unknown[]; paths?: object; extra?: object }): string`. It returns the registry JSON text, for `write(repo, '.rig/sensors.json', registry({...}))`.

- [ ] **Step 1: Write the failing tests** in `scripts/registrycore.spec.ts`

```ts
// The core reads the registry directly (behavioural harness spec 2026-10-16 §3, step 4c).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeRepo, sdlc, hook, write, gitIn, registry } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const commit = (text: string) => { write(repo, '.rig/sensors.json', text); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const turn = (rel = 'src/a.js') => { hook(repo, 'prompt-submit', {}); write(repo, rel, `export const a = ${Math.random()}\n`); return hook(repo, 'stop', { session_id: 's1' }) }
const marker = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-4c-')), 'ran.txt')
const mark = (file: string, name: string, exit = 0) => `node -e "require('fs').appendFileSync('${file}', '${name}\\n'); process.exit(${exit})"`
const ran = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [])

test('an old-shape sensors.json is one clear config error at Stop, commit and status', () => {
  commit(JSON.stringify({ fast: { test: 'node -e 0' } }))
  const stop = JSON.parse(turn().stdout)
  assert.equal(stop.decision, 'block')
  assert.match(stop.reason, /pre-registry format; run sdlc\.ts init --stack/)
  gitIn(repo, 'add', '.')
  assert.match(sdlc(repo, ['check', '--at', 'commit']).stdout, /pre-registry format/)
  assert.equal(sdlc(repo, ['status']).code, 0)
})

test('Stop runs turn sensors, commit runs commit sensors, never nightly', () => {
  const m = marker()
  commit(registry({ turn: { t: mark(m, 'turn') }, commit: { c: mark(m, 'commit') }, extra: { sensors: [{ id: 'n', cmd: mark(m, 'nightly'), cadence: 'nightly', blocks: false, count: 'exit', guide: 'n' }] } }))
  turn()
  assert.deepEqual(ran(m), ['turn'])
  gitIn(repo, 'add', '.')
  sdlc(repo, ['check', '--at', 'commit'])
  assert.deepEqual(ran(m), ['turn', 'turn', 'commit'])
})

test('blocks:false warns; a failing knownRed sensor warns; a passing one leaves knownRed by its id', () => {
  const m = marker()
  commit(registry({ turn: { soft: mark(m, 'soft', 1), red: mark(m, 'red', 1) }, advisory: ['soft'], knownRed: ['red'] }))
  const r = turn()
  assert.doesNotMatch(r.stdout, /"decision":"block"/, r.stdout)
  commit(registry({ turn: { red: mark(m, 'red', 0) }, knownRed: ['red'] }))
  turn()
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).knownRed, [])
})

test('a {files} sensor runs on the whole repo at turn, and on the touched file at edit', () => {
  const m = marker()
  const echo = `node -e "require('fs').appendFileSync('${m}', process.argv.slice(1).join(' ') + '\\n')" {files}`
  commit(registry({ extra: { sensors: [{ id: 'lint', cmd: echo, cadence: 'edit', blocks: true, count: 'exit', guide: 'Lint passes.' }] } }))
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'src/a.js') } })
  hook(repo, 'stop', { session_id: 's1' })
  assert.deepEqual(ran(m), ['src/a.js', '.']) // the shell strips commandFor's quoting before the script sees argv
})

test('red-proof with no unit sensor warns and skips', () => {
  commit(registry({}))
  gitIn(repo, 'checkout', '-qb', 'feature')
  sdlc(repo, ['new', 'demo', '--type', 'feature'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- B1 x\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo'], { env: { SDLC_HUMAN: '1' } })
  write(repo, 'test/a.test.js', '// B1\n')
  const r = sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--slug', 'demo'])
  assert.match(r.stdout, /red-proof[\s\S]*no unit sensor/)
})

test('CI with --config-from judges with the base registry; an old-shape base is a config error', () => {
  commit(JSON.stringify({ fast: { test: 'node -e 0' } }))
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/sensors.json', registry({}))
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'pr')
  assert.match(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main']).stdout, /pre-registry format/)
})
```

Add `registry` to `scripts/testkit.ts`:
```ts
// A registry-shaped sensors.json for fixtures: command maps per cadence, plus the few built-in options specs set.
export function registry(v: { turn?: Record<string, string>; commit?: Record<string, string>; ci?: Record<string, string>; advisory?: string[]; knownRed?: string[]; contracts?: object; size?: object; layers?: unknown[]; paths?: object; extra?: { sensors?: object[] } & Record<string, unknown> } = {}): string {
  const cmds = (cadence: string, m: Record<string, string> = {}) => Object.entries(m).map(([id, cmd]) => ({ id, cmd, cadence, blocks: !(v.advisory ?? []).includes(id), count: 'exit', guide: `${id} passes.` }))
  const builtins = [...(v.size ? [{ id: 'size', builtin: true, options: v.size }] : []), ...(v.layers ? [{ id: 'layering', builtin: true, options: { layers: v.layers } }] : [])]
  const { sensors: more = [], ...rest } = v.extra ?? {}
  return JSON.stringify({ sensors: [...cmds('turn', v.turn), ...cmds('commit', v.commit), ...cmds('ci', v.ci), ...builtins, ...more], knownRed: v.knownRed ?? [], ...(v.contracts ? { contracts: v.contracts } : {}), ...(v.paths ? { paths: v.paths } : {}), ...rest })
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/registrycore.spec.ts`
Expected: FAIL. The old shape is still accepted, commit runs only the fast commands, and red-proof says nothing about a unit sensor.

- [ ] **Step 3: `loadConfig`, the runner and the built-ins** (`scripts/check.ts`)

```ts
const OLD_SHAPE = '.rig/sensors.json uses the pre-registry format; run sdlc.ts init --stack to write a registry (spec 2026-10-16 §3)'

// With a ref (CI), the registry comes from the base branch, so a PR cannot loosen the rules it is judged by.
export function loadConfig(ref: string | null = null): { registry: Registry; rules: Rule[]; errors: string[] } {
  if (ref && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === null) return { registry: defaultRegistry(), rules: [], errors: [`config ref ${ref} does not exist`] }
  const text = (rel: string): string => (ref ? git(['show', `${ref}:${rel}`]) ?? '' : read(path.join(ROOT, rel)))
  const r = parseRules(text('.rig/rules.json'))
  const raw = text(SENSORS_JSON)
  const ruleErrors = r.errors.map(e => `rules.json: ${e}`)
  if (raw.trim() && !isRegistryShape(raw)) return { registry: defaultRegistry(), rules: r.rules, errors: [OLD_SHAPE, ...ruleErrors] }
  const p = parseRegistry(raw)
  return { registry: p.registry, rules: r.rules, errors: [...p.errors.map(e => `sensors: ${e}`), ...ruleErrors] }
}

// Built-ins a team turned off are dropped; built-ins it made advisory warn.
function builtinsApplied(findings: Finding[], r: Registry): Finding[] {
  const builtin = (id: string) => r.sensors.find(s => s.builtin && s.id === id)
  return findings.filter(f => builtin(f.sensor)?.enabled !== false).map(f => (f.severity === 'block' && builtin(f.sensor)?.blocks === false ? { ...f, severity: 'warn' as const } : f))
}

// The registry's command sensors due at this cadence (spec §3.1), in order, inside one time budget. A sensor with
// "blocks": false warns; a knownRed one warns while it fails and leaves knownRed once it passes.
export function runSensors(r: Registry, at: Cadence, slug: string | null, budgetMs: number, allowRatchet = false, skip?: Set<string>): Finding[] {
  const findings: Finding[] = []
  const cleared: string[] = []
  let left = budgetMs
  for (const s of activeSensors(r, at, 'continuous')) {
    const cmd = commandFor(s, null)
    if (!cmd || skip?.has(normCmd(cmd))) continue
    const known = r.knownRed.includes(s.id)
    if (left <= 0) {
      findings.push({ sensor: 'commands', severity: s.blocks ? 'block' : 'warn', message: `${s.id} not run: the ${Math.round(budgetMs / 1000)} s budget ran out`, fix: `make ${s.id} faster or move it to a later cadence in .rig/sensors.json` })
      continue
    }
    const row = runCommand(cmd, { timeoutMs: Math.min(left, s.timeoutMs ?? left) })
    left -= row.ms
    if (slug) recordRun(slug, { ...row, source: at === 'turn' ? 'gate' : 'ship' })
    if (row.exit === 0) { if (known) cleared.push(s.id); continue }
    const tail = row.tail.split('\n').slice(0, 20).map(t => '      ' + t).join('\n')
    findings.push({
      sensor: 'commands',
      severity: !s.blocks || (known && !row.timedOut) ? 'warn' : 'block',
      message: `${s.id} failed (exit ${row.exit}${row.timedOut ? ', timed out' : ''}): ${s.guide}\n${tail}`,
      fix: known && !row.timedOut ? 'known red before this change: fix it when you can' : `fix what it reports, then rerun: ${cmd}`,
    })
  }
  if (cleared.length && allowRatchet) ratchet(cleared)
  return findings
}
```
- In `runChecks`:
  - Compute `const at: Cadence = i.commands === 'fast' ? 'turn' : i.point === 'commit' ? 'commit' : 'ci'`.
  - Replace the `runDeclared(...)` call with `if (i.commands !== 'none') findings.push(...runSensors(config, at, i.point === 'ci' ? null : i.slugs[0] ?? null, i.budgetMs, Boolean(i.ratchet) && i.point !== 'ci', contractCmds))`, where `contractCmds = new Set([config.contracts.validate, config.contracts.run].filter(Boolean).map(normCmd))`.
  - The contracts call becomes `if ((i.contracts ?? (i.point === 'ship' || i.point === 'ci')) && (config.contracts.validate || config.contracts.run)) findings.push(...runContracts(config.contracts, ...))`.
  - Delete the `unscoped` block.
  - `builtinsApplied(findings, config)` keeps its call.
- `cmdCheck`:
  - Destructure `{ registry: config, rules, errors }`.
  - At commit, pass `commands: replaying ? 'none' : 'full'` and `budgetMs` default `600_000`. Stop stays `60_000` (`partial` now means `at === 'stop'` only for the budget).
  - Pass `contracts: at === 'commit' ? !replaying : undefined` and `gates: config.gates`.
  - `syncBlocks` loses its `registry &&` guard.
- `proofOnBase` and `testCorpus` read `config.paths` through `isTest(f, config.paths)`. The test command becomes:
```ts
  const id = String(builtinOptions(config, 'red-proof').sensor ?? 'unit')
  const unit = config.sensors.find(s => s.id === id && s.cmd && s.enabled)
  const cmd = unit ? commandFor(unit, null) : null
  if (!cmd) return [{ sensor: 'red-proof', severity: 'warn', message: `no unit sensor (${id}) to run the new tests on the base`, fix: 'add a command sensor with id "unit", or set red-proof options.sensor' }]
```
- `applyWaivers`'s CI exclusion: `f.sensor === 'behavioral'` becomes `f.sensor === 'contracts'`. Decision 6 renames the finding in Task 3, so make both edits in Task 3. Here, keep `'behavioral'`.

- [ ] **Step 4: `registry.ts`, `model.ts`, `sensors.ts`**

- registry.ts:
```ts
// The contract files, as the freeze sees them: commands with no files declared default to .rig/contracts/**.
export const contractGlobs = (c: Contracts): string[] => (c.files.length ? c.files : c.validate || c.run ? ['.rig/contracts/**'] : [])
export const builtinOptions = (r: Registry, id: BuiltinId): Record<string, unknown> => r.sensors.find(s => s.builtin && s.id === id)?.options ?? {}
```
  Export `RANK`, which already exists for `runsAt`. Delete `contractGlobs` from contracts.ts and import it there and in hooks.ts.
- model.ts: `isTest = (file: string, paths: Paths): boolean => matchesAny(file, paths.tests)`. `isSource` checks `paths.ignore`, `.rig/` and `paths.tests` the same way it does today, with `cfg.` replaced by `paths.`.
- sensors.ts: each function that took `cfg: SensorConfig` takes `r: Registry`:
  - `withoutFixtures` reads `r.paths.fixtures`.
  - `testTamper` and `suppressions` use `isTest(f, r.paths)`.
  - `layering` reads `(builtinOptions(r, 'layering').layers ?? []) as Layer[]`.
  - `size` reads `{ fileLines, diffLines, lineChars }` from `builtinOptions(r, 'size')`, with the defaults 400, 500 and 160.
  - `retiredIdentifiers` uses `contractGlobs(r.contracts)`.
  - `weakensConfig(before, after)` becomes `return weakensRegistry(before, after)`. Delete the legacy branch and its imports (`parseConfig`, `RATCHET_NODES`, `isRegistryShape`).

- [ ] **Step 5: lifecycle, core, the callers**

- lifecycle.ts:
```ts
// The contract files under the registry's globs (spec §6), tracked or new.
export function contractFiles(): string[] {
  const globs = contractGlobs(parseRegistry(read(path.join(SDLC, 'sensors.json'))).registry.contracts)
  if (!globs.length) return []
  return (git(['ls-files', '--cached', '--others', '--exclude-standard']) ?? '').split('\n').filter(f => f && globs.some(g => globToRegex(g).test(f))).sort()
}
```
  `freezeRecord(slug)` uses `contractFiles()` (it keeps its `slug` parameter for the call sites; its value is unused, so rename the parameter `_slug`). Delete `behavioralFiles` from core.ts.
- hooks.ts:
  - `listGuides(r: Registry)` maps `@tests` to `r.paths.tests` and `@contracts` to `contractGlobs(r.contracts)`.
  - Every `const { config, ... } = loadConfig()` becomes `const { registry, ... } = loadConfig()`. Pass `registry` where `config` went, and use `isSource(f, registry.paths)`.
  - Delete the `registry ? … : …` fallbacks and `modeNow`'s null branch (the registry is never null).
- verify.ts, githooks.ts, pr.ts, sdlc.ts, sync.ts: the same destructuring change.
  - githooks: delete the `prePush === 'off'` early return and use `const PUSH_BUDGET_MS = 600_000`.
  - sdlc.ts: `loadConfig().config.knownRed` becomes `loadConfig().registry.knownRed`.
  - sync.ts `cmdSync`: refuse an old-shape file with the `OLD_SHAPE` text. Import it from check.ts, or repeat the string.
- initbaseline.ts:
```ts
  for (const s of activeSensors(registry, 'turn', 'continuous')) {
    const cmd = commandFor(s, null)
    if (!cmd) continue
    const r = runCommand(cmd, { timeoutMs: BUDGET_MS })
    if (r.timedOut) { rows.push(`${s.id}: timed out after ${r.ms} ms: make it faster; knownRed cannot cover a timeout`); continue }
    if (r.exit !== 0) red.push(s.id)
    rows.push(`${s.id}: ${r.exit === 0 ? 'pass' : `fail (exit ${r.exit}) → knownRed`} in ${r.ms} ms`)
  }
```
  This replaces the `resolveCommands` loop and the `levels` loop. `known` comes from `registry.knownRed`.
- stackinit.ts: delete `declareStackLevels`, `STACK_MARKERS` and the `templates/stacks.json` read. In `declareStack`, a non-empty, non-`{}` `sensors.json` returns `isRegistryShape(text) ? '.rig/sensors.json already exists; edit it' : '.rig/sensors.json uses the pre-registry format: move it aside, then run init --stack'`. Delete `templates/stacks.json`.

- [ ] **Step 6: Convert the fixtures**

For each spec that writes an old-shape `sensors.json`, rewrite it with `registry({...})`:
- `fast: { x: cmd }` → `turn: { x: cmd }`
- `full: { x: cmd }` → `commit: { x: cmd }`
- `knownRed: ['fast.x']` → `knownRed: ['x']`
- `limits: {...}` → `size: {...}`
- `layers: [...]` → `layers: [...]`
- `behavioral: { validate, run, files }` → `contracts: { validate, run, files }`
- `tests`, `ignore`, `fixtures`, `testSupport` → `paths: {...}`

Delete these tests outright, because their code goes:
- the ones that assert `scopes`, `ci.scope`, `affected`, `unscoped` or per-scope commands (scopes.spec.ts as a whole);
- `levels` and `quality` parsing (model.spec.ts);
- `fromLegacy`, `loadRegistry` legacy or `registryConfig` (registry.spec.ts);
- `githooks.prePush`/`budgetMs`;
- `declareStackLevels`.

Messages that named `fast.x` now name the sensor id `x`. Findings keep the `commands` sensor.

- [ ] **Step 7: Run everything**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4c-t1.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4c-t1.txt; npm run typecheck; npm run test:e2e:unit`
Expected: `fail 0`, clean, 16 pass. If `tests/e2e/lib/*.test.mjs` imports a changed helper, fix only the unit test.

- [ ] **Step 8: Commit**

```bash
git add -A scripts templates
git commit -m "feat(registry): every check reads the registry directly; runSensors replaces the fast/full command maps; old-shape sensors.json is a config error"
```

---

### Task 2: Delete the adapter

**Files:**
- Delete: `scripts/configparse.ts`, `scripts/scopes.ts`, `scripts/scopes.spec.ts`.
- Modify:
  - `scripts/model.ts`: delete `SensorConfig`, `BehavioralConfig`, `BudgetConfig`, `Band`, `Level`, `QualityCategory`, `QualityCmd`, `RatchetNode`, `RoutingOverride`, `Consumer`, `Scope`, `GateKey`, `LEVELS`, `QUALITY_CATEGORIES`, `RATCHET_NODES`, `DEFAULT_BUDGET`, the defaults, `parseConfig`, `parseV4`, `parseV6`, and anything else that serves only them. Keep `Finding`, `Severity`, `FileDiff`, `Rule`, `Layer`, `parseRules`, `formatFindings`, `warnLines`, `warnRow`, `matchesAny`, `globToRegex`, `isTest`, `isSource`, `SECRET_PATTERNS`, `maskSecrets`, `openQuestions`, `ghBin`, `isObject`, `isStringList`, `posInt`, `printable` and `SENSOR_NAMES`.
  - `scripts/registry.ts`: delete `fromLegacy`, `registryConfig`, and `loadRegistry`'s legacy branch (`loadRegistry` becomes `parseRegistry` plus `legacy: false`, or is removed with its callers switched to `parseRegistry`). `updateKnownRed` drops the `fast.`/`full.` key mapping.
  - `scripts/vendor.ts`: `VENDORED` loses `configparse` and `scopes`.
  - `scripts/model.spec.ts` and `scripts/registry.spec.ts`: drop the tests of deleted code.
- Test: `scripts/removed.spec.ts`

- [ ] **Step 1: Write the failing test** (append to `scripts/removed.spec.ts`)

```ts
test('4c: the old-config adapter is gone', () => {
  gone('scripts/configparse.ts', 'scripts/scopes.ts', 'templates/stacks.json')
  for (const name of ['SensorConfig', 'parseConfig', 'BehavioralConfig']) assert.doesNotMatch(read('scripts/model.ts'), new RegExp(`export (?:function|const|type) ${name}\\b`), name)
  for (const name of ['fromLegacy', 'registryConfig']) assert.doesNotMatch(read('scripts/registry.ts'), new RegExp(`export function ${name}\\b`), name)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL, "scripts/configparse.ts should be deleted".

- [ ] **Step 3: Delete**

```bash
git rm -q scripts/configparse.ts scripts/scopes.ts scripts/scopes.spec.ts
```
Then cut model.ts and registry.ts as listed. Let `npm run typecheck` name every orphan and remove it.

- [ ] **Step 4: Run and commit**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4c-t2.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4c-t2.txt; npm run typecheck`
Expected: `fail 0`, clean.
```bash
git add -A scripts
git commit -m "refactor: delete the old-config adapter (configparse, scopes, SensorConfig, fromLegacy, registryConfig)"
```

---

### Task 3: `contracts` sensor, `--tier`, the init skill, the 4b minors

**Files:**
- Modify:
  - `scripts/contracts.ts`: finding `sensor: 'contracts'`.
  - `scripts/model.ts`: `SENSOR_NAMES` has `contracts`, not `behavioral`.
  - `scripts/check.ts`: the CI no-waiver rule names `contracts`, and `plan-gate` is never waived (4b minor).
  - `scripts/sdlc.ts`: drop the `--tier` comment.
  - `scripts/hooks.ts`: SessionStart passes `treeStamp()` (4b minor).
  - `skills/init/SKILL.md`: the Sensors and Baseline steps use stack packs and the registry.
  - `templates/readme-rig.md` line 21: describe the registry.
  - Specs that use `--tier` or assert `behavioral`.
- Test: `scripts/registrycore.spec.ts`

- [ ] **Step 1: Write the failing tests** (append to `scripts/registrycore.spec.ts`)

```ts
test('a failing contract run is reported as the contracts sensor', () => {
  commit(registry({ contracts: { files: ['api/**'], run: 'node -e "process.exit(3)"' } }))
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.')
  assert.match(sdlc(repo, ['check', '--at', 'commit']).stdout, /\[contracts\][\s\S]*behavioural suite failed/)
})

test('a waiver row cannot clear plan-gate, even a hand-written one', () => {
  commit(registry({}))
  sdlc(repo, ['new', 'demo', '--type', 'chore'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- none\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n')
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'demo', sensor: 'plan-gate', file: '*', reason: 'x', by: 'p', at: 't' }) + '\n')
  assert.match(sdlc(repo, ['verify', 'demo']).stdout, /\[plan-gate\]/)
})

test('a resumed session after a passing verify is told to open the PR', () => {
  commit(registry({}))
  sdlc(repo, ['new', 'demo', '--type', 'chore'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- none\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo'], { env: { SDLC_HUMAN: '1' } })
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 0)
  const ctx = JSON.parse(hook(repo, 'session-start', { session_id: 's1' }).stdout).hookSpecificOutput.additionalContext as string
  assert.match(ctx, /Next: \/rig:pr demo/)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/registrycore.spec.ts`
Expected: the three new tests FAIL. The finding is `[behavioral]`, the waiver clears plan-gate, and SessionStart says `/rig:build`.

- [ ] **Step 3: Implement**

- contracts.ts: both findings get `sensor: 'contracts'`. model.ts `SENSOR_NAMES`: replace `'behavioral'` with `'contracts'`.
- check.ts `applyWaivers`:
```ts
  // Never waivable: plan-gate (only a person's approval clears it); at CI also contracts and harness-tamper on harness files.
  const never = (f: Finding): boolean => f.sensor === 'plan-gate' || (Boolean(ci) && ((f.sensor === 'harness-tamper' && (!f.file || isProtected(f.file))) || f.sensor === 'contracts'))
```
  `waived` then uses `!never(f)` in place of the inline condition.
- hooks.ts SessionStart: `status(active, registry.gates, treeStamp())`. Import `treeStamp` from stamp.ts.
- sdlc.ts: delete the `// --tier is accepted and ignored until step 4c` comment. Run `grep -rln -- "'--tier'" scripts/*.spec.ts` and remove the `'--tier', '<X>'` pair from each `new` call.
- `skills/init/SKILL.md`, in the Sensors and Baseline steps:
  - Replace the `fast`/`full`/`levels`/`quality`/`templates/stacks.json` instructions with: run `sdlc.ts init --stack`. It detects the stack from `templates/stacks/*.json` markers and writes `.rig/sensors.json` as a registry. Then adjust each sensor's `cmd` to what scout (b) found, keeping its `id`, `cadence`, `blocks` and `guide`, and run `sdlc.ts sync`.
  - Baseline runs each turn-cadence sensor once and writes failing ids to `knownRed`.
  - Keep the step order and the remaining text. The 60-line skill cap holds.
- `templates/readme-rig.md` line 21: "**Deterministic checks decide:** the sensors in `.rig/sensors.json` (each with a command or a built-in, a cadence and one guide sentence) must pass; failures that already existed are recorded as `knownRed` so rig never blocks on debt it did not create."
- Specs: every assertion of `[behavioral]` or `/behavioral/` becomes `contracts`.

- [ ] **Step 4: Run and commit**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4c-t3.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4c-t3.txt; npm run typecheck`
Expected: `fail 0`, clean.
```bash
git add -A scripts skills templates
git commit -m "feat: the contracts sensor (was behavioral); plan-gate never waivable; init uses stack packs; new --tier gone"
```

---

### Task 4: Core neutrality, dead-code sweep, the cap

**Files:**
- Create: `scripts/neutrality.spec.ts`
- Modify: `scripts/runs.ts` and `scripts/sdlc.ts` (comments that name tools), `scripts/size.spec.ts` (a scripts-only cap at the measured total), and every module holding a dead export.

- [ ] **Step 1: Write the failing test** in `scripts/neutrality.spec.ts`

```ts
// Core neutrality (spec 2026-10-16 §10.1): tool and command names live in templates/stacks/, never in core scripts.
// The three pattern tables in sensors.ts match language idioms in a diff (data, not invocations) and are left out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const DENY = /\b(?:mvn|cargo|dotnet|npm|npx|pip|gradle|eslint|tsc|pytest|jest|vitest|go test)\b/
const PATTERN_TABLES = /export const (?:TAMPER_PATTERNS|SUPPRESSIONS)[\s\S]*?\n\]\n|const CONFIG_FILE = .*\n/g

test('no core script names a language tool or command', () => {
  const hits: string[] = []
  for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8').replace(PATTERN_TABLES, '')
    text.split('\n').forEach((line, i) => { if (DENY.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`) })
  }
  assert.deepEqual(hits, [])
})

test('the size cap counts non-spec scripts and holds', () => {
  const total = fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')
    .reduce((n, f) => n + fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\n$/, '').split('\n').length, 0)
  assert.ok(total <= SCRIPTS_CAP, `scripts are ${total} lines (cap ${SCRIPTS_CAP}; the spec's target is 3 000)`)
})
const SCRIPTS_CAP = 1 // set in Step 4 to the measured total, rounded up to the next 50
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/neutrality.spec.ts`
Expected: FAIL. The neutrality test lists `runs.ts` (the `npm test → node, jest workers` comment) and `sdlc.ts` (the `"npm test"` usage comment). The cap test fails at 1.

- [ ] **Step 3: Reword the comments; sweep dead exports**

- runs.ts: the comment becomes "a declared test command spawns worker processes"; sdlc.ts: the usage example becomes `-- "<test command>"`.
- Dead exports: run
```bash
for f in scripts/*.ts; do case $f in *.spec.ts|*/testkit.ts) continue;; esac; for n in $(grep -oE "^export (async )?(function|const|type|let) [A-Za-z_]+" $f | awk '{print $NF}'); do u=$(grep -lw "$n" scripts/*.ts tests/e2e -r | grep -v "^$f$" | grep -v "\.spec\.ts$" | head -1); [ -z "$u" ] && echo "$f $n"; done; done
```
  For each export listed:
  - Used only by its own file: un-export it.
  - Used nowhere at all: delete it.
  - Used only by spec files: delete it with those spec tests, unless the spec tests behaviour a kept function exposes through it. In that case keep it and list it in the ledger.
  Rerun the command until it lists nothing new. Then run `npm run typecheck` and delete every local it reports unused.

- [ ] **Step 4: Set the caps**

Measure: `ls scripts/*.ts | grep -v spec | grep -v testkit | xargs cat | wc -l`. Set `SCRIPTS_CAP` in neutrality.spec.ts to that number rounded up to the next 50. Lower the total cap in `scripts/size.spec.ts` to the new measured total, rounded up to the next 100, using that spec's own counting method.

- [ ] **Step 5: Run and commit**

Run: `npm test > /tmp/4c-full.txt 2>&1; echo exit $?; grep -E "^ℹ (tests|pass|fail)" /tmp/4c-full.txt; npm run typecheck`
Expected: exit 0, `fail 0`.
```bash
git add -A scripts
git commit -m "test: core neutrality spec; dead exports swept; scripts cap at the measured total"
```

---

### Task 5: Docs, memory, review

- [ ] **Step 1: Docs**
  - **README.md and DESIGN.md:** where they describe `sensors.json`, show the registry shape (spec §3) instead of `fast`/`full`/`levels`/`quality`/`scopes`/`behavioral`.
  - **Removed config knobs:** say an old-shape file must be rewritten with `init --stack`. Delete the `scopes`, `githooks.prePush`/`budgetMs` and `ci.scope` documentation.
  - **Size note:** the scripts cap is N and the target is 3 000.
  - **Who:** one `general-purpose` agent with model `sonnet` and a brief of at most 60 lines, or edit inline if the hits are few. Find them with `grep -n "fast\|full\|levels\|quality\|scopes\|behavioral\|prePush\|budgetMs" README.md DESIGN.md`.
- [ ] **Step 2: Memory.** Update `behavioural-harness-rebuild.md`:
  - 4c done, with the commit and this plan's path.
  - Step 5 is next: the e2e rewrite and stack fixtures.
  - The carried items: count ratchets for `lines`/`json:` sensors, the deferred step-3 sync minors, the remaining 4b minors (pr remote-path tests, the upgrade note, stale test names), the Specmatic gates, and the 3 000 target.
- [ ] **Step 3: Run** `npm test` and `npm run typecheck`, and quote the summary lines.
- [ ] **Step 4: One review.**
  - **Who:** one reviewer agent on `git diff main...HEAD`, model `opus`, with a brief of at most 60 lines: spec §3 and §10.1, this plan's Decisions and Review Focus, and the ledger rulings.
  - **What to check:** that no check reads a field the registry lacks, the commit cadence change, red-proof's command source, knownRed keyed by id, CI `--config-from` with an old-shape base, and that no kept text documents a deleted config key.
- [ ] **Step 5:** Fix Critical and Important findings in one pass, each with a test that fails first, then rerun `npm test`. Merge only when the person asks.
