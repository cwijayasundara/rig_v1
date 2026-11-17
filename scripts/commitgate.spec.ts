// The commit gate's observe mode and the Rig-Verified trailer.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, registry } from './testkit.ts'
import { parseRegistry, weakensRegistry } from './registry.ts'

const SECRET = 'const apikey = "abcdefghijklmnop12345678"\n'
let repo: string
const stage = (rel: string, text: string): void => { write(repo, rel, text); gitIn(repo, 'add', rel) }
const withGate = (gate: string): string => registry({ extra: { risk: { gate } } })
// The gate mode comes from the trunk, so a test that wants observe commits the registry on main first.
const onTrunk = (text: string): void => { write(repo, '.rig/sensors.json', text); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'registry') }
beforeEach(() => { repo = makeRepo() })

test('risk.gate parses, defaults to enforce, rejects other values, and loosening to observe is a weakening', () => {
  assert.equal(parseRegistry(withGate('observe')).registry.risk.gate, 'observe')
  assert.equal(parseRegistry(registry()).registry.risk.gate, 'enforce')
  assert.match(parseRegistry(withGate('off')).errors.join(), /risk.gate must be/)
  assert.deepEqual(weakensRegistry(withGate('enforce'), withGate('observe')), ['risk.gate loosened to observe'])
  assert.deepEqual(weakensRegistry(withGate('observe'), withGate('enforce')), [])
})

test('observe mode lets a would-be block through, says so, and logs it', () => {
  onTrunk(withGate('observe'))
  stage('src/a.js', SECRET)
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(r.code, 0, r.stdout)
  assert.match(r.stdout, /observe: would block/)
  const log = fs.readFileSync(path.join(repo, '.rig/gates.jsonl'), 'utf8')
  assert.match(log, /secrets/)
})

test('the mode is the trunk\'s: observe written only in the working tree still blocks', () => {
  onTrunk(registry())
  write(repo, '.rig/sensors.json', withGate('observe'))
  stage('src/a.js', SECRET)
  assert.equal(sdlc(repo, ['check', '--at', 'commit']).code, 1)
})

test('observe never demotes a broken config: it still blocks', () => {
  onTrunk(withGate('observe'))
  write(repo, '.rig/sensors.json', withGate('bogus')) // the working copy is what the commit judges
  stage('src/a.js', 'export const a = 1\n')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(r.code, 1, r.stdout)
  assert.match(r.stdout, /risk.gate must be/)
})

test('a real commit gets Rig-Verified: pass; --no-verify gets nothing; a stale or missing verdict reads none', () => {
  sdlc(repo, ['vendor'])
  sdlc(repo, ['hooks', 'install'])
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'harness')
  stage('src/a.js', 'export const a = 1\n')
  gitIn(repo, 'commit', '-qm', 'clean')
  assert.match(gitIn(repo, 'log', '-1', '--format=%(trailers:key=Rig-Verified,valueonly)'), /^pass$/)
  stage('src/b.js', 'export const b = 1\n')
  gitIn(repo, 'commit', '-qm', 'skipped', '--no-verify')
  assert.equal(gitIn(repo, 'log', '-1', '--format=%(trailers:key=Rig-Verified,valueonly)'), '')
  // commit-msg with no verdict for this tree: none
  const msg = path.join(repo, 'MSG'); fs.writeFileSync(msg, 'x\n')
  stage('src/c.js', 'export const c = 1\n')
  assert.equal(sdlc(repo, ['trailer', msg]).code, 0)
  assert.match(fs.readFileSync(msg, 'utf8'), /Rig-Verified: none/)
})

test('a verdict is for the tree it judged: staging more after pre-commit makes the trailer none', () => {
  sdlc(repo, ['vendor'])
  stage('src/a.js', 'export const a = 1\n')
  assert.equal(sdlc(repo, ['check', '--at', 'commit']).code, 0)
  stage('src/z.js', 'export const z = 1\n') // changes the tree after the verdict
  const msg = path.join(repo, 'MSG'); fs.writeFileSync(msg, 'x\n')
  sdlc(repo, ['trailer', msg])
  assert.match(fs.readFileSync(msg, 'utf8'), /Rig-Verified: none/)
})

test('the README documents the gate modes, the trailer, the checklist and /goal', () => {
  const readme = fs.readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8')
  for (const needle of ['risk.gate', 'Rig-Verified', 'sdlc.ts checklist', 'learn prune', '/goal']) assert.ok(readme.includes(needle), `README lacks ${needle}`)
})
