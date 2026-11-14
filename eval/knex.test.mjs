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
import { UPSTREAM, TASKS, TRAP_TEST, TRAP_WORDS, BARE_PROMPT, PHASES, CLAUDE_MD, setupBare, checks, applyPatch } from './variants/knex.mjs'
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

// --- T1 notLike (traps caller, types) -----------------------------------------------------------------------------------------------------
const notLikeSandbox = (name, kind) => {
  const sb = createSandbox({ name, out: tmp(name) })
  setupBare(sb, { dry: true })
  applyPatch(sb.dir, 'notLike', kind)
  return sb
}
const npmTest = sb => spawnSync('npm', ['test', '--silent'], { cwd: sb.dir, encoding: 'utf8', timeout: 900_000 })

netTest('notLike ref patch passes caller and types', async () => {
  const sb = notLikeSandbox('kx-nl-ref', 'ref')
  const t = npmTest(sb)
  assert.equal(t.status, 0, (t.stdout + t.stderr).slice(-400))
  const r = await checks(sb.dir)
  assert.equal(r.traps.caller, true, r.failures.join('; '))
  assert.equal(r.traps.types, true, r.failures.join('; '))
})

netTest('notLike slip patch passes npm test and fails only caller', async () => {
  const sb = notLikeSandbox('kx-nl-slip', 'slip')
  const t = npmTest(sb)
  assert.equal(t.status, 0, (t.stdout + t.stderr).slice(-400))
  const r = await checks(sb.dir)
  assert.equal(r.traps.caller, false)
  assert.equal(r.traps.types, true, r.failures.join('; '))
  assert.match(r.failures.join('\n'), /caller: (mysql|mssql)/)
})

netTest('a types-only slip (no d.ts entries) passes npm test and fails only types', async () => {
  const sb = notLikeSandbox('kx-nl-notypes', 'slip-notypes')
  const t = npmTest(sb)
  assert.equal(t.status, 0, (t.stdout + t.stderr).slice(-400))
  const r = await checks(sb.dir)
  assert.equal(r.traps.caller, true, r.failures.join('; '))
  assert.equal(r.traps.types, false)
})
// --- end T1 ---------------------------------------------------------------------------------------------------------------------------

// === T2 emptyUpsert (traps rule, dialect) ===
import { score } from './variants/knex.mjs'
const bounded = async (cmd, args, { cwd, timeoutMs, env }) => { const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }); return { status: r.status, stdout: r.stdout, stderr: r.stderr } }
const t2 = async kind => {
  const sb = createSandbox({ name: `kx-t2-${kind}`, out: tmp(`t2-${kind}`) })
  setupBare(sb, { dry: true })
  applyPatch(sb.dir, 'emptyUpsert', kind)
  return { sb, r: await score(sb, { timeoutMs: 900_000, runBounded: bounded, tamper: () => null }) }
}
const sqliteSuite = dir => spawnSync('npm', ['run', 'test:sqlite', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 * 1024 * 1024 })

test('the emptyUpsert issue names no trap and leaves plain empty inserts alone', () => {
  const issue = fs.readFileSync(path.join(HERE, 'variants/knex/tasks/emptyUpsert.md'), 'utf8')
  for (const w of TRAP_WORDS) assert.ok(!issue.toLowerCase().includes(w.toLowerCase()), w)
  assert.ok(!/insert\(\s*\[\s*\]\s*\)(?!\.)/.test(issue.replace(/insert\(rows\)/g, '')), 'no plain insert([])')
  assert.match(issue, /\[\]/)
})

netTest('emptyUpsert ref patch passes rule and dialect, and test:sqlite is green', async () => {
  const { sb, r } = await t2('ref')
  assert.equal(r.npmTest, true)
  assert.equal(r.traps.rule, true, r.trapFailures.join('; '))
  assert.equal(r.traps.dialect, true, r.trapFailures.join('; '))
  assert.ok(fs.existsSync(path.join(sb.dir, TRAP_TEST.emptyUpsert)))
  const s = sqliteSuite(sb.dir)
  assert.equal(s.status, 0, (s.stdout + s.stderr).slice(-400))
})

netTest('emptyUpsert slip patch passes npm test and fails rule; test:sqlite is red under it', async () => {
  const { sb, r } = await t2('slip')
  assert.equal(r.npmTest, true)
  assert.equal(r.traps.rule, false)
  assert.equal(r.traps.dialect, true, r.trapFailures.join('; '))
  assert.match(r.trapFailures.join('\n'), /rule: test:sqlite failed/)
  const s = sqliteSuite(sb.dir)
  assert.notEqual(s.status, 0)
  assert.match(s.stdout, /should throw an error if the array passed in is empty/)
})

netTest('a sqlite-only fix fails only dialect', async () => {
  const { r } = await t2('slip-sqlite-only')
  assert.equal(r.npmTest, true)
  assert.equal(r.traps.rule, true, r.trapFailures.join('; '))
  assert.equal(r.traps.dialect, false)
})
// === end T2 emptyUpsert ===

// === whole variant: dry runs and the combined slips =====================================================================================
import { runOne } from './run.mjs'
import { scoreRun } from './score.mjs'
import { ARMS } from './arms.mjs'

netTest('dry knex run: full marks, escaped 0, for a bare arm (rig-start is frozen; W5 measures rig-on only)', async () => {
  const out = tmp('dry')
  for (const id of ['sonnet-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'knex' })
    assert.equal(row.error, undefined, `${id}: ${row.error}`)
    assert.deepEqual(row.traps, { caller: true, types: true, rule: true, dialect: true }, `${id}: ${JSON.stringify(row.trapFailures)}`)
    assert.deepEqual([row.accepted, row.checks, row.of, row.escaped, row.missing, row.npmTest], [true, 5, 5, 0, [], true], id)
  }
})

netTest('dry knex rig-on run: accepted, escaped 0, mode on', async () => {
  const row = await runOne(ARMS.find(a => a.id === 'sonnet-rig-on'), 1, { dry: true, out: tmp('dry-on'), capRunUsd: 6, variant: 'knex' })
  assert.deepEqual([row.accepted, row.escaped, row.mode, row.error], [true, 0, 'on', undefined], JSON.stringify(row))
})

for (const [task, kind, trap] of [['notLike', 'slip', 'caller'], ['notLike', 'slip-notypes', 'types'], ['emptyUpsert', 'slip', 'rule'], ['emptyUpsert', 'slip-sqlite-only', 'dialect']]) {
  netTest(`${task}/${kind} with the other task's ref: scored through scoreRun, npm test passes and only ${trap} fails`, async () => {
    const sb = createSandbox({ name: `kx-both-${task}-${kind}`, out: tmp('both') })
    const base = setupBare(sb, { dry: true })
    for (const t of TASKS) applyPatch(sb.dir, t, t === task ? kind : 'ref')
    sb.commitAll('chore: run result')
    const r = await scoreRun(sb, base, { variant: 'knex' })
    assert.deepEqual(r.traps, { caller: true, types: true, rule: true, dialect: true, [trap]: false }, JSON.stringify(r.trapFailures))
    assert.deepEqual([r.npmTest, r.escaped, r.missing, r.accepted], [true, 1, [], false])
  })
}

netTest('a trap whose test file was never written is missing, not escaped', async () => {
  const sb = createSandbox({ name: 'kx-missing', out: tmp('missing') })
  const base = setupBare(sb, { dry: true })
  const r = await scoreRun(sb, base, { variant: 'knex' })
  assert.deepEqual([r.npmTest, r.escaped, r.missing.length], [true, 0, 2])
})
