import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { planFiles, overlaps, queueText } from './queue.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

test('planFiles reads the ## Files section, backticks and directories included', () => {
  assert.deepEqual(planFiles('# Plan\n\n## Files\n- src/cart/cart.js\n- `src/http/`\n* test/a.test.js\n\n## Tests\n- B1: test/a.test.js\n'), ['src/cart/cart.js', 'src/http/', 'test/a.test.js'])
  assert.deepEqual(planFiles('# no files section'), [])
})

test('overlaps: the same file, or a directory holding a file, in two different worktrees; never within one worktree', () => {
  const rows = [
    { slug: 'aa-cart', worktree: '/w/a', files: ['src/cart/cart.js', 'src/http/'] },
    { slug: 'bb-http', worktree: '/w/b', files: ['src/http/handler.js', 'test/x.js'] },
    { slug: 'cc-docs', worktree: '/w/c', files: ['README.md'] },
    { slug: 'dd-same', worktree: '/w/a', files: ['src/cart/cart.js'] },
  ]
  const found = overlaps(rows)
  assert.deepEqual(found.map(o => o.file), ['src/http/handler.js'], 'the directory holds the file; the same worktree is one instance')
  assert.deepEqual(found[0]?.changes, ['aa-cart (a)', 'bb-http (b)'])
  assert.deepEqual(overlaps(rows.filter(r => r.slug !== 'bb-http')), [])
})

test('queue: a plan waiting for approval is listed for the person with the command, a change at spec is the model\'s, and a shared file is flagged', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'rig')
  const wtA = path.join(path.dirname(repo), `${path.basename(repo)}-wt-a`)
  const wtB = path.join(path.dirname(repo), `${path.basename(repo)}-wt-b`)
  gitIn(repo, 'worktree', 'add', '-q', '-b', 'wip-a', wtA)
  gitIn(repo, 'worktree', 'add', '-q', '-b', 'wip-b', wtB)
  sdlc(wtA, ['new', 'add-cart', '--type', 'feature'])
  write(wtA, '.rig/changes/add-cart/spec.md', '# Spec\n\n## Behaviours\n- B1: x\n\n## Open questions\nnone\n')
  write(wtA, '.rig/changes/add-cart/plan.md', '# Plan\n\n## Files\n- src/http/handler.js\n\n## Open questions\nnone\n')
  sdlc(wtB, ['new', 'add-links', '--type', 'feature'])
  write(wtB, '.rig/changes/add-links/spec.md', '# Spec\n\n## Behaviours\n- B2: y\n\n## Open questions\nnone\n')
  write(wtB, '.rig/changes/add-links/plan.md', '# Plan\n\n## Files\n- src/http/handler.js\n\n## Open questions\nnone\n')
  sdlc(repo, ['new', 'early-one', '--type', 'feature'])
  const r = sdlc(repo, ['queue', '--json'])
  assert.equal(r.code, 0, r.stderr)
  const q = JSON.parse(r.stdout)
  const by = Object.fromEntries(q.rows.map((x: { slug: string; status: string; person: boolean }) => [x.slug, x]))
  assert.deepEqual([by['add-cart'].status, by['add-cart'].person, by['add-links'].person], ['approve', true, true])
  assert.deepEqual([by['early-one'].status, by['early-one'].person], ['spec', false])
  assert.deepEqual(q.overlaps.map((o: { file: string }) => o.file), ['src/http/handler.js'])
  const text = sdlc(repo, ['queue']).stdout
  assert.match(text, /Waiting for you \(2\):[\s\S]*add-cart[\s\S]*SDLC_HUMAN=1 node .*approve add-cart/)
  assert.match(text, /With the model \(1\):[\s\S]*early-one/)
  assert.match(text, /Plans that touch the same file \(1\)[\s\S]*src\/http\/handler\.js: add-cart \(.*\) and add-links/)
  assert.ok(text.includes(`cd ${fs.realpathSync(wtA)}`) || text.includes(`cd ${wtA}`), 'the approve command starts in that worktree')
})

test('queueText says so when nothing waits', () => {
  assert.match(queueText({ rows: [], overlaps: [] }), /Waiting for you: nothing\nWith the model: nothing/)
})
