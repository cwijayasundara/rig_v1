// Chart files, digest, approval and intent readiness (outer-loop spec 2026-10-17 §5, §7). Runs chart.ts inside a test repo.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const LIB = path.resolve(import.meta.dirname, 'chart.ts')
// Runs `code` with `C` bound to chart.ts inside the test repo and returns its JSON result.
const call = (code: string): unknown => {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as C from ${JSON.stringify(LIB)}; const v = await (async () => { ${code} })(); console.log(JSON.stringify(v ?? null))`],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, NODE_TEST_CONTEXT: '' } })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').at(-1) ?? 'null')
}

const P = '.rig/product'
const prd = (n: number, extra = ''): string => `---\nsprint: ${n}\nengineers: 1\n---\n# Sprint ${n}\n\n### FR-${n}: thing\n\n## Open questions\nnone\n${extra}`
const intent = (n: number, o: { depends?: string; iface?: string; req?: string } = {}): string =>
  `---\nsprint: ${n}\nprd: [${o.req ?? `FR-${n}`}]\ndepends: ${o.depends ?? '[]'}\nestimate_days: 1\nkind: ${o.iface ? 'boundary' : 'internal'}\n---\n# i\n\n## Interfaces\n${o.iface ?? 'none'}\n\n## Behaviours\n- B1 (${o.req ?? `FR-${n}`}): works\n\n## Open questions\nnone\n`
const chart1 = (): void => {
  write(repo, `${P}/prd/sprint-1.md`, prd(1))
  write(repo, `${P}/intents/alpha.md`, intent(1))
  write(repo, `${P}/architecture.md`, '# Architecture\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
}
const files = (n: number): unknown => call(`return C.chartFiles(${n})`)
const state = (n: number): { state: string; changed: string[] } => call(`return C.chartState(${n})`) as { state: string; changed: string[] }

test('the digest changes when a sprint file is edited, added or removed, and not for another sprint intent', () => {
  chart1()
  write(repo, `${P}/intents/zeta.md`, intent(2))
  const d = (): unknown => call('return C.chartDigest(1)')
  const base = d()
  write(repo, `${P}/intents/zeta.md`, intent(2) + '\nmore\n')
  assert.equal(d(), base, 'a sprint 2 intent is not part of sprint 1')
  write(repo, `${P}/intents/alpha.md`, intent(1) + '\nmore\n')
  const edited = d()
  assert.notEqual(edited, base)
  write(repo, `${P}/intents/beta.md`, intent(1, { req: 'FR-1' }))
  const added = d()
  assert.notEqual(added, edited)
  fs.rmSync(path.join(repo, `${P}/intents/beta.md`))
  assert.equal(d(), edited)
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/alpha.md`, `${P}/prd/sprint-1.md`])
})

test('contract and example files an intent names are part of its sprint', () => {
  chart1()
  write(repo, 'api/x.yaml', 'openapi: 3\n')
  write(repo, 'api/ex.json', '{}\n')
  write(repo, `${P}/intents/alpha.md`, intent(1, { iface: 'Contract: api/x.yaml\nExample: api/ex.json\n' }))
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/alpha.md`, `${P}/prd/sprint-1.md`, 'api/ex.json', 'api/x.yaml'])
})

test('an approval is missing, then approved, then stale after an edit that names the file', () => {
  chart1()
  assert.equal(state(1).state, 'missing')
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.equal(state(1).state, 'approved')
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, `${P}/approvals/chart-1.json`), 'utf8')).by, 'Pat')
  write(repo, `${P}/intents/alpha.md`, intent(1) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/intents/alpha.md`] })
  write(repo, `${P}/intents/zeta.md`, intent(2))
  assert.deepEqual(state(1).changed, [`${P}/intents/alpha.md`], 'another sprint does not change it')
})

test('a hand-edited or garbage approval file reads as missing and never throws', () => {
  chart1()
  write(repo, `${P}/approvals/chart-1.json`, '{ not json')
  assert.equal(state(1).state, 'missing')
  write(repo, `${P}/approvals/chart-1.json`, '{"by":"x"}\n')
  assert.equal(state(1).state, 'missing')
})

test('a later sprint editing the shared architecture leaves sprint 1 approved once sprint 2 is approved', () => {
  chart1()
  call(`C.writeChartApproval(1, 'Pat')`)
  write(repo, `${P}/architecture.md`, '# Architecture\n\nchanged for sprint 2\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/architecture.md`] })
  write(repo, `${P}/prd/sprint-2.md`, prd(2))
  write(repo, `${P}/intents/zeta.md`, intent(2))
  call(`C.writeChartApproval(2, 'Pat')`)
  assert.equal(state(1).state, 'approved')
})

