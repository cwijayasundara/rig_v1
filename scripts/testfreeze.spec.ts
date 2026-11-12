// Frozen tests (C2): the test writer's hand-off is hashed; a later change to a frozen test blocks locally and in CI, however it was written.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, hook } from './testkit.ts'

type F = { sensor: string; severity: string; file?: string; message: string; fix?: string }
const FREEZE = '.rig/changes/demo/tests.freeze.jsonl'
const rows = (r: string) => fs.readFileSync(path.join(r, FREEZE), 'utf8').trim().split('\n').map(l => JSON.parse(l))
const tamper = (r: string, at: string, ...more: string[]) => (JSON.parse(sdlc(r, ['check', '--at', at, '--base', 'main', '--json', ...more]).stdout) as { findings: F[] }).findings.filter(f => f.sensor === 'test-tamper')

function frozenRepo(): string {
  const r = makeRepo()
  sdlc(r, ['init'])
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'base')
  gitIn(r, 'checkout', '-qb', 'work')
  sdlc(r, ['new', 'demo', '--type', 'feature'])
  write(r, 'tests/a.test.js', 'test one B1\n')
  write(r, 'src/a.js', 'export const a = 1\n')
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'tests')
  return r
}

test('tests-freeze records the change\'s test files by hash, defaults the first why, and requires --why afterwards', () => {
  const r = frozenRepo()
  assert.equal(sdlc(r, ['tests-freeze', 'demo']).code, 0)
  const [row] = rows(r)
  assert.equal(row.why, 'hand-off')
  assert.equal(row.commit, gitIn(r, 'rev-parse', 'HEAD'))
  assert.deepEqual(row.files.map((f: { path: string }) => f.path), ['tests/a.test.js'])
  assert.match(row.files[0].sha256, /^[0-9a-f]{64}$/)
  const second = sdlc(r, ['tests-freeze', 'demo'])
  assert.notEqual(second.code, 0)
  assert.match(second.stdout + second.stderr, /--why/)
  assert.equal(rows(r).length, 1)
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  assert.equal(sdlc(r, ['tests-freeze', 'demo', '--why', 'B1 asserted the wrong value']).code, 0)
  const all = rows(r)
  assert.deepEqual([all.length, all[0].why, all[1].why], [2, 'hand-off', 'B1 asserted the wrong value'])
  assert.notEqual(all[0].files[0].sha256, all[1].files[0].sha256)
})

test('a frozen test changed by Write, by a plain fs write (Bash), or deleted blocks at stop, ship and ci; a new test does not', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  hook(r, 'prompt-submit', {})
  assert.deepEqual(tamper(r, 'ci'), [])
  write(r, 'tests/new.test.js', 'test two\n')
  assert.deepEqual(tamper(r, 'ci'), [])
  fs.writeFileSync(path.join(r, 'tests/a.test.js'), 'test one B1 loosened\n')
  for (const at of ['stop', 'ship', 'ci']) {
    const [f, ...rest] = tamper(r, at)
    assert.deepEqual([rest.length, f?.severity, f?.file, f?.message], [0, 'block', 'tests/a.test.js', 'frozen test changed after the test writer\'s hand-off'], at)
    assert.match(f?.fix ?? '', /relaunch the test writer.*tests-freeze demo --why/)
  }
  fs.rmSync(path.join(r, 'tests/a.test.js'))
  assert.equal(tamper(r, 'ci').length, 1)
})

test('a re-freeze with --why makes the new content the frozen one (the last row wins)', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  assert.equal(tamper(r, 'ci').length, 1)
  sdlc(r, ['tests-freeze', 'demo', '--why', 'wrong value'])
  assert.deepEqual(tamper(r, 'ci'), [])
})

test('a freeze file rewritten instead of appended blocks at ci and ship; an appended one passes', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'freeze')
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  sdlc(r, ['tests-freeze', 'demo', '--why', 'wrong value'])
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'refreeze')
  assert.deepEqual(tamper(r, 'ci'), [])
  // rewrite: drop the first row and re-hash the loosened test as if it were the hand-off
  write(r, 'tests/a.test.js', 'test one B1 loosened\n')
  fs.writeFileSync(path.join(r, FREEZE), '')
  sdlc(r, ['tests-freeze', 'demo'])
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'rewrite')
  for (const at of ['ship', 'ci']) assert.deepEqual(tamper(r, at).map(f => [f.severity, f.message]), [['block', 'tests.freeze.jsonl was rewritten, not appended']], at)
})
