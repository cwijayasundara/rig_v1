// The sprint chart (.rig/product/): its digest, its one human approval, and the parsers the trace report uses.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'
import { listField, prdIds, testCases } from './chart.ts'

let repo: string
beforeEach(() => { repo = makeRepo() })
const PRD = '---\nsprint: 1\n---\n# PRD\n\n## Functional requirements\n### FR-1: Add to cart\n### FR-2: Checkout\n\n## Non-functional requirements\n| ID | Category |\n|---|---|\n| NFR-1 | performance |\n\n## Open questions\nnone\n'
const approve = (n: number, human = true) => sdlc(repo, ['approve', `chart-${n}`], { env: { SDLC_HUMAN: human ? '1' : '' } })
const rows = (): Record<string, unknown>[] => fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)

test('listField reads flow lists and tolerates empties and quotes', () => {
  assert.deepEqual(listField('[a, "b" , ,c]'), ['a', 'b', 'c'])
  assert.deepEqual(listField(''), [])
  assert.deepEqual(listField(undefined), [])
  assert.deepEqual(listField('single'), ['single'])
})

test('prdIds reads FR headings and NFR table rows, not ids mentioned in prose', () => {
  assert.deepEqual(prdIds(PRD + '\nFR-9 is mentioned here only.\n'), ['FR-1', 'FR-2', 'NFR-1'])
})

test('testCases reads TC rows and ignores the header and separator', () => {
  const t = '| ID | Requirement | Intent | Level | Data | Expected |\n|---|---|---|---|---|---|\n| TC-1 | FR-1, NFR-1 | add-to-cart.md | acceptance | data/cart.json | item in cart |\n'
  assert.deepEqual(testCases(t), [{ id: 'TC-1', reqs: ['FR-1', 'NFR-1'], intent: 'add-to-cart', level: 'acceptance', data: 'data/cart.json' }])
})

test('approve chart-N is human-only, writes one row with the files it covers, and is idempotent', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  const r = approve(1, false)
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /human-only/)
  assert.equal(approve(1).code, 0)
  assert.match(approve(1).stdout, /chart-1 is already approved/)
  const all = rows()
  assert.equal(all.length, 1)
  assert.deepEqual([all[0]?.slug, all[0]?.stage], ['chart-1', 'chart'])
  assert.deepEqual((all[0]?.files as { path: string }[]).map(f => f.path), ['.rig/product/prd/sprint-1.md'])
})

test('approve chart-N refuses a missing PRD, an open question and an unresolved concern', () => {
  write(repo, '.rig/intent/x.md', '---\nstatus: draft\n---\n# x\n')
  assert.match(approve(2).stderr, /sprint-2\.md does not exist/)
  write(repo, '.rig/product/prd/sprint-1.md', PRD.replace('## Open questions\nnone', '## Open questions\n- Which payment provider?'))
  assert.match(approve(1).stderr, /open question.*\n.*payment provider/)
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/product/architecture.md', '---\nsprint: 1\n---\n# Architecture\n\n## Concerns\n- [drift] the cart module calls the DB directly → owner: architect\n\n## Open questions\nnone\n')
  assert.match(approve(1).stderr, /concern/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/approvals.jsonl')), false)
})

test('the digest covers the PRD, architecture, ADRs, test plan and sprint-N intents only; CRLF does not change it', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a\n')
  write(repo, '.rig/intent/other.md', '---\nstatus: draft\nsprint: 2\n---\n# Intent: other\n')
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/intent/other.md', '---\nstatus: draft\nsprint: 2\n---\n# Intent: other, edited\n')
  write(repo, '.rig/intent/a.md', '---\r\nstatus: draft\r\nsprint: 1\r\n---\r\n# Intent: a\r\n')
  assert.match(approve(1).stdout, /already approved/, 'another sprint and a CRLF checkout keep the approval')
  const edits: [string, string][] = [
    ['.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a, edited\n'],
    ['.rig/intent/b.md', '---\nsprint: 1\n---\n# new\n'],
    ['.rig/product/adr/0001-db.md', '# ADR 1\n'],
    ['.rig/product/testplan/data/cart.json', '{}'],
  ]
  for (const [file, text] of edits) {
    write(repo, file, text)
    assert.match(approve(1).stdout, /approved chart-1 by/, file)
  }
  fs.rmSync(path.join(repo, '.rig/intent/b.md'))
  assert.match(approve(1).stdout, /approved chart-1 by/, 'a removed sprint intent changes the digest')
})

