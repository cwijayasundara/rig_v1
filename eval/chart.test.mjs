import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scoreChart, renderChartTable, runChartOne, CHART_ARMS } from './chart.mjs'

const key = { requirements: ['FR-1', 'FR-2'] }
const intent = (slug, prd, days = 1, reqs = prd) => ({ slug, prd, estimateDays: days, behaviours: [{ id: 'B1', reqs, text: 'x' }] })
const perfect = [intent('a', ['FR-1']), intent('b', ['FR-2'])]

test('a perfect chart scores full recall, no invented intent, full size compliance, valid dependencies', () => {
  assert.deepEqual(scoreChart(key, [], perfect), { recall: 1, inventedIntentRate: 0, sizeCompliance: 1, dependenciesValid: true })
})

test('an intent citing a requirement the PRD lacks, or nothing, is invented', () => {
  assert.equal(scoreChart(key, [], [...perfect, intent('c', ['FR-99'])]).inventedIntentRate, 1 / 3)
  assert.equal(scoreChart(key, [], [...perfect, intent('c', [], 1, [])]).inventedIntentRate, 1 / 3)
  assert.equal(scoreChart(key, [], [intent('a', ['FR-1', 'FR-9'])]).inventedIntentRate, 1)
})

test('a requirement no intent cites lowers recall', () => {
  assert.equal(scoreChart(key, [], [intent('a', ['FR-1'])]).recall, 0.5)
})

test('an estimate of three days lowers size compliance', () => {
  assert.equal(scoreChart(key, [], [intent('a', ['FR-1'], 3), intent('b', ['FR-2'])]).sizeCompliance, 0.5)
})

test('a depends finding makes the dependencies invalid', () => {
  assert.equal(scoreChart(key, [{ rule: 'depends', severity: 'block', where: 'a', message: 'cycle' }], perfect).dependenciesValid, false)
})

test('no intents at all scores zero compliance and zero recall, never NaN', () => {
  assert.deepEqual(scoreChart(key, [], []), { recall: 0, inventedIntentRate: 0, sizeCompliance: 0, dependenciesValid: true })
})

test('the table has a row per arm with the means', () => {
  const rows = [{ arm: 'architect-opus', recall: 1, inventedIntentRate: 0, sizeCompliance: 1, dependenciesValid: true, usd: 1 }, { arm: 'architect-opus', recall: 0.5, inventedIntentRate: 0.5, sizeCompliance: 1, dependenciesValid: false, usd: 3 }]
  const table = renderChartTable(rows)
  assert.match(table, /\| architect-opus \| 2 \| 0\.75 \| 0\.25 \| 1 \| 1\/2 \| \$2\.00 \|/)
})

test('a dry run replays the known-good chart at $0 and scores it perfectly', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-chart-'))
  const row = await runChartOne(CHART_ARMS[0], 1, { dry: true, out, capRunUsd: 3 })
  assert.deepEqual([row.arm, row.recall, row.inventedIntentRate, row.sizeCompliance, row.dependenciesValid, row.usd, row.error], [CHART_ARMS[0].id, 1, 0, 1, true, 0, undefined], JSON.stringify(row))
})
