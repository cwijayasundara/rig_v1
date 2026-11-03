// Plan 2026-11-03 PRD sufficiency: did the client write enough. coverage.md is checked by script, as conversion.md is.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TOPICS, parseCoverage, coverageProblems, clientGaps } from './prdcoverage.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = ['# Cart PRD', '', '## Context', '', 'Shoppers lose carts today.', '', '## Items', '', 'If the file is corrupt, exit 3 and change nothing.', ''].join('\n')
const PRD = (ac = ''): string => `---\nproduct: cart\nsprint: 1\nengineers: 1\n---\n# PRD\n\n## Functional requirements\n\n### FR-4: Items\n\nNeed: x\nPriority: must\n\n- AC-4.1: WHEN an item is added THE SYSTEM SHALL give it the next id${ac}\n\n## Data rules\n\nnone\n\n## Non-functional requirements\n\nnone\n\n## Boundaries\n\nnone\n\n## Open questions\n\nnone\n`
const NA = '— no model in this product'
const FULL = [
  '- failure covered source.md:9 "If the file is corrupt, exit 3 and change nothing."',
  '- escalation open', '- ground-truth open', '- security n/a by Dana — a local tool with no users', '- rollout n/a ' + NA,
  ...['accuracy', 'autonomy', 'fallback', 'budget', 'audit'].map(id => `- ${id} n/a ${NA}`), ''].join('\n')
const run = (coverage: string | null, prd = PRD(), source = SOURCE): { rule: string; where: string }[] => coverageProblems({ source, prd, coverage }).map(f => ({ rule: f.rule, where: f.where }))
const rules = (coverage: string | null, prd?: string): string[] => run(coverage, prd).map(f => f.rule).sort()

test('no coverage.md is one coverage-missing finding', () => assert.deepEqual(rules(null), ['coverage-missing']))

test('a complete file leaves only the open topics, each with the question to put to the client', () => {
  assert.deepEqual(rules(FULL), ['coverage-open', 'coverage-open'])
  const msgs = coverageProblems({ source: SOURCE, prd: PRD(), coverage: FULL }).map(f => f.message).join('\n')
  assert.match(msgs, /Escalation and hand-off[^\n]*Ask the client: When does the system hand over/)
  assert.deepEqual(rules(FULL.replace('- escalation open', '- escalation n/a — no person is involved').replace('- ground-truth open', '- ground-truth n/a — no model')), [])
})

test('a missing, a duplicated and an unknown topic', () => {
  assert.deepEqual(run(FULL.replace('- audit n/a ' + NA + '\n', '')).filter(f => f.rule === 'coverage-row'), [{ rule: 'coverage-row', where: 'audit' }])
  assert.deepEqual(run(FULL + '- audit n/a ' + NA + '\n- audit open\n').filter(f => f.rule === 'coverage-row').map(f => f.where), ['audit'])
  assert.deepEqual(run(FULL + '- colour open\n').filter(f => f.rule === 'coverage-topic'), [{ rule: 'coverage-topic', where: 'colour' }])
  assert.deepEqual(rules(FULL + '- garbled\n'), ['coverage-open', 'coverage-open', 'coverage-row'])
})

test('coverage-quote: a quote that is not in the source, or is far from its line', () => {
  assert.deepEqual(rules(FULL.replace('exit 3 and change nothing.', 'exit 4.')), ['coverage-open', 'coverage-open', 'coverage-quote'])
  assert.deepEqual(rules(FULL.replace('source.md:9', 'source.md:30')), ['coverage-open', 'coverage-open', 'coverage-quote'])
  assert.deepEqual(rules(FULL.replace('source.md:9', 'source.md:8')), ['coverage-open', 'coverage-open'])
})

test('coverage-answer: only a criterion a person confirmed answers a topic', () => {
  const answered = FULL.replace('- escalation open', '- escalation answered AC-4.1')
  assert.deepEqual(rules(answered, PRD(' (confirmed at chart by Dana)')), ['coverage-open'])
  assert.deepEqual(rules(answered, PRD(' (answered at chart)')), ['coverage-open'])
  assert.deepEqual(rules(answered, PRD(' (proposed at chart)')), ['coverage-answer', 'coverage-open'])
  assert.deepEqual(rules(answered, PRD()), ['coverage-answer', 'coverage-open'])
  assert.deepEqual(rules(answered.replace('AC-4.1', 'AC-9.9'), PRD(' (confirmed at chart by Dana)')), ['coverage-answer', 'coverage-open'])
  assert.deepEqual(rules(answered.replace('answered AC-4.1', 'answered'), PRD()), ['coverage-answer', 'coverage-open'])
})

test('coverage-reason: n/a needs a reason; "by <who>" is optional', () => {
  assert.deepEqual(rules(FULL.replace('- rollout n/a ' + NA, '- rollout n/a')), ['coverage-open', 'coverage-open', 'coverage-reason'])
  assert.deepEqual(parseCoverage('- security n/a by Dana — local only\n- rollout n/a — none\n'), [{ id: 'security', state: 'n/a', by: 'Dana', reason: 'local only' }, { id: 'rollout', state: 'n/a', reason: 'none' }])
})

test('clientGaps lists the open topics in the chart order, and says so when nothing is missing', () => {
  const text = clientGaps(FULL)
  assert.ok(text.indexOf('Escalation and hand-off') < text.indexOf('Ground truth and sample data'))
  assert.match(text, /^- \*\*Escalation and hand-off\*\* \(escalation\): When does/m)
  assert.doesNotMatch(text, /Security and access/)
  assert.match(clientGaps(FULL.replace(/open/g, 'n/a — x')), /Nothing is missing\./)
})

test('the template names every topic id and label, so the table and the template cannot drift', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'templates/prd-topics.md'), 'utf8')
  for (const t of TOPICS) { assert.ok(tpl.includes(`| ${t.id} | ${t.label} |`), t.id); assert.ok(t.question.length > 20, t.id) }
  assert.deepEqual(TOPICS.filter(t => t.agent).map(t => t.id), ['accuracy', 'autonomy', 'fallback', 'budget', 'audit'])
})
