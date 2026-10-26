// The PRD format for coding agents (spec 2026-10-26 PRD format and conversion): every rule a numbered, testable line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { prdFormatProblems, prdCriteria, prdLedger, conversionProblems, parseMap } from './prdformat.ts'
import { parseLedger, ledgerProblems, parseIntent, parentOf } from './chartcheck.ts'

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

// The generated ledger (spec 2026-10-26 PRD format): one row per criterion, so no model writes requirements.md.
const intentOf = (behaviours: string, prd = '[FR-4, NFR-1]') => parseIntent('store', `---\nsprint: 1\nprd: ${prd}\ndepends: []\nestimate_days: 1\nkind: internal\n---\n# s\n\n## Behaviours\n${behaviours}\n## Open questions\nnone\n`)
const ALL = '- B1 (FR-4, AC-4.1): next id\n- B2 (FR-4, DR-1): starts at 1\n- B3 (FR-4, DR-2): never reused\n- B4 (NFR-1): fast\n'
const lp = (behaviours: string, prd = PRD()) => ledgerProblems({ prd, ledger: prdLedger(prd), intents: [intentOf(behaviours)], cases: null, required: true, inFormat: true }).map(f => `${f.rule} ${f.where}`).sort()

test('prdLedger writes one row per criterion with its prd.md line, and parseLedger reads it back', () => {
  const prd = PRD()
  const at = (s: string): number => prd.split('\n').findIndex(l => l.includes(s)) + 1
  assert.equal(prdLedger(prd), ['# Requirements (generated from prd.md by rig: never edit)', '',
    `- AC-4.1 [rule] prd.md:${at('AC-4.1')} "WHEN an item is added THE SYSTEM SHALL give it the next id"`,
    `- DR-1 [rule] prd.md:${at('DR-1')} "Each item id is an integer starting at 1."`,
    `- DR-2 [rule] prd.md:${at('DR-2')} "Ids are never reused, even after an item is removed."`,
    `- NFR-1 [rule] prd.md:${at('| NFR-1')} "NFR-1 | performance | add on a 1 000-item cart | under 200 ms | unit"`, ''].join('\n'))
  assert.deepEqual(parseLedger(prdLedger(prd)).map(r => [r.id, r.kind]), [['AC-4.1', 'rule'], ['DR-1', 'rule'], ['DR-2', 'rule'], ['NFR-1', 'rule']])
  assert.deepEqual(lp(ALL), [])
})

test('citing only the FR covers none of its criteria; a DR is covered by the behaviour that cites it; NFR rows by their id', () => {
  assert.deepEqual(lp('- B1 (FR-4): next id\n- B2 (FR-4, DR-1): x\n- B3 (FR-4, DR-2): y\n- B4 (NFR-1): fast\n'), ['rule-uncovered AC-4.1'])
  assert.deepEqual(lp('- B1 (FR-4, AC-4.1): next id\n- B4 (NFR-1): fast\n'), ['rule-uncovered DR-1', 'rule-uncovered DR-2'])
})

test('an AC or DR the ledger lacks is an unknown id', () => {
  assert.deepEqual(lp(ALL + '- B5 (FR-4, AC-9.9): ghost\n- B6 (FR-4, DR-9): ghost\n'), ['unknown-id store#B5', 'unknown-id store#B6'])
})

test('parentOf: an AC belongs to its FR, an NFR row to itself, a DR to no FR', () => {
  assert.deepEqual(['AC-4.1', 'NFR-2', 'DR-1', 'FR-4.2', 'G-1'].map(parentOf), ['FR-4', 'NFR-2', null, 'FR-4', null])
})

// The conversion map (spec 2026-10-26 PRD format): every sentence of the person's original is accounted for, by script.
const SOURCE = ['# Cart PRD', '', '## Context', '', 'Shoppers lose carts today.', '', '## Items', '', 'Ids start at 1. Ids are never reused.', '',
  'Example:', '', '```json', '{"id": 1, "sku": "coffee"}', '```', ''].join('\n')
