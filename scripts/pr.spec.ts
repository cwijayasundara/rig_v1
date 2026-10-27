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

test('pr carries a sprint chart approval that is not yet committed, so CI sees the person\'s approval', () => {
  write(repo, '.rig/product/sprints/sprint-0/approval.json', '{"by":"a person"}\n')
  shipReady()
  assert.equal(pr().code, 0)
  assert.match(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.rig\/product\/sprints\/sprint-0\/approval\.json/)
})

test('a follow-up pr after the review commits review.md, with no other change', () => {
  shipReady()
  pr()
  write(repo, '.rig/changes/demo/review.md', '# Review: demo\n\nverdict: approve\n')
  const r = sdlc(repo, ['pr', 'demo', '--message', 'docs(review): demo'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.rig\/changes\/demo\/review\.md/)
  assert.equal(gitIn(repo, 'status', '--porcelain').trim(), '')
})

test('the review fixes run with the change active again, and the follow-up pr clears it; another active change stays', () => {
  shipReady()
  pr()
  sdlc(repo, ['activate', 'demo'])
  write(repo, '.rig/changes/demo/review.md', '# Review: demo\n')
  const active = (): unknown => JSON.parse(sdlc(repo, ['status', '--json']).stdout).active
  assert.equal(active(), 'demo')
  assert.equal(sdlc(repo, ['pr', 'demo', '--message', 'docs(review): demo']).code, 0)
  assert.equal(active(), null)
  sdlc(repo, ['new', 'other'])
  write(repo, '.rig/changes/demo/review.md', '# Review: demo\n\nedited\n')
  assert.equal(sdlc(repo, ['pr', 'demo', '--message', 'docs(review): demo']).code, 0)
  assert.equal(active(), 'other')
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

test('the PR body is built from the change files, kept apart from the pr.md state file, and ships in the commit', () => {
  shipReady()
  write(repo, '.rig/changes/demo/pr-outline.md', '## Change outline\n\nsrc only\n')
  assert.equal(pr().code, 0)
  const body = fs.readFileSync(path.join(repo, '.rig/changes/demo/pr-body.md'), 'utf8')
  assert.match(body, /## Why the change/)
  assert.match(body, /- B1: the change works/)
  assert.match(body, /## Change outline\n\nsrc only/)
  assert.match(body, /## Risk\n\nTier [0-2]\n\n[\s\S]*- no review\.md: the change was not reviewed/, 'S pr computes the tier from the files it ships since the verified base')
  assert.doesNotMatch(body, /always-human path: \.rig\/(?!sensors\.json|guides\/)/, 'local-only .rig/ files are not in the PR, so they never set its tier')
  assert.doesNotMatch(body, /^state:/m)
  assert.match(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.rig\/changes\/demo\/pr-body\.md/)
})

// shop_app 2026-10-27: an uncommitted /rig:upgrade rode into a feature commit.
test('pr leaves a dirty vendored harness file out of the commit and names it', () => {
  write(repo, '.claude/skills/rig-x/SKILL.md', 'upgraded\n')
  shipReady()
  const r = pr()
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /left out 1 vendored harness file.*uncommitted \/rig:upgrade/)
  assert.doesNotMatch(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.claude\/skills/)
  assert.match(gitIn(repo, 'status', '--porcelain', '-uall'), /\.claude\/skills\/rig-x/)
})

// shop_app 2026-10-27: the AC -> test table was kept by hand and drifted.
test('pr refuses when an intent AC has no test naming it, and ships once one does', () => {
  write(repo, '.rig/product/sprints/sprint-1/intents/demo.md', '---\nslug: demo\nsprint: 1\n---\n# Demo\n\n## Behaviours\n- B1 (FR-1, AC-1.2): the change works\n\n## Open questions\nnone\n')
  shipReady()
  const r = pr()
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /not shipping: .*acceptance criteria[\s\S]*B1 AC-1\.2/)
  // Review 2026-10-27: a longer id never stands in for a shorter one.
  write(repo, 'test/ac.test.js', "test('test_ac_1_20_works', () => {}); test('AC-1.21', () => {})\n")
  verified(repo, 'demo')
  assert.match(pr().stderr, /B1 AC-1\.2/, 'ac_1_20 and AC-1.21 are not tests of AC-1.2')
  write(repo, 'test/ac.test.js', "test('test_ac_1_2_works', () => {})\n")
  verified(repo, 'demo')
  const ok = pr()
  assert.equal(ok.code, 0, ok.stderr)
})

// shop_app cart-storage 2026-10-27: a security fix changed what load catches, and spec.md B7 and the PR body never said so.
// amendments.md sits beside the hashed spec.md and plan.md, so recording one keeps the approval valid.
test('pr refuses a review fix wave with no amendments.md, and ships once it records the amendment or says none', () => {
  shipReady()
  write(repo, '.rig/changes/demo/review.md', 'verdict: pass\n## Findings\n- [severity: high] [category: correctness] src/a.js:1: load raises on a deep file. Fails when: nesting is 100000 deep. → fix → fixed (confirmed)\n')
  verified(repo, 'demo')
  assert.match(pr().stderr, /amendments\.md/)
  write(repo, '.rig/changes/demo/amendments.md', '## Amendments\n- A1 (B1): load also rejects a file nested too deeply, as a StorageError. Found by the security review after approval.\n')
  const r = pr()
  assert.equal(r.code, 0, r.stderr)
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/pr-body.md'), 'utf8'), /## Amendments after approval\n\n- A1 \(B1\): load also rejects/)
})

test('pr needs no amendments.md when the review fixed nothing', () => {
  shipReady()
  write(repo, '.rig/changes/demo/review.md', 'verdict: pass\n## Findings\n\n## Deferred\n- none\n')
  verified(repo, 'demo')
  assert.equal(pr().code, 0)
})

// shop_app cart-storage 2026-10-27: pr-body.md embeds pr-outline.md, so shipping both stored the text twice; the regenerated sprint plan stayed dirty after the merge.
test('pr ships pr-body.md but not the pr-outline.md it embeds, and carries the sprint plan the build refreshed', () => {
  shipReady()
  write(repo, '.rig/changes/demo/pr-outline.md', '## Special things to note\n- one\n')
  write(repo, '.rig/product/sprints/sprint-1/plan.md', '# plan\n')
  verified(repo, 'demo')
  const r = pr()
  assert.equal(r.code, 0, r.stderr)
  const shipped = gitIn(repo, 'show', '--name-only', '--format=', 'HEAD').split('\n')
  assert.ok(shipped.includes('.rig/changes/demo/pr-body.md'))
  assert.ok(!shipped.includes('.rig/changes/demo/pr-outline.md'))
  assert.ok(shipped.includes('.rig/product/sprints/sprint-1/plan.md'))
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/pr-body.md'), 'utf8'), /Special things to note/)
})