test('chartFindings runs the trace rules over the files and adds concerns and architecture questions', () => {
  chart1()
  assert.deepEqual(call('return C.chartFindings(1, false)'), [])
  const withCases = call('return C.chartFindings(1, true)') as { rule: string; where: string }[]
  assert.deepEqual(withCases.map(f => f.rule), ['req-untested'], 'no cases.md yet')
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | data/x.json | ok |\n')
  assert.deepEqual((call('return C.chartFindings(1, true)') as { rule: string }[]).map(f => f.rule), ['case-data-missing'])
  write(repo, `${P}/testplan/data/x.json`, '{}\n')
  assert.deepEqual(call('return C.chartFindings(1, true)'), [])
  write(repo, `${P}/architecture.md`, '# A\n\n## Concerns\n- the auth gap (owner: lead)\n\n## Open questions\n- which db?\n')
  assert.deepEqual((call('return C.chartFindings(1, false)') as { rule: string }[]).map(f => f.rule).sort(), ['concern', 'open-question'])
})

test('chartFindings reports an owner decision parked under Risks and notes, without blocking', () => {
  chart1()
  write(repo, `${P}/architecture.md`, '# A\n\n## Concerns\nnone\n\n## Risks and notes\n- No bench sensor. Owner: repo owner.\n\n## Open questions\nnone\n')
  const f = call('return C.chartFindings(1, false)') as { rule: string; severity: string; where: string }[]
  assert.deepEqual(f.map(x => [x.rule, x.severity, x.where]), [['parked-decision', 'report', 'architecture.md']])
})

