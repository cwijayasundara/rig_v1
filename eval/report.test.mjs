import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, renderMarkdown } from './report.mjs'

const row = (arm, run, ok, usd = 1, extra = {}) => ({ arm, run, accepted: ok, checks: ok ? 3 : 1, of: 3, inputTokens: 1000 * run, outputTokens: 100 * run, usd, minutes: run, tamper: { testTamper: ok ? 0 : 1, suppression: 0 }, ...extra })

test('summarize merges rows from several files and keeps ARMS order', () => {
  const s = summarize([row('opus-bare', 1, true), row('haiku-bare', 1, false), row('haiku-bare', 2, true), row('opus-bare', 2, true)])
  assert.deepEqual(s.map(a => a.arm), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-final'])
  const hb = s.find(a => a.arm === 'haiku-bare')
  assert.deepEqual([hb.runs, hb.accepted, hb.checksMean, hb.inMedian, hb.usdMean, hb.tamper], [2, 1, 2, 1500, 1, 1])
})

test('an arm with no rows reads 0/0 and dashes', () => {
  const md = renderMarkdown(summarize([row('haiku-bare', 1, true)]), { date: '2026-10-16', files: ['a.jsonl'] })
  assert.match(md, /\| haiku-rig \| 0\/0 \| – \|/)
  assert.doesNotMatch(md, /NaN|undefined/)
})

test('the table shows lift in acceptance over Haiku bare, and errored runs', () => {
  const s = summarize([row('haiku-bare', 1, false), row('haiku-bare', 2, false), row('haiku-rig', 1, true), row('haiku-rig', 2, false, 1, { error: 'spend cap $6 reached' })])
  const md = renderMarkdown(s, { date: '2026-10-16', files: ['a.jsonl'] })
  assert.match(md, /\| haiku-rig \| 1\/2 \| \+50 pts \|/)
  assert.match(md, /\| haiku-bare \| 0\/2 \| baseline \|/)
  assert.match(md, /errors: haiku-rig 1 \(spend cap \$6 reached\)/)
})
