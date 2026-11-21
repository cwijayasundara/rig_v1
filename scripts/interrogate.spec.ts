// Interrogate (pilot §3): findings are kept only when their command fails on a clean checkout of the committed code and names what it breaks.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { judge } from './interrogate.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

test('judge keeps a failing command that shows the failure and cites what it breaks, and dismisses the rest with a reason', () => {
  const fails = { exit: 1, tail: 'AssertionError: total was 8' }
  assert.deepEqual(judge({ breaks: 'B1' }, fails), { status: 'reproduced' })
  assert.deepEqual(judge({ breaks: 'B1', match: 'total was \\d+' }, fails), { status: 'reproduced' })
  assert.match(judge({ breaks: 'B1', match: 'nope' }, fails).why!, /does not show the stated failure/)
  assert.match(judge({ breaks: 'B1' }, { exit: 0, tail: '' }).why!, /passes on a clean checkout/)
  assert.match(judge({ breaks: ' ' }, fails).why!, /cites no behaviour/)
  assert.match(judge({ breaks: 'B1' }, { exit: 124, tail: '' }).why!, /timed out/)
  assert.match(judge({ breaks: 'B1', match: '(' }, fails).why!, /not a valid pattern/)
})

let repo: string
const rec = (...extra: string[]) => sdlc(repo, ['interrogate', 'record', 'demo', '--adversary', 'opus', '--title', 'add subtracts instead', '--breaks', 'B1', ...extra, '--', 'node', 'check.js'])
beforeEach(() => {
  repo = makeRepo()
  write(repo, 'src.js', 'exports.add = (a, b) => a - b\n')
  write(repo, 'check.js', "if (require('./src.js').add(1, 2) !== 3) { console.error('add(1,2) was wrong'); process.exit(1) }\n")
  fs.mkdirSync(path.join(repo, '.rig/changes/demo'), { recursive: true })
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the change')
})

test('record refuses a command that passes, and records one that fails with its id; verify reproduces it on a clean checkout', () => {
  write(repo, 'ok.js', 'process.exit(0)\n'); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'ok')
  const passed = sdlc(repo, ['interrogate', 'record', 'demo', '--adversary', 'opus', '--title', 'nothing wrong here', '--breaks', 'B1', '--', 'node', 'ok.js'])
  assert.equal(passed.code, 1); assert.match(passed.stderr, /nothing is proven/)
  const r = rec()
  assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /recorded I-1/)
  assert.match(rec().stdout, /already recorded/)
  const v = sdlc(repo, ['interrogate', 'verify', 'demo'])
  assert.equal(v.code, 1, v.stdout + v.stderr)
  assert.match(v.stdout, /1 found, 1 reproduced, 0 dismissed/); assert.match(v.stdout, /I-1 reproduced: add subtracts instead \[opus; breaks B1\]/)
  const res = JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/evidence/interrogate.json'), 'utf8'))
  assert.equal(res.reproduced, 1); assert.match(res.rows[0].tail, /add\(1,2\) was wrong/)
})

test('after the code is fixed and committed, the same finding is dismissed: it no longer fails on the clean checkout', () => {
  rec()
  write(repo, 'src.js', 'exports.add = (a, b) => a + b\n'); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'fix')
  const v = sdlc(repo, ['interrogate', 'verify', 'demo'])
  assert.equal(v.code, 0, v.stdout + v.stderr)
  assert.match(v.stdout, /0 reproduced, 1 dismissed/); assert.match(v.stdout, /passes on a clean checkout/)
})

test('verify refuses while committed code and the working tree differ: the rerun must be of the code that ships', () => {
  rec()
  write(repo, 'src.js', 'exports.add = (a, b) => a + b\n')
  const v = sdlc(repo, ['interrogate', 'verify', 'demo'])
  assert.equal(v.code, 1); assert.match(v.stderr, /commit first/)
})

test('record needs the adversary, a title and what it breaks', () => {
  const r = sdlc(repo, ['interrogate', 'record', 'demo', '--title', 'x', '--', 'node', 'check.js'])
  assert.equal(r.code, 1); assert.match(r.stderr, /usage: interrogate record/)
})
