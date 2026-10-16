# Behavioural harness, step 1: registry and stack packs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the language-free sensor registry (`.rig/sensors.json` new shape), a reader that also accepts today's config, and eight JSON stack packs, all tested and not yet wired into hooks.

**Architecture:** One new module `scripts/registry.ts` owns the registry types, parsing, defaults, policy resolution, sensor selection by cadence, and the adapter from today's `SensorConfig`. One new module `scripts/stackpacks.ts` owns pack parsing and stack detection. Packs are data under `templates/stacks/`. Nothing existing changes behaviour in this step; step 2 switches hooks to `loadRegistry`.

**Tech Stack:** Node ≥ 22.18 running TypeScript directly (erasable syntax only), `node:test`, `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` (sections 3, 4, 11 step 1).

## Global Constraints

- Node `>=22.18`; scripts run as `.ts` with `--disable-warning=ExperimentalWarning`; `tsconfig` has `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `erasableSyntaxOnly`, `verbatimModuleSyntax` (no enums, no parameter properties, `import type` for types).
- Each script ≤ 500 lines; harness total ≤ 11 000 lines (`scripts/size.spec.ts`).
- Cadences, exactly: `edit`, `turn`, `commit`, `ci`, `nightly`.
- `count`: `exit`, `lines`, or `json:<path>`.
- Policy modes: `continuous`, `final`. Default policy `{ "haiku": "continuous", "sonnet": "continuous", "opus": "final", "default": "continuous" }`.
- Models default `{ "build": "sonnet", "evaluate": "opus" }`.
- Under `final`, only `secrets` and `harness-tamper` run at `edit` and `turn`.
- Built-in ids: `secrets`, `test-tamper`, `suppression`, `harness-tamper`, `size`, `layering`, `rules`, `red-proof`, `traceability`, `model-role`.
- Stack packs: `node`, `angular`, `python`, `go`, `rust`, `java-maven`, `java-gradle`, `dotnet`.
- Core must not name a language toolchain; tool commands live only in `templates/stacks/`.

### Decisions this plan adds where the spec is silent

- **Built-ins always present.** A built-in missing from `sensors` is added with its defaults; to turn one off, list it with `"enabled": false`. `secrets` and `harness-tamper` cannot be disabled.
- **Built-in settings** (size limits, layer rules) go in a built-in's `options` object. Step 1 checks only that it is an object; step 2's sensors validate their own options.
- **Test globs** move to a top-level `paths` block (`tests`, `testSupport`, `fixtures`, `ignore`). Core defaults are generic; packs add language globs.
- **`nightly`** runs every enabled sensor; a `nightly` sensor runs only at `nightly`.
- **Specmatic defaults** are not in the packs yet: its CLI syntax is unverified. Step 3 adds them after running Specmatic. Packs ship with empty `contracts` commands.

## Review Focus

1. A `.rig/sensors.json` in today's shape (with `fast`, `full`, `quality`, `behavioral`, `knownRed`) must load through `loadRegistry` without errors and keep its commands, or existing target repos break at step 2.
2. A built-in listed with only `{ "id": "size", "builtin": true, "options": {...} }` must get default cadence, blocks and guide, not an error.
3. A command sensor whose id collides with a built-in (`"id": "secrets", "cmd": ...`) must be an error, not silently replace the secret scan.
4. An unknown, empty or missing model id (`claude-fable-5-1`, `""`, `null`) must resolve to the `default` mode.
5. Paths with spaces or quotes substituted into `{files}` must be shell-quoted; an empty file list at `edit` must mean "skip", not "run on the whole repo".

---

### Task 1: Registry types, defaults and sensor parsing

**Files:**
- Create: `scripts/registry.ts`
- Test: `scripts/registry.spec.ts`

**Interfaces:**
- Consumes: `isObject`, `isStringList`, `posInt` from `scripts/model.ts`.
- Produces:
  - `type Cadence = 'edit' | 'turn' | 'commit' | 'ci' | 'nightly'`, `CADENCES: Cadence[]`
  - `type Count = 'exit' | 'lines' | \`json:${string}\``
  - `type Mode = 'continuous' | 'final'`
  - `BUILTIN_IDS` (readonly tuple), `type BuiltinId`, `ALWAYS_ON: BuiltinId[]`
  - `type RegistrySensor = { id: string; cmd?: string; builtin?: true; cadence: Cadence; blocks: boolean; count?: Count; guide: string; timeoutMs?: number; enabled: boolean; options?: Record<string, unknown> }`
  - `type Paths = { tests: string[]; testSupport: string[]; fixtures: string[]; ignore: string[] }`
  - `type Contracts = { files: string[]; validate: string; run: string }`
  - `type Policy = Record<string, Mode> & { default: Mode }`
  - `type Registry = { stack: string | null; gates: { plan: boolean; merge: boolean }; contracts: Contracts; models: { build: string; evaluate: string }; paths: Paths; sensors: RegistrySensor[]; policy: Policy }`
  - `defaultRegistry(): Registry`
  - `parseRegistry(text: string): { registry: Registry; errors: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `scripts/registry.spec.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRegistry, defaultRegistry, BUILTIN_IDS } from './registry.ts'

const reg = (v: unknown) => parseRegistry(JSON.stringify(v))

test('empty text gives the default registry with every built-in', () => {
  const { registry, errors } = parseRegistry('')
  assert.deepEqual(errors, [])
  assert.deepEqual(registry.sensors.map(s => s.id), [...BUILTIN_IDS])
  assert.ok(registry.sensors.every(s => s.builtin === true && s.enabled && s.guide.length > 0))
  assert.deepEqual(registry.models, { build: 'sonnet', evaluate: 'opus' })
  assert.deepEqual(registry.policy, { haiku: 'continuous', sonnet: 'continuous', opus: 'final', default: 'continuous' })
  assert.deepEqual(registry, defaultRegistry())
})

test('a command sensor is parsed and built-ins are appended after it', () => {
  const { registry, errors } = reg({ sensors: [{ id: 'unit', cmd: 'make test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the tests.' }] })
  assert.deepEqual(errors, [])
  assert.deepEqual(registry.sensors[0], { id: 'unit', cmd: 'make test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the tests.', enabled: true })
  assert.equal(registry.sensors.length, 1 + BUILTIN_IDS.length)
})

test('a built-in listed with only options keeps its default cadence, blocks and guide', () => {
  const { registry, errors } = reg({ sensors: [{ id: 'size', builtin: true, options: { fileLines: 300 } }] })
  assert.deepEqual(errors, [])
  const size = registry.sensors.find(s => s.id === 'size')
  const plain = defaultRegistry().sensors.find(s => s.id === 'size')
  assert.equal(size?.cadence, plain?.cadence)
  assert.equal(size?.guide, plain?.guide)
  assert.deepEqual(size?.options, { fileLines: 300 })
  assert.equal(registry.sensors.filter(s => s.id === 'size').length, 1)
})