test('new --source refuses a blocked or unapproved intent and names why; a ready one starts; a later stale chart leaves it alone', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a\n')
  write(repo, '.rig/intent/b.md', '---\nstatus: accepted\ndepends: [a]\n---\n# Intent: b\n')
  const start = (f: string, slug: string) => sdlc(repo, ['new', slug, '--type', 'feature', '--tier', 'M', '--source', `.rig/intent/${f}`])
  let r = start('a.md', 'a-change')
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /chart-1 is not approved/)
  r = start('b.md', 'b-change')
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /blocked by: a/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/b-change')), false)
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/product/prd/sprint-1.md', PRD.replace('Checkout', 'Pay'))
  assert.match(start('a.md', 'a-change').stderr, /chart-1 is stale: .*\.rig\/product\/prd\/sprint-1\.md/)
  assert.equal(approve(1).code, 0)
  r = start('a.md', 'a-change')
  assert.equal(r.code, 0, r.stderr)
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  const next = JSON.parse(sdlc(repo, ['next', 'a-change', '--json']).stdout) as { verdict: string; reason: string }
  assert.doesNotMatch(next.reason ?? '', /chart/)
})

test('chart check reports every gap kind, and what changed since the approval; it never fails on gaps', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/cart.md', '---\nstatus: draft\nsprint: 1\nprd: [FR-1, FR-7]\ndepends: [ghost]\n---\n# Intent: cart\n')
  write(repo, '.rig/intent/bare.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: bare\n')
  write(repo, '.rig/product/testplan/cases.md', '| ID | Requirement | Intent | Level | Data | Expected |\n|---|---|---|---|---|---|\n| TC-1 | FR-1 | cart | acceptance | data/cart.json | added |\n| TC-2 | NFR-1 | gone | perf | - | p95 under 300 ms |\n')
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/intent/bare.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: bare, edited\n')
  const r = sdlc(repo, ['chart', 'check', '1', '--json'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), {
    sprint: 1, approval: 'stale', uncovered: ['FR-2', 'NFR-1'], untested: ['FR-2'], unreferenced: ['bare.md'], unknownIds: ['FR-7'],
    orphanCases: ['TC-2 → gone'], missingData: ['TC-1 → data/cart.json'], deps: ['cart.md: missing:ghost'], changedSinceApproval: ['.rig/intent/bare.md'],
  })
  assert.match(sdlc(repo, ['chart', 'check', '1']).stdout, /^chart-1: stale$/m)
  const none = sdlc(repo, ['chart', 'check', '9'])
  assert.notEqual(none.code, 0)
  assert.match(none.stderr, /no PRD for sprint 9/)
})


