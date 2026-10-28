import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRegistry, defaultRegistry, BUILTIN_IDS } from './registry.ts'
import { SENSOR_NAMES } from './model.ts'

const reg = (v: unknown) => parseRegistry(JSON.stringify(v))

test('empty text gives the default registry with every built-in', () => {
  const { registry, errors } = parseRegistry('')
  assert.deepEqual(errors, [])
  assert.deepEqual(registry.sensors.map(s => s.id), [...BUILTIN_IDS])
  assert.ok(registry.sensors.every(s => s.builtin === true && s.enabled && s.guide.length > 0))
  assert.deepEqual(registry.models, { build: 'sonnet', evaluate: 'opus', design: 'sonnet' })
  assert.deepEqual(registry.policy, { haiku: 'continuous', sonnet: 'continuous', opus: 'final', default: 'continuous' })
  assert.deepEqual(registry, defaultRegistry())
})

test('a command sensor is parsed and built-ins are appended after it', () => {
  const { registry, errors } = reg({ sensors: [{ id: 'unit', cmd: 'make test', cadence: 'turn', blocks: true, guide: 'Run the tests.' }] })
  assert.deepEqual(errors, [])
  assert.deepEqual(registry.sensors[0], { id: 'unit', cmd: 'make test', cadence: 'turn', blocks: true, guide: 'Run the tests.', enabled: true })
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
  const { errors } = reg({ sensors: [{ id: 'secrets', cmd: 'true', cadence: 'edit', blocks: true, guide: 'x' }] })
  assert.match(errors.join(), /"secrets" is a built-in id/)
})

test('rejects bad sensor fields with the field named', () => {
  const bad = { id: 'Bad Id', cmd: '', cadence: 'hourly', blocks: 'yes', count: 'json:', guide: ' ', timeoutMs: 0, extra: 1 }
  const msg = reg({ sensors: [bad] }).errors.join('\n')
  for (const part of ['sensors[0].id must be kebab-case', 'sensors[0].cmd must be a non-empty command', 'sensors[0].cadence must be one of', 'sensors[0].blocks must be true or false', 'sensors[0].guide must be a non-empty sentence', 'sensors[0].timeoutMs must be a positive integer', 'sensors[0]: unknown key "extra"'])
    assert.ok(msg.includes(part), `missing: ${part}\n${msg}`)
})

test('rejects duplicate ids and unknown built-ins', () => {
  const s = { id: 'unit', cmd: 'x', cadence: 'turn', blocks: true, guide: 'g' }
  assert.match(reg({ sensors: [s, s] }).errors.join(), /duplicate sensor id "unit"/)
  assert.match(reg({ sensors: [{ id: 'magic', builtin: true }] }).errors.join(), /"magic" is not a built-in sensor/)
})

test('rejects a non-object, unparseable JSON and unknown top-level keys', () => {
  assert.match(parseRegistry('[1]').errors.join(), /must be a JSON object/)
  assert.match(parseRegistry('{').errors.join(), /does not parse/)
  assert.match(reg({ sensors: [], tiers: {} }).errors.join(), /unknown key "tiers"/)
})

import { modelFamily, policyMode, runsAt, activeSensors, commandFor, type RegistrySensor } from './registry.ts'

const cmd = (id: string, cadence: RegistrySensor['cadence'], c = 'run'): RegistrySensor => ({ id, cmd: c, cadence, blocks: true, guide: 'g', enabled: true })

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
  assert.equal(commandFor(s, null), 'eslint .')
  assert.equal(commandFor(s, []), null)
  assert.equal(commandFor(cmd('unit', 'turn', 'make test'), []), 'make test')
  assert.equal(commandFor({ id: 'secrets', builtin: true, cadence: 'edit', blocks: true, guide: 'g', enabled: true }, null), null)
})