test('a built-in can be disabled, except secrets and harness-tamper', () => {
  assert.deepEqual(reg({ sensors: [{ id: 'size', builtin: true, enabled: false }] }).errors, [])
  assert.match(reg({ sensors: [{ id: 'secrets', builtin: true, enabled: false }] }).errors.join(), /secrets cannot be disabled/)
  assert.match(reg({ sensors: [{ id: 'harness-tamper', builtin: true, enabled: false }] }).errors.join(), /harness-tamper cannot be disabled/)
})

test('a command sensor may not take a built-in id', () => {
  const { errors } = reg({ sensors: [{ id: 'secrets', cmd: 'true', cadence: 'edit', blocks: true, count: 'exit', guide: 'x' }] })
  assert.match(errors.join(), /"secrets" is a built-in id/)
})

test('rejects bad sensor fields with the field named', () => {
  const bad = { id: 'Bad Id', cmd: '', cadence: 'hourly', blocks: 'yes', count: 'json:', guide: ' ', timeoutMs: 0, extra: 1 }
  const msg = reg({ sensors: [bad] }).errors.join('\n')
  for (const part of ['sensors[0].id must be kebab-case', 'sensors[0].cmd must be a non-empty command', 'sensors[0].cadence must be one of', 'sensors[0].blocks must be true or false', 'sensors[0].count must be', 'sensors[0].guide must be a non-empty sentence', 'sensors[0].timeoutMs must be a positive integer', 'sensors[0]: unknown key "extra"'])
    assert.ok(msg.includes(part), `missing: ${part}\n${msg}`)
})

test('rejects duplicate ids and unknown built-ins', () => {
  const s = { id: 'unit', cmd: 'x', cadence: 'turn', blocks: true, count: 'exit', guide: 'g' }
  assert.match(reg({ sensors: [s, s] }).errors.join(), /duplicate sensor id "unit"/)
  assert.match(reg({ sensors: [{ id: 'magic', builtin: true }] }).errors.join(), /"magic" is not a built-in sensor/)
})

