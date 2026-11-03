import test from 'node:test'
import assert from 'node:assert/strict'
import { gate } from './gate.mjs'

const rows = (arm, flags, usd = 0.5) => flags.map((accepted, i) => ({ arm, run: i + 1, accepted, usd }))
const BASE = { links: { 'haiku-rig': { minRuns: 3, minAcceptedRate: 0.6, maxUsdPerAccepted: 1.0 }, 'haiku-bare': { minRuns: 3, minAcceptedRate: 0.6 } } }

test('an arm at or above its baseline passes, and the gate says what each arm did', () => {
  const r = gate([...rows('haiku-rig', [true, true, false]), ...rows('haiku-bare', [true, true, true], 0.03)], BASE, 'links')
  assert.equal(r.pass, true)
  assert.match(r.lines.join('\n'), /haiku-rig: 2\/3 accepted, \$0\.75 per accepted/)
})

test('a drop below the baseline, a cost blow-up, too few runs and a missing arm each fail', () => {
  assert.match(gate(rows('haiku-rig', [true, false, false]).concat(rows('haiku-bare', [true, true, true])), BASE, 'links').failures.join(), /haiku-rig: accepted 33%, below the baseline 60%/)
  assert.match(gate(rows('haiku-rig', [true, true, true], 2).concat(rows('haiku-bare', [true, true, true])), BASE, 'links').failures.join(), /\$2\.00 per accepted, over the baseline \$1\.00/)
  assert.match(gate(rows('haiku-rig', [true, true]).concat(rows('haiku-bare', [true, true, true])), BASE, 'links').failures.join(), /2 run\(s\), the baseline needs 3; this proves nothing/)
  assert.match(gate(rows('haiku-bare', [true, true, true]), BASE, 'links').failures.join(), /haiku-rig: has a baseline but no results in this run/)
  assert.match(gate(rows('haiku-rig', [false, false, false]).concat(rows('haiku-bare', [true, true, true])), BASE, 'links').failures.join(), /nothing accepted/)
})

test('an arm with no baseline is listed as not enforced and never counts as a pass of its own', () => {
  const r = gate(rows('opus-bare', [true, true, true]), {}, 'links')
  assert.deepEqual(r.unenforced, ['opus-bare'])
  assert.equal(r.pass, true, 'nothing to fail against')
  assert.deepEqual(r.failures, [])
})

test('failed runs are left out, not counted as misses', () => {
  const r = gate([...rows('haiku-bare', [true, true, true]), { arm: 'haiku-bare', run: 4, failed: true }], { links: { 'haiku-bare': { minRuns: 3, minAcceptedRate: 1 } } }, 'links')
  assert.equal(r.pass, true)
})

// The nightly runs `--variant links --arms haiku-bare,haiku-rig` against the committed baseline: if either arm loses its entry the gate
// goes back to "not enforced" and says nothing is wrong.
test('the committed baseline enforces both arms the nightly eval runs, and the recorded links run passes it', async () => {
  const fs = await import('node:fs')
  const baseline = JSON.parse(fs.readFileSync(new URL('./baseline.json', import.meta.url), 'utf8'))
  const nightly = fs.readFileSync(new URL('../.github/workflows/eval.yml', import.meta.url), 'utf8')
  const arms = /--arms (\S+)/.exec(nightly)?.[1]?.split(',') ?? []
  assert.deepEqual(arms.sort(), ['haiku-bare', 'haiku-rig'])
  for (const a of arms) assert.ok(baseline.links?.[a]?.minRuns >= 3 && baseline.links[a].minAcceptedRate > 0, `${a} has no enforced baseline`)
  const recorded = fs.readFileSync(new URL('./results/2026-10-21-links2.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  const r = gate(recorded, baseline, 'links')
  assert.deepEqual([r.unenforced, r.failures], [[], []])
})
