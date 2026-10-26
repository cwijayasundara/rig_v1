// rig:upgrade: three-way classification of harness files (base = manifest at install, disk = now, next = this plugin).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha } from './core.ts'
import { classify, proposeSensors } from './upgrade.ts'
import { loadPacks, PACKS_DIR } from './stackpacks.ts'

const one = (base: Record<string, string> | null, disk: string | null | undefined, next: string | undefined, baseText?: string) => {
  const b = base === null ? null : { ...base, ...(baseText === undefined ? {} : { f: sha(baseText) }) }
  const d = new Map<string, string | null>(disk === undefined ? [] : [['f', disk]])
  const n = new Map<string, string>(next === undefined ? [] : [['f', next]])
  return classify(b, d, n).get('f')
}

test('classify: unchanged since install is replaced', () => assert.equal(one({}, 'v1', 'v2', 'v1'), 'replace'))
test('classify: local edit with unchanged upstream is kept', () => assert.equal(one({}, 'mine', 'v1', 'v1'), 'keep'))
test('classify: both changed is a conflict', () => assert.equal(one({}, 'mine', 'v2', 'v1'), 'conflict'))
test('classify: no manifest: any difference is a conflict', () => assert.equal(one(null, 'a', 'b'), 'conflict'))
test('classify: no manifest: identical is noop', () => assert.equal(one(null, 'a', 'a'), 'noop'))
test('classify: missing file is added', () => {
  assert.equal(one({}, null, 'v2', 'v1'), 'add')
  assert.equal(one(null, null, 'v2'), 'add')
  assert.equal(one(null, undefined, 'v2'), 'add')
})
test('classify: removed upstream and untouched is deleted', () => assert.equal(one({}, 'v1', undefined, 'v1'), 'delete'))
test('classify: removed upstream and edited is a conflict', () => {
  assert.equal(one({}, 'mine', undefined, 'v1'), 'conflict')
  assert.equal(one(null, 'mine', undefined), 'conflict')
})

const packs = loadPacks(PACKS_DIR).packs
const team = (sensors: unknown[], stack = 'node') => JSON.stringify({ stack, sensors })

test('proposeSensors: proposes a pack sensor the team lacks', () => {
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  assert.ok(ids.includes('types'))
  const got = proposeSensors(team(ids.filter(i => i !== 'types').map(id => ({ id, cmd: 'x' }))), packs)
  assert.equal(got?.stack, 'node')
  assert.deepEqual(got?.sensors.map(s => (s as { id: string }).id), ['types'])
})
test("proposeSensors: a team's changed lint command is not proposed or touched", () => {
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  const text = team(ids.map(id => ({ id, cmd: id === 'lint' ? 'my own lint' : 'x' })))
  assert.equal(proposeSensors(text, packs), null)
  const text2 = team(ids.filter(i => i !== 'types').map(id => ({ id, cmd: 'my own ' + id })))
  assert.ok(!proposeSensors(text2, packs)!.sensors.some(s => (s as { id: string }).id === 'lint'))
})
test('proposeSensors: old shape, unparseable, unknown stack and a covered registry are null', () => {
  assert.equal(proposeSensors('{"stack":"node","lint":"x"}', packs), null)
  assert.equal(proposeSensors('not json', packs), null)
  assert.equal(proposeSensors(team([], 'nope'), packs), null)
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  assert.equal(proposeSensors(team(ids.map(id => ({ id }))), packs), null)
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MIGRATIONS, pendingMigrations, runMigrations } from './migrations.ts'

const tmpRepo = (sensors: string | null, marker = 'package.json'): string => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-mig-'))
  fs.writeFileSync(path.join(d, marker), '{}')
  fs.mkdirSync(path.join(d, '.rig'))
  if (sensors !== null) fs.writeFileSync(path.join(d, '.rig', 'sensors.json'), sensors)
  return d
}
const OLD = '{"stack":"node","lint":"x"}\n'
const since = MIGRATIONS[0]!.since

test('pendingMigrations returns only versions after installed and up to next', () => {
  assert.deepEqual(pendingMigrations(since, since), [])
  assert.deepEqual(pendingMigrations('0.0.1', '0.0.2'), [])
  assert.deepEqual(pendingMigrations('0.0.1', since).map(m => m.id), ['pre-registry-sensors'])
})
test('an unknown installed version runs everything', () => assert.deepEqual(pendingMigrations('', '99.0.0'), MIGRATIONS))
test('pre-registry-sensors writes sensors.json.rig-new and leaves sensors.json byte-identical', () => {
  const d = tmpRepo(OLD)
  const notes = runMigrations(pendingMigrations('', '99.0.0'), d)
  assert.ok(notes.some(n => n.includes('sensors.json.rig-new')))
  assert.equal(fs.readFileSync(path.join(d, '.rig', 'sensors.json'), 'utf8'), OLD)
  const proposed = fs.readFileSync(path.join(d, '.rig', 'sensors.json.rig-new'), 'utf8')
  assert.ok(Array.isArray(JSON.parse(proposed).sensors))
})
test('running it twice changes nothing more', () => {
  const d = tmpRepo(OLD)
  runMigrations(MIGRATIONS, d)
  const first = fs.readFileSync(path.join(d, '.rig', 'sensors.json.rig-new'), 'utf8')
  runMigrations(MIGRATIONS, d)
  assert.equal(fs.readFileSync(path.join(d, '.rig', 'sensors.json.rig-new'), 'utf8'), first)
  assert.equal(fs.readFileSync(path.join(d, '.rig', 'sensors.json'), 'utf8'), OLD)
})
test('a registry-shape sensors.json is untouched and no .rig-new appears', () => {
  const reg = JSON.stringify({ stack: 'node', sensors: [] })
  const d = tmpRepo(reg)
  assert.deepEqual(runMigrations(MIGRATIONS, d), [])
  assert.equal(fs.readFileSync(path.join(d, '.rig', 'sensors.json'), 'utf8'), reg)
  assert.ok(!fs.existsSync(path.join(d, '.rig', 'sensors.json.rig-new')))
})
test('an unknown stack gets a note and nothing is written', () => {
  const d = tmpRepo(OLD, 'README.md')
  const notes = runMigrations(MIGRATIONS, d)
  assert.ok(notes.length === 1 && /no stack pack/.test(notes[0]!))
  assert.ok(!fs.existsSync(path.join(d, '.rig', 'sensors.json.rig-new')))
})
