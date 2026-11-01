import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runJourneyOnce, journeyGate, checkBadCases, JOURNEY_ARMS } from './journey.mjs'
import { resultsAllowed } from './lib/cli.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ej-'))
const REC = path.resolve(import.meta.dirname, '../tests/e2e/journey/recorded')

test('a dry run yields a row with every field and perfect pass shares', async () => {
  const row = await runJourneyOnce({ arm: JOURNEY_ARMS[0], n: 1, dry: true, out: tmp(), capRunUsd: 5, recordedDir: path.join(REC, 'synthetic') })
  for (const k of ['arm', 'run', 'stageReached', 'passShare', 'blocking', 'usd', 'minutes', 'agreement']) assert.ok(k in row, k)
  assert.equal(row.stageReached, 'J6')
  assert.equal(row.blocking, 0)
  assert.ok(Object.values(row.passShare).every(v => v === 1))
})

test('a dry run never writes under eval/results', () => {
  assert.match(resultsAllowed(path.resolve(import.meta.dirname, 'results/x.jsonl'), true), /never write/)
})

test('a bad case drops the pass share of its stage and counts a blocking violation', async () => {
  const row = await runJourneyOnce({ arm: JOURNEY_ARMS[0], n: 1, dry: true, out: tmp(), capRunUsd: 5, recordedDir: path.join(REC, 'bad/chart-missing-ac') })
  assert.ok(row.passShare.J1 < 1)
  assert.equal(row.stageReached, 'J1')
  assert.ok(row.blocking >= 1)
})

test('the gate lists an arm with no baseline as not enforced', () => {
  const g = journeyGate([{ arm: 'haiku-rig', passShare: { J1: 1 }, blocking: 0 }], {})
  assert.deepEqual(g.unenforced, ['haiku-rig'])
  assert.ok(g.pass)
})

test('the gate needs minRuns and fails on a pass-share drop or extra blocking items', () => {
  const base = { 'haiku-rig': { minRuns: 2, minPassShare: { J1: 0.9 }, maxBlocking: 0 } }
  assert.match(journeyGate([{ arm: 'haiku-rig', passShare: { J1: 1 }, blocking: 0 }], base).failures[0], /1 run/)
  const bad = journeyGate([{ arm: 'haiku-rig', passShare: { J1: 0.5 }, blocking: 2 }, { arm: 'haiku-rig', passShare: { J1: 0.6 }, blocking: 1 }], base)
  assert.equal(bad.pass, false)
  assert.equal(bad.failures.length, 2)
})

test('checkBadCases reports a case whose expected violation is not raised', async () => {
  const root = tmp()
  fs.cpSync(path.join(REC, 'bad/chart-missing-ac'), path.join(root, 'bad/chart-missing-ac'), { recursive: true })
  fs.writeFileSync(path.join(root, 'bad/chart-missing-ac/expected.json'), JSON.stringify({ violation: 'J1.99' }))
  const r = await checkBadCases({ recordedRoot: root, out: tmp() })
  assert.deepEqual(r.missed, ['chart-missing-ac'])
  const ok = await checkBadCases({ recordedRoot: REC, out: tmp() })
  assert.deepEqual(ok.missed, [])
})
