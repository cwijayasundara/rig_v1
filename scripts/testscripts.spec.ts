// Ship blocks on a package test script no sensor runs (the 2026-11-14 eval: the refund rule lived only in `test:all`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { uncoveredTestScripts, testScriptFindings } from './testscripts.ts'
import { defaultRegistry, type Registry } from './registry.ts'

const repo = (scripts: Record<string, string> | null): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-testscripts-'))
  if (scripts) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts }))
  return dir
}
const withCmds = (...cmds: string[]): Registry => {
  const r = defaultRegistry()
  return { ...r, sensors: [...r.sensors, ...cmds.map((cmd, i) => ({ id: `c${i}`, cmd, cadence: 'turn' as const, blocks: true, guide: 'g', enabled: true }))] }
}

test('a test script only a second script runs is uncovered (the hard eval shape)', () => {
  const dir = repo({ test: 'node --test test/*.test.js', 'test-fast': 'node --test test/*.test.js', 'test:all': 'node --test test/*.test.js test/integration/*.test.js' })
  assert.deepEqual(uncoveredTestScripts(withCmds('run-script test-fast'), dir), ['test:all'])
  const f = testScriptFindings(withCmds('run-script test-fast'), dir)
  assert.equal(f.length, 1)
  assert.equal(f[0]!.severity, 'block')
  assert.equal(f[0]!.sensor, 'test-scripts')
  assert.match(f[0]!.message, /"test:all"/)
  assert.match(f[0]!.fix, /\.rig\/sensors\.json/)
})

test('a sensor naming the script, running its body, or a covered script calling it covers it', () => {
  const dir = repo({ test: 'run-script test:unit && run-script test:int', 'test:unit': 'u', 'test:int': 'i', 'test:e2e': 'e' })
  assert.deepEqual(uncoveredTestScripts(withCmds('runner test', 'e'), dir), [])
  assert.deepEqual(uncoveredTestScripts(withCmds('runner test:unit'), dir), ['test', 'test:e2e', 'test:int'])
})

test('watch and dev scripts, non-test scripts, a disabled sensor and no package.json', () => {
  const dir = repo({ test: 't', 'test:watch': 'w', build: 'b', lint: 'l' })
  assert.deepEqual(uncoveredTestScripts(withCmds('runner test'), dir), [])
  const r = withCmds('runner test')
  assert.deepEqual(uncoveredTestScripts(withCmds('runner test', 'other'), repo({ test: 't', 'test:x': 'x' })), ['test:x'])
  assert.deepEqual(uncoveredTestScripts({ ...r, sensors: r.sensors.map(s => ({ ...s, enabled: false })) }, dir), [], 'no enabled command sensor: not judged')
  assert.deepEqual(uncoveredTestScripts(withCmds(), repo(null)), [])
})

test('check --at ship blocks on the uncovered script and passes once a sensor runs it', async () => {
  const { makeRepo, write, gitIn, sdlc, registry } = await import('./testkit.ts')
  const repo = makeRepo()
  write(repo, 'package.json', JSON.stringify({ scripts: { test: 'node -e 0', 'test:all': 'node -e 1' } }))
  write(repo, '.rig/sensors.json', registry({ turn: { unit: 'node -e 0' } }))
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base')
  const blocked = sdlc(repo, ['check', '--at', 'ship'])
  assert.notEqual(blocked.code, 0)
  assert.match(blocked.stdout + blocked.stderr, /test-scripts[\s\S]*"test:all"/)
  write(repo, '.rig/sensors.json', registry({ turn: { unit: 'node -e 0' }, ci: { all: 'node -e 1' } }))
  gitIn(repo, 'commit', '-qam', 'sensor')
  const ok = sdlc(repo, ['check', '--at', 'ship'])
  assert.doesNotMatch(ok.stdout + ok.stderr, /test-scripts/)
})
