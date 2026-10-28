// Review items the change left open go to the unbuilt intent that owns them, else the backlog; the change's additions are recorded in its own intent
// (shop_app sprint 1, 2026-10-28: a Deferred ANSI item and four spec additions sat in files nobody read again).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, verified, ARCH_OK, IMPL_OK } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] })) })
const SP = '.rig/product/sprints/sprint-1'
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const rd = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const REVIEW = '## Findings\n## Deferred\n- src/ops.py:3: x\n- names should strip ANSI escapes → carry: cli\n- docs/other.md: y\n- src/store.py:9: z → fixed\n## Unverifiable\n- a future CLI that prints names → settle by: a journey\n'

function chart(): void {
  const intent = (scope: string): string => `---\nsprint: 1\nprd: [FR-1]\ndepends: []\nestimate_days: 1\nkind: internal\nscope: [${scope}]\n---\n# i\n\n## Interfaces\nnone\n\n## Behaviours\n- B1 (FR-1): works\n\n## Open questions\nnone\n`
  write(repo, `${SP}/prd.md`, '---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: thing\n\n## Open questions\nnone\n')
  for (const s of ['store', 'ops', 'cli']) write(repo, `${SP}/intents/${s}.md`, intent(`src/${s}.py`))
  write(repo, '.rig/product/architecture.md', ARCH_OK(1))
  write(repo, `${SP}/implementation-plan.md`, IMPL_OK(['store', 'ops', 'cli']))
  write(repo, `${SP}/chart-review.md`, 'verdict: pass\n## Findings\n## Deferred\n')
  write(repo, `${SP}/testplan/cases.md`, '| ID | Req | Intent | B | Level | Data | Expected |\n' + ['store', 'ops', 'cli'].map((s, i) => `| TC-${i + 1} | FR-1 | ${s} | B1 | unit | - | ok |`).join('\n') + '\n')
  const ok = sdlc(repo, ['approve', 'chart-1', '--by', 'Pat'], HUMAN)
  assert.equal(ok.code, 0, ok.stderr)
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'chart')
}
function start(slug: string, spec = '# Spec\n\n## Behaviours\n- B1: the change works\n\n## Open questions\nnone\n'): void {
  assert.equal(sdlc(repo, ['new', slug, '--source', `${SP}/intents/${slug}.md`]).code, 0)
  write(repo, `.rig/changes/${slug}/spec.md`, spec)
  write(repo, `.rig/changes/${slug}/plan.md`, '# Plan\n\n## Files\n- src/\n\n## Open questions\nnone\n')
}
const B9 = '# Spec\n\n## Behaviours\n- B1: the change works\n- B9: it also trims names\n\n## Open questions\nnone\n'
function shipStore(review = REVIEW, spec?: string, amendments?: string): void {
  chart()
  start('store', spec)
  const ap = sdlc(repo, ['approve', 'store'], HUMAN)
  assert.equal(ap.code, 0, ap.stderr)
  write(repo, 'test/a.test.js', '// B1 B9\n')
  write(repo, '.rig/changes/store/review.md', review)
  if (amendments) write(repo, '.rig/changes/store/amendments.md', amendments)
  verified(repo, 'store')
}
const AM = '## Amendments\n- A1 (B1): load also catches ValueError\n'
const prStore = () => sdlc(repo, ['pr', 'store', '--message', 'feat: store'])

