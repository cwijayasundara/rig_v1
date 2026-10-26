import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scoreChart, renderChartTable, runChartOne, CHART_ARMS } from './chart.mjs'

const key = { requirements: ['FR-1', 'FR-2'] }
const intent = (slug, prd, days = 1, reqs = prd, more = {}) => ({ slug, prd, estimateDays: days, behaviours: [{ id: 'B1', reqs, text: 'x' }], kind: 'internal', failures: [], design: 1, ...more })
const perfect = [intent('a', ['FR-1']), intent('b', ['FR-2'])]

test('a perfect chart scores full recall, no invented intent, full size compliance, valid dependencies', () => {
  assert.deepEqual(scoreChart(key, [], perfect), { recall: 1, inventedIntentRate: 0, sizeCompliance: 1, dependenciesValid: true, designCoverage: 1, failureCoverage: 1 })
})

test('design coverage counts intents with a design row; failure coverage counts boundary intents with a failure behaviour', () => {
  const boundary = (slug, failures) => intent(slug, ['FR-1'], 1, ['FR-1'], { kind: 'boundary', failures })
  const s = scoreChart(key, [], [intent('a', ['FR-1'], 1, ['FR-1'], { design: 0 }), boundary('b', ['B2']), boundary('c', [])])
  assert.deepEqual([s.designCoverage, s.failureCoverage], [2 / 3, 0.5])
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
  assert.deepEqual(scoreChart(key, [], []), { recall: 0, inventedIntentRate: 0, sizeCompliance: 0, dependenciesValid: true, designCoverage: 0, failureCoverage: 1 })
})

test('the table has a row per arm with the means', () => {
  const rows = [{ arm: 'architect-opus', recall: 1, inventedIntentRate: 0, sizeCompliance: 1, dependenciesValid: true, designCoverage: 1, failureCoverage: 1, usd: 1 }, { arm: 'architect-opus', recall: 0.5, inventedIntentRate: 0.5, sizeCompliance: 1, dependenciesValid: false, designCoverage: 0, failureCoverage: 0.5, usd: 3 }]
  const table = renderChartTable(rows)
  assert.match(table, /\| architect-opus \| 2 \| 0\.75 \| 0\.25 \| 1 \| 1\/2 \| 0\.5 \| 0\.75 \| \$2\.00 \|/)
})

test('a dry run replays the known-good chart at $0 and scores it perfectly', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-chart-'))
  const row = await runChartOne(CHART_ARMS[0], 1, { dry: true, out, capRunUsd: 3 })
  assert.deepEqual([row.arm, row.recall, row.inventedIntentRate, row.sizeCompliance, row.dependenciesValid, row.designCoverage, row.failureCoverage, row.usd, row.error], [CHART_ARMS[0].id, 1, 0, 1, true, 1, 1, 0, undefined], JSON.stringify(row))
})

// 2026-10-26 PRD fidelity: the id rules sat in prose, the chart weakened them, and three id bugs shipped.
const rulesKey = { requirements: ['FR-1'], rules: [{ quote: 'Ids start at 1.', mustKeep: ['\\b1\\b'] }, { quote: 'Ids are never reused, even after an item is removed.', mustKeep: ['never|not.*reuse|unique'] }] }
const rows = [{ id: 'G-1', alias: null, kind: 'rule', quote: 'Ids start at 1.' }, { id: 'G-2', alias: null, kind: 'rule', quote: 'Ids are never reused, even after an item is removed.' }]
const withRules = (b2 = 'a removed id is never handed out again') => [{ ...intent('a', ['FR-1']), behaviours: [{ id: 'B1', reqs: ['FR-1'], rules: ['G-1'], text: 'the first id is 1' }, { id: 'B2', reqs: ['FR-1'], rules: ['G-2'], text: b2 }] }]

test('prose rules quoted in the ledger, cited by a behaviour that keeps their constraints, score full marks', () => {
  const s = scoreChart(rulesKey, [], withRules(), rows)
  assert.deepEqual([s.rulesQuoted, s.rulesCited, s.constraintsKept], [1, 1, 1])
})

test('a behaviour that drops "never reused" halves constraints kept; an unquoted rule lowers rules quoted', () => {
  assert.equal(scoreChart(rulesKey, [], withRules('ids are integers'), rows).constraintsKept, 0.5)
  assert.deepEqual([scoreChart(rulesKey, [], withRules(), rows.slice(0, 1)).rulesQuoted, scoreChart(rulesKey, [], withRules(), rows.slice(0, 1)).rulesCited], [0.5, 0.5])
})

test('a key with no rules leaves the three rule scores out', () => {
  assert.deepEqual(Object.keys(scoreChart(key, [], perfect)).filter(k => k.startsWith('rules') || k === 'constraintsKept'), [])
})

test('the sprint-b key states its rules in the PRD prose, word for word', () => {
  const k = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/chart/sprint-b.json'), 'utf8'))
  const prd = fs.readFileSync(path.join(import.meta.dirname, '..', k.prd), 'utf8')
  for (const r of k.rules) assert.ok(prd.includes(r.quote), r.quote)
  assert.match(prd, /## Data model\n\n[^\n]*Ids are never reused/)
})

// 2026-10-26 PRD format: a sprint-b PRD is converted; the score follows each prose rule through the map into a DR line.
const conversion = (dr2 = 'Ids are never reused, even after an item is removed.') => ({
  map: [{ ids: ['DR-1'], context: false, line: 9, quote: 'Ids start at 1.', reason: '' }, { ids: ['DR-2'], context: false, line: 9, quote: 'Ids are never reused, even after an item is removed.', reason: '' }],
  criteria: [{ id: 'DR-1', parent: null, kind: 'rule', line: 30, text: 'Each item id is an integer starting at 1.' }, { id: 'DR-2', parent: null, kind: 'rule', line: 31, text: dr2 }],
})
const drIntents = [{ ...intent('a', ['FR-1']), behaviours: [{ id: 'B1', reqs: ['FR-1'], rules: ['DR-1'], text: 'x' }, { id: 'B2', reqs: ['FR-1'], rules: ['DR-2'], text: 'y' }] }]

test('a conversion that maps both prose rules to DR lines that keep their constraints, cited by behaviours, scores full marks', () => {
  const s = scoreChart(rulesKey, [], drIntents, [], conversion())
  assert.deepEqual([s.rulesQuoted, s.rulesCited, s.constraintsKept], [1, 1, 1])
})

test('a DR line that lost "never" halves constraints kept', () => {
  assert.equal(scoreChart(rulesKey, [], drIntents, [], conversion('Ids are integers.')).constraintsKept, 0.5)
})
