// The slim lifecycle (behavioural harness spec 2026-10-16 §8): a change is a folder and its status is which files it has.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn, hook } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const LIB = path.resolve(import.meta.dirname, 'lifecycle.ts')
// Runs `code` with `L` bound to lifecycle.ts inside the test repo and returns its JSON result.
const call = (code: string): unknown => {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as L from ${JSON.stringify(LIB)}; const v = await (async () => { ${code} })(); console.log(JSON.stringify(v ?? null))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').at(-1) ?? 'null')
}
const SPEC = '# Spec\n\n## Behaviours\n- B1: lists orders\n\n## Open questions\nnone\n'
const PLAN = '# Plan\n\n## Files\n- src/a.js\n\n## Open questions\nnone\n'
const GATED = '{ plan: true }'

test('newChange writes intent.md with the type and makes the change active', () => {
  assert.equal(call(`L.newChange('demo', 'bugfix', 'Fix it'); return L.activeSlug()`), 'demo')
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/intent.md'), 'utf8'), /^type: bugfix$/m)
  assert.equal(call(`return L.changeType('demo')`), 'bugfix')
})

test('older types map to the four the proof rules need; anything else is a feature', () => {
  assert.deepEqual(call(`return ['greenfield', 'incident', 'migration', 'spike', 'refactor', 'nonsense', undefined].map(t => L.toType(t))`),
    ['feature', 'bugfix', 'chore', 'chore', 'refactor', 'feature', 'feature'])
})

test('status walks spec, plan, approve, build, pr, review as the files appear', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  const st = (): unknown => call(`return L.status('demo', ${GATED}, 'tree-1')`)
  assert.equal(st(), 'spec')
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  assert.equal(st(), 'plan')
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.equal(st(), 'approve')
  call(`L.writeApproval('demo', 'Ana')`)
  assert.equal(st(), 'build')
  call(`L.writeVerify('demo', { at: 'x', tree: 'tree-1', base: null, pass: true, blocks: [] })`)
  assert.equal(st(), 'pr')
  write(repo, '.rig/changes/demo/pr.md', '---\nstate: local-only\n---\nfeat: demo\n')
  assert.equal(st(), 'review')
})

