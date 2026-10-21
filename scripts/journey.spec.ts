// The journey view: one test per state of the table in docs/superpowers/specs/2026-10-18-journey-dashboard-design.md.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { makeRepo, write, sdlc } from './testkit.ts'

type J = { agents: { agent: string; model: string; at: string }[]; initialised: boolean; kind: string; show: string[]; sprint: number | null; outer: { id: string; state: string; command: string; by: string; detail?: string }[]; inner: { slug: string; steps: { id: string; state: string; command: string; by: string; auto?: true }[] } | null; next: { command: string; by: string }; ready: string[]; sensors?: unknown }
let repo: string
const view = (): J => JSON.parse(sdlc(repo, ['status', '--journey', '--json']).stdout) as J
const states = (j: J): string => j.outer.map(s => `${s.id}:${s.state}`).join(' ')
const PRD = '---\nsprint: 0\nengineers: 1\n---\n# Sprint 0\n\n### FR-0: thing\n\n## Open questions\nnone\n'
const INTENT = (): string => '---\nsprint: 0\nprd: [FR-0]\ndepends: []\nestimate_days: 1\nkind: internal\n---\n# i\n\n## Interfaces\nnone\n\n## Behaviours\n- B1 (FR-0): works\n\n## Open questions\nnone\n'
const ARCH = '# Architecture\n\n## Concerns\nnone\n\n## Open questions\nnone\n'
const CASES = '| ID | Req | Intent | B | Level | Data | Expected |\n| TC-1 | FR-0 | walking-skeleton | B1 | unit | - | ok |\n'

beforeEach(() => {
  repo = makeRepo()
  write(repo, '.rig/sensors.json', JSON.stringify({ stack: 'x', paths: { tests: ['**/*.test.ts'] }, sensors: [{ id: 'unit', cmd: 'true', cadence: 'commit', blocks: true, guide: 'run the tests' }] }))
})

test('journey: an empty repo shows the outer loop at init', () => {
  fs.rmSync(`${repo}/.rig`, { recursive: true })
  const r = sdlc(repo, ['status', '--journey', '--json'])
  assert.deepEqual(JSON.parse(r.stdout), { initialised: false })
})

test('journey: initialised, no PRD → the person writes sprint-0.md', () => {
  const j = view()
  assert.equal(j.kind, 'greenfield')
  assert.deepEqual(j.show, ['outer', 'inner'])
  assert.match(states(j), /^init:done prd:current chart:todo/)
  assert.match(j.next.command, /^add the PRD at \.rig\/product\/prd\/sprint-0\.md, then \/rig:chart 0$/)
  assert.equal(j.next.by, 'person')
})

test('journey: PRD but no intents → chart', () => {
  write(repo, '.rig/product/prd/sprint-0.md', PRD)
  const j = view()
  assert.match(states(j), /prd:done chart:current/)
  assert.match(j.next.command, /chart 0$/)
  assert.equal(j.next.by, 'model')
})

test('journey: intents but no test plan → testplan', () => {
  write(repo, '.rig/product/prd/sprint-0.md', PRD)
  write(repo, '.rig/product/intents/walking-skeleton.md', INTENT())
  const j = view()
  assert.match(states(j), /chart:done testplan:current/)
  assert.equal(j.outer.find(s => s.id === 'chart')?.detail, '1 intents')
  assert.match(j.next.command, /testplan 0$/)
})

test('journey: test plan present, chart unapproved → a person approves chart-0 (a gate)', () => {
  write(repo, '.rig/product/prd/sprint-0.md', PRD)
  write(repo, '.rig/product/intents/walking-skeleton.md', INTENT())
  write(repo, '.rig/product/testplan/cases.md', CASES)
  write(repo, '.rig/product/architecture.md', ARCH)
  const j = view()
  assert.match(states(j), /testplan:done approve:gate build:todo/)
  assert.match(j.next.command, /approve chart-0$/)
  assert.equal(j.next.by, 'person')
  assert.deepEqual(j.ready, [])
})

