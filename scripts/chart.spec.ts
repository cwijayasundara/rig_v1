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
  write(repo, `${P}/intents/a.md`, intent(1))
  write(repo, `${P}/architecture.md`, '# Architecture\n\n## Concerns\nnone\n\n## Open questions\nnone\n')
}
const files = (n: number): unknown => call(`return C.chartFiles(${n})`)
const state = (n: number): { state: string; changed: string[] } => call(`return C.chartState(${n})`) as { state: string; changed: string[] }

test('the digest changes when a sprint file is edited, added or removed, and not for another sprint intent', () => {
  chart1()
  write(repo, `${P}/intents/z.md`, intent(2))
  const d = (): unknown => call('return C.chartDigest(1)')
  const base = d()
  write(repo, `${P}/intents/z.md`, intent(2) + '\nmore\n')
  assert.equal(d(), base, 'a sprint 2 intent is not part of sprint 1')
  write(repo, `${P}/intents/a.md`, intent(1) + '\nmore\n')
  const edited = d()
  assert.notEqual(edited, base)
  write(repo, `${P}/intents/b.md`, intent(1, { req: 'FR-1' }))
  const added = d()
  assert.notEqual(added, edited)
  fs.rmSync(path.join(repo, `${P}/intents/b.md`))
  assert.equal(d(), edited)
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/a.md`, `${P}/prd/sprint-1.md`])
})

test('contract and example files an intent names are part of its sprint', () => {
  chart1()
  write(repo, 'api/x.yaml', 'openapi: 3\n')
  write(repo, 'api/ex.json', '{}\n')
  write(repo, `${P}/intents/a.md`, intent(1, { iface: 'Contract: api/x.yaml\nExample: api/ex.json\n' }))
  assert.deepEqual(files(1), [`${P}/architecture.md`, `${P}/intents/a.md`, `${P}/prd/sprint-1.md`, 'api/ex.json', 'api/x.yaml'])
})

test('an approval is missing, then approved, then stale after an edit that names the file', () => {
  chart1()
  assert.equal(state(1).state, 'missing')
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.equal(state(1).state, 'approved')
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, `${P}/approvals/chart-1.json`), 'utf8')).by, 'Pat')
  write(repo, `${P}/intents/a.md`, intent(1) + '\nedit\n')
  assert.deepEqual(state(1), { state: 'stale', changed: [`${P}/intents/a.md`] })
  write(repo, `${P}/intents/z.md`, intent(2))
  assert.deepEqual(state(1).changed, [`${P}/intents/a.md`], 'another sprint does not change it')
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
  write(repo, `${P}/intents/z.md`, intent(2))
  call(`C.writeChartApproval(2, 'Pat')`)
  assert.equal(state(1).state, 'approved')
})

test('chartFindings runs the trace rules over the files and adds concerns and architecture questions', () => {
  chart1()
  assert.deepEqual(call('return C.chartFindings(1, false)'), [])
  const withCases = call('return C.chartFindings(1, true)') as { rule: string; where: string }[]
  assert.deepEqual(withCases.map(f => f.rule), ['req-untested'], 'no cases.md yet')
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | a | B1 | unit | data/x.json | ok |\n')
  assert.deepEqual((call('return C.chartFindings(1, true)') as { rule: string }[]).map(f => f.rule), ['case-data-missing'])
  write(repo, `${P}/testplan/data/x.json`, '{}\n')
  assert.deepEqual(call('return C.chartFindings(1, true)'), [])
  write(repo, `${P}/architecture.md`, '# A\n\n## Concerns\n- the auth gap (owner: lead)\n\n## Open questions\n- which db?\n')
  assert.deepEqual((call('return C.chartFindings(1, false)') as { rule: string }[]).map(f => f.rule).sort(), ['concern', 'open-question'])
})

test('intentReady explains why not: unapproved, stale, blocked by an unshipped dependency, already started', () => {
  chart1()
  write(repo, `${P}/intents/b.md`, intent(1, { depends: '[a]' }))
  const ready = (slug: string): { ready: boolean; why: string[] } => call(`return C.intentReady(${JSON.stringify(slug)})`) as { ready: boolean; why: string[] }
  assert.deepEqual(ready('a'), { ready: false, why: ['chart-1 is not approved'] })
  call(`C.writeChartApproval(1, 'Pat')`)
  assert.deepEqual(ready('a'), { ready: true, why: [] })
  assert.deepEqual(ready('b'), { ready: false, why: ['blocked by a'] })
  write(repo, '.rig/changes/a/pr.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'ship a')
  assert.deepEqual(ready('b'), { ready: true, why: [] }, 'a is shipped once its pr.md is on the trunk')
  assert.deepEqual(ready('a'), { ready: false, why: ['already started'] })
  write(repo, `${P}/intents/b.md`, intent(1, { depends: '[a]' }) + '\nedit\n')
  const stale = ready('b')
  assert.equal(stale.ready, false)
  assert.match(stale.why[0] ?? '', /^chart-1 is stale: run \/rig:approve chart-1 after reviewing \(changed: .*intents\/b\.md\)$/)
  assert.deepEqual(ready('ghost'), { ready: false, why: ['no such intent: ghost'] })
})

// The CLI: chart check, approve chart-N, ready.
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const cleanChart = (): void => {
  chart1()
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | a | B1 | unit | - | ok |\n')
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
  write(repo, `${P}/intents/a.md`, intent(1, { req: 'FR-1' }).replace('estimate_days: 1', 'estimate_days: 5'))
  const refused = sdlc(repo, ['approve', 'chart-1'], HUMAN)
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /estimate/)
  assert.ok(!fs.existsSync(path.join(repo, `${P}/approvals/chart-1.json`)))
  write(repo, `${P}/intents/a.md`, intent(1))
  const ok = sdlc(repo, ['approve', 'chart-1', '--by', 'Pat'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /approved chart-1 by Pat/)
  assert.equal(state(1).state, 'approved')
  assert.match(sdlc(repo, ['approve', 'chart-1'], HUMAN).stdout, /already approved/)
})

test('ready lists the intents that can start and leaves out the blocked ones', () => {
  cleanChart()
  write(repo, `${P}/intents/b.md`, intent(1, { depends: '[a]' }))
  write(repo, `${P}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-1 | a | B1 | unit | - | ok |\n| TC-2 | FR-1 | b | B1 | unit | - | ok |\n')
  assert.equal(sdlc(repo, ['approve', 'chart-1'], HUMAN).code, 0)
  const r = sdlc(repo, ['ready', '--json'])
  assert.deepEqual((JSON.parse(r.stdout) as { slug: string }[]).map(i => i.slug), ['a'])
  assert.match(sdlc(repo, ['ready']).stdout, /a\s+sprint 1\s+1 day/)
})