const CONVERTED = PRD().replace('## Open questions', '## Examples\n\n```json\n{"id": 1, "sku": "coffee"}\n```\n\n## Open questions')
const MAP = ['- context source.md:5 "Shoppers lose carts today." — motivation, kept in Context',
  '- DR-1 source.md:9 "Ids start at 1."', '- DR-2 source.md:9 "Ids are never reused."', '- context source.md:11 "Example:" — caption of the example, copied to Examples', ''].join('\n')
const conv = (o: { source?: string; prd?: string; map?: string | null } = {}) =>
  conversionProblems({ source: o.source ?? SOURCE, prd: o.prd ?? CONVERTED, map: o.map === undefined ? MAP : o.map }).map(f => f.rule).sort()

test('a map that accounts for every sentence, with the example copied, has no finding', () => {
  assert.deepEqual(conv(), [])
  assert.deepEqual(parseMap(MAP)[1], { ids: ['DR-1'], context: false, line: 9, quote: 'Ids start at 1.', reason: '' })
})

test('map-unquoted: dropping "never reused" blocks, and so does a lone number left out', () => {
  assert.deepEqual(conv({ map: MAP.replace(/^- DR-2 .*\n/m, '') }), ['map-unquoted'])
  assert.deepEqual(conv({ map: MAP.replace('"Ids start at 1."', '"Ids start at"') }), ['map-unquoted'])
})

test('map-reason, map-id, map-fence, map-missing and map-line', () => {
  assert.deepEqual(conv({ map: MAP.replace(' — motivation, kept in Context', '') }), ['map-reason'])
  assert.deepEqual(conv({ map: MAP.replace('- DR-2 source.md:9', '- DR-7 source.md:9') }), ['map-id'])
  assert.deepEqual(conv({ prd: PRD() }), ['map-fence'])
  assert.deepEqual(conv({ map: null }), ['map-missing'])
  assert.deepEqual(conv({ map: MAP + '- garbled\n' }), ['map-line'])
})

test('map-misquote: a paraphrase, or a line far from the sentence', () => {
  assert.deepEqual(conv({ map: MAP.replace('"Ids are never reused."', '"Ids may be reused."') }), ['map-misquote', 'map-unquoted'])
  assert.deepEqual(conv({ map: MAP.replace('- DR-1 source.md:9', '- DR-1 source.md:30') }), ['map-misquote'])
})

test('a criterion marked out of scope becomes an out-of-scope ledger row with when, who and why', () => {
  const prd = PRD({ data: '- DR-1: Each item id is an integer starting at 1.\n- DR-2: Ids are archived after a year (out of scope: sprint 2, decided by Ana — storage first).\n' })
  assert.deepEqual(prdFormatProblems(prd), [])
  const row = parseLedger(prdLedger(prd)).find(r => r.id === 'DR-2')
  assert.deepEqual([row?.kind, row?.when, row?.by, row?.reason, row?.quote], ['out-of-scope', 'sprint 2', 'Ana', 'storage first', 'Ids are archived after a year.'])
  assert.deepEqual(lp('- B1 (FR-4, AC-4.1): next id\n- B2 (FR-4, DR-1): starts at 1\n- B4 (NFR-1): fast\n', prd), [])
})

test('the reference PRD and the e2e chart fixture PRD are in format', () => {
  for (const f of ['docs/prds/shopping-cart-app-prd.md', 'tests/e2e/prd/chart-fixture/product/sprints/sprint-1/prd.md']) assert.deepEqual(prdFormatProblems(fs.readFileSync(path.join(ROOT, f), 'utf8')), [], f)
})

test('the e2e chart fixture ledger is what its PRD generates', () => {
  const dir = path.join(ROOT, 'tests/e2e/prd/chart-fixture/product/sprints/sprint-1')
  assert.equal(fs.readFileSync(path.join(dir, 'requirements.md'), 'utf8'), prdLedger(fs.readFileSync(path.join(dir, 'prd.md'), 'utf8')))
})
