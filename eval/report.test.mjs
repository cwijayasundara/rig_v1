import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, renderMarkdown } from './report.mjs'

const row = (arm, run, ok, usd = 1, extra = {}) => ({ arm, run, accepted: ok, checks: ok ? 3 : 1, of: 3, inputTokens: 1000 * run, outputTokens: 100 * run, usd, minutes: run, tamper: { testTamper: ok ? 0 : 1, suppression: 0 }, ...extra })

test('summarize merges rows from several files and keeps ARMS order', () => {
  const s = summarize([row('opus-bare', 1, true), row('haiku-bare', 1, false), row('haiku-bare', 2, true), row('opus-bare', 2, true)])
  assert.deepEqual(s.map(a => a.arm), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-arch', 'haiku-rig-full', 'haiku-low-bare', 'haiku-low-rig', 'haiku-rig-final'])
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

test('final review: the same row read twice is counted once, and unjudged tamper is shown', () => {
  const r = row('haiku-bare', 1, true, 1, { at: '2026-10-16T10:00:00Z', tamper: { testTamper: 0, suppression: 0, unjudged: 2 } })
  const s = summarize([r, { ...r }])
  assert.equal(s.find(a => a.arm === 'haiku-bare').runs, 1)
  assert.match(renderMarkdown(s, { date: 'd', files: ['a'] }), /\| 0 \(\+2 unjudged\) \|/)
})

test('the table reports dollars per accepted task and flags a thin sample', () => {
  const rows = [
    { arm: 'haiku-bare', run: 1, at: 'a', accepted: true, checks: 3, usd: 0.1 }, { arm: 'haiku-bare', run: 2, at: 'b', accepted: false, checks: 2, usd: 0.3 },
    { arm: 'haiku-rig', run: 1, at: 'c', accepted: false, checks: 1, usd: 0.5 },
  ]
  const md = renderMarkdown(summarize(rows), { date: '2026-10-21', files: ['x.jsonl'] })
  assert.match(md, /\| haiku-bare \| 1\/2 \|[^\n]*\| \$0\.40 \|/, 'total spend 0.40 over 1 accepted')
  assert.match(md, /\| haiku-rig \| 0\/1 \|[^\n]*none accepted/)
  assert.match(md, /n < 3 for haiku-rig, haiku-bare: direction only/)
})

test('a run the machine slept through is not scored: its cost is shown apart and the arm keeps only real runs', () => {
  const s = summarize([row('haiku-rig', 1, false, 4, { infra: 'sleep' }), row('haiku-rig', 1, true, 1, { at: 'later' })])
  const a = s.find(x => x.arm === 'haiku-rig')
  assert.deepEqual([a.runs, a.accepted, a.invalid, a.invalidUsd], [1, 1, 1, 4])
  assert.match(renderMarkdown(s, { date: 'd', files: ['f'] }), /not scored \(machine slept mid-run.*haiku-rig 1 \(\$4\.00\)/)
})
