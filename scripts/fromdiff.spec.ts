// new --from-diff (proposal 2026-10-27 P4): work done before a change existed becomes one, and red-proof judges its tests
// against the base the work started from.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, fromOld } from './testkit.ts'

let repo: string
const SUB_TEST = "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { sub } from '../src/sub.js'\ntest('B1 subtracts', () => assert.equal(sub(3, 1), 2))\n"

beforeEach(() => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', fromOld({ full: { unit: 'node --test test/*.test.js' } }) + '\n')
  write(repo, 'package.json', '{ "type": "module" }\n')
  write(repo, 'src/add.js', 'export const add = (a, b) => a + b\n')
  write(repo, 'test/add.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('add', () => assert.equal(add(1, 2), 3))\n")
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'base')
})
const read = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')

test('a branch\'s commits, edits and new files are captured as the blast radius, against the base', () => {
  const base = gitIn(repo, 'rev-parse', 'HEAD')
  gitIn(repo, 'checkout', '-qb', 'vibe')
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'vibe: sub')
  write(repo, 'src/add.js', 'export const add = (a, b) => a + b + 0\n')
  write(repo, 'src/mul.js', 'export const mul = (a, b) => a * b\n')
  const r = sdlc(repo, ['new', 'calc-ops', '--from-diff', '--title', 'calculator ops'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /captured 3 file\(s\)[\s\S]*src\/sub\.js \+1 -0/)
  assert.match(read('.rig/changes/calc-ops/intent.md'), new RegExp(`from-diff: ${base}`))
  const spec = read('.rig/changes/calc-ops/spec.md')
  for (const f of ['src/add.js', 'src/mul.js', 'src/sub.js']) assert.match(spec, new RegExp(`^- ${f}$`, 'm'))
  assert.doesNotMatch(spec, /\.rig\//)
})

test('nothing to capture, or a charted intent with --from-diff, is refused', () => {
  gitIn(repo, 'checkout', '-qb', 'vibe')
  assert.match(sdlc(repo, ['new', 'empty', '--from-diff']).stderr, /nothing to capture/)
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  assert.match(sdlc(repo, ['new', 'both', '--from-diff', '--source', 'x.md']).stderr, /--source alone/)
})

test('on a trunk with no remote, only uncommitted work is captured and the person is warned', () => {
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'vibe on main')
  write(repo, 'src/mul.js', 'export const mul = (a, b) => a * b\n')
  const r = sdlc(repo, ['new', 'mul', '--from-diff'])
  assert.match(r.stdout, /captured 1 file\(s\)[\s\S]*src\/mul\.js/)
  assert.match(r.stdout, /WARNING: main has no origin\/main/)
})

test('red-proof judges captured work: a test that fails on the base passes, one that passes there is blocked', () => {
  gitIn(repo, 'checkout', '-qb', 'vibe')
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  assert.equal(sdlc(repo, ['new', 'sub', '--from-diff']).code, 0)
  write(repo, '.rig/changes/sub/spec.md', read('.rig/changes/sub/spec.md').replace('## Behaviours\n', '## Behaviours\n- B1 subtract\n').replace('\n## Out of scope', '- test/\n\n## Out of scope'))
  write(repo, '.rig/changes/sub/plan.md', '## Files\n- src/sub.js\n- test/\n## Verification\n- node --test test/*.test.js\n')
  const approved = sdlc(repo, ['approve', 'sub'], { env: { SDLC_HUMAN: '1' } })
  assert.equal(approved.code, 0, approved.stdout + approved.stderr)
  write(repo, 'test/sub.test.js', SUB_TEST)
  const ok = sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--slug', 'sub'])
  assert.equal(ok.code, 0, ok.stdout)
  fs.rmSync(path.join(repo, 'test/sub.test.js'))
  write(repo, 'test/add2.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('B1 add again', () => assert.equal(add(2, 2), 4))\n")
  const weak = sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--slug', 'sub'])
  assert.equal(weak.code, 1)
  assert.match(weak.stdout, /\[red-proof\][\s\S]*already pass on the base/)
})

test('review fixes: a rename seeds both paths, a space becomes a glob, and a branch with no trunk to compare is warned', () => {
  gitIn(repo, 'checkout', '-qb', 'vibe')
  gitIn(repo, 'mv', 'src/add.js', 'src/plus.js')
  write(repo, 'src/my file.js', 'export const x = 1\n')
  assert.equal(sdlc(repo, ['new', 'rename', '--from-diff']).code, 0)
  const spec = read('.rig/changes/rename/spec.md')
  assert.match(spec, /^- src\/add\.js$/m)
  assert.match(spec, /^- src\/plus\.js$/m)
  assert.match(spec, /^- src\/my\?file\.js$/m)
  gitIn(repo, 'branch', '-m', 'main', 'develop')
  const r = sdlc(repo, ['new', 'no-trunk', '--from-diff'])
  assert.match(r.stdout, /WARNING: no main or master to compare vibe with/)
})
