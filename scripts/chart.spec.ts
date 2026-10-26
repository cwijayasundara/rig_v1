// Chart files, digest, approval and intent readiness (outer-loop spec 2026-10-17 §5, §7). Runs chart.ts inside a test repo.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn, IMPL_OK } from './testkit.ts'

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
  write(repo, `${P}/sprints/sprint-1/prd.md`, prd(1))
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1))
  write(repo, `${P}/architecture.md`, ARCH_DOC())
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha']))
}
const files = (n: number): unknown => call(`return C.chartFiles(${n})`)
const state = (n: number): { state: string; changed: string[] } => call(`return C.chartState(${n})`) as { state: string; changed: string[] }

test('the digest changes when a sprint file is edited, added or removed, and not for another sprint intent', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-2/intents/zeta.md`, intent(2))
  const d = (): unknown => call('return C.chartDigest(1)')
  const base = d()
  write(repo, `${P}/sprints/sprint-2/intents/zeta.md`, intent(2) + '\nmore\n')
  assert.equal(d(), base, 'a sprint 2 intent is not part of sprint 1')
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1) + '\nmore\n')
  const edited = d()
  assert.notEqual(edited, base)
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { req: 'FR-1' }))
  const added = d()
  assert.notEqual(added, edited)
  fs.rmSync(path.join(repo, `${P}/sprints/sprint-1/intents/beta.md`))
  assert.equal(d(), edited)
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/sprints/sprint-1/implementation-plan.md`, `${P}/sprints/sprint-1/intents/alpha.md`, `${P}/sprints/sprint-1/prd.md`])
})

test('contract and example files an intent names are part of its sprint', () => {
  chart1()
  write(repo, 'api/x.yaml', 'openapi: 3\n')
  write(repo, 'api/ex.json', '{}\n')
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1, { iface: 'Contract: api/x.yaml\nExample: api/ex.json\n' }))
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/sprints/sprint-1/implementation-plan.md`, `${P}/sprints/sprint-1/intents/alpha.md`, `${P}/sprints/sprint-1/prd.md`, 'api/ex.json', 'api/x.yaml'])
})

test('an approval is missing, then approved, then stale after an edit that names the file', () => {
  chart1()
  assert.equal(state(1).state, 'missing')
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.equal(state(1).state, 'approved')
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, `${P}/sprints/sprint-1/approval.json`), 'utf8')).by, 'Pat')
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/sprints/sprint-1/intents/alpha.md`] })
  write(repo, `${P}/sprints/sprint-2/intents/zeta.md`, intent(2))
  assert.deepEqual(state(1).changed, [`${P}/sprints/sprint-1/intents/alpha.md`], 'another sprint does not change it')
})

// 2026-10-26 PRD fidelity: bug 1 was flagged by the chart review and still shipped, because "→ fixed" was never checked and
// approval never read the review.
test('approve chart-N refuses with no review, and with a finding not confirmed fixed, naming each and the waive command', () => {
  cleanChart()
  fs.rmSync(path.join(repo, `${P}/sprints/sprint-1/chart-review.md`))
  const none = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(none.code, 1)
  assert.match(none.stderr, /no chart-review\.md/)
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, 'verdict: pass\n## Findings\n- [severity: high] [category: coverage] a.md:1: nextId can repeat → fix (confidence 90) → fixed\n')
  const open = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(open.code, 1)
  assert.match(open.stderr, /1\. .*nextId can repeat/)
  assert.match(open.stderr, /waive chart-1 <finding number> <reason>/)
  assert.ok(!fs.existsSync(path.join(repo, `${P}/sprints/sprint-1/approval.json`)))
})

