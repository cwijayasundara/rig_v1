// The sprint chart's deterministic trace rules (outer-loop spec 2026-10-17 §7): no repo, no model, only text in and findings out.
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { designIntents, prdIds, parseIntent, parseCases, traceReport, intentSpecProblems, parkedDecisions, type Intent, type TestCase } from './chartcheck.ts'

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

test('designIntents also reads * bullets and bold or backticked slugs, and skips fenced blocks', () => {
  assert.deepEqual(designIntents('## Intents\n* a-one: x\n- **b-two**: y\n- `c-three`: z\n```\n- fenced: no\n```\n'), ['a-one', 'b-two', 'c-three'])
})

test('designIntents reads "- slug: scope (ids)" lines under ## Intents and nothing else', () => {
  const doc = '# D\n\n## Intents\n- walking-skeleton: thinnest slice (FR-1)\n- add-item: merge by sku (FR-2)\nnot-a-bullet: x\n\n## Design\n- not-an-intent: y\n'
  assert.deepEqual(designIntents(doc), ['walking-skeleton', 'add-item'])
  assert.deepEqual(designIntents('# D\n## Design\nnone\n'), [])
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
  const f = traceReport({ prd: PRD, intents: parse(big), cases: null, exists })
  assert.deepEqual(rules(f, 'report'), ['capacity'])
})

test('failure-behaviour is a report: a boundary intent that states no failure behaviour', () => {
  const iface = 'Contract: api/x.yaml\nExample: ex/x.json\n'
  const at = (behaviours: string, kind = 'boundary') => rules(traceReport({ prd: PRD, intents: parse({ ...good, b: intent('b', { prd: '[FR-2]', kind, iface, behaviours }) }), cases: null, exists }), 'report')
  assert.deepEqual(at('- B1 (FR-2): x\n'), ['failure-behaviour'])
  assert.deepEqual(at('- B1 (FR-2): x\n\n### Failure behaviour\n\n- B2 (FR-2): a slow store answers 503\n'), [])
  assert.deepEqual(at('- B1 (FR-2): x\n', 'internal'), [])
})

test('intentSpecProblems: a dropped intent behaviour, and an extra one that cites nothing the intent serves', () => {
  const i = parseIntent('a', intent('a', { prd: '[FR-1]', behaviours: '- B1 (FR-1): adds\n- B2 (FR-1): more\n' }))
  const spec = (lines: string): string => `# Spec\n\n## Behaviours\n${lines}\n## Open questions\nnone\n`
  assert.deepEqual(intentSpecProblems(i, spec('- B1: adds\n- B2: more\n')), [])
  assert.match(intentSpecProblems(i, spec('- B1: adds\n')).join('\n'), /B2 of a is missing from spec\.md/)
  assert.deepEqual(intentSpecProblems(i, spec('- B1: adds\n- B2: more\n- B3 (FR-1): extra\n')), [], 'an extra that cites a requirement of the intent is fine')
  assert.match(intentSpecProblems(i, spec('- B1: adds\n- B2: more\n- B3: extra\n')).join('\n'), /B3 .*cites no requirement of a/)
  assert.match(intentSpecProblems(i, spec('- B1: adds\n- B2: more\n- B3 (FR-2): extra\n')).join('\n'), /B3 .*cites no requirement of a/)
})

// Fix pass after the final review.
const base = parseIntent('base', intent('base', { prd: '[FR-9]', behaviours: '- B1 (FR-9): earlier sprint\n' }))

test('a dependency on an intent of another sprint is fine; a missing one is still an error', () => {
  const dep = (d: string) => traceReport({ prd: PRD, intents: parse({ ...good, b: intent('b', { prd: '[FR-2]', depends: d, behaviours: '- B1 (FR-2): removes\n' }) }), others: [base], cases: goodCases, exists })
  assert.deepEqual(dep('[base]').filter(f => f.rule === 'depends'), [])
  assert.equal(dep('[ghost]').filter(f => f.rule === 'depends').length, 1)
})

test('test cases of another sprint are left to that sprint; a case naming no intent anywhere is still an orphan', () => {
  const other = cases(caseRow('TC-9', 'FR-9', 'base', 'B1'))
  const r = (cs: TestCase[]) => traceReport({ prd: PRD, intents: parse(good), others: [base], cases: [...goodCases, ...cs], exists })
  assert.deepEqual(r(other), [])
  assert.ok(r(cases(caseRow('TC-9', 'FR-9', 'nobody', 'B1'))).some(f => f.rule === 'case-orphan'))
})

test('contract-path: a named contract or example must exist in the repo and stay inside it', () => {
  const at = (iface: string) => traceReport({ prd: PRD, intents: parse({ ...good, b: intent('b', { prd: '[FR-2]', depends: '[a]', kind: 'boundary', iface, behaviours: '- B1 (FR-2): x\n' }) }), cases: goodCases, exists, repoExists: p => p === 'api/x.yaml' || p === 'ex/x.json' }).filter(f => f.rule === 'contract-path')
  assert.deepEqual(at('Contract: api/x.yaml\nExample: ex/x.json\n'), [])
  assert.equal(at('Contract: api/typo.yaml\nExample: ex/x.json\n').length, 1, 'missing')
  assert.equal(at('Contract: ../../x.yaml\nExample: ex/x.json\n').length, 1, 'outside the repo')
  assert.equal(at('Contract: /etc/x.yaml\nExample: ex/x.json\n').length, 1, 'absolute')
})

