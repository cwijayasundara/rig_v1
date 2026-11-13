// C6: the comprehension check (questions in the PR body, answers in the approving review) and the audit-in-progress block.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkQuestions, answersMissing, auditOpen } from './prcheck.ts'
import type { FileDiff } from './model.ts'

const lines = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ n: from + i, text: i === 0 ? 'export function exportCsv(rows) {' : `  row ${i}` }))
const diffs: FileDiff[] = [
  { file: 'src/small.ts', status: 'M', added: lines(1, 2), removed: [] },
  { file: 'src/export.ts', status: 'M', added: [...lines(10, 6), ...lines(40, 2)], removed: [] },
  { file: 'test/export.test.ts', status: 'A', added: lines(1, 30), removed: [] },
]
const spec = '# Spec\n\n## Behaviours\n- B1: export downloads a CSV\n- B2: empty report exports a header row\n'

test('exactly three questions Q1-Q3, deterministic, from the largest changed source file, the spec behaviours and a changed line range', () => {
  const q = checkQuestions(diffs, spec)
  assert.equal(q.length, 3)
  assert.match(q[0]!, /^Q1: What breaks if `exportCsv` in src\/export\.ts returns early\?$/)
  assert.match(q[1]!, /^Q2: Which behaviour \(B1, B2\) does src\/export\.ts serve\?$/)
  assert.match(q[2]!, /^Q3: Which test fails if src\/export\.ts lines 10-15 are reverted\?$/)
  assert.deepEqual(checkQuestions([...diffs].reverse(), spec), q)
})

test('with no spec behaviours Q2 asks for the intent; with no diff there are still three questions', () => {
  assert.match(checkQuestions(diffs, '')[1]!, /^Q2: Which intent does src\/export\.ts serve\?$/)
  const none = checkQuestions([], spec)
  assert.equal(none.length, 3)
  assert.deepEqual(none.map(q => q.slice(0, 3)), ['Q1:', 'Q2:', 'Q3:'])
})

const review = (body: string, o: object = {}) => ({ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER', commit_id: 'h1', body, ...o })
const good = 'Q1: the export stops halfway\nQ2: B1 the csv download\nQ3: test/export.test.ts fails'

test('answers: the approving review of the head commit must carry Q1-Q3 of 10+ characters, not skip/n/a/lgtm', () => {
  assert.equal(answersMissing([review(good)], 'h1', 'dev', false), null)
  assert.match(answersMissing([review('')], 'h1', 'dev', false)!, /does not answer Q1, Q2, Q3/)
  assert.match(answersMissing([review('Q1: short\nQ2: B1 the csv download\nQ3: test/export.test.ts fails')], 'h1', 'dev', false)!, /Q1/)
  assert.match(answersMissing([review('Q1: skip\nQ2: n/a\nQ3: lgtm')], 'h1', 'dev', false)!, /Q1, Q2, Q3/)
  assert.match(answersMissing([review(good, { commit_id: 'old' })], 'h1', 'dev', false)!, /Q1/, 'an answer on another commit does not count')
  assert.match(answersMissing([review(good, { state: 'COMMENTED' })], 'h1', 'dev', false)!, /Q1/)
  assert.match(answersMissing([review(good, { user: { login: 'dev' } })], 'h1', 'dev', false)!, /Q1/, 'the author cannot answer for the reviewer')
  assert.equal(answersMissing([review(good, { user: { login: 'dev' }, state: 'COMMENTED' })], 'h1', 'dev', true), null, 'the lead override path: the self-approver answers in a review comment')
})

test('an audit commit with no revert of it blocks; a reverted one does not', () => {
  assert.match(auditOpen(['feat: x', 'audit: seeded defect s5-ab12'])!, /audit in progress: a seeded defect is present/)
  assert.equal(auditOpen(['feat: x']), null)
  assert.equal(auditOpen(['Revert "audit: seeded defect s5-ab12"', 'audit: seeded defect s5-ab12']), null)
  assert.match(auditOpen(['Revert "audit: seeded defect s5-ab12"', 'audit: seeded defect s5-ab12', 'audit: seeded defect s5-cd34'])!, /audit in progress/)
})