test('a person waives a chart finding, approval then succeeds; the model cannot waive, and a missing finding number is refused', () => {
  cleanChart()
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, 'verdict: pass\n## Findings\n- [severity: high] [category: coverage] a.md:1: nextId can repeat → fix (confidence 90)\n')
  assert.equal(sdlc(repo, ['waive', 'chart-1', '1', 'accepted', 'risk']).code, 3)
  assert.equal(sdlc(repo, ['waive', 'chart-1', '7', 'x', '--by', 'Pat'], HUMAN).code, 1)
  const w = sdlc(repo, ['waive', 'chart-1', '1', 'accepted', 'risk', '--by', 'Pat'], HUMAN)
  assert.equal(w.code, 0, w.stderr)
  const saved = JSON.parse(fs.readFileSync(path.join(repo, `${P}/sprints/sprint-1/waivers.json`), 'utf8')) as { finding: number; by: string; reason: string }[]
  assert.deepEqual(saved.map(x => [x.finding, x.by, x.reason]), [[1, 'Pat', 'accepted risk']])
  const ok = sdlc(repo, ['approve', 'chart-1', '--by', 'Pat'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
})

// 2026-10-26 PRD fidelity: the ledger is read by chart check, and it and the chart waivers are part of what a person approves.
const RULE_PRD = prd(1, '').replace('### FR-1: thing\n', '### FR-1: thing\n\n- Ids are never reused.\n')
test('chart check blocks on a missing ledger before approval and only reports it for a sprint approved without one', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/prd.md`, RULE_PRD)
  const ledger = (): { rule: string; severity: string }[] => (call('return C.chartFindings(1, false)') as { rule: string; severity: string }[]).filter(f => f.rule.startsWith('ledger'))
  assert.deepEqual(ledger().map(f => [f.rule, f.severity]), [['ledger-missing', 'block']])
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.deepEqual(ledger().map(f => [f.rule, f.severity]), [['ledger-missing', 'report']])
})

test('the ledger and the chart waivers are approved files; chart-review.md is not', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/requirements.md`, '- G-1 [rule] prd.md:7 "Ids are never reused."\n')
  write(repo, `${P}/sprints/sprint-1/waivers.json`, '[]\n')
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, 'verdict: pass\n## Findings\n')
  call(`C.writeChartApproval(1, 'Pat')`)
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, 'verdict: pass\n## Findings\n\nedited\n')
  assert.equal(state(1).state, 'approved')
  write(repo, `${P}/sprints/sprint-1/requirements.md`, '- G-1 [rule] prd.md:7 "Ids are never reused." \n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/sprints/sprint-1/requirements.md`] })
  write(repo, `${P}/sprints/sprint-1/requirements.md`, '- G-1 [rule] prd.md:7 "Ids are never reused."\n')
  write(repo, `${P}/sprints/sprint-1/waivers.json`, '[{"finding":1}]\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/sprints/sprint-1/waivers.json`] })
})

// 2026-10-25 shop_app: ADRs stayed `proposed` after approval, so the architect's "never edit an accepted ADR" never applied.
test('approval accepts that sprint\'s proposed ADRs and their Decisions rows, and the chart stays approved', () => {
  chart1()
  const adr = (s: number, status = 'proposed'): string => `---\nsprint: ${s}\nstatus: ${status}\ndate: 2026-10-25\n---\n# ADR\n\nstatus: proposed in prose stays\n`
  write(repo, `${P}/adr/0001-one.md`, adr(1))
  write(repo, `${P}/adr/0002-two.md`, adr(2))
  write(repo, `${P}/adr/0003-three.md`, adr(1, 'superseded-by 0004'))
  write(repo, `${P}/architecture.md`, `${ARCH_DOC()}\n## Decisions\n\n| ADR | Title | Status | Sprint |\n|---|---|---|---|\n| 0001 | One | proposed | 1 |\n| 0002 | Two | proposed | 2 |\n`)
  call(`C.writeChartApproval(1, 'Pat')`)
  const at = (f: string): string => fs.readFileSync(path.join(repo, P, f), 'utf8')
  assert.match(at('adr/0001-one.md'), /^status: accepted$/m)
  assert.match(at('adr/0001-one.md'), /status: proposed in prose stays/, 'only the frontmatter line changes')
  assert.match(at('adr/0002-two.md'), /^status: proposed$/m, 'another sprint\'s ADR is left alone')
  assert.match(at('adr/0003-three.md'), /^status: superseded-by 0004$/m)
  write(repo, `${P}/adr/0005-quoted.md`, adr(3).replace('status: proposed\n', 'status: "proposed"\n'))
  write(repo, `${P}/adr/0006-padded.md`, adr(3).replace('status: proposed\n', 'status: proposed  \n'))
  write(repo, `${P}/sprints/sprint-3/prd.md`, prd(3))
  write(repo, `${P}/sprints/sprint-3/intents/gamma.md`, intent(3))
  call(`C.writeChartApproval(3, 'Pat')`)
  for (const f of ['adr/0005-quoted.md', 'adr/0006-padded.md']) assert.match(at(f), /^status: accepted$/m, `${f}: a quoted or space-padded status is accepted too`)
  assert.match(at('architecture.md'), /\| 0001 \| One \| accepted \| 1 \|/)
  assert.match(at('architecture.md'), /\| 0002 \| Two \| proposed \| 2 \|/)
  assert.equal(state(1).state, 'approved', 'the digest is taken after the ADRs are accepted')
})

