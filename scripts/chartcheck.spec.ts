// The sprint chart's deterministic trace rules (outer-loop spec 2026-10-17 §7): no repo, no model, only text in and findings out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prdIds, parseIntent, parseCases, traceReport, type Intent, type TestCase } from './chartcheck.ts'

const PRD = '---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: add\n### FR-2: remove\n| NFR-1 | fast |\n\nMentioned only in prose: FR-9.\n\n## Open questions\nnone\n'
const intent = (slug: string, o: { prd?: string; depends?: string; days?: string; kind?: string; behaviours?: string; iface?: string; open?: string } = {}): string =>
  `---\nsprint: 1\nprd: ${o.prd ?? '[FR-1]'}\ndepends: ${o.depends ?? '[]'}\nestimate_days: ${o.days ?? '1'}\nkind: ${o.kind ?? 'internal'}\n---\n# ${slug}\n\n## Intent\nwhy\n\n## Interfaces\n${o.iface ?? 'none'}\n\n## Behaviours\n${o.behaviours ?? '- B1 (FR-1): it adds\n'}\n## Open questions\n${o.open ?? 'none'}\n`
const parse = (m: Record<string, string>): Intent[] => Object.entries(m).map(([slug, text]) => parseIntent(slug, text))
const rules = (fs: { rule: string; severity: string }[], severity = 'block'): string[] => fs.filter(f => f.severity === severity).map(f => f.rule).sort()
const exists = (p: string): boolean => p === 'data/ok.json'
const caseRow = (id: string, req: string, slug: string, b: string, data = '-'): string => `| ${id} | ${req} | ${slug} | ${b} | unit | ${data} | ok |`
const cases = (...rows: string[]): TestCase[] => parseCases(rows.join('\n'))
const full = (intents: Record<string, string>, cs: TestCase[] | null, prd = PRD) => traceReport({ prd, intents: parse(intents), cases: cs, exists })
// A chart that satisfies every rule: FR-1 and NFR-1 in a, FR-2 in b, a case per requirement.
const good = { a: intent('a', { prd: '[FR-1, NFR-1]', behaviours: '- B1 (FR-1): adds\n- B2 (NFR-1): fast\n' }), b: intent('b', { prd: '[FR-2]', depends: '[a]', behaviours: '- B1 (FR-2): removes\n' }) }
const goodCases = cases(caseRow('TC-1', 'FR-1', 'a', 'B1'), caseRow('TC-2', 'NFR-1', 'a', 'B2'), caseRow('TC-3', 'FR-2', 'b', 'B1'))

test('prdIds takes headings and table rows, not prose mentions', () => {
  assert.deepEqual(prdIds(PRD), ['FR-1', 'FR-2', 'NFR-1'])
})

test('a good chart has no findings', () => {
  assert.deepEqual(full(good, goodCases), [])
})

test('parseIntent reads the canonical and the loose forms alike (CRLF, no brackets, .md in depends)', () => {
  const canon = parseIntent('b', intent('b', { prd: '[FR-3]', depends: '[a]', behaviours: '- B1 (FR-3): x\n' }))
  const loose = parseIntent('b', intent('b', { prd: 'FR-3', depends: '[a.md]', behaviours: '- B1 (FR-3): x\n' }).replace(/\n/g, '\r\n'))
  assert.deepEqual(loose, canon)
  assert.deepEqual(canon.prd, ['FR-3'])
  assert.deepEqual(canon.depends, ['a'])
  assert.deepEqual(canon.behaviours, [{ id: 'B1', reqs: ['FR-3'], text: 'x' }])
  assert.equal(canon.estimateDays, 1)
  assert.equal(canon.kind, 'internal')
})

test('parseIntent reads contract and example files and open questions', () => {
  const i = parseIntent('c', intent('c', { kind: 'boundary', iface: 'Contract: api/openapi.yaml\nExample: contracts/examples/x.json\n', open: '- which format?\n' }))
  assert.deepEqual(i.contractFiles, ['api/openapi.yaml'])
  assert.deepEqual(i.exampleFiles, ['contracts/examples/x.json'])
  assert.deepEqual(i.openQuestions, ['which format?'])
})

test('intent-untraced: a behaviour that cites no requirement', () => {
  const bad = { ...good, a: intent('a', { prd: '[FR-1, NFR-1]', behaviours: '- B1: adds\n- B2 (NFR-1): fast\n' }) }
  assert.ok(rules(full(bad, goodCases)).includes('intent-untraced'))
  assert.ok(rules(full({ ...good, a: intent('a', { prd: '[]' }) }, goodCases)).includes('intent-untraced'))
})

test('unknown-id: an intent or a behaviour cites an id the PRD does not define', () => {
  assert.ok(rules(full({ ...good, b: intent('b', { prd: '[FR-2]', depends: '[a]', behaviours: '- B1 (FR-99): x\n' }) }, goodCases)).includes('unknown-id'))
  assert.ok(rules(full({ ...good, b: intent('b', { prd: '[FR-2, FR-9]', depends: '[a]' }) }, goodCases)).includes('unknown-id'), 'FR-9 is only in prose')
})

