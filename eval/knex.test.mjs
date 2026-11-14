// The knex variant (W5): two tasks on knex 3.1.0, four traps that upstream's `npm test` passes.
// Specs that need the pinned clone skip, with the reason, when it cannot be had (no network, no npm, no sqlite3 binary).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { cloneUpstream, seedUpstream, upstreamAvailable } from './lib/upstream.mjs'
import { UPSTREAM, TASKS, TRAP_TEST, TRAP_WORDS, BARE_PROMPT, PHASES, CLAUDE_MD, setupBare, checks } from './variants/knex.mjs'
import { phasesFor } from './run.mjs'
import { BARE_PROMPT_KNEX } from './setup.mjs'

const HERE = import.meta.dirname
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), `rig-kx-${p}-`))
const avail = process.env.RIG_EVAL_OFFLINE ? 'upstream clone unavailable: forced offline' : upstreamAvailable(UPSTREAM)
const net = avail === true ? {} : { skip: avail }
const netTest = (name, fn) => test(name, net, fn)
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
function fixture() {
  const src = tmp('src')
  git(src, 'init', '-q', '-b', 'main'); git(src, 'config', 'user.email', 'a@b.c'); git(src, 'config', 'user.name', 'x')
  fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'fx', version: '1.0.0' }))
  fs.writeFileSync(path.join(src, 'a.txt'), 'a\n'); git(src, 'add', '-A'); git(src, 'commit', '-q', '-m', 'one'); git(src, 'tag', 'v1')
  return { url: `file://${src}`, tag: 'v1', name: 'fixture', sha: git(src, 'rev-parse', 'HEAD') }
}

test('cloneUpstream installs from a supplied lockfile and runs rebuild', () => {
  const lock = path.join(tmp('lock'), 'package-lock.json')
  const body = JSON.stringify({ name: 'fx', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fx', version: '1.0.0' } } }, null, 2) + '\n'
  fs.writeFileSync(lock, body)
  const dir = cloneUpstream({ ...fixture(), cacheDir: tmp('cache'), lockfile: lock, rebuild: [] })
  assert.equal(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'), body, 'the lockfile bytes landed')
  assert.ok(fs.existsSync(path.join(dir, '.rig-eval-ready')))
  const dir2 = cloneUpstream({ ...fixture(), cacheDir: tmp('cache'), lockfile: lock })
  assert.ok(fs.existsSync(path.join(dir2, 'package-lock.json')), 'rebuild is optional')
})

test('seedUpstream applies a base patch before the base commit', () => {
  const up = tmp('up')
  fs.writeFileSync(path.join(up, 'a.txt'), 'one\n')
  const patch = path.join(tmp('patch'), 'p.patch')
  fs.writeFileSync(patch, '--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-one\n+two\n')
  const sb = createSandbox({ name: 'kx-seed', out: tmp('sb') })
  const sha = seedUpstream(sb, up, 'chore: base', { patch })
  assert.equal(fs.readFileSync(path.join(sb.dir, 'a.txt'), 'utf8'), 'two\n')
  assert.equal(git(sb.dir, 'show', `${sha}:a.txt`), 'two')
  assert.equal(git(sb.dir, 'rev-list', '--count', 'HEAD'), '1', 'one base commit')
})

test('two tasks, four traps, the trap test files are named', () => {
  assert.deepEqual(TASKS, ['notLike', 'emptyUpsert'])
  assert.deepEqual(TRAP_TEST, { notLike: 'test/unit/query/where-not-like.js', emptyUpsert: 'test/unit/query/empty-upsert.js' })
  assert.deepEqual(phasesFor('knex').map(p => p.id), ['N1', 'N2'])
  assert.equal(PHASES.length, 2)
  assert.equal(UPSTREAM.sha, '4ca3dd5bc28e0665c5bed55026fac2ec45489d81')
  assert.equal(UPSTREAM.tag, '3.1.0')
})

test('no prompt contains a TRAP_WORDS entry', () => {
  assert.ok(TRAP_WORDS.length >= 6)
  assert.equal(BARE_PROMPT_KNEX, BARE_PROMPT)
  for (const w of ['trap', 'hidden', 'collate', 'onConflict', 'types/index.d.ts', 'test:sqlite']) assert.ok(TRAP_WORDS.includes(w), w)
  const texts = [['the bare prompt', BARE_PROMPT], ['CLAUDE.md', CLAUDE_MD], ...PHASES.map(p => [p.id, p.prompt])]
  for (const [name, text] of texts) for (const w of TRAP_WORDS) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${name} contains "${w}"`)
  assert.match(CLAUDE_MD, /lib\/[\s\S]*test\//)
  for (const t of TASKS) {
    const f = path.join(HERE, `variants/knex/tasks/${t}.md`)
    if (fs.existsSync(f)) assert.ok(BARE_PROMPT.includes(fs.readFileSync(f, 'utf8').trim()), `the bare prompt carries the issue ${t}`)
  }
})

test('the check files ship and the base patch touches only the two named edits', () => {
  for (const f of ['checks.t1.mjs', 'checks.t2.mjs']) assert.ok(fs.existsSync(path.join(HERE, 'variants/knex', f)), f)
  const patch = fs.readFileSync(path.join(HERE, 'variants/knex/base.patch'), 'utf8')
  assert.deepEqual([...patch.matchAll(/^diff --git a\/(\S+) b\//gm)].map(m => m[1]).sort(), ['package.json', 'test/db-less-test-suite.js'])
})

netTest('base passes npm test and test:sqlite, and every trap fails there', async () => {
  const sb = createSandbox({ name: 'kx-base', out: tmp('base') })
  setupBare(sb, { dry: true })
  const run = s => spawnSync('npm', ['run', s, '--silent'], { cwd: sb.dir, encoding: 'utf8', timeout: 900_000 })
  const t = run('test')
  assert.equal(t.status, 0, (t.stdout + t.stderr).slice(-400))
  assert.match(t.stdout, /1532 passing/)
  const s = run('test:sqlite')
  assert.equal(s.status, 0, (s.stdout + s.stderr).slice(-400))
  assert.match(s.stdout, /386 passing/)
  const r = await checks(sb.dir)
  assert.ok(Object.values(r.traps).every(v => v === false), JSON.stringify(r.traps))
})