test('case data cannot point outside the testplan', () => {
  assert.ok(rules(full(good, [...goodCases, ...cases(caseRow('TC-4', 'FR-1', 'a', 'B1', '../../secret'))])).includes('case-data-missing'))
})

test('the shipped templates read as empty: their prompts are comments, not content', () => {
  const t = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '../templates', f), 'utf8')
  const i = parseIntent('tpl', t('intent-format.md'))
  assert.deepEqual([i.openQuestions, i.contractFiles, i.exampleFiles, i.behaviours], [[], [], [], []])
  assert.deepEqual(traceReport({ prd: t('prd-format.md'), intents: [], cases: null, exists }).filter(f => f.rule === 'open-question'), [])
})

// Jain's application brief carries intent and design in one file, and its resiliency rules are what an unaided model drops.
test('an intent brief holds its design and its failure behaviour, as the application brief does', () => {
  const at = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')
  const tpl = at('templates/intent-format.md')
  assert.deepEqual([...tpl.matchAll(/^## (.+)$/gm)].map(m => m[1]), ['Intent', 'Non-goals', 'Design', 'Interfaces', 'Behaviours', 'Tests required', 'Open questions'])
  assert.match(tpl, /## Design\n\n<!--[^>]*\| Part \| Responsibility \| Must not \|/)
  for (const f of ['templates/intent-format.md', 'templates/brief.md']) assert.match(at(f), /## Behaviours\n[\s\S]*### Failure behaviour\n\n<!--[^>]*timeout/i, f)
  assert.match(at('templates/brief.md'), /## Architecture\n\n<!--[^>]*responsibilit/i)
  const i = parseIntent('a', intent('a', { behaviours: '- B1 (FR-1): it adds\n\n### Failure behaviour\n\n- B2 (FR-1): a slow store answers 503 after 2 s\n' }))
  assert.deepEqual(i.behaviours.map(b => [b.id, b.reqs]), [['B1', ['FR-1']], ['B2', ['FR-1']]])
  assert.deepEqual([i.failures, i.design], [['B2'], 0])
  const designed = parseIntent('d', intent('d').replace('## Interfaces', '## Design\n| Part | Responsibility | Must not |\n|---|---|---|\n| Api | maps HTTP | call the store |\n| Store | keeps stock | know HTTP |\n\n## Interfaces'))
  assert.equal(designed.design, 2)
  assert.match(at('agents/architect.md'), /## Design[\s\S]*### Failure behaviour/)
  assert.match(at('skills/plan/SKILL.md'), /cite[^.]*## Design/i)
})

// Reviewer design 2026-10-18 §5: an owner decision parked in a section the check does not block on is reported, never blocked.
test('parked owner decision under Risks and notes is reported', () => {
  const arch = '# A\n\n## Concerns\nnone\n\n## Risks and notes\n- No bench sensor for NFR-1. Owner: repo owner.\n'
  assert.deepEqual(parkedDecisions('architecture.md', arch), [{ rule: 'parked-decision', severity: 'report', where: 'architecture.md', message: 'architecture.md parks a decision under "Risks and notes": No bench sensor for NFR-1. Owner: repo owner.' }])
})

test('a risks list with no owner or decision is not reported', () => {
  assert.deepEqual(parkedDecisions('architecture.md', '# A\n\n## Risks\n- The disk may fill.\n'), [])
  assert.deepEqual(parkedDecisions('architecture.md', '# A\n\n## Concerns\n- the auth gap (owner: lead)\n'), [], 'Concerns already blocks')
})

test('the finding never blocks approval', () => {
  assert.equal(parkedDecisions('a.md', '## Notes\n- a decision for the owner\n')[0]?.severity, 'report')
})

const repoText = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')

test('evaluator documents a chart mode with the seven chart categories', () => {
  const ev = repoText('agents/evaluator.md')
  assert.match(ev, /## Chart mode/)
  for (const c of ['scope', 'coverage', 'duplication', 'concerns', 'answers', 'sequence', 'cases']) assert.match(ev, new RegExp(`\\b${c}\\b`), c)
  assert.match(ev, /review the chart bundle for sprint/i)
  assert.match(ev, /You advise[^\n]*never edit and never block/, 'it advises, a person approves')
})

test('architect fills brief.md and reports open questions instead of settling them in architecture.md', () => {
  const ar = repoText('agents/architect.md')
  assert.match(ar, /fill[^\n]*brief\.md/i)
  assert.match(ar, /see the intents/i)
  assert.match(ar, /Open questions[^.]*(?:reply|return|report)|(?:reply|return|report)[^.]*open questions/i)
})
