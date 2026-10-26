// rig:upgrade: three-way classification of harness files (base = manifest at install, disk = now, next = this plugin).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sha } from './core.ts'
import { classify } from './upgrade.ts'

const one = (base: Record<string, string> | null, disk: string | null | undefined, next: string | undefined, baseText?: string) => {
  const b = base === null ? null : { ...base, ...(baseText === undefined ? {} : { f: sha(baseText) }) }
  const d = new Map<string, string | null>(disk === undefined ? [] : [['f', disk]])
  const n = new Map<string, string>(next === undefined ? [] : [['f', next]])
  return classify(b, d, n).get('f')
}

test('classify: unchanged since install is replaced', () => assert.equal(one({}, 'v1', 'v2', 'v1'), 'replace'))
test('classify: local edit with unchanged upstream is kept', () => assert.equal(one({}, 'mine', 'v1', 'v1'), 'keep'))
test('classify: both changed is a conflict', () => assert.equal(one({}, 'mine', 'v2', 'v1'), 'conflict'))
test('classify: no manifest: any difference is a conflict', () => assert.equal(one(null, 'a', 'b'), 'conflict'))
test('classify: no manifest: identical is noop', () => assert.equal(one(null, 'a', 'a'), 'noop'))
test('classify: missing file is added', () => {
  assert.equal(one({}, null, 'v2', 'v1'), 'add')
  assert.equal(one(null, null, 'v2'), 'add')
  assert.equal(one(null, undefined, 'v2'), 'add')
})
test('classify: removed upstream and untouched is deleted', () => assert.equal(one({}, 'v1', undefined, 'v1'), 'delete'))
test('classify: removed upstream and edited is a conflict', () => {
  assert.equal(one({}, 'mine', undefined, 'v1'), 'conflict')
  assert.equal(one(null, 'mine', undefined), 'conflict')
})