test('{changed} and {changed-lines} take the change\'s source files, filtered by extension; nothing to judge skips', () => {
  const changed = [{ file: 'src/a.ts', lines: [2, 3, 4, 9] }, { file: 'my dir/b.js', lines: [1] }, { file: 'src/c.json', lines: [1] }, { file: 'src/d.ts', lines: [] }]
  assert.equal(commandFor(cmd('m', 'ci', 'mut {changed}'), null, changed), `mut src/a.ts 'my dir/b.js' src/c.json src/d.ts`)
  assert.equal(commandFor(cmd('m', 'ci', 'mut {changed:ts,js}'), null, changed), `mut src/a.ts 'my dir/b.js' src/d.ts`)
  assert.equal(commandFor(cmd('m', 'ci', 'mut --mutate {changed-lines:ts,js}'), null, changed), `mut --mutate 'src/a.ts:2-4,src/a.ts:9-9,my dir/b.js:1-1'`, 'one argument; a file with no added line has no range')
  assert.equal(commandFor(cmd('m', 'ci', 'mut {changed:py}'), null, changed), null, 'no file of that kind changed: skip')
  assert.equal(commandFor(cmd('m', 'ci', 'mut {changed}'), null, null), null, 'no diff to judge (a baseline or nightly run): skip')
  assert.equal(commandFor(cmd('m', 'ci', 'mut {changed}'), null, []), null)
})

test('a file name starting with a dash is passed as a path, not a flag', () => {
  const s = cmd('lint', 'edit', 'eslint {files}')
  assert.equal(commandFor(s, ['-rf', 'src/-x.ts']), 'eslint ./-rf src/-x.ts')
})

test('a whole-repo run passes "." for {files}, so tools that need a path still get one', () => {
  assert.equal(commandFor(cmd('fmt', 'edit', 'prettier --check {files}'), null), 'prettier --check .')
  assert.equal(commandFor(cmd('lint', 'edit', 'eslint --files={files} --quiet'), null), 'eslint --files=. --quiet')
  assert.equal(commandFor(cmd('lint', 'edit', 'eslint --files={files} --quiet'), ['a.ts']), 'eslint --files=a.ts --quiet')
})



test('Markdown and lock files are not source by default; the node packs also ignore package-lock.json', () => {
  assert.deepEqual(defaultRegistry().paths.ignore, ['**/*.md', '**/*.lock'])
})

test('secrets and harness-tamper must block', () => {
  assert.match(parseRegistry(JSON.stringify({ sensors: [{ id: 'secrets', builtin: true, blocks: false }] })).errors.join(), /secrets must block/)
  assert.match(parseRegistry(JSON.stringify({ sensors: [{ id: 'harness-tamper', builtin: true, blocks: false }] })).errors.join(), /harness-tamper must block/)
})

test('knownRed must name command sensors', () => {
  assert.deepEqual(parseRegistry(JSON.stringify({ sensors: [cmd('unit', 'turn')], knownRed: ['unit'] })).errors, [])
  assert.match(parseRegistry(JSON.stringify({ sensors: [], knownRed: ['nope'] })).errors.join(), /knownRed: "nope" is not a command sensor/)
  assert.match(parseRegistry(JSON.stringify({ sensors: [], knownRed: 'x' })).errors.join(), /knownRed must be a list of sensor ids/)
})

import { weakensRegistry } from './registry.ts'

test('weakening a registry is named: removed, disabled, softened, changed or later sensors, wider ignores, new known red, final policy, raised limits', () => {
  const before = JSON.stringify({ sensors: [cmd('unit', 'turn', 'npm test'), cmd('lint', 'edit', 'eslint {files}'), cmd('arch', 'commit', 'make arch'), { id: 'size', builtin: true, options: { fileLines: 300 } }], contracts: { files: ['api/**'], run: 'r' } })
  const after = JSON.stringify({
    sensors: [{ ...cmd('unit', 'turn', 'true'), blocks: false }, { ...cmd('lint', 'nightly', 'eslint {files}') }, { id: 'size', builtin: true, options: { fileLines: 900 } }, { id: 'test-tamper', builtin: true, enabled: false }],
    paths: { ignore: ['**/*.md', '**/*.lock', 'src/**'] }, knownRed: ['unit'], policy: { sonnet: 'final' }, contracts: { files: [], run: '' },
  })
  const reasons = weakensRegistry(before, after).join('\n')
  for (const part of ['sensor unit no longer blocks', 'sensor unit command changed', 'sensor lint moved from edit to nightly', 'sensor arch removed', 'sensor test-tamper disabled', 'size.fileLines raised 300 → 900', 'paths.ignore added src/**', 'knownRed added unit', 'policy.sonnet moved to final', 'contracts.files lost api/**', 'contracts.run changed'])
    assert.ok(reasons.includes(part), `missing: ${part}\n${reasons}`)
})

