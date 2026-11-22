// defaultBase: a change started from an approved, unmerged chart branch is judged against that chart.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { makeRepo, write, gitIn } from './testkit.ts'

const baseOf = (repo: string): string => {
  const lib = pathToFileURL(path.resolve(import.meta.dirname, 'core.ts')).href
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { defaultBase } from ${JSON.stringify(lib)}; console.log(defaultBase())`],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, NODE_TEST_CONTEXT: '' } })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}
const commit = (repo: string, f: string): string => { write(repo, f, f); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', f); return gitIn(repo, 'rev-parse', 'HEAD') }

const approved = (repo: string, n: number): string => commit(repo, `.rig/product/sprints/sprint-${n}/approval.json`)

test('a rig/chart branch with no chart approval is not a base', () => {
  const repo = makeRepo(), main = gitIn(repo, 'rev-parse', 'HEAD')
  gitIn(repo, 'checkout', '-qb', 'rig/chart-1'); commit(repo, 'app/x.py')
  gitIn(repo, 'checkout', '-qb', 'sdlc/a'); commit(repo, 'app/a.py')
  assert.equal(baseOf(repo), main)
})

test('the base is the unmerged chart tip, so the approved chart and its contracts are not part of the change', () => {
  const repo = makeRepo(), main = gitIn(repo, 'rev-parse', 'HEAD')
  gitIn(repo, 'checkout', '-qb', 'rig/chart-1'); const chart = approved(repo, 1)
  gitIn(repo, 'checkout', '-qb', 'sdlc/a'); commit(repo, 'app/a.py')
  assert.equal(baseOf(repo), chart)
  assert.notEqual(chart, main)
})

test('with no chart branch, or once it is merged, the base is the trunk merge-base', () => {
  const repo = makeRepo(), main = gitIn(repo, 'rev-parse', 'HEAD')
  gitIn(repo, 'checkout', '-qb', 'sdlc/a'); commit(repo, 'app/a.py')
  assert.equal(baseOf(repo), main)
  gitIn(repo, 'checkout', '-q', 'main'); gitIn(repo, 'checkout', '-qb', 'rig/chart-1'); const chart = approved(repo, 1)
  gitIn(repo, 'checkout', '-q', 'main'); gitIn(repo, 'merge', '-q', '--ff-only', 'rig/chart-1')
  gitIn(repo, 'checkout', '-qb', 'sdlc/b'); commit(repo, 'app/b.py')
  assert.equal(baseOf(repo), chart)
})
