// The reviewer's brief (harness readiness 2.2): short, self-contained, and built to be precise rather than loud.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const brief = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/review-brief.md'), 'utf8')

test('the brief is at most 60 lines and names its two placeholders', () => {
  assert.ok(brief.trimEnd().split('\n').length <= 60)
  assert.match(brief, /<base>/)
  assert.match(brief, /<slug>/)
})

test('the brief hands the reviewer the delta and the intent, and no builder reasoning', () => {
  assert.match(brief, /git diff <base>/)
  for (const f of ['intent.md', 'spec.md', 'plan.md', 'REVIEW.md']) assert.ok(brief.includes(f), f)
  assert.match(brief, /## Review/)
  assert.match(brief, /never seen how this change was built/)
  assert.match(brief, /Edit nothing/)
})

test('the brief demands evidence for every finding and caps how many it may raise', () => {
  assert.match(brief, /concrete input or state where it goes wrong/)
  assert.match(brief, /When you cannot, drop it/)
  assert.match(brief, /at most 8 findings/i)
  assert.match(brief, /Do not report style/)
})

test('the findings shape is the one review.md and the learning loop already read', () => {
  const line = brief.split('\n').find(l => l.startsWith('- [severity:')) ?? ''
  assert.match(line, /\[category: correctness\|contract\|data\|coupling\|responsibility\|abstraction\|duplication\|tests\]/)
  assert.doesNotMatch(brief, /\[category: security/, 'security is a separate pass')
})

test('a dismissed finding carries no category tag, so the learning loop counts kept findings only', () => {
  const review = '## Findings\n- [severity: high] [category: tests] a.js:1: p → f\n\n## Dismissed\n- b.js:2 q → dismissed: spec B3 says otherwise\n'
  assert.equal([...review.matchAll(/\[category: ([a-z-]+)\]/g)].length, 1, 'the pattern learn mine uses sees one finding')
})
