import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { packSnapshot, unpackSnapshot, seedSandbox } from './snapshot.mjs'
import { MODES, legStages } from './legs.mjs'
import { STAGES } from './stages.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'))
const repo = () => {
  const dir = tmp()
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'x')
  fs.writeFileSync(path.join(dir, 'kept.txt'), 'hello'); git('add', '-A'); git('commit', '-qm', 'c')
  fs.mkdirSync(path.join(dir, '.venv')); fs.writeFileSync(path.join(dir, '.venv/skip'), 'x')
  return { dir, git }
}

test('pack then unpack restores files and git history, and leaves out caches', () => {
  const a = repo(); const rec = tmp()
  packSnapshot({ dir: a.dir, recordedDir: rec, stage: 'J2' })
  const b = tmp()
  assert.equal(unpackSnapshot({ dir: b, recordedDir: rec, stage: 'J2' }), true)
  assert.equal(fs.readFileSync(path.join(b, 'kept.txt'), 'utf8'), 'hello')
  assert.ok(fs.existsSync(path.join(b, '.git')))
  assert.ok(!fs.existsSync(path.join(b, '.venv')))
})

test('unpack returns false when no snapshot was recorded for the stage', () => {
  assert.equal(unpackSnapshot({ dir: tmp(), recordedDir: tmp(), stage: 'J9' }), false)
})

test('seedSandbox restores a snapshot, recreates .tmp, and gives it a working bare origin', () => {
  const a = repo(); const rec = tmp()
  packSnapshot({ dir: a.dir, recordedDir: rec, stage: 'J2' })
  const root = tmp(); const dir = path.join(root, 'repo'); fs.mkdirSync(dir)
  const origin = path.join(root, 'origin.git')
  const calls = []
  const sb = { dir, origin, git: (...x) => execFileSync('git', x, { cwd: dir, encoding: 'utf8' }).trim(), run: (c, x) => { calls.push(x[0]); return { status: 0 } } }
  assert.equal(seedSandbox({ sb, recordedDir: rec, stage: 'J2' }), true)
  assert.ok(fs.existsSync(path.join(dir, '.tmp')))
  assert.equal(sb.git('remote', 'get-url', 'origin'), origin)
  assert.equal(execFileSync('git', ['rev-parse', 'main'], { cwd: origin, encoding: 'utf8' }).trim(), sb.git('rev-parse', 'HEAD'))
})

test('MODES: fast has two build legs from approved-chart snapshots under 20 minutes; chart and full are longer', () => {
  assert.deepEqual(MODES.fast.legs, [{ seed: 'J2', stages: ['J3'] }, { seed: 'J5', stages: ['J6'] }])
  assert.equal(MODES.fast.minutes, 20); assert.equal(MODES.fast.intents, 1)
  assert.deepEqual(MODES.chart.legs, [{ seed: null, stages: ['J0', 'J1', 'J2'] }, { seed: 'J3', stages: ['J4', 'J5'] }])
  assert.deepEqual(MODES.full.legs[0].stages, ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'])
  assert.ok(MODES.chart.minutes > 20 && MODES.full.minutes > MODES.chart.minutes)
})

test('legStages picks stages in table order', () => {
  assert.deepEqual(legStages(STAGES, ['J5', 'J4']).map(s => s.id), ['J4', 'J5'])
})
