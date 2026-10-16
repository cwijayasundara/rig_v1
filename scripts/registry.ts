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
