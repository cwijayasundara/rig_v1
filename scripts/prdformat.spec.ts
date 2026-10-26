// The PRD format for coding agents (spec 2026-10-26 PRD format and conversion): every rule a numbered, testable line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { prdFormatProblems, prdCriteria } from './prdformat.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const rules = (f: { rule: string }[]): string[] => f.map(x => x.rule).sort()
const PRD = (o: { fr?: string; data?: string; nfr?: string; drop?: string } = {}): string => {
  const s: Record<string, string> = {
    'Context and problem': 'Carts lose items.',
    'Functional requirements': o.fr ?? '### FR-4: Items\n\nNeed: an item gets an id.\nPriority: must\n\n- AC-4.1: WHEN an item is added THE SYSTEM SHALL give it the next id\n',
    'Data rules': o.data ?? '- DR-1: Each item id is an integer starting at 1.\n- DR-2: Ids are never reused, even after an item is removed.\n',
    'Non-functional requirements': o.nfr ?? '| ID | Category | Requirement | Target | Verified by |\n|---|---|---|---|---|\n| NFR-1 | performance | add on a 1 000-item cart | under 200 ms | unit |\n',
    'Boundaries': '- Always: run the tests.\n- Never: commit secrets.\n',
    'Open questions': 'none\n',
  }
  return '---\nproduct: cart\nsprint: 1\nengineers: 1\n---\n# PRD\n\n' + Object.entries(s).filter(([k]) => k !== o.drop).map(([k, v]) => `## ${k}\n\n${v}\n`).join('')
}

test('the template is itself in format, so the template and the check cannot drift apart', () => {
  assert.deepEqual(prdFormatProblems(fs.readFileSync(path.join(ROOT, 'templates/prd-format.md'), 'utf8')), [])
})

test('a PRD with every rule numbered is in format', () => {
  assert.deepEqual(prdFormatProblems(PRD()), [])
})

test('prd-section: a strict section is missing', () => {
  assert.deepEqual(rules(prdFormatProblems(PRD({ drop: 'Data rules' }))), ['prd-section'])
  assert.deepEqual(prdFormatProblems(PRD({ data: 'none\n', nfr: 'none\n' })), [])
})

test('prd-prose: the id rules written as a paragraph under Data rules are named by line; as DR lines they pass', () => {
  const prd = PRD({ data: 'Ids start at 1. Ids are never reused.\n' })
  const found = prdFormatProblems(prd)
  assert.deepEqual(rules(found), ['prd-prose'])
  assert.equal(found[0]!.where, `prd.md:${prd.split('\n').indexOf('Ids start at 1. Ids are never reused.') + 1}`)
})

test('prd-criterion: an FR with no AC, an AC under the wrong FR, an AC without a testable shape', () => {
  assert.deepEqual(rules(prdFormatProblems(PRD({ fr: '### FR-4: Items\n\nNeed: x\n' }))), ['prd-criterion'])
  assert.deepEqual(rules(prdFormatProblems(PRD({ fr: '### FR-4: Items\n\n- AC-5.1: WHEN x THE SYSTEM SHALL y\n' }))), ['prd-criterion'])
  assert.deepEqual(rules(prdFormatProblems(PRD({ fr: '### FR-4: Items\n\n- AC-4.1: ids are nice\n' }))), ['prd-criterion'])
})

test('prd-id and prd-nfr: a duplicate id, and an NFR target with no number', () => {
  assert.deepEqual(rules(prdFormatProblems(PRD({ fr: '### FR-4: Items\n\n- AC-4.1: WHEN a THE SYSTEM SHALL b\n- AC-4.1: WHEN c THE SYSTEM SHALL d\n' }))), ['prd-id'])
  assert.deepEqual(rules(prdFormatProblems(PRD({ nfr: '| ID | Category | Requirement | Target | Verified by |\n|---|---|---|---|---|\n| NFR-1 | performance | add | fast | unit |\n' }))), ['prd-nfr'])
})

test('CRLF, a bold id, lower-case when/shall and Given/when/then are all in format', () => {
  const fr = '### FR-4: Items\n\n- **AC-4.1:** when an item is added the system shall give it the next id\n- AC-4.2: Given an empty cart, when an item is added, then its id is 1\n'
  assert.deepEqual(prdFormatProblems(PRD({ fr }).replace(/\n/g, '\r\n')), [])
})

test('a wrapped criterion is one criterion with its full text', () => {
  const c = prdCriteria(PRD({ fr: '### FR-4: Items\n\n- AC-4.1: WHEN an item is added\n  THE SYSTEM SHALL give it the next id\n' }))
  assert.equal(c[0]!.text, 'WHEN an item is added THE SYSTEM SHALL give it the next id')
})

test('a sub-heading and a notes paragraph inside an FR are prose', () => {
  const prd = PRD({ fr: '### FR-4: Items\n\n- AC-4.1: WHEN a THE SYSTEM SHALL b\n\n#### Notes\n\nIds start at 1.\n' })
  const found = prdFormatProblems(prd)
  assert.ok(found.some(f => f.rule === 'prd-prose' && f.message.includes('Ids start at 1.')), JSON.stringify(found))
})

test('prdCriteria: ACs with their FR, DRs with no parent, NFR rows, and answers given at chart', () => {
  const prd = PRD({ fr: '### FR-4: Items\n\n- AC-4.1: WHEN a THE SYSTEM SHALL b\n- AC-4.2: WHEN c THE SYSTEM SHALL d (answered at chart)\n' })
  const c = prdCriteria(prd)
  assert.deepEqual(c.map(x => [x.id, x.parent, x.kind]), [['AC-4.1', 'FR-4', 'rule'], ['AC-4.2', 'FR-4', 'answer'], ['DR-1', null, 'rule'], ['DR-2', null, 'rule'], ['NFR-1', 'NFR-1', 'rule']])
  assert.equal(c[2]!.text, 'Each item id is an integer starting at 1.')
  assert.equal(c[4]!.text, 'NFR-1 | performance | add on a 1 000-item cart | under 200 ms | unit')
  assert.equal(prd.split('\n')[c[0]!.line - 1], '- AC-4.1: WHEN a THE SYSTEM SHALL b')
})
