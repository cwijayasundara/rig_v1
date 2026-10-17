// Mining recurring findings and waivers into candidates, and the firing and retirement bookkeeping (learning loop design 2026-10-17).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, write, gitIn } from './testkit.ts'
import { mineCandidates, lessonStatus, shippedChanges } from './learnmine.ts'
import type { Lesson } from './learnfile.ts'

const shipAll = (repo: string, ...slugs: string[]): void => {
  for (const slug of slugs) write(repo, `.rig/changes/${slug}/pr.md`, 'pr')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'ship')
}

const finding = (category: string, n = 1): string =>
  `verdict: changes-needed\n## Findings\n${Array.from({ length: n }, (_, i) => `- [severity: high] [category: ${category}] src/a.ts:${i + 1}: bare string → use the contract shape (confidence 90)`).join('\n')}\n`

test('a category found in two changes is eligible, with both changes named', () => {
  const repo = makeRepo()
  write(repo, '.rig/changes/cart-add/review.md', finding('contract'))
  write(repo, '.rig/changes/cart-remove/review.md', finding('contract'))
  write(repo, '.rig/changes/cart-pay/review.md', finding('tests'))
  shipAll(repo, 'cart-add', 'cart-remove', 'cart-pay')
  const got = mineCandidates(repo)
  assert.equal(got.length, 1)
  assert.deepEqual({ key: got[0]?.key, kind: got[0]?.kind, changes: got[0]?.changes, count: got[0]?.count }, { key: 'contract', kind: 'finding', changes: ['cart-add', 'cart-remove'], count: 2 })
  assert.match(got[0]?.sample ?? '', /bare string/)
})

test('a category repeated three times in one change is not eligible', () => {
  const repo = makeRepo()
  write(repo, '.rig/changes/cart-add/review.md', finding('contract', 3))
  assert.deepEqual(mineCandidates(repo), [])
})

test('a review.md with no tags, and a change with no review.md, yield nothing', () => {
  const repo = makeRepo()
  write(repo, '.rig/changes/cart-add/review.md', 'looks fine, nothing to report\n')
  write(repo, '.rig/changes/cart-remove/intent.md', '# intent\n')
  assert.deepEqual(mineCandidates(repo), [])
})

test('waivers on one sensor in two changes are eligible', () => {
  const repo = makeRepo()
  const row = (slug: string) => JSON.stringify({ slug, sensor: 'size', file: '*', reason: 'big', by: 'p', at: '2026-10-17T00:00:00Z' })
  write(repo, '.rig/changes/a-one/intent.md', 'x')
  write(repo, '.rig/changes/b-two/intent.md', 'x')
  write(repo, '.rig/waivers.jsonl', `${row('a-one')}\n${row('b-two')}\nnot json\n`)
  shipAll(repo, 'a-one', 'b-two')
  const got = mineCandidates(repo)
  assert.deepEqual(got.map(c => [c.key, c.kind, c.changes]), [['size', 'waiver', ['a-one', 'b-two']]])
})

const lesson = (over: Partial<Lesson> = {}): Lesson => ({ id: 'L1', text: 't', key: 'contract', seen: ['a', 'b'], first: '2026-10-01', lastFired: '2026-10-01', status: 'active', ...over })
const ship = (slug: string, date: string, keys: string[]) => ({ slug, date, keys })

test('lastFired becomes the latest later change carrying the lesson key', () => {
  const got = lessonStatus([lesson()], [ship('c', '2026-10-05', ['contract']), ship('d', '2026-10-09', ['contract']), ship('e', '2026-10-11', ['tests']), ship('old', '2026-09-20', ['contract'])], [])
  assert.equal(got.lastFired.L1, '2026-10-09')
  assert.deepEqual(got.retire, [])
})

test('an active lesson not fired across 10 later changes is flagged', () => {
  const later = Array.from({ length: 10 }, (_, i) => ship(`c${i}`, `2026-10-${String(i + 2).padStart(2, '0')}`, ['tests']))
  const got = lessonStatus([lesson()], later, [])
  assert.equal(got.retire[0]?.id, 'L1')
  assert.match(got.retire[0]?.why ?? '', /10 later changes/)
  assert.deepEqual(lessonStatus([lesson()], later.slice(0, 9), []).retire, [])
})

test('a promoted rule waived three times is flagged', () => {
  const waivers = ['a', 'b', 'c'].map(s => ({ sensor: 'rules', reason: `no-bare-error is wrong here ${s}` }))
  const got = lessonStatus([lesson({ status: 'promoted:no-bare-error' })], [], waivers)
  assert.match(got.retire[0]?.why ?? '', /waived 3/)
  assert.deepEqual(lessonStatus([lesson({ status: 'promoted:no-bare-error' })], [], waivers.slice(0, 2)).retire, [])
})

test('shippedChanges dates a change by the commit that added its pr.md', () => {
  const repo = makeRepo()
  write(repo, '.rig/changes/cart-add/review.md', finding('contract'))
  write(repo, '.rig/changes/cart-add/pr.md', 'pr')
  write(repo, '.rig/changes/unshipped/review.md', finding('contract'))
  gitIn(repo, 'add', '.rig/changes/cart-add')
  gitIn(repo, 'commit', '-qm', 'ship', '--date', '2026-10-05T10:00:00Z')
  const got = shippedChanges(repo)
  assert.equal(got.length, 1)
  assert.equal(got[0]?.slug, 'cart-add')
  assert.match(got[0]?.date ?? '', /^\d{4}-\d{2}-\d{2}$/)
  assert.deepEqual(got[0]?.keys, ['contract'])
})

test('an in-flight change (no committed pr.md) is not mined, and a directory that is not a change slug is ignored', () => {
  const repo = makeRepo()
  write(repo, '.rig/changes/cart-add/review.md', finding('contract'))
  write(repo, '.rig/changes/cart-remove/review.md', finding('contract'))
  write(repo, '.rig/changes/X/review.md', finding('contract'))
  shipAll(repo, 'cart-add', 'X')
  assert.deepEqual(mineCandidates(repo), [])
})

test('changes shipped the same day as the last firing still count toward retirement, but an earning change does not', () => {
  const day = '2026-10-01'
  const many = Array.from({ length: 10 }, (_, i) => ship(`c${i}`, day, ['tests']))
  assert.match(lessonStatus([lesson({ first: day, lastFired: day })], many, []).retire[0]?.why ?? '', /not fired in 10/)
  assert.deepEqual(lessonStatus([lesson({ first: day, lastFired: day, seen: ['c0', 'c1'] })], many, []).retire, [])
})

test('a waiver naming no-x-y does not count against the promoted rule no-x', () => {
  const waivers = ['a', 'b', 'c'].map(s => ({ sensor: 'rules', reason: `no-x-y is wrong here ${s}` }))
  assert.deepEqual(lessonStatus([lesson({ status: 'promoted:no-x' })], [], waivers).retire, [])
  const exact = ['a', 'b', 'c'].map(s => ({ sensor: 'rules', reason: `"no-x", ${s}` }))
  assert.equal(lessonStatus([lesson({ status: 'promoted:no-x' })], [], exact).retire.length, 1)
})
