// The brownfield variant (W3b option 2): four tasks on commander.js v12.1.0, each with a seeded trap that upstream's `npm test` passes.
// Specs that need the pinned clone skip, with the reason, when it cannot be had (no network, no npm).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { cloneUpstream, upstreamAvailable } from './lib/upstream.mjs'
import { UPSTREAM, CLAUDE_MD, TASKS, TRAP_TEST, TRAP_WORDS, NFR_BOUND_MS, BARE_PROMPT, PHASES, applyPatch, checks, timeNames, setupBare, dryBare } from './variants/brownfield.mjs'
import { runOne, phasesFor } from './run.mjs'
import { setupRig } from './setup.mjs'
import { scoreRun } from './score.mjs'
import { ARMS } from './arms.mjs'
import { BARE_PROMPT_BROWNFIELD } from './setup.mjs'

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), `rig-bf-${p}-`))
// RIG_EVAL_OFFLINE=1 makes this file behave as if the clone were unavailable (the spec below runs it that way and counts the skips).
const avail = process.env.RIG_EVAL_OFFLINE ? 'upstream clone unavailable: forced offline' : upstreamAvailable(UPSTREAM)
const skipFor = a => (a === true ? {} : { skip: a })
const net = skipFor(avail)
const netSpecs = []
const netTest = (name, fn) => { netSpecs.push(name); return test(name, net, fn) }
const sandbox = name => createSandbox({ name, out: tmp(name) })
const npmTest = dir => spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 300_000 })

test('upstream clone is pinned (sha mismatch throws, a matching sha is cached)', () => {
  const src = tmp('src')
  const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'x')
  fs.writeFileSync(path.join(src, 'a.txt'), 'a\n'); git('add', '-A'); git('commit', '-q', '-m', 'one'); git('tag', 'v1')
  const sha = git('rev-parse', 'HEAD')
  const base = { url: `file://${src}`, tag: 'v1', name: 'fixture', install: false }
  assert.throws(() => cloneUpstream({ ...base, sha: 'a'.repeat(40), cacheDir: tmp('cache') }), /sha mismatch/)
  const cacheDir = tmp('cache')
  const dir = cloneUpstream({ ...base, sha, cacheDir })
  assert.equal(dir, path.join(cacheDir, `fixture-${sha.slice(0, 7)}`))
  assert.equal(cloneUpstream({ ...base, sha, cacheDir: cacheDir }), dir, 'the second call reuses the cache')
  assert.equal(UPSTREAM.sha, '970ecae402b253de691e6a9066fea22f38fe7431')
  assert.equal(UPSTREAM.tag, 'v12.1.0')
})

test('upstream cache: a cold-cache race (another process finishes first) uses its dir; the marker carries the sha and is verified on reuse', () => {
  const src = tmp('src')
  const git = (...a) => execFileSync('git', ['-C', src, ...a], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'x')
  fs.writeFileSync(path.join(src, 'a.txt'), 'a\n'); git('add', '-A'); git('commit', '-q', '-m', 'one'); git('tag', 'v1')
  const sha = git('rev-parse', 'HEAD')
  const opts = { url: `file://${src}`, tag: 'v1', name: 'fixture', install: false, sha }
  const cacheDir = tmp('cache')
  const dir = path.join(cacheDir, `fixture-${sha.slice(0, 7)}`)
  const got = cloneUpstream({ ...opts, cacheDir, beforeRename: () => cloneUpstream({ ...opts, cacheDir }) })
  assert.equal(got, dir)
  assert.equal(fs.readFileSync(path.join(dir, '.rig-eval-ready'), 'utf8').trim(), sha)
  assert.deepEqual(fs.readdirSync(cacheDir), [path.basename(dir)], 'no partial directory is left behind')
  fs.writeFileSync(path.join(dir, '.rig-eval-ready'), `${'b'.repeat(40)}\n`)
  fs.writeFileSync(path.join(dir, 'stale.txt'), 'x')
  assert.equal(cloneUpstream({ ...opts, cacheDir }), dir)
  assert.equal(fs.readFileSync(path.join(dir, '.rig-eval-ready'), 'utf8').trim(), sha, 'a marker for another sha is not reused')
  assert.ok(!fs.existsSync(path.join(dir, 'stale.txt')))
})