test('tightening or leaving a registry alone is not weakening; an unparseable one is', () => {
  const base = JSON.stringify({ sensors: [{ ...cmd('unit', 'commit', 'npm test'), blocks: false }] })
  assert.deepEqual(weakensRegistry(base, base), [])
  assert.deepEqual(weakensRegistry(base, JSON.stringify({ sensors: [cmd('unit', 'turn', 'npm test'), cmd('extra', 'edit', 'x')] })), [])
  assert.deepEqual(weakensRegistry(base, '{'), ['sensors.json no longer parses'])
})

test('contracts.covers parses as globs, defaults to empty, and losing one weakens the harness', () => {
  assert.deepEqual(reg({ sensors: [] }).registry.contracts.covers, [])
  assert.deepEqual(reg({ sensors: [], contracts: { covers: ['src/http/**'] } }).registry.contracts.covers, ['src/http/**'])
  assert.match(reg({ sensors: [], contracts: { covers: 'src' } }).errors.join(), /contracts\.covers must be a list of globs/)
  const before = JSON.stringify({ sensors: [], contracts: { covers: ['src/http/**'] } })
  assert.deepEqual(weakensRegistry(before, JSON.stringify({ sensors: [] })), ['contracts.covers lost src/http/**'])
})

test('a command sensor may not take a harness finding\'s name', () => {
  const harness = SENSOR_NAMES.filter(n => !(BUILTIN_IDS as readonly string[]).includes(n)) // every finding name that is not a built-in, e.g. scope, journeys
  for (const id of new Set(['commands', 'plan-gate', 'human-approval', 'sync', ...harness])) {
    const { errors } = parseRegistry(JSON.stringify({ sensors: [{ id, cmd: 'true', cadence: 'turn', blocks: true, guide: 'g' }] }))
    assert.ok(errors.some(e => e.includes(`"${id}" is reserved for a harness finding`)), `${id}: ${errors.join('; ')}`)
  }
})

test('models.design is parsed and an unknown role is an error', () => {
  const ok = reg({ models: { design: 'sonnet' } })
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.registry.models.design, 'sonnet')
  const bad = reg({ models: { x: 'y' } })
  assert.ok(bad.errors.some(e => /models\.x must be build, evaluate or design/.test(e)), bad.errors.join('; '))
})

test('raising a sensor timeoutMs counts as weakening; lowering does not; a retired gates.merge still parses', () => {
  const mk = (t: number | undefined) => JSON.stringify({ gates: { merge: true }, sensors: [{ id: 'unit', cmd: 'x', cadence: 'turn', blocks: true, guide: 'g', ...(t ? { timeoutMs: t } : {}) }] })
  assert.ok(weakensRegistry(mk(1000), mk(5000)).some(w => /timeoutMs raised/.test(w)))
  assert.ok(weakensRegistry(mk(1000), mk(undefined)).length === 0)
  assert.ok(weakensRegistry(mk(undefined), mk(5000)).some(w => /timeoutMs raised/.test(w)))
  assert.deepEqual(parseRegistry(mk(1000)).errors, [])
})

