import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { runJourney } from './journey.mjs'
import { STAGES } from './stages.mjs'
import { createViolationLog } from './violations.mjs'
import { scriptedKit, recordStage } from './driver-scripted.mjs'

const here = import.meta.dirname
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'))
const stubSb = () => ({ root: tmp(), dir: tmp(), sdlc: () => ({ status: 0, stdout: '[]', stderr: '' }), git: () => 'HEAD', run: () => ({ status: 0, stdout: '', stderr: '' }), commitAll: () => false })

async function replay(set) {
  const sb = stubSb()
  const kit = scriptedKit({ sb, recordedDir: path.join(here, 'recorded', set) })
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: sb.dir, triage: {} })
  const results = await runJourney({ sb, log, rubricDir: path.join(here, 'rubrics'), capUsd: 25, minutes: 60, ...kit })
  return { results, log }
}

test('the synthetic set replays to 7 passes and no violations', async () => {
  const { results, log } = await replay('synthetic')
  assert.deepEqual(results.map(r => r.status), Array(7).fill('pass'))
  assert.equal(log.all().length, 0)
})

for (const name of fs.readdirSync(path.join(here, 'recorded/bad')).filter(f => !f.startsWith('.'))) {
  test(`bad case ${name}: the expected violation is raised`, async () => {
    const dir = path.join('bad', name)
    const expected = JSON.parse(fs.readFileSync(path.join(here, 'recorded', dir, 'expected.json'), 'utf8'))
    const { log } = await replay(dir)
    assert.ok(log.all().some(v => v.id === expected.violation), `no ${expected.violation}; got ${log.all().map(v => v.id)}`)
  })
}

test('recordStage then replay round-trips a snapshot and the verdicts', async () => {
  const sb = stubSb()
  fs.writeFileSync(path.join(sb.dir, 'kept.txt'), 'hello'); fs.mkdirSync(path.join(sb.dir, '.venv')); fs.writeFileSync(path.join(sb.dir, '.venv/skip.txt'), 'x')
  const rec = tmp()
  recordStage({ sb, stage: 'J0', verdicts: [{ id: 'J0.1', verdict: 'pass', evidence: 'e', note: 'n' }], decision: null, recordedDir: rec })
  assert.ok(fs.existsSync(path.join(rec, 'snapshots/J0.tar.gz')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(rec, 'verdicts/J0.json'), 'utf8')).items[0].id, 'J0.1')
  const sb2 = stubSb()
  const kit = scriptedKit({ sb: sb2, recordedDir: rec })
  await kit.driver.init()
  assert.equal(fs.readFileSync(path.join(sb2.dir, 'kept.txt'), 'utf8'), 'hello')
  assert.ok(!fs.existsSync(path.join(sb2.dir, '.venv')))
})

test('onStageDone is called with each finished stage', async () => {
  const sb = stubSb(); const seen = []
  const kit = scriptedKit({ sb, recordedDir: path.join(here, 'recorded/synthetic') })
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: sb.dir, triage: {} })
  await runJourney({ sb, log, rubricDir: path.join(here, 'rubrics'), capUsd: 25, minutes: 60, ...kit, onStageDone: r => seen.push(r.stage) })
  assert.deepEqual(seen, ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'])
})

test('recordStage with snapshot:false writes verdicts but no tarball', () => {
  const sb = stubSb(); fs.writeFileSync(path.join(sb.dir, 'a.txt'), 'a')
  const rec = tmp()
  recordStage({ sb, stage: 'J1', verdicts: [], decision: null, recordedDir: rec, snapshot: false })
  assert.ok(fs.existsSync(path.join(rec, 'verdicts/J1.json')))
  assert.ok(!fs.existsSync(path.join(rec, 'snapshots/J1.tar.gz')))
})