test('offline: an unreachable upstream gives a reason, and the specs that need it skip', () => {
  const r = upstreamAvailable({ url: 'file:///nonexistent/rig-eval', tag: 'v1', sha: 'a'.repeat(40), name: 'none', cacheDir: tmp('off') })
  assert.match(r, /^upstream clone unavailable: /)
  assert.deepEqual(skipFor(r), { skip: r })
  assert.deepEqual(skipFor(true), {})
})

test('every spec that needs the clone skips, with the reason, when the clone is unavailable', { skip: process.env.RIG_EVAL_OFFLINE ? 'this is the offline child' : false }, () => {
  assert.ok(netSpecs.length >= 8, `${netSpecs.length} specs need the clone`)
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-reporter=tap', import.meta.filename], { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('NODE_TEST'))), RIG_EVAL_OFFLINE: '1' }, timeout: 120_000 })
  const n = k => Number(new RegExp(`^# ${k} (\\d+)`, 'm').exec(r.stdout)?.[1])
  assert.equal(n('fail'), 0, r.stdout.slice(-600))
  assert.equal(n('skipped'), netSpecs.length + 1, 'exactly the specs that need the clone are skipped (and this one, in the child)')
  assert.match(r.stdout, /forced offline/)
})

test('four tasks, each with a reference patch, a slip patch and an issue; the trap test files are named', () => {
  assert.deepEqual(TASKS, ['requires', 'intParser', 'keyValue', 'commandNames'])
  for (const t of TASKS) {
    for (const k of ['ref', 'slip']) assert.ok(fs.existsSync(path.join(import.meta.dirname, `variants/brownfield/patches/${t}/${k}.patch`)), `${t}/${k}.patch`)
    assert.ok(TRAP_TEST[t]?.startsWith('tests/'), t)
  }
  assert.deepEqual(phasesFor('brownfield').map(p => p.id), ['K1', 'K2', 'K3', 'K4'])
  assert.equal(PHASES.length, 4)
})

test('no prompt contains a TRAP_WORDS entry', () => {
  assert.ok(TRAP_WORDS.length >= 6)
  const texts = [['the bare prompt', BARE_PROMPT], ...PHASES.map(p => [p.id, p.prompt])]
  assert.equal(BARE_PROMPT_BROWNFIELD, BARE_PROMPT)
  for (const [name, text] of texts) for (const w of TRAP_WORDS) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${name} contains "${w}"`)
  for (const t of TASKS) assert.ok(BARE_PROMPT.includes(fs.readFileSync(path.join(import.meta.dirname, `variants/brownfield/tasks/${t}.md`), 'utf8').trim()), `the bare prompt carries the issue ${t}`)
})

test('the rig arm\'s CLAUDE.md names no trap word and no entry point or typings file', () => {
  for (const w of [...TRAP_WORDS, 'esm', 'typings', 'index.js']) assert.ok(!CLAUDE_MD.toLowerCase().includes(w.toLowerCase()), `CLAUDE.md contains "${w}"`)
})

netTest('no file the harness adds to either arm\'s base beyond upstream contains a TRAP_WORDS entry', async () => {
  const up = cloneUpstream(UPSTREAM)
  const bare = sandbox('bf-words-bare'), rig = sandbox('bf-words-rig')
  setupBare(bare, { dry: true })
  await setupRig(rig, ARMS.find(a => a.id === 'haiku-rig'), { dry: true, variant: 'brownfield' })
  let scanned = 0
  for (const sb of [bare, rig]) {
    for (const f of sb.git('ls-files').split('\n').filter(Boolean)) { // what the harness committed; run artifacts (coverage, caches) are not its words
      if (/^\.(rig|claude)\//.test(f)) continue
      const full = path.join(sb.dir, f)
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
      const text = fs.readFileSync(full, 'utf8')
      const was = path.join(up, f)
      if (fs.existsSync(was) && fs.readFileSync(was, 'utf8') === text) continue
      scanned++
      for (const w of TRAP_WORDS) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${f} (harness-written) contains "${w}"`)
    }
  }
  assert.ok(scanned >= 1, 'CLAUDE.md at least was scanned')
})

