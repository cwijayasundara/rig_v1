// plan-check (W2 G1): the deterministic stand-in for the plan approval when gates.plan is false.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn, registry } from './testkit.ts'

let repo: string
const INTENT = '.rig/product/sprints/sprint-1/intents/demo.md'
const SPEC = '# Spec\n\n## Behaviours\n- B1: the change works (FR-1)\n\n## Open questions\nnone\n'
const PLAN = '# Plan\n\n## Files\n- src/a.js\n\n## Open questions\nnone\n'
const setup = (o: { plan?: boolean; intent?: string | null; spec?: string; plan_?: string } = {}) => {
  write(repo, '.rig/sensors.json', registry({ contracts: { files: ['.rig/contracts/**'] }, extra: { gates: { plan: o.plan ?? false } } }))
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\n')
  if (o.intent !== null) write(repo, INTENT, o.intent ?? '---\nscope: [src]\n---\n# Demo\n\nFR-1 the thing\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'cfg')
  sdlc(repo, ['new', 'demo'])
  write(repo, '.rig/changes/demo/spec.md', o.spec ?? SPEC)
  write(repo, '.rig/changes/demo/plan.md', o.plan_ ?? PLAN)
}
const planCheck = (...a: string[]) => sdlc(repo, ['plan-check', 'demo', ...a])
const branched = () => { const r = planCheck('--commit'); assert.equal(r.code, 0, r.stdout + r.stderr); return r }
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'rig') })

test('contract file edited on the branch blocks', () => {
  setup(); branched()
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\npaths: {}\n'); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'edit')
  const r = planCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /contract \.rig\/contracts\/api\.yaml changed on a change branch: a contract change goes back to the chart/)
})

test('contract file deleted blocks', () => {
  setup(); branched()
  gitIn(repo, 'rm', '-q', '.rig/contracts/api.yaml'); gitIn(repo, 'commit', '-qm', 'rm')
  assert.match(planCheck().stdout, /contract \.rig\/contracts\/api\.yaml changed/)
})

test('contract file renamed blocks, naming both paths', () => {
  setup({}); branched()
  gitIn(repo, 'mv', '.rig/contracts/api.yaml', 'docs-api.yaml'); gitIn(repo, 'commit', '-qm', 'mv')
  assert.match(planCheck().stdout, /contract \.rig\/contracts\/api\.yaml changed/)
})

test('a contract edit in the working tree blocks locally', () => {
  setup(); branched()
  write(repo, '.rig/contracts/api.yaml', 'changed\n')
  assert.match(planCheck().stdout, /contract \.rig\/contracts\/api\.yaml changed/)
})

test('plan file outside scope blocks with "scope change"', () => {
  setup({ plan_: '# Plan\n\n## Files\n- lib/other.js\n\n## Open questions\nnone\n' })
  const r = planCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /scope change: lib\/other\.js is outside intent demo; it goes back to the chart/)
})

test('spec cites FR-9 that the intent does not: blocks', () => {
  setup({ spec: SPEC.replace('(FR-1)', '(FR-1, FR-9)') })
  const r = planCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /scope change: FR-9 is outside intent demo/)
  assert.doesNotMatch(r.stdout, /scope change: FR-1 /)
})

test('uncharted change: one warn, contracts still checked', () => {
  setup({ intent: null }); branched()
  const ok = planCheck()
  assert.equal(ok.code, 0, ok.stdout)
  assert.equal(ok.stdout.match(/not charted: scope and ledger checks skipped/g)?.length, 1)
  write(repo, '.rig/contracts/api.yaml', 'changed\n')
  const bad = planCheck()
  assert.equal(bad.code, 1)
  assert.match(bad.stdout, /not charted/)
  assert.match(bad.stdout, /contract \.rig\/contracts\/api\.yaml changed/)
})

test('source commit before the plan commit blocks, naming the sha', () => {
  setup(); gitIn(repo, 'checkout', '-q', '-b', 'sdlc/demo')
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  const sha = gitIn(repo, 'rev-parse', '--short=7', 'HEAD')
  const r = planCheck()
  assert.equal(r.code, 1)
  assert.ok(r.stdout.includes(`source committed before the plan (commit ${sha}): run S plan-check demo --commit before building`), r.stdout)
})

test('--commit then a source commit passes', () => {
  setup()
  const r = branched()
  assert.match(r.stdout, /^[0-9a-f]{7}$/m)
  assert.equal(gitIn(repo, 'rev-parse', '--abbrev-ref', 'HEAD'), 'sdlc/demo')
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s'), 'plan(demo): spec and plan')
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  const after = planCheck()
  assert.equal(after.code, 0, after.stdout)
})

const changesAfter = () => spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `const m = await import(${JSON.stringify(path.resolve(import.meta.dirname, 'plancheck.ts'))}); console.log(JSON.stringify(m.planChangesAfterBuild('demo', 'main')))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
test('a later plan.md edit is listed by planChangesAfterBuild', () => {
  setup(); branched()
  assert.deepEqual(JSON.parse(changesAfter().stdout), [])
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  write(repo, '.rig/changes/demo/plan.md', PLAN + '\nmore\n'); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'replan')
  const sha = gitIn(repo, 'rev-parse', '--short=7', 'HEAD')
  assert.deepEqual(JSON.parse(changesAfter().stdout), [`- ${sha} replan`])
})

test('open question in spec blocks via approvalRefusal', () => {
  setup({ spec: SPEC.replace('none', 'which database?') })
  const r = planCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /resolve the open question/)
})

const ciCheck = () => sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--slug', 'demo'])
const badBranch = () => {
  setup(); gitIn(repo, 'checkout', '-q', '-b', 'sdlc/demo')
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  write(repo, '.rig/changes/demo/spec.md', SPEC); gitIn(repo, 'add', '-f', '.rig/changes/demo'); gitIn(repo, 'commit', '-qm', 'plan')
}

test('no merge-base at CI blocks', async () => {
  setup(); branched()
  const { planCheck: pc } = await import('./plancheck.ts')
  const found = pc('demo', { base: null, ci: true })
  assert.ok(found.some(f => f.severity === 'block' && /no merge-base: fetch with fetch-depth: 0/.test(f.message)))
  assert.ok(pc('demo', { base: null, ci: false }).every(f => f.severity !== 'block' || !/merge-base/.test(f.message)))
})

test('S pr refuses on a plan-check block when gates.plan is false', () => {
  setup(); gitIn(repo, 'checkout', '-q', '-b', 'sdlc/demo')
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  const r = sdlc(repo, ['pr', 'demo', '--message', 'feat: demo'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /plan-check blocks demo/)
  assert.match(r.stderr, /source committed before the plan/)
})

test('check --at ci with gates.plan false reports plan-check', () => {
  badBranch()
  const r = ciCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[plan-check\]/)
  assert.match(r.stdout, /source committed before the plan/)
})

test('gates.plan true: planCheck is not run by pr or ci', () => {
  setup({ plan: true }); gitIn(repo, 'checkout', '-q', '-b', 'sdlc/demo')
  write(repo, 'src/a.js', 'export const a = 1\n'); gitIn(repo, 'add', 'src'); gitIn(repo, 'commit', '-qm', 'code')
  const r = sdlc(repo, ['pr', 'demo', '--message', 'feat: demo'])
  assert.match(r.stderr, /plan is not approved/)
  assert.doesNotMatch(r.stderr, /plan-check/)
  assert.doesNotMatch(ciCheck().stdout, /plan-check/)
})