test('intentReady explains why not: unapproved, stale, blocked by an unshipped dependency, already started', () => {
  chart1()
  write(repo, `${P}/intents/beta.md`, intent(1, { depends: '[alpha]' }))
  const ready = (slug: string): { ready: boolean; why: string[] } => call(`return C.intentReady(${JSON.stringify(slug)})`) as { ready: boolean; why: string[] }
  assert.deepEqual(ready('alpha'), { ready: false, why: ['chart-1 is not approved'] })
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.deepEqual(ready('alpha'), { ready: true, why: [] })
  assert.deepEqual(ready('beta'), { ready: false, why: ['blocked by alpha'] })
  write(repo, '.rig/changes/alpha/pr.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'ship alpha')
  assert.deepEqual(ready('beta'), { ready: true, why: [] }, 'a is shipped once its pr.md is on the trunk')
  assert.deepEqual(ready('alpha'), { ready: false, why: ['already started'] })
  write(repo, `${P}/intents/beta.md`, intent(1, { depends: '[alpha]' }) + '\nedit\n')
  const stale = ready('beta')
  assert.equal(stale.ready, false)
  assert.match(stale.why[0] ?? '', /^chart-1 is stale: run \/rig:approve chart-1 after reviewing \(changed: .*intents\/beta\.md\)$/)
  assert.deepEqual(ready('ghost'), { ready: false, why: ['no such intent: ghost'] })
})

// The CLI: chart check, approve chart-N, ready.
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const cleanChart = (): void => {
  chart1()
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n')
}

test('chart check prints findings, as JSON on request, and fails only when the PRD is missing', () => {
  chart1()
  const r = sdlc(repo, ['chart', 'check', '1', '--cases', '--json'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual((JSON.parse(r.stdout) as { rule: string }[]).map(f => f.rule), ['req-untested'])
  assert.match(sdlc(repo, ['chart', 'check', '1']).stdout, /no blocking findings/)
  assert.equal(sdlc(repo, ['chart', 'check', '9']).code, 1)
})

test('approve chart-N is human-only, refuses while a block finding stands, and is idempotent', () => {
  cleanChart()
  assert.equal(sdlc(repo, ['approve', 'chart-1']).code, 3)
  write(repo, `${P}/intents/alpha.md`, intent(1, { req: 'FR-1' }).replace('estimate_days: 1', 'estimate_days: 5'))
  const refused = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /estimate/)
  assert.ok(!fs.existsSync(path.join(repo, `${P}/approvals/chart-1.json`)))
  write(repo, `${P}/intents/alpha.md`, intent(1))
  const ok = sdlc(repo, ['approve', 'chart-1', '--by', 'Pat'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /approved chart-1 by Pat/)
  assert.equal(state(1).state, 'approved')
  assert.match(sdlc(repo, ['approve', 'chart-1'], HUMAN).stdout, /already approved/)
})

test('ready lists the intents that can start and leaves out the blocked ones', () => {
  cleanChart()
  write(repo, `${P}/intents/beta.md`, intent(1, { depends: '[alpha]' }))
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n| TC-2 | FR-1 | beta | B1 | unit | - | ok |\n')
  assert.equal(sdlc(repo, ['approve', 'chart-1'], HUMAN).code, 0)
  const r = sdlc(repo, ['ready', '--json'])
  assert.deepEqual((JSON.parse(r.stdout) as { slug: string }[]).map(i => i.slug), ['alpha'])
  assert.match(sdlc(repo, ['ready']).stdout, /alpha\s+sprint 1\s+1 day/)
})

// new --source links a change to its intent; sync keeps the change's spec.md faithful to it.
const startable = (): void => {
  cleanChart()
  assert.equal(sdlc(repo, ['approve', 'chart-1'], HUMAN).code, 0)
}
const SRC = `${P}/intents/alpha.md`

test('new --source refuses an intent that cannot start, naming why', () => {
  cleanChart()
  const r = sdlc(repo, ['new', 'alpha', '--source', SRC])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /chart-1 is not approved/)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes/alpha')))
})

test('new --source needs the slug of the intent', () => {
  startable()
  const r = sdlc(repo, ['new', 'other', '--source', SRC])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /slug must equal the intent's/)
})

test('new --source starts the change: source recorded, behaviours copied into spec.md', () => {
  startable()
  const r = sdlc(repo, ['new', 'alpha', '--source', SRC])
  assert.equal(r.code, 0, r.stderr)
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/alpha/intent.md'), 'utf8'), new RegExp(`^source: ${SRC.replace(/\./g, '\\.')}$`, 'm'))
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/alpha/spec.md'), 'utf8'), /## Behaviours\n- B1 \(FR-1\): works\n/)
})

test('a started change keeps going after its chart goes stale; a new start is refused', () => {
  cleanChart()
  write(repo, `${P}/intents/beta.md`, intent(1, { req: 'FR-1' }))
  assert.equal(sdlc(repo, ['approve', 'chart-1'], HUMAN).code, 0)
  assert.equal(sdlc(repo, ['new', 'alpha', '--source', SRC]).code, 0)
  write(repo, `${P}/intents/beta.md`, intent(1, { req: 'FR-1' }) + '\nedit\n')
  assert.match(sdlc(repo, ['status']).stdout, /alpha\s+feature\s+plan/)
  const r = sdlc(repo, ['new', 'beta', '--source', `${P}/intents/beta.md`])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /chart-1 is stale/)
})

test('sync --check blocks a change whose spec.md dropped a behaviour of its intent', () => {
  startable()
  write(repo, '.rig/sensors.json', '{"sensors":[]}\n')
  assert.equal(sdlc(repo, ['new', 'alpha', '--source', SRC]).code, 0)
  assert.equal(sdlc(repo, ['sync']).code, 0)
  assert.equal(sdlc(repo, ['sync', '--check']).code, 0)
  write(repo, '.rig/changes/alpha/spec.md', '# Spec\n\n## Behaviours\n- B9: something else\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['sync', '--check'])
  assert.equal(r.code, 1)
  assert.match(r.stdout, /B1 of alpha is missing from spec\.md/)
})

// Fix pass after the final review.
const tpl = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '../templates', f), 'utf8')
const rulesOf = (n: number, cases: boolean): string[] => (call(`return C.chartFindings(${n}, ${cases})`) as { rule: string }[]).map(f => f.rule)

test('an architecture document that keeps the template prompts has no concern and no open question', () => {
  chart1()
  write(repo, `${P}/architecture.md`, tpl('architecture-format.md'))
  assert.deepEqual(rulesOf(1, false), [])
})

test('a real concern blocks, a resolved one does not', () => {
  chart1()
  write(repo, `${P}/architecture.md`, '# A\n\n## Concerns\n- the auth gap (owner: lead)\n\n## Open questions\nnone\n')
  assert.deepEqual(rulesOf(1, false), ['concern'])
  write(repo, `${P}/architecture.md`, '# A\n\n## Concerns\n- [x] the auth gap (owner: lead)\n- the cache gap (resolved)\n\n## Open questions\nnone\n')
  assert.deepEqual(rulesOf(1, false), [])
})

test('sprint 2 may depend on a sprint 1 intent and keeps sprint 1 test cases in cases.md', () => {
  chart1()
  write(repo, `${P}/prd/sprint-2.md`, prd(2))
  write(repo, `${P}/intents/zeta.md`, intent(2, { depends: '[alpha]' }))
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n| TC-2 | FR-2 | zeta | B1 | unit | - | ok |\n')
  assert.deepEqual(rulesOf(2, true), [])
})