test('with the plan gate off, a planned change goes straight to build', () => {
  call(`L.newChange('demo', 'chore', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.equal(call(`return L.status('demo', { plan: false }, null)`), 'build')
})

test('an approval goes stale when spec.md or plan.md changes, trailing whitespace aside', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  call(`L.writeApproval('demo', 'Ana')`)
  assert.equal(call(`return L.approvalState('demo')`), 'approved')
  write(repo, '.rig/changes/demo/plan.md', PLAN + '\n\n')
  assert.equal(call(`return L.approvalState('demo')`), 'approved')
  write(repo, '.rig/changes/demo/plan.md', PLAN.replace('src/a.js', 'src/b.js'))
  assert.equal(call(`return L.approvalState('demo')`), 'stale')
})

test('a charted change\'s requirements.md is approved with it when present and never required', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.equal(call(`return L.approvalRefusal('demo')`), null)
  write(repo, '.rig/changes/demo/requirements.md', '- G-1 [rule] prd.md:9 "Ids start at 1."\n')
  call(`L.writeApproval('demo', 'Ana')`)
  assert.equal(call(`return L.approvalState('demo')`), 'approved')
  write(repo, '.rig/changes/demo/requirements.md', '- G-1 [rule] prd.md:9 "Ids start at 2."\n')
  assert.equal(call(`return L.approvalState('demo')`), 'stale')
})

test('approvalRefusal names missing files and open questions', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  assert.match(String(call(`return L.approvalRefusal('demo')`)), /no spec\.md or plan\.md/)
  write(repo, '.rig/changes/demo/spec.md', SPEC.replace('## Open questions\nnone', '## Open questions\n- Which currency?'))
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.match(String(call(`return L.approvalRefusal('demo')`)), /spec\.md: Which currency\?/)
})

test('the approval freezes contract files per file, and records {} when there are none', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.deepEqual((call(`return L.writeApproval('demo', 'Ana')`) as { contracts: object }).contracts, {})
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'] } }))
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  assert.deepEqual(Object.keys((call(`return L.writeApproval('demo', 'Ana')`) as { contracts: object }).contracts), ['api/openapi.yaml'])
})

test('verifyFresh needs a pass on the same tree', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  call(`L.writeVerify('demo', { at: 'x', tree: 't1', base: null, pass: true, blocks: [] })`)
  assert.deepEqual(call(`return [L.verifyFresh('demo', 't1'), L.verifyFresh('demo', 't2'), L.verifyFresh('demo', null)]`), [true, false, false])
  call(`L.writeVerify('demo', { at: 'x', tree: 't1', base: null, pass: false, blocks: ['unit: failed'] })`)
  assert.equal(call(`return L.verifyFresh('demo', 't1')`), false)
})

test('a change is shipped once its pr.md is on the trunk', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/pr.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'ship')
  assert.equal(call(`return L.status('demo', ${GATED}, null)`), 'shipped')
})

test('activeSlug ignores a slug whose folder is gone; setActive(null) clears it', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  fs.rmSync(path.join(repo, '.rig/changes/demo'), { recursive: true })
  assert.equal(call(`return L.activeSlug()`), null)
  call(`L.newChange('two', 'feature', 'Two'); L.setActive(null)`)
  assert.equal(call(`return L.activeSlug()`), null)
})

// The CLI on the slim lifecycle.
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const planned = (slug = 'demo') => {
  sdlc(repo, ['new', slug, '--type', 'feature'])
  write(repo, `.rig/changes/${slug}/spec.md`, SPEC)
  write(repo, `.rig/changes/${slug}/plan.md`, PLAN)
}
const statusOf = (slug = 'demo') => (JSON.parse(sdlc(repo, ['status', '--json']).stdout) as { changes: { slug: string; status: string }[] }).changes.find(c => c.slug === slug)?.status

test('cli: new, approve, verify and status walk one change; verify.json written under .rig stays fresh', () => {
  planned()
  assert.equal(statusOf(), 'approve')
  assert.notEqual(sdlc(repo, ['approve', 'demo']).code, 0, 'approve is human-only')
  assert.equal(sdlc(repo, ['approve', 'demo'], HUMAN).code, 0)
  assert.ok(fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
  assert.equal(statusOf(), 'build')
  write(repo, 'test/a.test.js', "// B1 lists orders\n")
  const v = sdlc(repo, ['verify', 'demo'])
  assert.equal(v.code, 0, v.stdout + v.stderr)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/verify.json'), 'utf8')).pass, true)
  assert.equal(statusOf(), 'pr', 'writing verify.json under .rig does not make it stale')
})

test('cli: verify blocks a planned change that is not approved, with a plan-gate finding', () => {
  planned()
  const v = sdlc(repo, ['verify', 'demo'])
  assert.equal(v.code, 1)
  assert.match(v.stdout, /\[plan-gate\]/)
})

test('cli: a typed /rig:approve <slug> approves that change once; a change that is not ready is refused with the reason', () => {
  sdlc(repo, ['new', 'early', '--type', 'feature'])
  const early = JSON.parse(hook(repo, 'prompt-submit', { prompt: '/rig:approve early' }).stdout).hookSpecificOutput.additionalContext as string
  assert.match(early, /no spec\.md or plan\.md/)
  planned()
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo' })
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo' })
  const a = JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8'))
  assert.ok(a.by)
  assert.match(sdlc(repo, ['approve', 'demo'], HUMAN).stdout, /already approved/)
})

test('cli: a change left by an older rig reads from its files without crashing', () => {
  write(repo, '.rig/changes/old/intent.md', '---\nslug: old\ntype: greenfield\ntier: L\n---\n# Old\n')
  write(repo, '.rig/changes/old/ratchet.json', '{"tier":"L","nodes":{}}')
  write(repo, '.rig/changes/old/design.md', '# Design\n')
  write(repo, '.rig/approvals.jsonl', '{"slug":"old","stage":"design","by":"x","at":"t","digest":"d"}\n')
  const s = JSON.parse(sdlc(repo, ['status', '--json']).stdout) as { changes: { slug: string; type: string; status: string }[] }
  assert.deepEqual(s.changes.find(c => c.slug === 'old'), { slug: 'old', type: 'feature', status: 'spec', next: '/rig:start old' })
  assert.match(sdlc(repo, ['approve', 'old'], HUMAN).stderr, /no spec\.md or plan\.md/)
})

test('cli: re-approving after every contract file is gone lifts the old freeze', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'] } }))
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  planned()
  sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8')).contracts), ['api/openapi.yaml'])
  fs.rmSync(path.join(repo, 'api/openapi.yaml'))
  write(repo, '.rig/changes/demo/plan.md', PLAN + '\n## Decisions\n- dropped the API\n')
  sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8')).contracts, {})
  gitIn(repo, 'add', '-A')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'commit']).stdout, /\[harness-tamper\][^\n]*openapi/)
})

test('cli: CI treats an approval.json the PR adds as a human row that needs independent approval', () => {
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'feature')
  planned()
  sdlc(repo, ['approve', 'demo'], HUMAN)
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'change')
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main'])
  assert.match(r.stdout, /approval demo by /)
  assert.match(r.stdout, /\[human-approval\]/)
})

test('cli: work with no change gets sensors only: Stop opens no ad-hoc change', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  hook(repo, 'stop', { session_id: 's1' })
  assert.deepEqual(fs.existsSync(path.join(repo, '.rig/changes')) ? fs.readdirSync(path.join(repo, '.rig/changes')) : [], [])
})

test('cli: the removed lifecycle commands are gone', () => {
  const usage = /usage: sdlc\.ts <([^>]+)>/.exec(sdlc(repo, []).stderr)?.[1]?.split('|') ?? []
  for (const c of ['next', 'scope-drift', 'pr-checks', 'skill', 'verify-report', 'log-usage', 'evals', 'inbox', 'spend', 'quality', 'shards', 'preflight', 'ratchet', 'impact-status']) assert.ok(!usage.includes(c), c)
  for (const c of ['new', 'activate', 'status', 'approve', 'verify', 'pr', 'run', 'waive', 'check', 'sync']) assert.ok(usage.includes(c), c)
})

test('outsideRadius: equal path and child-of-directory are inside; a sibling and a plan directory wider than the radius are outside', () => {
  assert.deepEqual(call(`return L.outsideRadius(['src/cart/models.py', 'tests/test_add.py'], ['src/cart/models.py', 'tests/'])`), [])
  assert.deepEqual(call(`return L.outsideRadius(['src/cart/cli.py'], ['src/cart/models.py'])`), ['src/cart/cli.py'])
  assert.deepEqual(call(`return L.outsideRadius(['src/cart/'], ['src/cart/models.py'])`), ['src/cart/'])
  assert.deepEqual(call(`return L.outsideRadius(['src/cart/'], ['src/'])`), [])
})

test('outsideRadius: a bare directory, a glob, ./ and a trailing colon match; src/a does not cover src/ab', () => {
  assert.deepEqual(call(`return L.outsideRadius(['src/a/x.ts', './src/b/y.ts', 'src/c/z.ts'], ['src/a', 'src/b/:', 'src/c/*.ts'])`), [])
  assert.deepEqual(call(`return L.outsideRadius(['src/ab/x.ts'], ['src/a'])`), ['src/ab/x.ts'])
})

test('approve refuses a plan that touches a file outside spec.md ## Blast radius, and names it', () => {
  planned()
  write(repo, '.rig/changes/demo/spec.md', `${SPEC}\n## Blast radius\n- src/a.ts\n`)
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- src/b.ts\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.equal(r.code, 1)
  assert.match(r.stderr, /plan touches a file outside the blast radius: src\/b\.ts/)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
})

test('approve --check reports the refusal without approving', () => {
  planned()
  write(repo, '.rig/changes/demo/spec.md', `${SPEC}\n## Blast radius\n- src/a.ts\n`)
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- src/b.ts\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo', '--check'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /outside the blast radius: src\/b\.ts/)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- src/a.ts\n\n## Open questions\nnone\n')
  const ok = sdlc(repo, ['approve', 'demo', '--check'])
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /^ok: demo can be approved/)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
})