test('a hand-edited or garbage approval file reads as missing and never throws', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/approval.json`, '{ not json')
  assert.equal(state(1).state, 'missing')
  write(repo, `${P}/sprints/sprint-1/approval.json`, '{"by":"x"}\n')
  assert.equal(state(1).state, 'missing')
})

test('a later sprint editing the shared architecture leaves sprint 1 approved once sprint 2 is approved', () => {
  chart1()
  call(`C.writeChartApproval(1, 'Pat')`)
  write(repo, `${P}/architecture.md`, '# Architecture\n\nchanged for sprint 2\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/architecture.md`] })
  write(repo, `${P}/sprints/sprint-2/prd.md`, prd(2))
  write(repo, `${P}/sprints/sprint-2/intents/zeta.md`, intent(2))
  call(`C.writeChartApproval(2, 'Pat')`)
  assert.equal(state(1).state, 'approved')
})

test('chartFindings runs the trace rules over the files and adds concerns and architecture questions', () => {
  chart1()
  assert.deepEqual(call('return C.chartFindings(1, false)'), [])
  const withCases = call('return C.chartFindings(1, true)') as { rule: string; where: string }[]
  assert.deepEqual(withCases.map(f => f.rule), ['req-untested'], 'no cases.md yet')
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | data/x.json | ok |\n')
  assert.deepEqual((call('return C.chartFindings(1, true)') as { rule: string }[]).map(f => f.rule), ['case-data-missing'])
  write(repo, `${P}/sprints/sprint-1/testplan/data/x.json`, '{}\n')
  assert.deepEqual(call('return C.chartFindings(1, true)'), [])
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('## Concerns\nnone', '## Concerns\n- the auth gap (owner: lead)').replace('## Open questions\nnone', '## Open questions\n- which db?'))
  assert.deepEqual((call('return C.chartFindings(1, false)') as { rule: string }[]).map(f => f.rule).sort(), ['concern', 'open-question'])
})

test('chartFindings reports an owner decision parked under Risks and notes, without blocking', () => {
  chart1()
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('## Concerns\nnone', '## Concerns\nnone\n\n## Risks and notes\n- No bench sensor. Owner: repo owner.'))
  const f = call('return C.chartFindings(1, false)') as { rule: string; severity: string; where: string }[]
  assert.deepEqual(f.map(x => [x.rule, x.severity, x.where]), [['parked-decision', 'report', 'architecture.md']])
})

test('intentReady explains why not: unapproved, stale, blocked by an unshipped dependency, already started', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { depends: '[alpha]' }))
  const ready = (slug: string): { ready: boolean; why: string[] } => call(`return C.intentReady(${JSON.stringify(slug)})`) as { ready: boolean; why: string[] }
  assert.deepEqual(ready('alpha'), { ready: false, why: ['chart-1 is not approved'] })
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.deepEqual(ready('alpha'), { ready: true, why: [] })
  assert.deepEqual(ready('beta'), { ready: false, why: ['blocked by alpha'] })
  write(repo, '.rig/changes/alpha/pr.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'ship alpha')
  assert.deepEqual(ready('beta'), { ready: true, why: [] }, 'a is shipped once its pr.md is on the trunk')
  assert.deepEqual(ready('alpha'), { ready: false, why: ['already started'] })
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { depends: '[alpha]' }) + '\nedit\n')
  const stale = ready('beta')
  assert.equal(stale.ready, false)
  assert.match(stale.why[0] ?? '', /^chart-1 is stale: run \/rig:approve chart-1 after reviewing \(changed: .*intents\/beta\.md\)$/)
  assert.deepEqual(ready('ghost'), { ready: false, why: ['no such intent: ghost'] })
})