test('review items go to the unbuilt intent that owns the file, a tagged one to its tag, the rest to the backlog', () => {
  shipStore()
  const r = prStore()
  assert.equal(r.code, 0, r.stderr)
  assert.match(rd(`${SP}/intents/ops.md`), /- C1 \(from store review\): src\/ops\.py:3: x/)
  assert.match(rd(`${SP}/intents/cli.md`), /- C1 \(from store review\): names should strip ANSI escapes/)
  const backlog = rd('.rig/product/backlog.md')
  assert.match(backlog, /^# Backlog/m)
  assert.match(backlog, /- \[open\] BL-1 \(store, sprint 1\): docs\/other\.md: y/)
  assert.match(backlog, /BL-2 \(store, sprint 1\): a future CLI that prints names/)
  for (const f of [`${SP}/intents/ops.md`, `${SP}/intents/cli.md`, '.rig/product/backlog.md', `${SP}/intents/store.md`]) assert.doesNotMatch(rd(f), /src\/store\.py:9/)
  assert.equal(gitIn(repo, 'status', '--porcelain'), '')
})

test('routing is idempotent across a follow-up pr and a carry run', () => {
  shipStore()
  assert.equal(prStore().code, 0)
  prStore()
  assert.equal(sdlc(repo, ['carry', 'store']).code, 0)
  assert.equal(rd(`${SP}/intents/ops.md`).match(/\(from store review\)/g)?.length, 1)
  assert.equal(rd(`${SP}/intents/cli.md`).match(/\(from store review\)/g)?.length, 1)
  assert.equal(rd('.rig/product/backlog.md').match(/BL-\d+/g)?.length, 2)
})

test('an uncharted change sends its items to the backlog and records no additions', () => {
  sdlc(repo, ['new', 'adhoc', '--type', 'feature'])
  write(repo, '.rig/changes/adhoc/spec.md', '# Spec\n\n## Behaviours\n- B9: new\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/adhoc/review.md', '## Deferred\n- src/ops.py:3: x\n- none\n')
  const r = sdlc(repo, ['carry', 'adhoc'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(rd('.rig/product/backlog.md'), /- \[open\] BL-1 \(adhoc, sprint -\): src\/ops\.py:3: x/)
  assert.doesNotMatch(rd('.rig/product/backlog.md'), /none/)
})

test('additions are recorded in the change\'s own intent', () => {
  shipStore(REVIEW, B9, AM)
  const r = prStore()
  assert.equal(r.code, 0, r.stderr)
  const t = rd(`${SP}/intents/store.md`)
  assert.match(t, /## Added during the change\n- B9: it also trims names\n- A1 \(B1\): load also catches ValueError/)
  assert.doesNotMatch(t.split('## Added during the change')[1] ?? '', /B1: the change works/)
  assert.match(t, /<!-- generated by sdlc pr; outside the chart approval -->\n## Added/)
})

test('the chart stays approved after carry and additions', () => {
  shipStore(REVIEW, B9)
  assert.equal(prStore().code, 0)
  assert.match(sdlc(repo, ['chart', 'report', '1']).stdout, /chart-1: approved/)
})

test('approval refuses a spec that leaves a carried item unsettled', () => {
  chart()
  fs.appendFileSync(path.join(repo, `${SP}/intents/ops.md`), '\n<!-- generated by sdlc pr; outside the chart approval -->\n## Carried in\n- C1 (from store review): src/ops.py:3: x\n')
  start('ops', '# Spec\n\n## Behaviours\n- B1: works\n\n## Open questions\nnone\n')
  const no = sdlc(repo, ['approve', 'ops', '--check'])
  assert.equal(no.code, 1)
  assert.match(no.stderr, /C1/)
  write(repo, '.rig/changes/ops/spec.md', '# Spec\n\n## Behaviours\n- B1: works\n\n## Out of scope\n- C1: the person said later\n\n## Open questions\nnone\n')
  const ok = sdlc(repo, ['approve', 'ops', '--check'])
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /ok/)
})

test('chart report counts carried, added and backlog items', () => {
  shipStore(REVIEW, B9, AM)
  assert.equal(prStore().code, 0)
  fs.writeFileSync(path.join(repo, '.rig/product/backlog.md'), rd('.rig/product/backlog.md').replace(/^- \[open\] BL-2.*\n/m, ''))
  assert.match(sdlc(repo, ['chart', 'report', '1']).stdout, /carried in 2, added during changes 2, backlog open 1/)
})
