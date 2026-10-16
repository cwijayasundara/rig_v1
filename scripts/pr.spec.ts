// pr (spec 2026-10-16 §8): refuses without an approved plan and a fresh verify.json; commits on sdlc/<slug>.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, approvedChange, verified } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] })) })
const pr = () => sdlc(repo, ['pr', 'demo', '--message', 'feat: demo'])

test('pr refuses a change whose plan is not approved', () => {
  sdlc(repo, ['new', 'demo'])
  assert.match(pr().stderr, /plan is not approved/)
})

test('pr refuses without a fresh passing verify.json, and after the tree changes', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  assert.match(pr().stderr, /verify\.json is missing/)
  verified(repo, 'demo')
  write(repo, 'src/late.js', 'export const late = 1\n')
  assert.match(pr().stderr, /from another tree/)
})

test('with no remote, pr commits on sdlc/<slug>, writes pr.md as local-only and clears the active change', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  const r = pr()
  assert.equal(r.code, 0, r.stderr)
  assert.equal(gitIn(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'sdlc/demo')
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/pr.md'), 'utf8'), /state: local-only/)
  assert.equal(gitIn(repo, 'status', '--porcelain').trim(), '')
  assert.match(sdlc(repo, ['status']).stdout, /demo\s+feature\s+review/)
})

test('a second pr is a no-op that names the existing pr.md', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  pr()
  assert.match(pr().stdout, /already has a PR/)
})