// The CLI: chart check, approve chart-N, ready.
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const REVIEW_PASS = 'verdict: pass\n## Findings\n## Deferred\n'
const cleanChart = (): void => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, REVIEW_PASS)
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n')
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
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1, { req: 'FR-1' }).replace('estimate_days: 1', 'estimate_days: 5'))
  const refused = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /estimate/)
  assert.ok(!fs.existsSync(path.join(repo, `${P}/sprints/sprint-1/approval.json`)))
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1))
  const ok = sdlc(repo, ['approve', 'chart-1', '--by', 'Pat'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /approved chart-1 by Pat/)
  assert.equal(state(1).state, 'approved')
  assert.match(sdlc(repo, ['approve', 'chart-1'], HUMAN).stdout, /already approved/)
})

test('ready lists the intents that can start and leaves out the blocked ones', () => {
  cleanChart()
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { depends: '[alpha]' }))
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n| TC-2 | FR-1 | beta | B1 | unit | - | ok |\n')
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha', 'beta']))
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
const SRC = `${P}/sprints/sprint-1/intents/alpha.md`

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
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { req: 'FR-1' }))
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha', 'beta']))
  assert.equal(sdlc(repo, ['approve', 'chart-1'], HUMAN).code, 0)
  assert.equal(sdlc(repo, ['new', 'alpha', '--source', SRC]).code, 0)
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { req: 'FR-1' }) + '\nedit\n')
  assert.match(sdlc(repo, ['status']).stdout, /alpha\s+feature\s+plan/)
  const r = sdlc(repo, ['new', 'beta', '--source', `${P}/sprints/sprint-1/intents/beta.md`])
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
const allRules = (n: number, cases: boolean): string[] => (call(`return C.chartFindings(${n}, ${cases})`) as { rule: string }[]).map(f => f.rule)
// The architecture-document rules have their own tests below; the rest of this file keeps its one-line architecture stubs.
const rulesOf = (n: number, cases: boolean): string[] => allRules(n, cases).filter(r => !r.startsWith('arch-') && !r.startsWith('impl-'))

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

test('sprint 2 may depend on a sprint 1 intent and has its own test plan', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-2/prd.md`, prd(2))
  write(repo, `${P}/sprints/sprint-2/intents/zeta.md`, intent(2, { depends: '[alpha]' }))
  write(repo, `${P}/sprints/sprint-2/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-2 | zeta | B1 | unit | - | ok |\n')
  assert.deepEqual(rulesOf(2, true), [])
})

test('a contract named outside the repo is reported and kept out of the digest', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1, { iface: 'Contract: ../outside.yaml\nExample: ../outside.json\n' }))
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
  write(repo, `${P}/sprints/sprint-1/prd.md`, prd(1, '\n<!--\n### FR-9: template example\n-->\n'))
  const r = call('return C.chartReport(1)') as string
  assert.match(r, /requirements 1:/)
  assert.doesNotMatch(r, /FR-9/)
})

// The sprint design doc: named by `design:` in architecture.md, hashed with the chart, and traced against the intents.
const DOC = 'docs/superpowers/specs/s1-design.md'
const archWith = (design: string | null): string => `---\nsprint: 1\nupdated: 2026-10-22\n${design === null ? '' : `design: ${design}\n`}---\n${ARCH_BODY}`
const docOf = (slugs: string[]): string => `# Design\n\n## Intents\n${slugs.map(s => `- ${s}: scope (FR-1)`).join('\n')}\n`
const findings = (n: number): { rule: string; message: string }[] => call(`return C.chartFindings(${n}, false)`) as { rule: string; message: string }[]

test('design: in architecture.md frontmatter puts the design doc under the chart approval; editing it makes chart-1 stale', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(DOC))
  write(repo, DOC, docOf(['alpha']))
  assert.equal(call('return C.designDocOf(1)'), DOC)
  call(`C.writeChartApproval(1, 'Pat')`)
  const row = JSON.parse(fs.readFileSync(path.join(repo, `${P}/sprints/sprint-1/approval.json`), 'utf8')) as { files: { path: string }[] }
  assert.ok(row.files.some(f => f.path === DOC))
  assert.equal(state(1).state, 'approved')
  write(repo, DOC, docOf(['alpha']) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [DOC] })
})

test('a quoted design: value is read without its quotes', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(`"${DOC}"`))
  assert.equal(call('return C.designDocOf(1)'), DOC)
})

