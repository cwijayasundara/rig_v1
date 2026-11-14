import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Checks } from './checks.mjs'

// 2026-11-14: a check that could not run (pytest missing) was recorded as a PASS, so a group looked fully green with coverage gone.
test('a skipped check is never a pass: it counts toward the group size, not toward passed', async () => {
  const c = new Checks('g')
  await c.check('ran', () => true)
  c.skip('needs pytest', 'pytest is not installed')
  assert.equal(c.failed.length, 0)
  assert.deepEqual(c.skipped.map(r => r.name), ['needs pytest'])
  assert.deepEqual([c.toJSON().passed, c.toJSON().skipped, c.toJSON().total], [1, 1, 2])
  const lines = []
  c.print(l => lines.push(l))
  assert.match(lines.at(-1), /g: 1\/2 checks passed, 1 skipped/)
})
