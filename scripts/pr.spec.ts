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

test('a second pr with nothing new to commit names the existing pr.md', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  pr()
  assert.match(pr().stdout, /already has a PR/)
})

// Final review fixes.
const shipReady = () => { approvedChange(repo, 'demo'); write(repo, 'test/a.test.js', '// B1\n'); verified(repo, 'demo') }

test('pr refuses when a frozen contract under .rig changed after verify', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['.rig/contracts/**'] } }))
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  shipReady()
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = pr()
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /frozen/)
})

test('pr commits only this change\'s folder: another change in progress stays out', () => {
  sdlc(repo, ['new', 'other'])
  shipReady()
  assert.equal(pr().code, 0)
  assert.match(gitIn(repo, 'status', '--porcelain'), /\.rig\/changes\/other\//)
  assert.doesNotMatch(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.rig\/changes\/other\//)
})

test('pr refuses to branch off another feature branch', () => {
  gitIn(repo, 'checkout', '-qb', 'sdlc/older')
  shipReady()
  const r = pr()
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /HEAD is sdlc\/older/)
})

test('a second pr after a fix and a fresh verify commits the follow-up on the same branch', () => {
  approvedChange(repo, 'demo', 'chore') // a chore: no red-proof once the branch has a base to diff against
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  pr()
  write(repo, 'src/fix.js', 'export const fix = 1\n')
  verified(repo, 'demo')
  const r = sdlc(repo, ['pr', 'demo', '--message', 'fix: review findings'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(gitIn(repo, 'log', '-1', '--format=%s'), /fix: review findings/)
  assert.equal(gitIn(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'sdlc/demo')
})

test('a failed push on the first pr leaves no pr.md or commit, so a rerun still opens the PR', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  gitIn(repo, 'remote', 'add', 'origin', path.join(repo, 'no-such-remote.git'))
  assert.match(pr().stderr, /git push failed/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/demo/pr.md')), false)
  assert.equal(gitIn(repo, 'log', '--format=%s', '-1'), 'init')
  const bare = fs.mkdtempSync(path.join(repo, '..', 'rig-bare-'))
  gitIn(bare, 'init', '-q', '--bare')
  gitIn(repo, 'remote', 'set-url', 'origin', bare)
  assert.match(pr().stderr, /pushed sdlc\/demo but gh pr create|gh pr create/)
})