test('a contract named outside the repo is reported and kept out of the digest', () => {
  chart1()
  write(repo, `${P}/intents/alpha.md`, intent(1, { iface: 'Contract: ../outside.yaml\nExample: ../outside.json\n' }))
  fs.writeFileSync(path.join(path.dirname(repo), 'outside.yaml'), 'x\n')
  assert.ok(rulesOf(1, false).includes('contract-path'))
  assert.ok(!(files(1) as string[]).some(f => f.includes('outside')))
})

test('sync --check still holds a change to its intent when the source line is deleted', () => {
  startable()
  write(repo, '.rig/sensors.json', '{"sensors":[]}\n')
  assert.equal(sdlc(repo, ['new', 'alpha', '--source', SRC]).code, 0)
  assert.equal(sdlc(repo, ['sync']).code, 0)
  write(repo, '.rig/changes/alpha/intent.md', '---\nslug: alpha\ntype: feature\n---\n# Alpha\n')
  write(repo, '.rig/changes/alpha/spec.md', '# Spec\n\n## Behaviours\n- B9: other\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['sync', '--check'])
  assert.equal(r.code, 1)
  assert.match(r.stdout, /B1 of alpha is missing from spec\.md/)
})

test('chartReport ignores a requirement id inside an HTML comment, as the trace check does', () => {
  chart1()
  write(repo, `${P}/prd/sprint-1.md`, prd(1, '\n<!--\n### FR-9: template example\n-->\n'))
  const r = call('return C.chartReport(1)') as string
  assert.match(r, /requirements 1:/)
  assert.doesNotMatch(r, /FR-9/)
})

// The sprint design doc: named by `design:` in architecture.md, hashed with the chart, and traced against the intents.
const DOC = 'docs/superpowers/specs/s1-design.md'
const archWith = (design: string | null): string => `---\nsprint: 1\nupdated: 2026-10-22\n${design === null ? '' : `design: ${design}\n`}---\n# Architecture\n\n## Concerns\nnone\n\n## Open questions\nnone\n`
const docOf = (slugs: string[]): string => `# Design\n\n## Intents\n${slugs.map(s => `- ${s}: scope (FR-1)`).join('\n')}\n`
const findings = (n: number): { rule: string; message: string }[] => call(`return C.chartFindings(${n}, false)`) as { rule: string; message: string }[]

test('design: in architecture.md frontmatter puts the design doc under the chart approval; editing it makes chart-1 stale', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(DOC))
  write(repo, DOC, docOf(['alpha']))
  assert.equal(call('return C.designDocOf(1)'), DOC)
  call(`C.writeChartApproval(1, 'Pat')`)
  const row = JSON.parse(fs.readFileSync(path.join(repo, `${P}/approvals/chart-1.json`), 'utf8')) as { files: { path: string }[] }
  assert.ok(row.files.some(f => f.path === DOC))
  assert.equal(state(1).state, 'approved')
  write(repo, DOC, docOf(['alpha']) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [DOC] })
})

test('design-intent blocks in both directions and names the slugs', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(DOC))
  write(repo, `${P}/intents/beta.md`, intent(1))
  write(repo, DOC, docOf(['alpha']))
  const a = findings(1).filter(f => f.rule === 'design-intent')
  assert.equal(a.length, 1)
  assert.match(a[0]!.message, /beta/)
  write(repo, DOC, docOf(['alpha', 'beta', 'gamma']))
  const b = findings(1).filter(f => f.rule === 'design-intent')
  assert.equal(b.length, 1)
  assert.match(b[0]!.message, /gamma/)
  write(repo, DOC, docOf(['alpha', 'beta']))
  assert.deepEqual(findings(1).filter(f => f.rule.startsWith('design')), [])
})

test('design-missing blocks when design: names a file that is not there, and a path outside the repo', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith('docs/nope.md'))
  assert.deepEqual(findings(1).filter(f => f.rule === 'design-missing').length, 1)
  write(repo, 'x.md', docOf(['alpha']))
  write(repo, `${P}/architecture.md`, archWith('../x.md'))
  assert.equal(call('return C.designDocOf(1)'), '../x.md')
  assert.equal(findings(1).filter(f => f.rule === 'design-missing').length, 1)
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/alpha.md`, `${P}/prd/sprint-1.md`])
})

test('a sprint whose architecture.md has no design: line has no design findings and no extra chart file', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(null))
  assert.equal(call('return C.designDocOf(1)'), null)
  assert.deepEqual(findings(1).filter(f => f.rule.startsWith('design')), [])
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/alpha.md`, `${P}/prd/sprint-1.md`])
})