test('rejects a non-object, unparseable JSON and unknown top-level keys', () => {
  assert.match(parseRegistry('[1]').errors.join(), /must be a JSON object/)
  assert.match(parseRegistry('{').errors.join(), /does not parse/)
  assert.match(reg({ sensors: [], tiers: {} }).errors.join(), /unknown key "tiers"/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: FAIL, `Cannot find module './registry.ts'`.

- [ ] **Step 3: Write the implementation**

Create `scripts/registry.ts`:

```ts
// The sensor registry (behavioural harness spec 2026-10-16 §3): one .rig/sensors.json, language-free.
// A sensor is a command or a built-in, a cadence, a blocks flag and one guide sentence. Tool commands live in templates/stacks/.
import { isObject, isStringList, posInt } from './model.ts'

export type Cadence = 'edit' | 'turn' | 'commit' | 'ci' | 'nightly'
export const CADENCES: Cadence[] = ['edit', 'turn', 'commit', 'ci', 'nightly']
export type Count = 'exit' | 'lines' | `json:${string}`
export type Mode = 'continuous' | 'final'
export const BUILTIN_IDS = ['secrets', 'test-tamper', 'suppression', 'harness-tamper', 'size', 'layering', 'rules', 'red-proof', 'traceability', 'model-role'] as const
export type BuiltinId = typeof BUILTIN_IDS[number]
export const ALWAYS_ON: BuiltinId[] = ['secrets', 'harness-tamper']

export type RegistrySensor = { id: string; cmd?: string; builtin?: true; cadence: Cadence; blocks: boolean; count?: Count; guide: string; timeoutMs?: number; enabled: boolean; options?: Record<string, unknown> }
export type Paths = { tests: string[]; testSupport: string[]; fixtures: string[]; ignore: string[] }
export type Contracts = { files: string[]; validate: string; run: string }
export type Policy = Record<string, Mode> & { default: Mode }
export type Registry = { stack: string | null; gates: { plan: boolean; merge: boolean }; contracts: Contracts; models: { build: string; evaluate: string }; paths: Paths; sensors: RegistrySensor[]; policy: Policy }

type Base = { cadence: Cadence; blocks: boolean; guide: string }
const BUILTIN_DEFAULTS: Record<BuiltinId, Base> = {
  'secrets': { cadence: 'edit', blocks: true, guide: 'Never write credentials into the repo; read them from the environment.' },
  'test-tamper': { cadence: 'edit', blocks: true, guide: 'Fix the code, never the test: do not skip, delete or weaken tests or lower coverage thresholds.' },
  'suppression': { cadence: 'edit', blocks: true, guide: 'Do not silence a lint or type error without a reason on the same line.' },
  'harness-tamper': { cadence: 'edit', blocks: true, guide: 'Do not weaken .rig/sensors.json, .rig/rules.json or frozen contract files; ask a person to waive instead.' },
  'size': { cadence: 'turn', blocks: false, guide: 'Keep files and diffs under the size limits; split a file before it grows past them.' },
  'layering': { cadence: 'edit', blocks: true, guide: 'Respect the declared layer rules; do not import across a forbidden boundary.' },
  'rules': { cadence: 'edit', blocks: true, guide: 'Follow the project rules in .rig/rules.json.' },
  'red-proof': { cadence: 'commit', blocks: true, guide: 'A new test must fail before the change and pass after it.' },
  'traceability': { cadence: 'commit', blocks: true, guide: 'Every behaviour in the brief needs a test that names its B-number.' },
  'model-role': { cadence: 'turn', blocks: false, guide: 'Build on the build model; leave review to the evaluator agent.' },
}
const GENERIC_TESTS = ['**/test/**', '**/tests/**', '**/__tests__/**']
const DEFAULT_POLICY: Policy = { haiku: 'continuous', sonnet: 'continuous', opus: 'final', default: 'continuous' }
const SENSOR_KEYS = ['id', 'cmd', 'builtin', 'cadence', 'blocks', 'count', 'guide', 'timeoutMs', 'enabled', 'options']
const TOP_KEYS = ['stack', 'gates', 'contracts', 'models', 'paths', 'sensors', 'policy']
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const isBuiltinId = (v: string): v is BuiltinId => (BUILTIN_IDS as readonly string[]).includes(v)
const isCadence = (v: unknown): v is Cadence => typeof v === 'string' && (CADENCES as string[]).includes(v)
export const isCount = (v: unknown): v is Count => v === 'exit' || v === 'lines' || (typeof v === 'string' && /^json:[A-Za-z0-9_.]+$/.test(v))
export const isMode = (v: unknown): v is Mode => v === 'continuous' || v === 'final'

export function builtinSensor(id: BuiltinId): RegistrySensor {
  return { id, builtin: true, ...BUILTIN_DEFAULTS[id], enabled: true }
}

export function defaultRegistry(): Registry {
  return {
    stack: null,
    gates: { plan: true, merge: true },
    contracts: { files: [], validate: '', run: '' },
    models: { build: 'sonnet', evaluate: 'opus' },
    paths: { tests: [...GENERIC_TESTS], testSupport: [], fixtures: [], ignore: [] },
    sensors: BUILTIN_IDS.map(builtinSensor),
    policy: { ...DEFAULT_POLICY },
  }
}

function parseSensor(raw: unknown, at: string, errors: string[]): RegistrySensor | null {
  if (!isObject(raw)) { errors.push(`${at} must be an object`); return null }
  const before = errors.length
  const id = typeof raw.id === 'string' ? raw.id : ''
  if (!KEBAB.test(id)) errors.push(`${at}.id must be kebab-case`)
  if ('builtin' in raw && raw.builtin !== true) errors.push(`${at}.builtin must be true when present`)
  const builtin = raw.builtin === true
  if (builtin && id && !isBuiltinId(id)) errors.push(`${at}: "${id}" is not a built-in sensor (known: ${BUILTIN_IDS.join(', ')})`)
  if (!builtin && isBuiltinId(id)) errors.push(`${at}: "${id}" is a built-in id; add "builtin": true or rename the sensor`)
  if (builtin && 'cmd' in raw) errors.push(`${at}: a built-in sensor has no cmd`)
  if (!builtin && (typeof raw.cmd !== 'string' || !raw.cmd.trim())) errors.push(`${at}.cmd must be a non-empty command string`)
  if (builtin && 'count' in raw) errors.push(`${at}: a built-in sensor has no count`)
  if (!builtin && !isCount(raw.count)) errors.push(`${at}.count must be "exit", "lines" or "json:<path>"`)
  const base = builtin && isBuiltinId(id) ? BUILTIN_DEFAULTS[id] : null
  const cadence = raw.cadence ?? base?.cadence
  if (!isCadence(cadence)) errors.push(`${at}.cadence must be one of ${CADENCES.join(', ')}`)
  const blocks = raw.blocks ?? base?.blocks
  if (typeof blocks !== 'boolean') errors.push(`${at}.blocks must be true or false`)
  const guide = raw.guide ?? base?.guide
  if (typeof guide !== 'string' || !guide.trim()) errors.push(`${at}.guide must be a non-empty sentence`)
  if ('timeoutMs' in raw && !posInt(raw.timeoutMs)) errors.push(`${at}.timeoutMs must be a positive integer`)
  const enabled = raw.enabled ?? true
  if (typeof enabled !== 'boolean') errors.push(`${at}.enabled must be true or false`)
  if (enabled === false && (ALWAYS_ON as string[]).includes(id)) errors.push(`${at}: ${id} cannot be disabled`)
  if ('options' in raw && !builtin) errors.push(`${at}: only built-in sensors take options`)
  else if ('options' in raw && !isObject(raw.options)) errors.push(`${at}.options must be an object`)
  for (const k of Object.keys(raw)) if (!SENSOR_KEYS.includes(k)) errors.push(`${at}: unknown key "${k}"`)
  if (errors.length !== before) return null
  const timeout = raw.timeoutMs
  const options = raw.options
  const common = { cadence: cadence as Cadence, blocks: blocks as boolean, guide: (guide as string).trim(), enabled: enabled as boolean, ...(posInt(timeout) ? { timeoutMs: timeout } : {}) }
  if (builtin) return { id, builtin: true, ...common, ...(isObject(options) ? { options } : {}) }
  return { id, cmd: raw.cmd as string, count: raw.count as Count, ...common }
}

function parseSensors(raw: unknown, errors: string[]): RegistrySensor[] {
  if (!Array.isArray(raw)) { errors.push('sensors must be a list'); return BUILTIN_IDS.map(builtinSensor) }
  const out: RegistrySensor[] = []
  raw.forEach((r, i) => {
    const s = parseSensor(r, `sensors[${i}]`, errors)
    if (!s) return
    if (out.some(o => o.id === s.id)) errors.push(`duplicate sensor id "${s.id}"`)
    else out.push(s)
  })
  for (const id of BUILTIN_IDS) if (!out.some(s => s.id === id)) out.push(builtinSensor(id))
  return out
}

const strings = (v: unknown, at: string, errors: string[]): string | null => {
  if (typeof v === 'string') return v
  errors.push(`${at} must be a string`)
  return null
}

function parseSections(value: Record<string, unknown>, r: Registry, errors: string[]): void {
  if ('stack' in value) {
    if (typeof value.stack === 'string' && value.stack.trim()) r.stack = value.stack
    else errors.push('stack must be a non-empty string')
  }
  if ('gates' in value) {
    const g = value.gates
    if (!isObject(g)) errors.push('gates must be { plan?: boolean, merge?: boolean }')
    else for (const [k, v] of Object.entries(g)) {
      if ((k === 'plan' || k === 'merge') && typeof v === 'boolean') r.gates[k] = v
      else errors.push(`gates.${k} must be plan or merge, true or false`)
    }
  }
  if ('contracts' in value) {
    const c = value.contracts
    if (!isObject(c)) errors.push('contracts must be { files?: [globs], validate?: string, run?: string }')
    else for (const [k, v] of Object.entries(c)) {
      if (k === 'files') { if (isStringList(v)) r.contracts.files = v; else errors.push('contracts.files must be a list of globs') }
      else if (k === 'validate' || k === 'run') { const s = strings(v, `contracts.${k}`, errors); if (s !== null) r.contracts[k] = s.trim() }
      else errors.push(`contracts: unknown key "${k}"`)
    }
  }
  if ('models' in value) {
    const m = value.models
    if (!isObject(m)) errors.push('models must be { build?: string, evaluate?: string }')
    else for (const [k, v] of Object.entries(m)) {
      if ((k === 'build' || k === 'evaluate') && typeof v === 'string' && v.trim()) r.models[k] = v.trim()
      else errors.push(`models.${k} must be build or evaluate, a model name`)
    }
  }
  if ('paths' in value) {
    const p = value.paths
    if (!isObject(p)) errors.push('paths must be { tests?, testSupport?, fixtures?, ignore? } lists of globs')
    else for (const [k, v] of Object.entries(p)) {
      if ((k === 'tests' || k === 'testSupport' || k === 'fixtures' || k === 'ignore') && isStringList(v)) r.paths[k] = v
      else errors.push(`paths.${k} must be tests, testSupport, fixtures or ignore, a list of globs`)
    }
  }
  if ('policy' in value) {
    const p = value.policy
    if (!isObject(p)) errors.push('policy must map model families to "continuous" or "final"')
    else for (const [k, v] of Object.entries(p)) {
      if (KEBAB.test(k) && isMode(v)) r.policy[k] = v
      else errors.push(`policy.${k} must be "continuous" or "final"`)
    }
  }
  if ('sensors' in value) r.sensors = parseSensors(value.sensors, errors)
}

export function parseRegistry(text: string): { registry: Registry; errors: string[] } {
  const registry = defaultRegistry()
  if (!text.trim()) return { registry, errors: [] }
  let value: unknown
  try { value = JSON.parse(text) } catch (e) { return { registry, errors: [`sensors.json does not parse: ${(e as Error).message}`] } }
  if (!isObject(value)) return { registry, errors: ['sensors.json must be a JSON object'] }
  const errors: string[] = []
  parseSections(value, registry, errors)
  for (const k of Object.keys(value)) if (!TOP_KEYS.includes(k)) errors.push(`unknown key "${k}"`)
  return { registry, errors }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: PASS, 8 tests.

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/registry.ts scripts/registry.spec.ts
git commit -m "feat(registry): sensor registry types, defaults and parsing"
```

---

### Task 2: Policy resolution and sensor selection by cadence

**Files:**
- Modify: `scripts/registry.ts` (append)
- Test: `scripts/registry.spec.ts` (append)

**Interfaces:**
- Consumes: `Registry`, `RegistrySensor`, `Cadence`, `Mode`, `ALWAYS_ON` from Task 1.
- Produces:
  - `modelFamily(model: string | null | undefined, policy: Policy): string` — the longest policy key contained in the lower-cased model id, else `'default'`.
  - `policyMode(r: Registry, model: string | null | undefined): Mode`
  - `runsAt(s: RegistrySensor, at: Cadence): boolean`
  - `activeSensors(r: Registry, at: Cadence, mode: Mode): RegistrySensor[]`
  - `commandFor(s: RegistrySensor, files: string[] | null): string | null` — `null` files means whole repo; an empty list with `{files}` in the command returns `null` (skip).

- [ ] **Step 1: Write the failing tests**

Append to `scripts/registry.spec.ts`:

```ts
import { modelFamily, policyMode, runsAt, activeSensors, commandFor, type RegistrySensor } from './registry.ts'

const cmd = (id: string, cadence: RegistrySensor['cadence'], c = 'run'): RegistrySensor => ({ id, cmd: c, cadence, blocks: true, count: 'exit', guide: 'g', enabled: true })

test('model ids map to policy families; unknown, empty and null map to default', () => {
  const r = defaultRegistry()
  assert.equal(modelFamily('claude-sonnet-5-5', r.policy), 'sonnet')
  assert.equal(modelFamily('claude-opus-5-5[1m]', r.policy), 'opus')
  assert.equal(modelFamily('HAIKU', r.policy), 'haiku')
  for (const m of ['claude-fable-5-1', '', null, undefined]) assert.equal(modelFamily(m, r.policy), 'default')
  assert.equal(policyMode(r, 'claude-opus-5-5'), 'final')
  assert.equal(policyMode(r, 'claude-sonnet-5-5'), 'continuous')
  assert.equal(policyMode(r, null), 'continuous')
})

test('a repo policy overrides one family and keeps the rest', () => {
  const { registry } = parseRegistry(JSON.stringify({ policy: { opus: 'continuous', default: 'final' } }))
  assert.equal(policyMode(registry, 'claude-opus-5-5'), 'continuous')
  assert.equal(policyMode(registry, 'claude-sonnet-5-5'), 'continuous')
  assert.equal(policyMode(registry, 'claude-fable-5-1'), 'final')
})

test('a sensor runs at its cadence and later ones; nightly sensors only at nightly; nightly runs all', () => {
  const e = cmd('e', 'edit'), c = cmd('c', 'commit'), n = cmd('n', 'nightly')
  assert.deepEqual(['edit', 'turn', 'commit', 'ci', 'nightly'].map(a => runsAt(e, a as RegistrySensor['cadence'])), [true, true, true, true, true])
  assert.deepEqual(['edit', 'turn', 'commit', 'ci', 'nightly'].map(a => runsAt(c, a as RegistrySensor['cadence'])), [false, false, true, true, true])
  assert.deepEqual(['edit', 'turn', 'commit', 'ci', 'nightly'].map(a => runsAt(n, a as RegistrySensor['cadence'])), [false, false, false, false, true])
  assert.equal(runsAt({ ...e, enabled: false }, 'ci'), false)
})

test('final mode keeps only secrets and harness-tamper at edit and turn, everything at commit', () => {
  const { registry } = parseRegistry(JSON.stringify({ sensors: [cmd('lint', 'edit'), cmd('unit', 'turn')] }))
  const ids = (at: RegistrySensor['cadence'], m: 'final' | 'continuous') => activeSensors(registry, at, m).map(s => s.id)
  assert.deepEqual(ids('edit', 'final').sort(), ['harness-tamper', 'secrets'])
  assert.deepEqual(ids('turn', 'final').sort(), ['harness-tamper', 'secrets'])
  assert.ok(ids('edit', 'continuous').includes('lint'))
  assert.ok(ids('turn', 'continuous').includes('unit'))
  assert.ok(ids('commit', 'final').includes('lint') && ids('commit', 'final').includes('unit'))
})

test('{files} is shell-quoted, removed for whole-repo runs, and an empty list skips', () => {
  const s = cmd('lint', 'edit', 'eslint {files}')
  assert.equal(commandFor(s, ['src/a.ts', 'my dir/b.ts', "it's.ts"]), `eslint src/a.ts 'my dir/b.ts' 'it'\\''s.ts'`)
  assert.equal(commandFor(s, null), 'eslint')
  assert.equal(commandFor(s, []), null)
  assert.equal(commandFor(cmd('unit', 'turn', 'make test'), []), 'make test')
  assert.equal(commandFor({ id: 'secrets', builtin: true, cadence: 'edit', blocks: true, guide: 'g', enabled: true }, null), null)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: FAIL, `does not provide an export named 'modelFamily'`.

- [ ] **Step 3: Write the implementation**

Append to `scripts/registry.ts`:

```ts
// ---------- policy and selection (spec §3.3) ----------

// The longest policy key found in the model id wins, so a family named "sonnet-fast" beats "sonnet".
export function modelFamily(model: string | null | undefined, policy: Policy): string {
  const id = (model ?? '').toLowerCase()
  if (!id) return 'default'
  const keys = Object.keys(policy).filter(k => k !== 'default').sort((a, b) => b.length - a.length)
  return keys.find(k => id.includes(k)) ?? 'default'
}

export const policyMode = (r: Registry, model: string | null | undefined): Mode => r.policy[modelFamily(model, r.policy)] ?? r.policy.default

const RANK: Record<Cadence, number> = { edit: 0, turn: 1, commit: 2, ci: 3, nightly: 4 }

// A sensor runs at its own cadence and every later one; a nightly sensor only at nightly; nightly runs everything enabled.
export function runsAt(s: RegistrySensor, at: Cadence): boolean {
  if (!s.enabled) return false
  if (s.cadence === 'nightly') return at === 'nightly'
  return RANK[s.cadence] <= RANK[at]
}

// Under "final", in-session cadences keep only the always-on built-ins; commit, ci and nightly run in full.
export function activeSensors(r: Registry, at: Cadence, mode: Mode): RegistrySensor[] {
  const due = r.sensors.filter(s => runsAt(s, at))
  if (mode === 'continuous' || RANK[at] >= RANK.commit) return due
  return due.filter(s => (ALWAYS_ON as string[]).includes(s.id))
}

const shq = (s: string): string => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

// null files: whole repo, so {files} is dropped. An empty list with {files}: nothing to check, skip (null).
export function commandFor(s: RegistrySensor, files: string[] | null): string | null {
  if (!s.cmd) return null
  if (!s.cmd.includes('{files}')) return s.cmd
  if (files && !files.length) return null
  if (!files) return s.cmd.replace(/\s*\{files\}/g, '').trim()
  return s.cmd.replaceAll('{files}', files.map(shq).join(' '))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: PASS, 13 tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/registry.ts scripts/registry.spec.ts
git commit -m "feat(registry): policy by model family, cadence selection, {files} substitution"
```

---

### Task 3: Reading today's config through the registry

**Files:**
- Modify: `scripts/registry.ts` (append)
- Test: `scripts/registry.spec.ts` (append)

**Interfaces:**
- Consumes: `parseConfig`, `type SensorConfig` from `scripts/model.ts`; Task 1 and 2 exports.
- Produces:
  - `fromLegacy(cfg: SensorConfig): Registry`
  - `isRegistryShape(text: string): boolean` — true when the JSON object has a `sensors` list.
  - `loadRegistry(text: string): { registry: Registry; errors: string[]; legacy: boolean }`

Mapping from today's `SensorConfig`:

| Today | Registry |
|---|---|
| `fast.<name>` | sensor `fast-<kebab name>`, cadence `turn`, blocks unless `<name>` is in `knownRed`, count `exit` |
| `full.<name>` | sensor `full-<kebab name>`, cadence `commit`, same blocks rule, count `exit` |
| `quality.<cat>` | sensor `quality-<cat>`, cadence `commit`, blocks `true`, count from `quality.<cat>.count` when valid else `lines` |
| `behavioral.files / validate / run` | `contracts.files / validate / run` |
| `contracts` (when no `behavioral`) | `contracts.files` |
| `tests`, `testSupport`, `fixtures`, `ignore` | `paths.*` |
| `limits` | built-in `size` `options` |
| `layers` | built-in `layering` `options.layers` |

- [ ] **Step 1: Write the failing tests**

Append to `scripts/registry.spec.ts`:

```ts
import { loadRegistry, fromLegacy, isRegistryShape } from './registry.ts'
import { parseConfig } from './model.ts'

test('a legacy sensors.json loads with its commands, contracts and paths', () => {
  const legacy = {
    fast: { 'unit tests': 'npm test' }, full: { e2e: 'npm run e2e' },
    quality: { lint: { cmd: 'eslint . -f unix', count: 'lines' } },
    behavioral: { validate: 'v', run: 'r', files: ['api/**'], cadence: 'final' },
    knownRed: ['e2e'], tests: ['**/*.t.js'], limits: { fileLines: 300 },
    layers: [{ from: 'src/ui/**', mustNotImport: ['src/db/**'], why: 'ui talks to services' }],
  }
  const { registry, errors, legacy: isLegacy } = loadRegistry(JSON.stringify(legacy))
  assert.deepEqual(errors, [])
  assert.equal(isLegacy, true)
  const by = (id: string) => registry.sensors.find(s => s.id === id)
  assert.deepEqual([by('fast-unit-tests')?.cmd, by('fast-unit-tests')?.cadence, by('fast-unit-tests')?.blocks], ['npm test', 'turn', true])
  assert.deepEqual([by('full-e2e')?.cadence, by('full-e2e')?.blocks], ['commit', false])
  assert.deepEqual([by('quality-lint')?.cmd, by('quality-lint')?.count], ['eslint . -f unix', 'lines'])
  assert.deepEqual(registry.contracts, { files: ['api/**'], validate: 'v', run: 'r' })
  assert.deepEqual(registry.paths.tests, ['**/*.t.js'])
  assert.equal((by('size')?.options as { fileLines?: number } | undefined)?.fileLines, 300)
  assert.equal(((by('layering')?.options as { layers?: unknown[] } | undefined)?.layers ?? []).length, 1)
  assert.ok(registry.sensors.every(s => s.guide.trim().length > 0))
})

test('legacy config errors are passed through, not thrown', () => {
  const { errors, legacy } = loadRegistry(JSON.stringify({ fast: 'oops' }))
  assert.equal(legacy, true)
  assert.match(errors.join(), /fast must map names to command strings/)
})

test('a file with a sensors list is read as a registry', () => {
  assert.equal(isRegistryShape(JSON.stringify({ sensors: [] })), true)
  assert.equal(isRegistryShape(JSON.stringify({ fast: {} })), false)
  assert.equal(isRegistryShape('{'), false)
  assert.equal(loadRegistry(JSON.stringify({ sensors: [] })).legacy, false)
  assert.equal(loadRegistry('').legacy, false)
})

test('an empty legacy config gives only the built-ins', () => {
  assert.deepEqual(fromLegacy(parseConfig('').config).sensors.filter(s => !s.builtin), [])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: FAIL, `does not provide an export named 'loadRegistry'`.

- [ ] **Step 3: Write the implementation**

Change the import at the top of `scripts/registry.ts` to:

```ts
import { isObject, isStringList, posInt, parseConfig, type SensorConfig } from './model.ts'
```

Append:

```ts
// ---------- today's config (spec §11 step 1: read the old shape until step 4 removes it) ----------

const kebab = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cmd'

export function fromLegacy(cfg: SensorConfig): Registry {
  const r = defaultRegistry()
  const extra: RegistrySensor[] = []
  const declared = (prefix: 'fast' | 'full', cadence: Cadence): void => {
    for (const [name, c] of Object.entries(cfg[prefix])) extra.push({ id: `${prefix}-${kebab(name)}`, cmd: c, cadence, blocks: !cfg.knownRed.includes(name), count: 'exit', guide: `"${name}" must pass before the ${cadence === 'turn' ? 'turn ends' : 'change is committed'}.`, enabled: true })
  }
  declared('fast', 'turn')
  declared('full', 'commit')
  for (const [cat, q] of Object.entries(cfg.quality)) {
    if (!q) continue
    extra.push({ id: `quality-${cat}`, cmd: q.cmd, cadence: 'commit', blocks: true, count: isCount(q.count) ? q.count : 'lines', guide: `Do not raise the ${cat} count above the base branch.`, enabled: true })
  }
  r.sensors = [...extra, ...r.sensors]
  const size = r.sensors.find(s => s.id === 'size')
  if (size) size.options = { ...cfg.limits }
  const layering = r.sensors.find(s => s.id === 'layering')
  if (layering && cfg.layers.length) layering.options = { layers: cfg.layers }
  r.contracts = cfg.behavioral
    ? { files: [...cfg.behavioral.files], validate: cfg.behavioral.validate ?? '', run: cfg.behavioral.run ?? '' }
    : { files: [...cfg.contracts], validate: '', run: '' }
  r.paths = { tests: [...cfg.tests], testSupport: [...cfg.testSupport], fixtures: [...cfg.fixtures], ignore: [...cfg.ignore] }
  return r
}

export function isRegistryShape(text: string): boolean {
  try {
    const v: unknown = JSON.parse(text)
    return isObject(v) && Array.isArray(v.sensors)
  } catch { return false }
}

export function loadRegistry(text: string): { registry: Registry; errors: string[]; legacy: boolean } {
  if (!text.trim() || isRegistryShape(text)) return { ...parseRegistry(text), legacy: false }
  const { config, errors } = parseConfig(text)
  return { registry: fromLegacy(config), errors, legacy: true }
}
```

Note: `legacy` is `true` for unparseable JSON too, so the error message comes from today's parser, which names `sensors.json`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --disable-warning=ExperimentalWarning --test scripts/registry.spec.ts`
Expected: PASS, 17 tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/registry.ts scripts/registry.spec.ts
git commit -m "feat(registry): read today's sensors.json through the registry"
```

---

### Task 4: Stack packs and stack detection

**Files:**
- Create: `scripts/stackpacks.ts`
- Create: `templates/stacks/node.json`, `angular.json`, `python.json`, `go.json`, `rust.json`, `java-maven.json`, `java-gradle.json`, `dotnet.json`
- Test: `scripts/stackpacks.spec.ts`

`templates/stacks.json` stays until step 2 moves `init --stack` onto the packs.

**Interfaces:**
- Consumes: `parseRegistry`, `type Registry`, `type Contracts`, `type Paths` from `scripts/registry.ts`; `globToRegex` from `scripts/model.ts`.
- Produces:
  - `type StackPack = { stack: string; markers: string[]; paths: Partial<Paths>; contracts: Contracts; sensors: unknown[] }`
  - `parsePack(text: string, file: string): { pack: StackPack | null; errors: string[] }`
  - `loadPacks(dir: string): { packs: StackPack[]; errors: string[] }`
  - `detectStacks(root: string, packs: StackPack[]): string[]` — pack names with at least one marker in `root`; a marker with `*` is a glob over `root`'s entries.
  - `packRegistry(pack: StackPack): Registry` — the registry `rig init` will write.
  - `PACKS_DIR` — absolute path of `templates/stacks`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/stackpacks.spec.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPacks, parsePack, detectStacks, packRegistry, PACKS_DIR } from './stackpacks.ts'

const STACKS = ['node', 'angular', 'python', 'go', 'rust', 'java-maven', 'java-gradle', 'dotnet']

test('every shipped pack parses and is a valid registry', () => {
  const { packs, errors } = loadPacks(PACKS_DIR)
  assert.deepEqual(errors, [])
  assert.deepEqual(packs.map(p => p.stack).sort(), [...STACKS].sort())
  for (const p of packs) assert.equal(packRegistry(p).stack, p.stack)
})

test('every pack covers types, lint and unit, has a nightly mutation sensor, and adds test globs', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const ids = packRegistry(p).sensors.filter(s => !s.builtin).map(s => s.id)
    for (const need of ['types', 'lint', 'unit', 'mutation']) assert.ok(ids.includes(need), `${p.stack} lacks ${need}`)
    assert.equal(packRegistry(p).sensors.find(s => s.id === 'mutation')?.cadence, 'nightly', p.stack)
    assert.ok((p.paths.tests ?? []).length > 0, `${p.stack} has no test globs`)
  }
})

test('a pack may not declare built-ins, must name its file and must have markers', () => {
  const ok = { stack: 'x', markers: ['x.toml'], paths: {}, contracts: { files: [], validate: '', run: '' }, sensors: [] }
  assert.deepEqual(parsePack(JSON.stringify(ok), 'x.json').errors, [])
  assert.match(parsePack(JSON.stringify({ ...ok, stack: 'y' }), 'x.json').errors.join(), /stack "y" does not match file x.json/)
  assert.match(parsePack(JSON.stringify({ ...ok, markers: [] }), 'x.json').errors.join(), /markers must be a non-empty list/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'secrets', builtin: true }] }), 'x.json').errors.join(), /packs declare no built-in sensors/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'lint' }] }), 'x.json').errors.join(), /x.json: sensors\[0\]/)
})

test('detects stacks from marker files and globs, and returns all matches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-stacks-'))
  const { packs } = loadPacks(PACKS_DIR)
  assert.deepEqual(detectStacks(root, packs), [])
  fs.writeFileSync(path.join(root, 'Shop.sln'), '')
  assert.deepEqual(detectStacks(root, packs), ['dotnet'])
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  fs.writeFileSync(path.join(root, 'angular.json'), '{}')
  assert.deepEqual(detectStacks(root, packs).sort(), ['angular', 'dotnet', 'node'])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/stackpacks.spec.ts`
Expected: FAIL, `Cannot find module './stackpacks.ts'`.

- [ ] **Step 3: Write `scripts/stackpacks.ts`**

```ts
// Stack packs (behavioural harness spec 2026-10-16 §4): per-language sensor defaults as data. Core never names a toolchain.
import fs from 'node:fs'
import path from 'node:path'
import { globToRegex, isObject, isStringList } from './model.ts'
import { parseRegistry, type Contracts, type Paths, type Registry } from './registry.ts'

export type StackPack = { stack: string; markers: string[]; paths: Partial<Paths>; contracts: Contracts; sensors: unknown[] }
export const PACKS_DIR = path.resolve(import.meta.dirname, '../templates/stacks')
const PACK_KEYS = ['stack', 'markers', 'paths', 'contracts', 'sensors']

const registryText = (p: StackPack): string => JSON.stringify({ stack: p.stack, paths: p.paths, contracts: p.contracts, sensors: p.sensors })

export function parsePack(text: string, file: string): { pack: StackPack | null; errors: string[] } {
  let v: unknown
  try { v = JSON.parse(text) } catch (e) { return { pack: null, errors: [`${file} does not parse: ${(e as Error).message}`] } }
  if (!isObject(v)) return { pack: null, errors: [`${file} must be a JSON object`] }
  const errors: string[] = []
  const name = path.basename(file, '.json')
  if (v.stack !== name) errors.push(`${file}: stack "${String(v.stack)}" does not match file ${file}`)
  if (!isStringList(v.markers) || !v.markers.length) errors.push(`${file}: markers must be a non-empty list of file names or globs`)
  if (!Array.isArray(v.sensors)) errors.push(`${file}: sensors must be a list`)
  else if (v.sensors.some(s => isObject(s) && s.builtin === true)) errors.push(`${file}: packs declare no built-in sensors`)
  for (const k of Object.keys(v)) if (!PACK_KEYS.includes(k)) errors.push(`${file}: unknown key "${k}"`)
  if (errors.length) return { pack: null, errors }
  const pack: StackPack = {
    stack: name,
    markers: v.markers as string[],
    paths: isObject(v.paths) ? (v.paths as Partial<Paths>) : {},
    contracts: isObject(v.contracts) ? (v.contracts as Contracts) : { files: [], validate: '', run: '' },
    sensors: v.sensors as unknown[],
  }
  const parsed = parseRegistry(registryText(pack))
  if (parsed.errors.length) return { pack: null, errors: parsed.errors.map(e => `${file}: ${e}`) }
  return { pack, errors: [] }
}

export function loadPacks(dir: string): { packs: StackPack[]; errors: string[] } {
  const packs: StackPack[] = []
  const errors: string[] = []
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const r = parsePack(fs.readFileSync(path.join(dir, f), 'utf8'), f)
    if (r.pack) packs.push(r.pack)
    errors.push(...r.errors)
  }
  return { packs, errors }
}

export function detectStacks(root: string, packs: StackPack[]): string[] {
  const entries = fs.existsSync(root) ? fs.readdirSync(root) : []
  const has = (m: string): boolean => (m.includes('*') ? entries.some(e => globToRegex(m).test(e)) : entries.includes(m))
  return packs.filter(p => p.markers.some(has)).map(p => p.stack)
}

export const packRegistry = (p: StackPack): Registry => parseRegistry(registryText(p)).registry
```

- [ ] **Step 4: Write the eight packs**

Every pack's `contracts` is `{ "files": [], "validate": "", "run": "" }` until step 3 adds Specmatic.

`templates/stacks/node.json`:

```json
{
  "stack": "node",
  "markers": ["package.json"],
  "paths": { "tests": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/test/**", "**/tests/**"], "testSupport": ["**/fixtures/**", "**/test-helpers/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "lint", "cmd": "npx --no-install eslint {files}", "cadence": "edit", "blocks": true, "count": "exit", "guide": "Lint must pass on every file you touch; fix the code rather than the rule." },
    { "id": "types", "cmd": "npx --no-install tsc --noEmit --pretty false", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The project must typecheck before the turn ends." },
    { "id": "unit", "cmd": "npm test", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run the unit suite before claiming done; fix the code, never the tests." },
    { "id": "layers", "cmd": "npx --no-install depcruise src --output-type err", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the dependency rules in .dependency-cruiser config; do not import across a forbidden boundary." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 src --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "coverage", "cmd": "npx --no-install c8 --check-coverage --lines 80 npm test", "cadence": "ci", "blocks": false, "count": "exit", "guide": "New code comes with tests that execute it; coverage alone does not prove behaviour." },
    { "id": "audit", "cmd": "npm audit --audit-level=high", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add dependencies with known high-severity vulnerabilities." },
    { "id": "mutation", "cmd": "npx --no-install stryker run", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/angular.json`:

```json
{
  "stack": "angular",
  "markers": ["angular.json"],
  "paths": { "tests": ["**/*.spec.ts", "**/e2e/**"], "testSupport": ["**/testing/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "lint", "cmd": "npx --no-install ng lint", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Angular lint must pass; fix the code rather than the rule." },
    { "id": "types", "cmd": "npx --no-install tsc -p tsconfig.app.json --noEmit --pretty false", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The app must typecheck before the turn ends." },
    { "id": "unit", "cmd": "npx --no-install ng test --watch=false", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run the component and service specs before claiming done; fix the code, never the specs." },
    { "id": "layers", "cmd": "npx --no-install depcruise src --output-type err", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the dependency rules between features, shared and core modules." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 src --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing components and services instead of copying them." },
    { "id": "build", "cmd": "npx --no-install ng build", "cadence": "ci", "blocks": true, "count": "exit", "guide": "The production build must succeed." },
    { "id": "audit", "cmd": "npm audit --audit-level=high", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add dependencies with known high-severity vulnerabilities." },
    { "id": "mutation", "cmd": "npx --no-install stryker run", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Specs must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/python.json`:

```json
{
  "stack": "python",
  "markers": ["pyproject.toml", "requirements.txt", "setup.py"],
  "paths": { "tests": ["**/test_*.py", "**/*_test.py", "**/tests/**"], "testSupport": ["**/conftest.py", "**/fixtures/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "lint", "cmd": "ruff check {files}", "cadence": "edit", "blocks": true, "count": "exit", "guide": "Ruff must pass on every file you touch; fix the code rather than the rule." },
    { "id": "types", "cmd": "mypy .", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The project must type-check with mypy before the turn ends." },
    { "id": "unit", "cmd": "pytest -q", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run pytest before claiming done; fix the code, never the tests." },
    { "id": "layers", "cmd": "lint-imports", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the import contracts in the import-linter config." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 . --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "pip-audit", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add dependencies with known vulnerabilities." },
    { "id": "mutation", "cmd": "mutmut run", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/go.json`:

```json
{
  "stack": "go",
  "markers": ["go.mod"],
  "paths": { "tests": ["**/*_test.go"], "testSupport": ["**/testdata/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "types", "cmd": "go vet ./...", "cadence": "turn", "blocks": true, "count": "exit", "guide": "go vet must pass before the turn ends." },
    { "id": "lint", "cmd": "golangci-lint run", "cadence": "turn", "blocks": true, "count": "exit", "guide": "golangci-lint must pass; fix the code rather than adding nolint." },
    { "id": "unit", "cmd": "go test ./...", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run go test before claiming done; fix the code, never the tests." },
    { "id": "layers", "cmd": "go-arch-lint check", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the component rules in .go-arch-lint.yml." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 . --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "govulncheck ./...", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not call code with known vulnerabilities." },
    { "id": "mutation", "cmd": "go-mutesting ./...", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/rust.json`:

```json
{
  "stack": "rust",
  "markers": ["Cargo.toml"],
  "paths": { "tests": ["**/tests/**", "**/benches/**"], "testSupport": ["**/fixtures/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "types", "cmd": "cargo check --quiet", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The crate must compile before the turn ends." },
    { "id": "lint", "cmd": "cargo clippy --quiet -- -D warnings", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Clippy must pass with warnings as errors; fix the code rather than adding allow attributes." },
    { "id": "unit", "cmd": "cargo test --quiet", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run cargo test before claiming done; fix the code, never the tests." },
    { "id": "layers", "cmd": "cargo deny check bans", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the banned and allowed dependencies in deny.toml." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 src --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "cargo audit", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add crates with known vulnerabilities." },
    { "id": "mutation", "cmd": "cargo mutants", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/java-maven.json`:

```json
{
  "stack": "java-maven",
  "markers": ["pom.xml"],
  "paths": { "tests": ["**/src/test/**", "**/*Test.java", "**/*IT.java"], "testSupport": ["**/src/test/resources/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "types", "cmd": "mvn -q compile", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The code must compile before the turn ends." },
    { "id": "unit", "cmd": "mvn -q test", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run the unit tests before claiming done; fix the code, never the tests." },
    { "id": "lint", "cmd": "mvn -q checkstyle:check", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Checkstyle must pass; do not add suppressions without a reason." },
    { "id": "layers", "cmd": "mvn -q test -Dtest=ArchitectureTest -Dsurefire.failIfNoSpecifiedTests=false", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the layer rules in ArchitectureTest." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 src/main --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "mvn -q org.owasp:dependency-check-maven:check", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add dependencies with known vulnerabilities." },
    { "id": "mutation", "cmd": "mvn -q org.pitest:pitest-maven:mutationCoverage", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/java-gradle.json`:

```json
{
  "stack": "java-gradle",
  "markers": ["build.gradle", "build.gradle.kts"],
  "paths": { "tests": ["**/src/test/**", "**/*Test.java", "**/*Test.kt"], "testSupport": ["**/src/test/resources/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "types", "cmd": "./gradlew -q compileJava", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The code must compile before the turn ends." },
    { "id": "unit", "cmd": "./gradlew -q test", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run the unit tests before claiming done; fix the code, never the tests." },
    { "id": "lint", "cmd": "./gradlew -q checkstyleMain", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Checkstyle must pass; do not add suppressions without a reason." },
    { "id": "layers", "cmd": "./gradlew -q test --tests '*ArchitectureTest'", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the layer rules in ArchitectureTest." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 src/main --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "./gradlew -q dependencyCheckAnalyze", "cadence": "ci", "blocks": false, "count": "exit", "guide": "Do not add dependencies with known vulnerabilities." },
    { "id": "mutation", "cmd": "./gradlew -q pitest", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

`templates/stacks/dotnet.json`:

```json
{
  "stack": "dotnet",
  "markers": ["*.sln", "*.csproj"],
  "paths": { "tests": ["**/*.Tests/**", "**/*.Test/**", "**/*Tests.cs"], "testSupport": ["**/TestData/**"] },
  "contracts": { "files": [], "validate": "", "run": "" },
  "sensors": [
    { "id": "types", "cmd": "dotnet build --nologo -v q", "cadence": "turn", "blocks": true, "count": "exit", "guide": "The solution must build before the turn ends." },
    { "id": "unit", "cmd": "dotnet test --nologo -v q", "cadence": "turn", "blocks": true, "count": "exit", "guide": "Run dotnet test before claiming done; fix the code, never the tests." },
    { "id": "lint", "cmd": "dotnet format --verify-no-changes", "cadence": "commit", "blocks": true, "count": "exit", "guide": "dotnet format must report no changes; do not suppress analyzers without a reason." },
    { "id": "layers", "cmd": "dotnet test --nologo -v q --filter Category=Architecture", "cadence": "commit", "blocks": true, "count": "exit", "guide": "Respect the layer rules in the architecture tests." },
    { "id": "duplication", "cmd": "npx --yes jscpd@5 . --silent --threshold 5", "cadence": "commit", "blocks": false, "count": "exit", "guide": "Reuse existing code instead of copying it." },
    { "id": "audit", "cmd": "dotnet list package --vulnerable --include-transitive", "cadence": "ci", "blocks": false, "count": "lines", "guide": "Do not add packages with known vulnerabilities." },
    { "id": "mutation", "cmd": "dotnet stryker", "cadence": "nightly", "blocks": false, "count": "exit", "guide": "Tests must assert behaviour so that changing the code makes them fail." }
  ]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --disable-warning=ExperimentalWarning --test scripts/stackpacks.spec.ts`
Expected: PASS, 4 tests.

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/stackpacks.ts scripts/stackpacks.spec.ts templates/stacks/
git commit -m "feat(stacks): eight language stack packs and stack detection"
```

---

### Task 5: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: every stage passes. The spec count rises by 21 (17 registry, 4 stack packs). Quote the summary lines in the hand-off.

- [ ] **Step 2: Check the size budget**

Run: `node --disable-warning=ExperimentalWarning --test scripts/size.spec.ts`
Expected: PASS. `scripts/registry.ts` and `scripts/stackpacks.ts` are each under 500 lines, and the harness stays under 11 000.

- [ ] **Step 3: Review the branch diff once**

Run `/code-review` on `git diff main...HEAD` restricted to this step's commits. Fix findings in one wave, rerun `npm test`, commit with `fix(registry): review findings`.

---

## Later steps (one plan each, written when the previous step lands)

| Step | Goal | Spec sections |
|---|---|---|
| 2 | Hooks and `rig check <cadence>` read `loadRegistry`; model recording (`PostModelSwitch`, `SessionStart`, transcript fallback); `Agent` launch model tracking; `agents/evaluator.md`; `init --stack` writes a pack registry. | 3.3–3.5, 7 |
| 3 | Contracts: freeze on plan approval, validate-before-run, contract-relevant `turn` runs; `rig sync` and `sync --check`; brief template; Specmatic defaults in packs after running it. | 5, 6 |
| 4 | Deletions (tiers, spend, chart, UI, brain, agents, workflows, 15 skills), old-config adapter removed, core-neutrality spec, size cap 3 000. | 8, 10.1 |
| 5 | E2e rewrite and stack fixtures. | 10.2 |
| 6 | Evaluation runner and first results pass. | 9 |