test('design-intent blocks in both directions and names the slugs', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(DOC))
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1))
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
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/sprints/sprint-1/implementation-plan.md`, `${P}/sprints/sprint-1/intents/alpha.md`, `${P}/sprints/sprint-1/prd.md`])
})

test('a sprint whose architecture.md has no design: line has no design findings and no extra chart file', () => {
  chart1()
  write(repo, `${P}/architecture.md`, archWith(null))
  assert.equal(call('return C.designDocOf(1)'), null)
  assert.deepEqual(findings(1).filter(f => f.rule.startsWith('design')), [])
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/sprints/sprint-1/implementation-plan.md`, `${P}/sprints/sprint-1/intents/alpha.md`, `${P}/sprints/sprint-1/prd.md`])
})

const ARCH_BODY = `# Architecture

## Technology stack

| Concern | Choice | Version | Source |
|---|---|---|---|
| Language | Python | 3.12 | PRD |
| Framework | LangChain | 0.3 | PRD |

## Architecture diagram

\`\`\`mermaid
flowchart LR
  cli --> chains
\`\`\`

\`\`\`text
[cli] ---> [chains]
\`\`\`

## Code structure

\`\`\`
src/app/
  cli.py     # entry (sprint 1)
  chains.py  # LangChain chains (sprint 1)
tests/
\`\`\`

## Key flows

\`\`\`mermaid
sequenceDiagram
  cli->>chains: run
\`\`\`

\`\`\`text
cli ---run---> chains
            <--- result
\`\`\`

## Quality tactics

| NFR | Target | Tactic | Where | Verified by |
|---|---|---|---|---|
| NFR-1 | p95 under 2s | cache | chains.py | bench |

## Sprint history

| Sprint | Adds | Intents | ADRs |
|---|---|---|---|
| 1 | everything | alpha | none |

## Concerns
none

## Open questions
none
`
const ARCH_DOC = (): string => `---\nsprint: 1\n---\n${ARCH_BODY}`

test('a full architecture document has no architecture finding; the unfilled template has them all', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/prd.md`, prd(1, '\n| NFR-1 | performance | fast | p95 under 2s | bench |\n'))
  write(repo, `${P}/architecture.md`, ARCH_DOC())
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')), [])
  write(repo, `${P}/architecture.md`, tpl('architecture-format.md'))
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')).sort(), ['arch-diagram', 'arch-diagram-text', 'arch-flow', 'arch-flow-text', 'arch-history', 'arch-nfr', 'arch-stack', 'arch-stack', 'arch-structure'])
})

test('the architecture document must name a language and a framework, draw a diagram, show the tree and cover every NFR', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/prd.md`, prd(1, '\n| NFR-1 | performance | fast | p95 under 2s | bench |\n'))
  const bad = ARCH_DOC().replace('| Framework | LangChain | 0.3 | PRD |\n', '').replace('```mermaid\nflowchart LR\n  cli --> chains\n```', 'prose only').replace('| NFR-1 | p95 under 2s | cache | chains.py | bench |', '')
  write(repo, `${P}/architecture.md`, bad)
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')).sort(), ['arch-diagram', 'arch-nfr', 'arch-stack'])
})

test('an intent whose folder and frontmatter disagree about the sprint, and a slug in two sprints, are blocking findings', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(2))
  assert.ok(rulesOf(1, false).includes('sprint-mismatch'))
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1))
  write(repo, `${P}/sprints/sprint-2/prd.md`, prd(2))
  write(repo, `${P}/sprints/sprint-2/intents/alpha.md`, intent(2))
  assert.ok(rulesOf(1, false).includes('duplicate-slug'))
})