// shop_app cart-core: start/SKILL.md asks for the radius "one per line", so it came as bare lines and read as empty,
// which put every plan file outside it; a prose bullet ("No existing test ...") and a "Modify:" label read as paths too.
test('approve reads a bare-line ## Blast radius and skips labels and prose bullets in ## Files', () => {
  planned()
  write(repo, '.rig/changes/demo/spec.md', `${SPEC}\n## Blast radius\nsrc/cart/errors.py\nsrc/cart/models.py\ntests/\n\n## Out of scope\n- \`src/cart/cli.py\`\n`)
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- `src/cart/errors.py` (modify: three subclasses)\n- Create: `src/cart/models.py`\n- tests/test_models.py (create)\n- No existing test is made wrong; the smoke test is untouched.\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.equal(r.code, 0, r.stderr)
})

test('a spec.md with no ## Blast radius heading is not checked', () => {
  planned()
  const r = sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.equal(r.code, 0, r.stderr)
})

// shop_app cart-storage 2026-10-27: the code and its red/green runs came at 12:21-12:25, the approval at 12:28.
test('post-edit blocks an edit to a planned file until a person approves the plan, then lets it through', () => {
  planned()
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  const early = hook(repo, 'post-edit', { tool_input: { file_path: path.join(repo, 'src/a.js') } })
  assert.equal(early.code, 2)
  assert.match(early.stderr, /\[?plan-gate\]?.*src\/a\.js.*before.*approv/is)
  write(repo, 'notes.txt', 'not in the plan\n')
  assert.equal(hook(repo, 'post-edit', { tool_input: { file_path: path.join(repo, 'notes.txt') } }).code, 0, 'a file the plan does not list is not this gate')
  sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.equal(hook(repo, 'post-edit', { tool_input: { file_path: path.join(repo, 'src/a.js') } }).code, 0)
})

test('post-edit does not block a planned file when the plan gate is off', () => {
  planned()
  write(repo, '.rig/sensors.json', JSON.stringify({ gates: { plan: false } }))
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  assert.equal(hook(repo, 'post-edit', { tool_input: { file_path: path.join(repo, 'src/a.js') } }).code, 0)
})

test('the stop check honours gates.plan: off lets a planned file through, on blocks it', () => {
  planned()
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  const stop = () => sdlc(repo, ['check', '--at', 'stop', '--slug', 'demo'])
  assert.match(stop().stdout, /plan-gate/)
  write(repo, '.rig/sensors.json', JSON.stringify({ gates: { plan: false } }))
  assert.doesNotMatch(stop().stdout, /plan-gate/)
})
