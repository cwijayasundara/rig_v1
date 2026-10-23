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
  assert.match(brief, /Style, naming, and suggestions[\s\S]*go under Deferred/)
})

test('the findings shape is the one review.md and the learning loop already read', () => {
  const line = brief.split('\n').find(l => l.startsWith('- [severity:')) ?? ''
  assert.match(line, /\[category: correctness\|contract\|design\|unmapped\|data\|coupling\|responsibility\|abstraction\|duplication\|tests\]/)
  assert.doesNotMatch(brief, /\[category: security/, 'security is a separate pass')
})

test('a dismissed finding carries no category tag, so the learning loop counts kept findings only', () => {
  const review = '## Findings\n- [severity: high] [category: tests] a.js:1: p → f\n\n## Dismissed\n- b.js:2 q → dismissed: spec B3 says otherwise\n'
  assert.equal([...review.matchAll(/\[category: ([a-z-]+)\]/g)].length, 1, 'the pattern learn mine uses sees one finding')
})

test('the skill computes the verdict after triage and forbids relabelling a finding to dismiss it', () => {
  const t = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/pr/SKILL.md'), 'utf8')
  assert.match(t, /`changes-needed` exactly when `## Findings` still has an item after your triage/)
  assert.match(t, /never relabel a finding to dismiss it/)
})

test('the brief and the skill agree: code doing what the non-goals exclude is a contract finding, and new files are read in full', () => {
  assert.match(brief, /Code that already does what the intent's non-goals exclude is a `contract` finding/)
  assert.match(brief, /every file `git status --short` lists with `\?\?`[\s\S]*read each of them in full/)
  assert.match(brief, /for coupling and responsibility, the specific next change it makes harder/)
})

test('the brief hands the reviewer the sprint design doc when architecture.md names one and defines the design category', () => {
  assert.match(brief, /architecture\.md[^\n]*design:/); assert.match(brief, /category: [^\]]*design/)
  assert.match(brief, /no longer matches a responsibility the design doc gives/)
  assert.ok(brief.trimEnd().split('\n').length <= 60)
})

test('the brief names unmapped behaviour and an Unverifiable section that never decides the verdict', () => {
  assert.match(brief, /`unmapped`/)
  assert.match(brief, /intent, spec (?:or|and) design doc never describe/)
  assert.match(brief.split('\n').find(l => l.startsWith('- [severity:')) ?? '', /\|unmapped\|/)
  assert.match(brief, /^## Unverifiable$/m)
  assert.match(brief, /settle by:/)
  assert.match(brief, /never change the verdict/i)
  assert.ok(brief.trimEnd().split('\n').length <= 60)
})
