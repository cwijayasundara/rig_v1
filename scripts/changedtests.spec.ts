// A change that alters behaviour must be able to update the tests that pinned the old behaviour (found by the 2026-10-21 links eval:
// a rig build stopped on a red old test because the plan never named it). The plan names those tests; the build updates them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { type FileDiff } from './model.ts'
import { defaultRegistry } from './registry.ts'
import { testTamper } from './sensors.ts'

const skill = (name: string): string => fs.readFileSync(path.join(import.meta.dirname, '..', 'skills', name, 'SKILL.md'), 'utf8')
const fd = (file: string, added: string[], removed: string[]): FileDiff => ({ file, status: 'M', added: added.map((text, i) => ({ n: i + 1, text })), removed: removed.map((text, i) => ({ n: i + 1, text })) })

test('the plan skill has the planner find and list the existing tests a change makes wrong', () => {
  const plan = skill('plan')
  assert.match(plan, /Search the existing tests[\s\S]*every existing test whose expectation this change makes wrong/)
  assert.match(plan, /deleting or weakening an assertion is not/)
})

test('the build skill updates a listed test to the new expectation and runs the whole suite', () => {
  const build = skill('build')
  assert.match(build, /listed test that pins behaviour this change alters is updated to the new expectation/)
  assert.match(build, /never an assertion removed or loosened/)
  assert.match(build, /run the whole suite, not only the new tests/)
})

test('test-tamper allows changing an existing assertion\'s expected value, and still blocks removing one', () => {
  const r = defaultRegistry()
  const changed = fd('test/shop.test.js', ["  assert.deepEqual(order.lines, [{ sku: 'TEA-001', qty: 2, unitCents: 450, href: '/products/TEA-001' }])"], ["  assert.deepEqual(order.lines, [{ sku: 'TEA-001', qty: 2, unitCents: 450 }])"])
  assert.deepEqual(testTamper([changed], r).filter(f => f.severity === 'block'), [], 'same number of assertions: an updated expectation')
  const dropped = fd('test/shop.test.js', [], ["  assert.deepEqual(order.lines, [{ sku: 'TEA-001', qty: 2, unitCents: 450 }])"])
  assert.equal(testTamper([dropped], r).filter(f => f.severity === 'block').length, 1, 'removing the assertion is still tamper')
})
