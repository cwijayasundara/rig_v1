// The slim lifecycle (behavioural harness spec 2026-10-16 §8): a change is a folder and its status is which files it has.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

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