test('humanApproval.selfApprovers parses, rejects other shapes, and adding a login is a weakening', () => {
  const reg = (h: unknown) => JSON.stringify({ sensors: [], humanApproval: h })
  assert.deepEqual(parseRegistry(reg({ selfApprovers: ['Lead', 'lead'] })).registry.humanApproval.selfApprovers, ['lead'])
  assert.match(parseRegistry(reg({ selfApprovers: 'lead' })).errors.join(), /humanApproval.selfApprovers must be/)
  assert.match(parseRegistry(reg(5)).errors.join(), /humanApproval must be/)
  assert.deepEqual(parseRegistry('{}').registry.humanApproval.selfApprovers, [])
  assert.match(weakensRegistry(reg({}), reg({ selfApprovers: ['lead'] })).join(), /humanApproval.selfApprovers added lead/)
  assert.deepEqual(weakensRegistry(reg({ selfApprovers: ['lead'] }), reg({})), [])
})

test('risk parses, rejects other shapes, and loosening it is a weakening', () => {
  const reg = (r: unknown) => JSON.stringify({ sensors: [], risk: r })
  assert.deepEqual(parseRegistry(reg({ enforce: true, alwaysHuman: ['src/billing/**'], maxLines: 200 })).registry.risk, { enforce: true, alwaysHuman: ['src/billing/**'], maxLines: 200, window: 20, maxRevertRate: 0.1 })
  assert.deepEqual(parseRegistry('{}').registry.risk, { enforce: false, alwaysHuman: [], maxLines: 400, window: 20, maxRevertRate: 0.1 })
  assert.match(parseRegistry(reg(5)).errors.join(), /risk must be/)
  assert.match(parseRegistry(reg({ maxLines: -1 })).errors.join(), /risk.maxLines must be/)
  assert.match(parseRegistry(reg({ alwaysHuman: 'x' })).errors.join(), /risk.alwaysHuman must be/)
  assert.match(parseRegistry(reg({ enforce: 'yes' })).errors.join(), /risk.enforce must be/)
  assert.match(parseRegistry(reg({ other: 1 })).errors.join(), /risk.other/)
  const tight = reg({ enforce: true, alwaysHuman: ['src/billing/**'], maxLines: 200 })
  const loose = weakensRegistry(tight, reg({ enforce: false, alwaysHuman: [], maxLines: 300 })).join()
  assert.match(loose, /risk.enforce turned off/)
  assert.match(loose, /risk.alwaysHuman lost src\/billing\/\*\*/)
  assert.match(loose, /risk.maxLines raised/)
  assert.deepEqual(weakensRegistry(reg({}), tight), [])
})

test('the breaker knobs and trusted authors parse, and loosening them is a weakening', () => {
  const reg = (r: unknown, h: unknown = {}) => JSON.stringify({ sensors: [], risk: r, humanApproval: h })
  const p = parseRegistry(reg({ window: 10, maxRevertRate: 0.05 }, { trusted: ['Dev', 'dev'] })).registry
  assert.deepEqual([p.risk.window, p.risk.maxRevertRate, p.humanApproval.trusted], [10, 0.05, ['dev']])
  assert.deepEqual([parseRegistry('{}').registry.risk.window, parseRegistry('{}').registry.risk.maxRevertRate, parseRegistry('{}').registry.humanApproval.trusted], [20, 0.1, []])
  assert.match(parseRegistry(reg({ maxRevertRate: 2 })).errors.join(), /risk.maxRevertRate must be/)
  assert.match(parseRegistry(reg({ window: 0 })).errors.join(), /risk.window must be/)
  assert.match(parseRegistry(reg({}, { trusted: 'dev' })).errors.join(), /humanApproval.trusted must be/)
  const loose = weakensRegistry(reg({ window: 10, maxRevertRate: 0.05 }), reg({ window: 30, maxRevertRate: 0.2 }, { trusted: ['dev'] })).join()
  assert.match(loose, /risk.maxRevertRate raised/)
  assert.match(loose, /risk.window raised/)
  assert.match(loose, /humanApproval.trusted added dev/)
})