test('a sprint owns its test plan: another sprint cases.md is not part of its chart and does not change its digest', () => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok |\n')
  const before = call('return C.chartDigest(1)')
  write(repo, `${P}/sprints/sprint-2/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-2 | zeta | B1 | unit | - | ok |\n')
  assert.equal(call('return C.chartDigest(1)'), before)
  assert.ok((files(1) as string[]).includes(`${P}/sprints/sprint-1/testplan/cases.md`))
  assert.ok(!(files(1) as string[]).includes(`${P}/sprints/sprint-2/testplan/cases.md`))
})

test('each sprint keeps its own design doc: charting sprint 2 does not move the design of sprint 1', () => {
  chart1()
  write(repo, 'docs/specs/2026-10-01-sprint-1-design.md', '# D1\n\n## Intents\n- alpha: thing (FR-1)\n')
  write(repo, 'docs/specs/2026-10-20-sprint-2-design.md', '# D2\n\n## Intents\n- zeta: thing (FR-2)\n')
  write(repo, `${P}/architecture.md`, '---\ndesign: docs/specs/2026-10-20-sprint-2-design.md\n---\n# A\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
  assert.equal(call('return C.designDocOf(1)'), 'docs/specs/2026-10-01-sprint-1-design.md')
  assert.equal(call('return C.designDocOf(2)'), 'docs/specs/2026-10-20-sprint-2-design.md')
  assert.ok(!allRules(1, false).includes('design-intent'))
})

test('architecture rules tolerate a # line inside a fence, a row with no closing pipe and a "Sprint 1" history cell', () => {
  chart1()
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('  cli.py     # entry (sprint 1)', '## generated/\n  cli.py     # entry (sprint 1)').replace('| Language | Python | 3.12 | PRD |', '| Language | Python').replace('| 1 | everything', '| Sprint 1 | everything'))
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')), [])
})

test('a sprint with no design doc of its own is not handed the newest sprint design', () => {
  chart1()
  write(repo, 'docs/specs/2026-10-20-sprint-2-design.md', '# D2\n\n## Intents\n- zeta: thing (FR-2)\n')
  write(repo, `${P}/architecture.md`, '---\ndesign: docs/specs/2026-10-20-sprint-2-design.md\n---\n# A\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
  assert.equal(call('return C.designDocOf(1)'), null)
})

test('chartFindings checks the Access table in architecture.md against the charted intents and the cases', () => {
  chart1()
  const table = '## Access\n\n| Action | Allowed | Interfaces | Intent |\n|---|---|---|---|\n| delete | owner | api | alpha |\n\n## Concerns'
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('## Concerns', table))
  assert.deepEqual(call('return C.chartFindings(1, false)'), [])
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected | Access |\n| TC-1 | FR-1 | alpha | B1 | unit | - | ok | delete: allowed api |\n')
  assert.deepEqual((call('return C.chartFindings(1, true)') as { rule: string }[]).map(f => f.rule), ['access-untested'])
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('## Concerns', table.replace('| alpha |', '| ghost |')))
  assert.deepEqual((call('return C.chartFindings(1, false)') as { rule: string }[]).map(f => f.rule), ['access-intent'])
})


// ---- sprint plan view (plan.ts) ----
const planRepo = (): void => {
  chart1()
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { depends: '[alpha]' }))
  write(repo, `${P}/sprints/sprint-1/intents/gamma.md`, intent(1, { depends: '[alpha, beta]' }))
}

test('chart plan writes plan.md with waves, a text graph, a Mermaid graph and what can start', () => {
  planRepo()
  const r = sdlc(repo, ['chart', 'plan', '1'])
  assert.equal(r.code, 0, r.stderr)
  const text = fs.readFileSync(path.join(repo, P, 'sprints/sprint-1/plan.md'), 'utf8')
  assert.match(text, /\| 1 \| alpha \| - \| 1 \| - \| ready \|/)
  assert.match(text, /\| 2 \| beta \| alpha \| 1 \| - \| blocked \|/)
  assert.match(text, /\| 3 \| gamma \| alpha, beta \| 1 \| - \| blocked \|/)
  assert.match(text, /\[implementation-plan\.md\]\(implementation-plan\.md\)\. Unassigned: alpha, beta, gamma/)
  assert.match(text, /alpha ○ ready\n└─ beta ✖ blocked\n   └─ gamma ✖ blocked  \(also after: alpha\)/)
  assert.match(text, /graph LR[\s\S]*n_alpha --> n_beta[\s\S]*n_beta --> n_gamma/)
  assert.match(text, /## Next up\n\n[\s\S]*- `\/rig:start \.rig\/product\/sprints\/sprint-1\/intents\/alpha\.md`/)
})

test('regenerating the plan does not make an approved chart stale', () => {
  chart1()
  const before = call('return C.chartDigest(1)')
  sdlc(repo, ['chart', 'plan', '1'])
  assert.equal(call('return C.chartDigest(1)'), before)
})

test('a refused start names the build order and what is ready now', () => {
  planRepo()
  const r = sdlc(repo, ['new', 'gamma', '--source', `${P}/sprints/sprint-1/intents/gamma.md`])
  assert.notEqual(r.code, 0)
  const msg = r.stdout + r.stderr
  assert.match(msg, /blocked by alpha, beta/)
  assert.match(msg, /build order is in \.rig\/product\/sprints\/sprint-1\/plan\.md/)
  assert.ok(fs.existsSync(path.join(repo, P, 'sprints/sprint-1/plan.md')))
})

test('the text graph lists intents on a dependency cycle instead of dropping them, and Mermaid ids avoid keywords', () => {
  write(repo, `${P}/sprints/sprint-1/prd.md`, prd(1))
  write(repo, `${P}/sprints/sprint-1/intents/end.md`, intent(1, { depends: '[loop]' }))
  write(repo, `${P}/sprints/sprint-1/intents/loop.md`, intent(1, { depends: '[end]' }))
  write(repo, `${P}/sprints/sprint-1/intents/solo.md`, intent(1))
  const text = (sdlc(repo, ['chart', 'plan', '1', '--print']).stdout)
  assert.match(text, /solo ○ ready/)
  assert.match(text, /end ✖ blocked {2}\(on a dependency cycle/)
  assert.match(text, /loop ✖ blocked {2}\(on a dependency cycle/)
  assert.match(text, /n_end\["end"\]/)
})

test('an unapproved chart is named in Next up, and a refused start lists no ready intent then', () => {
  planRepo()
  assert.match(sdlc(repo, ['chart', 'plan', '1', '--print']).stdout, /chart-1 is missing: a person runs `\/rig:approve chart-1`/)
  const r = sdlc(repo, ['new', 'gamma', '--source', `${P}/sprints/sprint-1/intents/gamma.md`])
  assert.doesNotMatch(r.stdout + r.stderr, /Ready now/)
})

// 2026-10-25 shop_app: `/rig:chart` from the plugin ran in a standalone repo and wrote `/rig:approve` into plan.md, though
// the repo's skills and README answer to /rig-approve only.
test('the plugin copy names /rig-x commands in a repo with the standalone skills installed', () => {
  planRepo()
  write(repo, '.claude/skills/rig-start/SKILL.md', '---\nname: rig:start\n---\n')
  const text = sdlc(repo, ['chart', 'plan', '1', '--print']).stdout
  assert.match(text, /a person runs `\/rig-approve chart-1`/)
  assert.doesNotMatch(text, /\/rig:[a-z]/)
})

// The sprint implementation plan (owner, 2026-10-26): engineers are allocated by filling `owner:` in each intent after the chart is approved.
test('filling in an intent owner keeps an approved chart approved, and plan.md shows the owner', () => {
  planRepo()
  call(`C.writeChartApproval(1, 'Pat')`)
  const file = path.join(repo, P, 'sprints/sprint-1/intents/alpha.md')
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('estimate_days: 1\n', 'estimate_days: 1\nowner: Sam\n'))
  assert.equal(state(1).state, 'approved')
  assert.equal(sdlc(repo, ['chart', 'plan', '1']).code, 0)
  const text = fs.readFileSync(path.join(repo, P, 'sprints/sprint-1/plan.md'), 'utf8')
  assert.match(text, /\| 1 \| alpha \| - \| 1 \| Sam \| ready \|/)
  assert.match(text, /Unassigned: beta, gamma/)
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\nedit\n')
  assert.equal(state(1).state, 'stale', 'any other edit still makes it stale')
})

test('a sprint with intents and no implementation-plan.md is blocked; the plan is a chart file', () => {
  chart1()
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('impl-')), [])
  fs.rmSync(path.join(repo, P, 'sprints/sprint-1/implementation-plan.md'))
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('impl-')), ['impl-missing'])
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha']))
  call(`C.writeChartApproval(1, 'Pat')`)
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha']) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/sprints/sprint-1/implementation-plan.md`] })
})