test('the templates parse: PRD ids, the cases table, and an open question under the PRD heading', () => {
  const tpl = (f: string): string => fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', f), 'utf8')
  const prd = tpl('prd-format.md')
  assert.deepEqual(prdIds(prd), ['FR-1', 'NFR-1'])
  assert.match(prd, /^## Open questions$/m)
  assert.match(prd, /^## Changes since last sprint$/m)
  assert.deepEqual(testCases(tpl('testplan-format.md')).map(c => c.id), ['TC-1'])
  assert.match(tpl('architecture-format.md'), /^## Concerns$/m)
})

test('chart routes: architecture and intents on the architect tier L route, the test plan on the implementer tier M route; sensors.json overrides apply', () => {
  assert.deepEqual(JSON.parse(sdlc(repo, ['chart', 'routes', '--json']).stdout), { architect: { model: 'opus', effort: 'high' }, testplan: { model: 'sonnet', effort: 'medium' } })
  write(repo, '.rig/sensors.json', JSON.stringify({ routing: { implementer: { M: 'opus:high' } } }))
  assert.deepEqual(JSON.parse(sdlc(repo, ['chart', 'routes', '--json']).stdout).testplan, { model: 'opus', effort: 'high' })
})

const prd = (n: number, ids: string): string => `---\nsprint: ${n}\n---\n# PRD\n\n${ids}\n\n## Open questions\nnone\n`
const sprintIntent = (name: string, n: number, extra = ''): void => write(repo, `.rig/intent/${name}.md`, `---\nstatus: draft\nsprint: ${n}\n${extra}---\n# Intent: ${name}\n`)
const startFrom = (name: string, slug: string) => sdlc(repo, ['new', slug, '--type', 'feature', '--tier', 'M', '--source', `.rig/intent/${name}.md`])

test('charting the next sprint edits the shared files: earlier unstarted intents wait for that chart, then start again', () => {
  write(repo, '.rig/product/prd/sprint-0.md', prd(0, '### FR-1: View'))
  write(repo, '.rig/product/architecture.md', '---\nsprint: 0\n---\n# Architecture\n')
  sprintIntent('old', 0)
  assert.equal(approve(0).code, 0)
  write(repo, '.rig/product/prd/sprint-1.md', prd(1, '### FR-2: Remove'))
  write(repo, '.rig/product/architecture.md', '---\nsprint: 1\n---\n# Architecture, sprint 1\n')
  sprintIntent('new', 1)
  const r = startFrom('old', 'old-change')
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /chart-0 is stale: .*\.rig\/product\/architecture\.md/)
  assert.doesNotMatch(r.stderr, /intent\/new\.md/, "the next sprint's intents are not chart-0's")
  assert.equal(approve(1).code, 0)
  assert.equal(startFrom('old', 'old-change').code, 0, 'chart-1 covers the shared files now')
  sprintIntent('old', 0, 'owner: someone\n')
  assert.equal(sdlc(repo, ['chart', 'check', '0', '--json']).stdout.includes('"approval":"stale"'), true, "an edit to sprint 0's own file still needs chart-0")
})

test('machine-local files in the chart folders do not change the digest', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/product/testplan/.DS_Store', 'x')
  write(repo, '.rig/product/adr/0001-x.md~', 'x')
  write(repo, '.rig/intent/.draft.md', '---\nsprint: 1\n---\n')
  assert.match(approve(1).stdout, /already approved/)
})

test('depends may name an intent with or without .md', () => {
  write(repo, '.rig/intent/a.md', '---\nstatus: accepted\n---\n# a\n')
  write(repo, '.rig/intent/b.md', '---\nstatus: accepted\ndepends: [a.md]\n---\n# b\n')
  const rows = JSON.parse(sdlc(repo, ['inbox', '--json']).stdout) as { file: string; blockedBy: string[] }[]
  assert.deepEqual(rows.find(e => e.file === 'b.md')?.blockedBy, ['a'])
})

test('a change cannot take the sprint gate name chart-N', () => {
  const r = sdlc(repo, ['new', 'chart-2', '--type', 'chore', '--tier', 'S'])
  assert.notEqual(r.code, 0)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/chart-2')), false)
})

test('dropping sprint: or depends: from a committed intent does not get it past the gate', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  sprintIntent('gated', 1)
  write(repo, '.rig/intent/after.md', '---\nstatus: accepted\ndepends: [gated]\n---\n# after\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'chart')
  write(repo, '.rig/intent/gated.md', '---\nstatus: accepted\n---\n# Intent: gated\n')
  write(repo, '.rig/intent/after.md', '---\nstatus: accepted\n---\n# after\n')
  for (const [name, slug] of [['gated', 'gated-change'], ['after', 'after-change']]) {
    const r = startFrom(name, slug)
    assert.notEqual(r.code, 0, name)
    assert.match(r.stderr, /sprint: or depends: differs from the last commit/, name)
  }
})

test("chart check: earlier sprints' cases are not unknown ids of this sprint", () => {
  write(repo, '.rig/product/prd/sprint-2.md', prd(2, '### FR-5: Wishlist'))
  sprintIntent('wish', 2, 'prd: [FR-5]\n')
  write(repo, '.rig/intent/old.md', '---\nstatus: draft\nsprint: 1\nprd: [FR-1]\n---\n# old\n')
  write(repo, '.rig/product/testplan/cases.md', '| ID | Requirement | Intent | Level | Data | Expected |\n|---|---|---|---|---|---|\n| TC-1 | FR-1 | old | unit | - | ok |\n| TC-9 | FR-5, FR-99 | wish | unit | - | ok |\n')
  const j = JSON.parse(sdlc(repo, ['chart', 'check', '2', '--json']).stdout) as { unknownIds: string[] }
  assert.deepEqual(j.unknownIds, ['FR-99'])
})

test('the chart skill hands concerns to their owners and opens the PR without probing for gh', () => {
  const skill = fs.readFileSync(path.join(import.meta.dirname, '..', 'skills', 'chart', 'SKILL.md'), 'utf8')
  assert.match(skill, /Never resolve one yourself/)
  assert.match(skill, /Concerns to resolve before approval/)
  assert.match(skill, /Do not probe for `gh`/)
  assert.doesNotMatch(skill, /With a remote and `gh`/)
})
