// A sensor that cannot fail is not a check. Every built-in either rejects a seeded violation here or names the spec that does.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { type FileDiff, type Finding } from './model.ts'
import { BUILTIN_IDS, defaultRegistry, inertSensors, type Registry } from './registry.ts'
import { testTamper, suppressions, layering, size, secretsInDiff, rulesSensor, harnessTamper } from './sensors.ts'

const fd = (file: string, added: string[], status: FileDiff['status'] = 'M'): FileDiff => ({ file, status, added: added.map((text, i) => ({ n: i + 1, text })), removed: [] })
const withOptions = (id: string, options: Record<string, unknown>): Registry => {
  const r = defaultRegistry()
  const s = r.sensors.find(x => x.id === id)
  if (s) s.options = options
  return r
}
const layered = withOptions('layering', { layers: [{ from: 'src/domain/**', mustNotImport: ['infra'], why: 'the domain stays framework-free' }] })
const RULE = { id: 'R1', pattern: 'console\\.log', message: 'no console.log', why: 'use the logger', action: 'block' as const }

// id -> a seeded violation the sensor must flag, or the spec that proves it (the sensor needs git, a clock or session state).
const SEEDED: Record<string, (() => Finding[]) | { spec: string }> = {
  'secrets': () => secretsInDiff([fd('src/c.js', ['const key = "AKIAABCDEFGHIJKLMNOP"'])]),
  'test-tamper': () => testTamper([fd('test/a.test.js', ["it.skip('adds', () => {})"])], defaultRegistry()),
  'suppression': () => suppressions([fd('src/a.js', ['// eslint-disable-next-line'])], defaultRegistry()),
  'layering': () => layering([fd('src/domain/order.js', ["import { db } from '../infra/db.js'"])], layered),
  'size': () => size([fd('src/a.js', ['x'])], defaultRegistry(), { 'src/a.js': 401 }, 'stop'),
  'rules': () => rulesSensor([fd('src/a.js', ['console.log(1)'])], [RULE]),
  'harness-tamper': () => harnessTamper([fd('.rig/bin/sdlc.ts', ['x'])], { point: 'ci', before: () => '', after: () => '' }),
  'red-proof': { spec: 'check.spec.ts' },
  'traceability': { spec: 'seeded.spec.ts' },
  'model-role': { spec: 'modelstate.spec.ts' },
}

test('every built-in sensor has a seeded violation it rejects, or names the spec that proves it', () => {
  assert.deepEqual(Object.keys(SEEDED).sort(), [...BUILTIN_IDS].sort(), 'a new built-in needs an entry here')
  for (const [id, proof] of Object.entries(SEEDED)) {
    if (typeof proof === 'function') assert.ok(proof().some(f => f.sensor === id), `${id} did not flag its seeded violation`)
    else assert.ok(fs.readFileSync(path.join(import.meta.dirname, proof.spec), 'utf8').includes(id), `${proof.spec} does not mention ${id}`)
  }
})

test('inertSensors lists a sensor that passes only because nothing configures it', () => {
  const r = defaultRegistry()
  assert.deepEqual(inertSensors(r, 0).map(i => i.id), ['layering', 'rules', 'red-proof'])
  assert.deepEqual(inertSensors(layered, 1).map(i => i.id), ['red-proof'])
  const off = defaultRegistry()
  for (const s of off.sensors) if (s.id === 'layering') s.enabled = false
  assert.ok(!inertSensors(off, 0).some(i => i.id === 'layering'), 'a disabled sensor is a choice, not a false green')
})