test('the architecture diagram and each key flow need an ASCII twin beside the mermaid one', () => {
  chart1()
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace('```text\n[cli] ---> [chains]\n```', ''))
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')), ['arch-diagram-text'])
  write(repo, `${P}/architecture.md`, ARCH_DOC().replace(/```text\ncli ---run[\s\S]*?```/, '```text\n```'))
  assert.deepEqual(allRules(1, false).filter(r => r.startsWith('arch-')), ['arch-flow-text'], 'an empty block draws nothing')
})

// 2026-10-26 PRD fidelity: the PRD's own words travel with a charted change, copied by the script, never retyped by a model.
test('new --source writes the ledger rows its intent cites into the change, word for word; no ledger, no file', () => {
  const PRD_RULES = '---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: thing\n\n- Ids start at 1.\n- Ids are stored.\n\n### FR-2: other\n\n- Export works.\n\n## Open questions\nnone\n'
  const LEDGER = '# Requirements\n\n- FR-1.1 [rule] prd.md:9 "Ids start at 1."\n- FR-1.2 [context] prd.md:10 "Ids are stored." — how, not what\n- FR-2.1 [rule] prd.md:14 "Export works."\n'
  cleanChart()
  write(repo, `${P}/sprints/sprint-1/prd.md`, PRD_RULES)
  write(repo, `${P}/sprints/sprint-1/requirements.md`, LEDGER)
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1).replace('- B1 (FR-1): works', '- B1 (FR-1, FR-1.1): the first id is 1'))
  write(repo, `${P}/sprints/sprint-1/intents/beta.md`, intent(1, { req: 'FR-2' }).replace('- B1 (FR-2): works', '- B1 (FR-2, FR-2.1): exports'))
  write(repo, `${P}/sprints/sprint-1/implementation-plan.md`, IMPL_OK(['alpha', 'beta']))
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1, FR-1.1 | alpha | B1 | unit | - | ok |\n| TC-2 | FR-2, FR-2.1 | beta | B1 | unit | - | ok |\n')
  const approved = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(approved.code, 0, approved.stderr)
  const r = sdlc(repo, ['new', 'alpha', '--source', SRC])
  assert.equal(r.code, 0, r.stderr)
  const req = fs.readFileSync(path.join(repo, '.rig/changes/alpha/requirements.md'), 'utf8')
  assert.ok(req.includes('- FR-1.1 [rule] prd.md:9 "Ids start at 1."\n'))
  assert.ok(!req.includes('FR-1.2') && !req.includes('FR-2.1'), req)
  assert.match(r.stdout, /requirements\.md/)
})

