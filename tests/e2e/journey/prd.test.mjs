import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { prdCriteria, prdFormatProblems } from '../../../scripts/prdformat.ts'

const read = f => fs.readFileSync(path.join(import.meta.dirname, 'prd', f), 'utf8')
const S1 = read('sprint-1-library-desk.md')
const S2 = read('sprint-2-library-desk-changes.md')
const frs = t => [...t.matchAll(/^### (FR-\d+):/gm)].map(m => m[1])

test('both PRDs parse into criteria and have no format problems', () => {
  for (const t of [S1, S2]) {
    assert.ok(prdCriteria(t).length > 10)
    assert.deepEqual(prdFormatProblems(t).filter(p => p.severity === 'block'), [])
  }
})

test('sprint 1 defines exactly FR-1..FR-10 and every FR has an AC', () => {
  assert.deepEqual(frs(S1), Array.from({ length: 10 }, (_, i) => `FR-${i + 1}`))
  const crit = prdCriteria(S1)
  for (const fr of frs(S1)) assert.ok(crit.some(c => c.parent === fr), `${fr} has no criterion`)
})

test('sprint 1 states the loan limit and the loan period in prose, not as numbers in an AC', () => {
  assert.match(S1, /at most 3 books/)
  assert.match(S1, /14 days/)
  const acs = S1.split('\n').filter(l => l.startsWith('- AC-')).join('\n')
  assert.doesNotMatch(acs, /\b14\b|\b3 loans\b/)
})

test('sprint 1 carries one open question about overdue', () => {
  assert.match(S1, /## Open questions\n\n- OQ-1: .*overdue/)
})

test('sprint 2 has a delta table with modified, new, removed-in-FR-10 and unchanged rows', () => {
  for (const kind of ['modified', 'new', 'unchanged']) assert.match(S2, new RegExp(`\\| ${kind} \\|`))
  assert.match(S2, /`--json` option of `find` is removed/)
  assert.deepEqual(frs(S2), ['FR-5', 'FR-7', 'FR-8', 'FR-10', 'FR-11', 'FR-12', 'FR-13'])
})

test('neither PRD names a source path', () => {
  const keep = l => !/^- (Source in|Same stack and layout)/.test(l)
  for (const t of [S1, S2]) assert.doesNotMatch(t.split('\n').filter(keep).join('\n'), /src\/|\.py\b/)
})
