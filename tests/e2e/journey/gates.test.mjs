import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { Checks } from '../lib/checks.mjs'
import { gateUnchangedTests, gateBuilt, gateChart } from './gates.mjs'

// A throwaway repo with the sandbox surface the gates use.
function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gates-'))
  const bin = path.join(dir, '.bin'); fs.mkdirSync(bin)
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'x')
  const write = (rel, t) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), t) }
  const stub = (code) => { fs.writeFileSync(path.join(bin, 'pytest'), `#!/bin/sh\nexit ${code}\n`, { mode: 0o755 }) }
  stub(0)
  const sb = {
    dir, git, write, read: rel => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : ''),
    run: (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, ...opts }),
    sdlc: () => ({ status: 0, stdout: '[]', stderr: '' }),
  }
  return { sb, git, write, stub }
}
const failed = c => c.failed.map(f => f.name)

test('gateUnchangedTests fails when a listed file differs from the base and passes when none do', async () => {
  const { sb, git, write } = repo()
  write('tests/test_a.py', 'a'); write('tests/test_b.py', 'b'); sb.git('add', '-A'); git('commit', '-qm', 'base')
  const base = git('rev-parse', 'HEAD')
  const ok = new Checks('t'); await gateUnchangedTests(ok, sb, { baseRef: base, files: ['tests/test_a.py', 'tests/test_b.py'] })
  assert.deepEqual(failed(ok), [])
  write('tests/test_b.py', 'changed'); git('add', '-A'); git('commit', '-qm', 'edit')
  const bad = new Checks('t'); await gateUnchangedTests(bad, sb, { baseRef: base, files: ['tests/test_a.py', 'tests/test_b.py'] })
  assert.equal(bad.failed.length, 1)
  assert.match(bad.failed[0].why, /test_b\.py/)
})

test('gateBuilt fails when a file outside the allowed paths changed', async () => {
  const { sb, git, write } = repo()
  write('src/library/a.py', 'a'); git('add', '-A'); git('commit', '-qm', 'base')
  git('checkout', '-q', '-b', 'sdlc/x')
  write('src/library/b.py', 'b'); write('README.md', 'oops'); git('add', '-A'); git('commit', '-qm', 'work')
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify({ changes: [{ slug: 'x', status: 'review' }] }), stderr: '' })
  const c = new Checks('t'); await gateBuilt(c, sb, { slug: 'x', allowedPaths: ['src/library/**', 'tests/**'], baseRef: 'main' })
  assert.equal(c.failed.length, 1)
  assert.match(c.failed[0].why, /README\.md/)
})

test('gateBuilt fails when pytest fails and when the change is not at review or shipped', async () => {
  const { sb, git, write, stub } = repo()
  write('src/a.py', 'a'); git('add', '-A'); git('commit', '-qm', 'base'); stub(1)
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify({ changes: [{ slug: 'x', status: 'build' }] }), stderr: '' })
  const c = new Checks('t'); await gateBuilt(c, sb, { slug: 'x', allowedPaths: ['src/**'], baseRef: 'main' })
  assert.equal(c.failed.length, 2)
})

test('gateChart fails on a block finding and passes on warnings only', async () => {
  const { sb } = repo()
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify([{ severity: 'block', rule: 'intent-untraced', where: 'loans' }]), stderr: '' })
  const bad = new Checks('t'); await gateChart(bad, sb, 1)
  assert.match(bad.failed[0].why, /intent-untraced/)
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify([{ severity: 'warn', rule: 'x', where: 'y' }]), stderr: '' })
  const ok = new Checks('t'); await gateChart(ok, sb, 1)
  assert.deepEqual(failed(ok), [])
})

test('gateBuilt accepts a merged change that status no longer lists, when its pr.md exists and its branch is in main', async () => {
  const { sb, git, write } = repo()
  write('src/a.py', 'a'); git('add', '-A'); git('commit', '-qm', 'base')
  git('checkout', '-q', '-b', 'sdlc/x'); write('src/b.py', 'b'); write('.rig/changes/x/pr.md', 'pr'); git('add', '-A'); git('commit', '-qm', 'work')
  git('checkout', '-q', 'main'); git('merge', '-q', '--ff-only', 'sdlc/x')
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify({ changes: [] }), stderr: '' })
  const c = new Checks('t'); await gateBuilt(c, sb, { slug: 'x', allowedPaths: ['src/**', '.rig/**'], baseRef: 'HEAD~1' })
  assert.deepEqual(failed(c), [])
})

test('gateBuilt still fails a change that is neither listed nor merged', async () => {
  const { sb, git, write } = repo()
  write('src/a.py', 'a'); git('add', '-A'); git('commit', '-qm', 'base')
  sb.sdlc = () => ({ status: 0, stdout: JSON.stringify({ changes: [] }), stderr: '' })
  const c = new Checks('t'); await gateBuilt(c, sb, { slug: 'x', allowedPaths: ['src/**'], baseRef: 'main' })
  assert.match(c.failed.map(f => f.name).join('|'), /reached review or shipped/)
})