test('new --source with no sprint ledger writes no requirements.md', () => {
  startable()
  assert.equal(sdlc(repo, ['new', 'alpha', '--source', SRC]).code, 0)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes/alpha/requirements.md')))
})

// 2026-10-26 final review: approval failed open on a review it could not read, and a deleted ledger stopped blocking.
test('a changes-needed review with no finding rig can read refuses approval', () => {
  cleanChart()
  write(repo, `${P}/sprints/sprint-1/chart-review.md`, 'verdict: changes-needed\n## Findings (2)\n- nextId can repeat\n')
  const r = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(r.code, 1)
  assert.match(r.stderr, /changes-needed/)
})

test('a ledger approved once and then deleted blocks again', () => {
  cleanChart()
  write(repo, `${P}/sprints/sprint-1/prd.md`, RULE_PRD)
  write(repo, `${P}/sprints/sprint-1/requirements.md`, '- G-1 [rule] prd.md:9 "Ids are never reused."\n')
  write(repo, `${P}/sprints/sprint-1/intents/alpha.md`, intent(1).replace('- B1 (FR-1): works', '- B1 (FR-1, G-1): never reused'))
  write(repo, `${P}/sprints/sprint-1/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1, G-1 | alpha | B1 | unit | - | ok |\n')
  const ok = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
  fs.rmSync(path.join(repo, `${P}/sprints/sprint-1/requirements.md`))
  const missing = (call('return C.chartFindings(1, false)') as { rule: string; severity: string }[]).filter(f => f.rule === 'ledger-missing')
  assert.deepEqual(missing.map(f => f.severity), ['block'])
})

test('approve on a chart already approved before reviews were read still says already approved', () => {
  cleanChart()
  call(`C.writeChartApproval(1, 'Pat')`)
  fs.rmSync(path.join(repo, `${P}/sprints/sprint-1/chart-review.md`))
  const r = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /already approved/)
})
