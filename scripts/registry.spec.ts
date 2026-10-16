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

import { loadRegistry, fromLegacy, isRegistryShape } from './registry.ts'
import { parseConfig } from './model.ts'

test('a legacy sensors.json loads with its commands, contracts and paths', () => {
  const legacy = {
    fast: { 'unit tests': 'npm test' }, full: { e2e: 'npm run e2e' },
    quality: { lint: { cmd: 'eslint . -f unix', count: 'lines' } },
    behavioral: { validate: 'v', run: 'r', files: ['api/**'], cadence: 'final' },
    knownRed: ['full.e2e'], tests: ['**/*.t.js'], limits: { fileLines: 300 },
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

test('legacy knownRed entries use the prefix.name key, so only that command stops blocking', () => {
  const { registry } = loadRegistry(JSON.stringify({ fast: { test: 'npm test', lint: 'eslint .' }, knownRed: ['fast.test'] }))
  assert.equal(registry.sensors.find(s => s.id === 'fast-test')?.blocks, false)
  assert.equal(registry.sensors.find(s => s.id === 'fast-lint')?.blocks, true)
})

test('legacy contract globs are not frozen; only behavioral.files become contract files', () => {
  assert.deepEqual(loadRegistry(JSON.stringify({ fast: { t: 'x' } })).registry.contracts, { files: [], validate: '', run: '' })
  assert.deepEqual(loadRegistry(JSON.stringify({ contracts: ['api/**'] })).registry.contracts.files, [])
})

test('legacy names that kebab to the same id get distinct ids', () => {
  const { registry, errors } = loadRegistry(JSON.stringify({ fast: { 'a b': 'x', 'a-b': 'y' } }))
  assert.deepEqual(errors, [])
  const ids = registry.sensors.filter(s => !s.builtin).map(s => s.id)
  assert.deepEqual(ids, ['fast-a-b', 'fast-a-b-2'])
})

test('a file name starting with a dash is passed as a path, not a flag', () => {
  const s = cmd('lint', 'edit', 'eslint {files}')
  assert.equal(commandFor(s, ['-rf', 'src/-x.ts']), 'eslint ./-rf src/-x.ts')
})

test('a whole-repo run drops the whole argument that holds {files}', () => {
  assert.equal(commandFor(cmd('lint', 'edit', 'eslint --files={files} --quiet'), null), 'eslint --quiet')
  assert.equal(commandFor(cmd('lint', 'edit', 'eslint --files={files} --quiet'), ['a.ts']), 'eslint --files=a.ts --quiet')
})

test('a legacy continuous contract cadence makes every model continuous', () => {
  const b = { behavioral: { run: 'r', cadence: 'continuous' } }
  const { registry } = loadRegistry(JSON.stringify(b))
  assert.equal(policyMode(registry, 'claude-opus-5-5'), 'continuous')
  assert.equal(policyMode(loadRegistry(JSON.stringify({ behavioral: { run: 'r', cadence: 'final' } })).registry, 'claude-opus-5-5'), 'final')
})

import { registryConfig, updateKnownRed } from './registry.ts'

const regOf = (v: unknown) => parseRegistry(JSON.stringify(v)).registry

test('the config view maps edit and turn sensors to fast, every live sensor to full, and skips nightly and disabled ones', () => {
  const r = regOf({ sensors: [cmd('lint', 'edit', 'eslint {files}'), cmd('unit', 'turn', 'make test'), cmd('arch', 'commit', 'make arch'), cmd('mut', 'nightly', 'make mut'), { ...cmd('off', 'turn', 'x'), enabled: false }] })
  const { config, errors } = registryConfig(r)
  assert.deepEqual(errors, [])
  assert.deepEqual(config.fast, { lint: 'eslint', unit: 'make test' })
  assert.deepEqual(config.full, { lint: 'eslint', unit: 'make test', arch: 'make arch' })
  assert.deepEqual(config.levels, { unit: 'make test', integration: 'make test', acceptance: 'make test', api: 'make test' })
})

test('advisory sensors and knownRed ids become known-red keys; paths, limits, layers and contracts carry over', () => {
  const r = regOf({
    sensors: [{ ...cmd('dup', 'commit', 'jscpd .'), blocks: false }, cmd('unit', 'turn', 'make test'),
      { id: 'size', builtin: true, options: { fileLines: 300 } },
      { id: 'layering', builtin: true, options: { layers: [{ from: 'src/ui/**', mustNotImport: ['src/db/**'], why: 'ui uses services' }] } }],
    knownRed: ['unit'], paths: { tests: ['**/*.t.js'] },
    contracts: { files: ['api/**'], validate: 'v', run: 'r' },
  })
  const { config, errors } = registryConfig(r)
  assert.deepEqual(errors, [])
  assert.deepEqual([...config.knownRed].sort(), ['fast.dup', 'fast.unit', 'full.dup', 'full.unit'])
  assert.deepEqual(config.tests, ['**/*.t.js'])
  assert.equal(config.limits.fileLines, 300)
  assert.equal(config.layers.length, 1)
  assert.deepEqual(config.behavioral, { validate: 'v', run: 'r', files: ['api/**'], cadence: 'final' })
  assert.deepEqual(config.contracts, ['api/**'])
})

test('disabled and non-blocking built-ins are listed for the checker', () => {
  const { config } = registryConfig(regOf({ sensors: [{ id: 'test-tamper', builtin: true, enabled: false }] }))
  assert.deepEqual(config.builtins?.off, ['test-tamper'])
  assert.ok(config.builtins?.soft.includes('size') && config.builtins.soft.includes('model-role'))
})

test('Markdown and lock files are not source by default; the node packs also ignore package-lock.json', () => {
  assert.deepEqual(defaultRegistry().paths.ignore, ['**/*.md', '**/*.lock'])
  assert.ok(registryConfig(defaultRegistry()).config.ignore.includes('**/*.md'))
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

test('updateKnownRed writes command keys in a legacy file and sensor ids in a registry', () => {
  const legacy = JSON.parse(updateKnownRed(JSON.stringify({ fast: { a: 'x' }, knownRed: ['fast.b'] }), ['fast.a'], ['fast.b']))
  assert.deepEqual(legacy.knownRed, ['fast.a'])
  const reg = JSON.parse(updateKnownRed(JSON.stringify({ sensors: [], knownRed: ['b'] }), ['fast.a', 'full.a', 'web:fast.c'], ['full.b']))
  assert.deepEqual(reg.knownRed, ['a', 'c'])
  assert.deepEqual(Object.keys(reg), ['sensors', 'knownRed'])
})