netTest('keyValue: a solution that rejects an empty value (the issue does not say) still passes the check', async () => {
  const sb = sandbox('bf-kv-empty')
  setupBare(sb, { dry: true })
  applyPatch(sb.dir, 'keyValue', 'ref')
  const f = path.join(sb.dir, 'lib/option.js')
  const src = fs.readFileSync(f, 'utf8')
  assert.ok(src.includes('if (split < 1) {'))
  fs.writeFileSync(f, src.replace('if (split < 1) {', 'if (split < 1 || split === value.length - 1) {'))
  assert.equal((await checks(sb.dir)).traps.keyValue, true)
})

test('the commandNames check builds its tree through the public API, not by pushing into .commands', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(import.meta.dirname, 'variants/brownfield.mjs'), 'utf8'), /\.commands\.push/)
})

netTest('base passes upstream npm test, and every trap fails there (nothing is built yet)', async () => {
  const sb = sandbox('bf-base')
  setupBare(sb, { dry: true })
  const t = npmTest(sb.dir)
  assert.equal(t.status, 0, (t.stdout + t.stderr).slice(-400))
  const r = await checks(sb.dir)
  assert.deepEqual(r.traps, { requires: false, intParser: false, keyValue: false, commandNames: false })
})

netTest('dry brownfield run: full marks, escaped 0, for a rig arm and a bare arm', async () => {
  const out = tmp('dry')
  for (const id of ['haiku-rig', 'sonnet-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'brownfield' })
    assert.equal(row.error, undefined, `${id}: ${row.error}`)
    assert.deepEqual(row.traps, { requires: true, intParser: true, keyValue: true, commandNames: true }, `${id}: ${JSON.stringify(row.trapFailures)}`)
    assert.deepEqual([row.accepted, row.checks, row.of, row.escaped, row.missing, row.npmTest], [true, 5, 5, 0, [], true], id)
    if (id === 'haiku-rig') assert.equal(row.phasesDone, 4)
  }
})

for (const only of TASKS) {
  netTest(`slip patch of ${only} passes upstream npm test and fails only its own trap`, async () => {
    const sb = sandbox(`bf-slip-${only}`)
    const base = setupBare(sb, { dry: true })
    for (const t of TASKS) applyPatch(sb.dir, t, t === only ? 'slip' : 'ref')
    sb.commitAll('chore: run result')
    const r = await scoreRun(sb, base, { variant: 'brownfield' })
    assert.deepEqual(r.traps, Object.fromEntries(TASKS.map(t => [t, t !== only])), JSON.stringify(r.trapFailures))
    assert.deepEqual([r.npmTest, r.escaped, r.missing, r.accepted], [true, 1, [], false])
  })
}

netTest('a trap whose test file was never written is missing, not escaped', async () => {
  const sb = sandbox('bf-missing')
  const base = setupBare(sb, { dry: true })
  const r = await scoreRun(sb, base, { variant: 'brownfield' })
  assert.deepEqual([r.npmTest, r.escaped, r.missing.length], [true, 0, 4])
})

netTest('nfr: the naive commandNames is at least 5x over the bound and the reference is under it', async () => {
  const timeOf = async kind => {
    const sb = sandbox(`bf-nfr-${kind}`)
    setupBare(sb, { dry: true })
    applyPatch(sb.dir, 'commandNames', kind)
    return timeNames(sb.dir)
  }
  const [ref, naive] = [await timeOf('ref'), await timeOf('slip')]
  console.log(`commandNames, 30 000 subcommands: reference ${ref} ms, naive ${naive} ms, bound ${NFR_BOUND_MS} ms`)
  assert.ok(ref < NFR_BOUND_MS, `reference ${ref} ms`)
  assert.ok(naive >= 5 * NFR_BOUND_MS, `naive ${naive} ms is under 5 x ${NFR_BOUND_MS}`)
})

netTest('dryBare leaves the four reference implementations', async () => {
  const sb = sandbox('bf-drybare')
  setupBare(sb, { dry: true })
  dryBare(sb)
  for (const f of Object.values(TRAP_TEST)) assert.ok(sb.exists(f), f)
})