test('journey: approved chart → the first ready intent, and brownfield shows the outer loop only', () => {
  write(repo, '.rig/product/prd/sprint-0.md', PRD)
  write(repo, '.rig/product/intents/walking-skeleton.md', INTENT())
  write(repo, '.rig/product/testplan/cases.md', CASES)
  write(repo, '.rig/product/architecture.md', ARCH)
  assert.equal(sdlc(repo, ['approve', 'chart-0'], { env: { SDLC_HUMAN: '1' } }).code, 0)
  let j = view()
  assert.match(states(j), /approve:done build:current/)
  assert.equal(j.outer.find(s => s.id === 'build')?.detail, '0/1 shipped')
  assert.deepEqual(j.ready, ['walking-skeleton'])
  assert.match(j.next.command, /start \.rig\/product\/intents\/walking-skeleton\.md$/)
  write(repo, '.rig/wiki.json', '{}')
  j = view()
  assert.equal(j.kind, 'brownfield')
  assert.deepEqual(j.show, ['outer'])
})

test('journey: an active change takes over the next command and fills the inner loop', () => {
  assert.equal(sdlc(repo, ['new', 'add-login', '--type', 'feature']).code, 0)
  const j = view()
  assert.equal(j.inner?.slug, 'add-login')
  assert.deepEqual(j.inner?.steps.slice(0, 3).map(s => `${s.id}:${s.state}`), ['start:current', 'plan:todo', 'approve:todo'])
  assert.match(j.next.command, /start add-login$/)
  assert.ok('sensors' in j)
})

test('journey: every step carries the full command to run, and the text form shows them', () => {
  const j = view()
  assert.deepEqual(j.outer.map(x => x.command), ['/rig:init', 'add PRD → .rig/product/prd/sprint-0.md', '/rig:chart 0', '/rig:testplan 0', '/rig:approve chart-0', '/rig:start <intent>'])
  assert.equal(sdlc(repo, ['new', 'add-login', '--type', 'feature']).code, 0)
  assert.deepEqual(view().inner?.steps.map(x => x.command), ['/rig:start add-login', '/rig:plan add-login', '/rig:approve add-login', '/rig:build add-login', '/rig:test add-login', '/rig:pr add-login', 'review and its fixes (/code-review)', 'review and merge the PR'])
  assert.match(sdlc(repo, ['status', '--journey']).stdout, /✓ \/rig:init {2}● add PRD → \.rig\/product\/prd\/sprint-0\.md {2}○ \/rig:chart 0/)
})

test('journey: build, test, PR and the advisory review are one unattended run; only approve and merge are a person', () => {
  sdlc(repo, ['new', 'add-login', '--type', 'feature'])
  const steps = view().inner?.steps ?? []
  assert.deepEqual(steps.filter(x => x.auto).map(x => x.id), ['build', 'test', 'pr', 'review'])
  assert.deepEqual(steps.filter(x => x.by === 'person').map(x => x.id), ['approve', 'merge'])
  assert.equal(view().outer.find(x => x.id === 'prd')?.by, 'person')
  assert.ok(view().outer.every(x => !('auto' in x)), 'the outer rail has no unattended run')
})

test('journey: the text form is one line per loop plus the next command', () => {
  const t = sdlc(repo, ['status', '--journey']).stdout
  assert.match(t, /^sprint 0 {2}✓ \/rig:init/m)
  assert.match(t, /^next: /m)
})

test('journey: agents come from model.json, empty without it', () => {
  assert.deepEqual(view().agents, [])
  write(repo, '.rig/state/model.json', JSON.stringify({ sessions: {}, launches: [{ session: 's', id: '1', agent: 'rig-architect', requested: null, resolved: 'claude-sonnet-5-5', at: 'now' }] }))
  assert.deepEqual(view().agents, [{ agent: 'rig-architect', model: 'claude-sonnet-5-5', at: 'now' }])
})
