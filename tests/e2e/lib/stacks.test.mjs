import test from 'node:test'
import assert from 'node:assert/strict'
import { probe, STACKS } from './stacks.mjs'

const fakeRun = result => () => result

test('probe() skips a stack whose version command exits non-zero', () => {
  const p = probe(fakeRun({ status: 1, stdout: '', stderr: 'Unable to locate a Java Runtime.' }), 'mvn', ['-v'])
  assert.equal(p.ok, false)
  assert.match(p.why, /mvn -v exited 1: Unable to locate a Java Runtime\./)
})

test('probe() skips a stack whose binary is missing', () => {
  const p = probe(fakeRun({ status: null, error: Object.assign(new Error('spawn go ENOENT'), { code: 'ENOENT' }) }), 'go', ['version'])
  assert.deepEqual(p, { ok: false, why: 'go not found' })
})

test('every pack the spec names has a fixture whose broken edit differs from its good edit', () => {
  assert.deepEqual(STACKS.map(s => s.stack).sort(), ['dotnet', 'go', 'java-maven', 'node', 'rust'])
  for (const s of STACKS) assert.notEqual(s.broken('x'), s.good('x'), s.stack)
})

import { sensorOf } from './findings.mjs'

test('sensorOf() names a command finding by the registry id its message leads with', () => {
  assert.equal(sensorOf({ sensor: 'commands', message: 'types failed (exit 101): Code must compile.' }), 'types')
  assert.equal(sensorOf({ sensor: 'commands', message: 'unit not run: the 600 s budget ran out' }), 'unit')
  assert.equal(sensorOf({ sensor: 'secrets', message: 'unit failed' }), 'secrets')
})