test('req-uncovered: a requirement no intent cites; zero intents leaves every requirement uncovered', () => {
  const only = { a: good.a }
  assert.deepEqual(full(only, goodCases).filter(f => f.rule === 'req-uncovered').map(f => f.where), ['FR-2'])
  assert.deepEqual(full({}, null).filter(f => f.rule === 'req-uncovered').map(f => f.where), ['FR-1', 'FR-2', 'NFR-1'])
})

test('req-untested: only when cases are given', () => {
  assert.ok(!rules(full(good, null)).includes('req-untested'))
  const fewer = cases(caseRow('TC-1', 'FR-1', 'a', 'B1'), caseRow('TC-3', 'FR-2', 'b', 'B1'))
  assert.deepEqual(full(good, fewer).filter(f => f.rule === 'req-untested').map(f => f.where), ['NFR-1'])
})

test('case-untraced and case-orphan: a case with no requirement, or naming a missing intent or behaviour', () => {
  assert.ok(rules(full(good, [...goodCases, ...cases(caseRow('TC-4', '-', 'a', 'B1'))])).includes('case-untraced'))
  assert.ok(rules(full(good, [...goodCases, ...cases(caseRow('TC-4', 'FR-1', 'nope', 'B1'))])).includes('case-orphan'))
  assert.ok(rules(full(good, [...goodCases, ...cases(caseRow('TC-4', 'FR-1', 'a', 'B7'))])).includes('case-orphan'))
})

test('case-data-missing: a data path that does not exist', () => {
  assert.ok(rules(full(good, [...goodCases, ...cases(caseRow('TC-4', 'FR-1', 'a', 'B1', 'data/gone.json'))])).includes('case-data-missing'))
  assert.ok(!rules(full(good, [...goodCases, ...cases(caseRow('TC-4', 'FR-1', 'a', 'B1', 'data/ok.json'))])).includes('case-data-missing'))
})

test('estimate: missing or above two days', () => {
  assert.ok(rules(full({ ...good, a: intent('a', { prd: '[FR-1, NFR-1]', days: '3', behaviours: '- B1 (FR-1): a\n- B2 (NFR-1): b\n' }) }, goodCases)).includes('estimate'))
  assert.ok(rules(full({ ...good, a: intent('a', { prd: '[FR-1, NFR-1]', days: '', behaviours: '- B1 (FR-1): a\n- B2 (NFR-1): b\n' }) }, goodCases)).includes('estimate'))
})

test('depends: a missing target, a cycle (both members) and a self-dependency', () => {
  const miss = full({ ...good, b: intent('b', { prd: '[FR-2]', depends: '[ghost]' }) }, goodCases).filter(f => f.rule === 'depends')
  assert.equal(miss.length, 1)
  assert.match(miss[0]?.message ?? '', /ghost/)
  const cyc = full({ a: intent('a', { prd: '[FR-1, NFR-1]', depends: '[b]', behaviours: '- B1 (FR-1): a\n- B2 (NFR-1): b\n' }), b: intent('b', { prd: '[FR-2]', depends: '[a]' }) }, goodCases).filter(f => f.rule === 'depends')
  assert.deepEqual(cyc.map(f => f.where).sort(), ['a', 'b'])
  assert.deepEqual(full({ ...good, b: intent('b', { prd: '[FR-2]', depends: '[b]' }) }, goodCases).filter(f => f.rule === 'depends').map(f => f.where), ['b'])
})

test('boundary-contract: a boundary intent must name a contract and an example', () => {
  const b = (iface: string) => ({ ...good, b: intent('b', { prd: '[FR-2]', depends: '[a]', kind: 'boundary', iface, behaviours: '- B1 (FR-2): x\n' }) })
  assert.ok(rules(full(b('none'), goodCases)).includes('boundary-contract'))
  assert.ok(rules(full(b('Contract: api/x.yaml\n'), goodCases)).includes('boundary-contract'))
  assert.ok(!rules(full(b('Contract: api/x.yaml\nExample: ex/x.json\n'), goodCases)).includes('boundary-contract'))
})

test('open-question: an unresolved question in the PRD or an intent', () => {
  assert.ok(rules(full(good, goodCases, PRD.replace('## Open questions\nnone', '## Open questions\n- scope?'))).includes('open-question'))
  assert.ok(rules(full({ ...good, a: intent('a', { prd: '[FR-1, NFR-1]', open: '- which?', behaviours: '- B1 (FR-1): a\n- B2 (NFR-1): b\n' }) }, goodCases)).includes('open-question'))
})

test('capacity is a report: summed days above ten per engineer', () => {
  const big = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`i${i}`, intent(`i${i}`, { prd: '[FR-1]', days: '2' })]))
  const f = traceReport({ prd: PRD, intents: parse(big), cases: null, exists, engineers: 1 })
  assert.deepEqual(rules(f, 'report'), ['capacity'])
})
