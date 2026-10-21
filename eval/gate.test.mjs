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
