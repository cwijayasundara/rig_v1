// rig:upgrade: numbered idempotent migrations.
import { test } from 'node:test'
import assert from 'node:assert/strict'
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
test('pre-registry-sensors applies only to an old-shape sensors.json', () => {
  const m = MIGRATIONS[0]!
  assert.equal(m.applies(tmpRepo(null)), false)
  assert.equal(m.applies(tmpRepo('{}')), false)
  assert.equal(m.applies(tmpRepo(JSON.stringify({ version: 1, sensors: [] }))), false)
  assert.equal(m.applies(tmpRepo(OLD)), true)
})
