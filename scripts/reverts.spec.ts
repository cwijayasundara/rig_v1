// Shipped changes, their tier and whether they were reverted (proposal 2026-10-27 C1, C2, Decision 3): from git alone, plus revert-labelled PR numbers in CI.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { changeHistory, breaker, type ChangeRow } from './reverts.ts'

function repo(): { dir: string; git: (...a: string[]) => string; ship: (slug: string, body: string | null, subject?: string) => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-reverts-'))
  const git = (...a: string[]): string => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'e@x'); git('config', 'user.name', 't')
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n'); git('add', '-A'); git('commit', '-qm', 'init')
  const ship = (slug: string, body: string | null, subject = `ship ${slug}`): string => {
    const d = path.join(dir, '.rig', 'changes', slug)
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'pr.md'), '---\nstate: open\n---\n')
    if (body !== null) fs.writeFileSync(path.join(d, 'pr-body.md'), body)
    fs.writeFileSync(path.join(dir, `${slug}.txt`), slug)
    git('add', '-A'); git('commit', '-qm', subject)
    return git('rev-parse', 'HEAD')
  }
  return { dir, git, ship }
}
const T0 = '## Why the change\n\nx\n\n## Risk\n\nTier 0: none of the signals\n'
const T1 = '## Risk\n\nTier 1\n\n- one-way door\n'

test('each shipped change carries its tier from the committed PR body, oldest first; a body without Risk is tier null', () => {
  const r = repo()
  r.ship('a', T0); r.ship('b', T1); r.ship('c', '## Why the change\n\nold body\n'); r.ship('d', null)
  assert.deepEqual(changeHistory(r.dir).map(c => [c.slug, c.tier, c.reverted]), [['a', 0, false], ['b', 1, false], ['c', null, false], ['d', null, false]])
})

test('a change is reverted when a later commit says it reverts the merge', () => {
  const r = repo()
  const sha = r.ship('a', T0); r.ship('b', T0)
  r.git('revert', '--no-edit', sha)
  assert.deepEqual(changeHistory(r.dir).map(c => [c.slug, c.reverted]), [['a', true], ['b', false]])
})

test('a merged PR labelled revert that deletes a change\'s pr.md reverts it, only when its number is passed', () => {
  const r = repo()
  r.ship('a', T0)
  fs.rmSync(path.join(r.dir, '.rig/changes/a/pr.md')); r.git('add', '-A'); r.git('commit', '-qm', 'Merge pull request #42 from o/undo-a')
  assert.equal(changeHistory(r.dir)[0]!.reverted, false)
  assert.equal(changeHistory(r.dir, [42])[0]!.reverted, true)
  assert.equal(changeHistory(r.dir, [7])[0]!.reverted, false)
})

const row = (slug: string, tier: ChangeRow['tier'], reverted: boolean): ChangeRow => ({ slug, sha: slug, date: '2026-10-27', tier, reverted })

test('the breaker trips when reverted tier-0 merges in the window exceed the rate, and only looks at tier 0', () => {
  assert.equal(breaker([row('a', 0, true), row('b', 0, false)], 20, 0.1), 'tier-0 merges reverted: 1 of 2 in the last 20 (over the risk.maxRevertRate of 0.1)')
  assert.equal(breaker([row('a', 0, false), row('b', 0, false)], 20, 0.1), null)
  assert.equal(breaker([row('a', 1, true), row('b', null, true)], 20, 0.1), null, 'no tier-0 merges: nothing to judge')
  assert.equal(breaker([row('a', 0, true), row('b', 0, false), row('c', 0, false)], 2, 0.1), null, 'only the last window tier-0 merges count')
  assert.equal(breaker([row('a', 0, true), row('b', 0, false)], 20, 0.5), null, 'at the rate is not over it')
})

test('for the breaker every merge is a row: a change reverted and landed again keeps its revert', () => {
  const r = repo()
  const first = r.ship('a', T0)
  r.git('revert', '--no-edit', first)
  r.ship('a', T0, 'ship a again')
  assert.deepEqual(changeHistory(r.dir).map(c => [c.slug, c.reverted]), [['a', false]], 'the report counts a change once, as it lands now')
  assert.deepEqual(changeHistory(r.dir, [], 'HEAD', true).map(c => [c.slug, c.reverted]), [['a', true], ['a', false]])
})

test('a squash-merged revert PR (subject "Title (#N)") counts when labelled', () => {
  const r = repo()
  r.ship('a', T0)
  fs.rmSync(path.join(r.dir, '.rig/changes/a/pr.md')); r.git('add', '-A'); r.git('commit', '-qm', 'Undo the cart change (#42)')
  assert.equal(changeHistory(r.dir, [42])[0]!.reverted, true)
})
