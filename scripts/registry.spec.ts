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
