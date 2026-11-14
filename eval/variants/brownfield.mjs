// The "brownfield" variant (W3b option 2): four small features on commander.js v12.1.0 (MIT, pinned by tag and sha, never committed here).
// Each task is stated as a GitHub issue would state it, and each has a trap that upstream's `npm test` and the tests a careful model writes pass:
//   requires     a rule upstream's tests already pin: an option that only has its default value is not "used" (tests/options.conflicts.test.js
//                pins it for conflicts()). The check gives the required option a default, and the requiring option a default.
//   intParser    a caller outside the obvious file: the export must also be added to esm.mjs (upstream checks that file only in `npm run test-all`).
//   keyValue     an option-parsing edge: the value of `-D name=a=b` is everything after the first `=`.
//   commandNames an NFR with a number: 30 000 subcommands in under 400 ms; a list scanned with includes() per name is far over it.
// patches/<task>/ref.patch is the reference (code and its unit test); slip.patch is a plausible slip with the same unit test, applied with `git apply`.
// Hidden checks run the model's code in child processes, one per check, with the verdict in a file the harness names (stdout is model-reachable).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { cloneUpstream, seedUpstream } from '../lib/upstream.mjs'
import { withScriptSensors } from '../lib/scriptsensors.mjs'
import { installedPlugins } from '../../tests/e2e/lib/sandbox.mjs'
import { assertOnboarding } from '../../tests/e2e/assert/onboarding.mjs'
import { Checks, must } from '../../tests/e2e/lib/checks.mjs'

const HERE = import.meta.dirname
export const UPSTREAM = { url: 'https://github.com/tj/commander.js', tag: 'v12.1.0', sha: '970ecae402b253de691e6a9066fea22f38fe7431', name: 'commander' }
export const TASKS = ['requires', 'intParser', 'keyValue', 'commandNames']
export const TRAP_TEST = { requires: 'tests/option.requires.test.js', intParser: 'tests/intParser.test.js', keyValue: 'tests/option.keyValue.test.js', commandNames: 'tests/command.commandNames.test.js' }
// Words that name a trap or its cause; no prompt may contain one (a spec checks).
export const TRAP_WORDS = ['trap', 'hidden', 'default', 'esm.mjs', 'typings', 'split', 'indexOf', 'includes(', 'quadratic', 'O(n', 'getOptionValueSource']
export const NFR_BOUND_MS = 400
const NFR_COMMANDS = 30_000

const ISSUES = Object.fromEntries(TASKS.map(t => [t, fs.readFileSync(path.join(HERE, `brownfield/tasks/${t}.md`), 'utf8').trim()]))
const patchOf = (task, kind) => path.join(HERE, `brownfield/patches/${task}/${kind}.patch`)
const upstream = () => cloneUpstream(UPSTREAM)

export const BARE_PROMPT = `The repository is commander.js ${UPSTREAM.tag}. Implement the four issues below in it, editing the existing code, with jest tests in tests/ (issue 1 in ${TRAP_TEST.requires}, issue 2 in ${TRAP_TEST.intParser}, issue 3 in ${TRAP_TEST.keyValue}, issue 4 in ${TRAP_TEST.commandNames}) and \`npm test\` passing. Work until it is done. In this unattended session, read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no cd, pipes, redirects, &&, ; or heredocs): compound commands are denied.\n\n${TASKS.map((t, i) => `Issue ${i + 1}: ${ISSUES[t]}`).join('\n\n')}`

// --- the rig phases: each task is one change; the dry driver copies the reference files, staged cumulatively from the pinned clone ----------
const filesOf = task => [...fs.readFileSync(patchOf(task, 'ref'), 'utf8').matchAll(/^diff --git a\/(\S+) b\//gm)].map(m => m[1])
export function applyPatch(dir, task, kind) {
  execFileSync('git', ['apply', '--whitespace=nowarn', patchOf(task, kind)], { cwd: dir, stdio: 'pipe' })
}
let staged
function stage() {
  if (staged) return staged
  const base = upstream()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-bf-stage-'))
  const work = path.join(root, 'work')
  fs.mkdirSync(work)
  for (const task of TASKS) {
    for (const f of filesOf(task)) if (!fs.existsSync(path.join(work, f)) && fs.existsSync(path.join(base, f))) { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.copyFileSync(path.join(base, f), path.join(work, f)) }
    applyPatch(work, task, 'ref')
    for (const f of filesOf(task)) { fs.mkdirSync(path.dirname(path.join(root, task, f)), { recursive: true }); fs.copyFileSync(path.join(work, f), path.join(root, task, f)) }
  }
  return (staged = root)
}
const files = (task, keep) => filesOf(task).filter(keep).map(f => ({ src: path.join(stage(), task, f), dest: f }))

const phase = (n, slug, task) => {
  const [title, ...rest] = ISSUES[task].split('\n\n')
  const p = {
    id: `K${n}`, slug, type: 'feature', title: title.trim(),
    prompt: `/rig-start A feature, as the issue below states it. Edit the existing files, do not rewrite them. Put its jest tests in ${TRAP_TEST[task]}.\n\n${ISSUES[task]}`,
    intent: { problem: rest[0].trim(), outcome: `K${n} holds as the issue says and the upstream tests still pass.`, nonGoals: 'Anything the issue does not ask for.' },
    spec: `# Spec: ${title.trim()}\n\n## Behaviours\n- K${n}: ${title.trim()}\n\n## Out of scope\n- Anything the issue does not ask for.\n\n## Open questions\nnone\n`,
    plan: `# Plan: ${title.trim()}\n\n## Files\n${filesOf(task).map(f => `- ${f}`).join('\n')}\n\n## Tests\n- K${n}: ${TRAP_TEST[task]} (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n`,
    contracts: [], commit: `feat: ${title.trim().split(':')[0].toLowerCase()}`, acceptance: 'brownfield',
  }
  // The files exist only once the pinned clone does, so they are read when the scripted driver copies them.
  Object.defineProperties(p, { tests: { enumerable: true, get: () => files(task, f => f.startsWith('tests/')) }, impl: { enumerable: true, get: () => files(task, f => !f.startsWith('tests/')) } })
  return p
}
export const PHASES = [phase(1, 'option-requires', 'requires'), phase(2, 'int-parser', 'intParser'), phase(3, 'option-key-value', 'keyValue'), phase(4, 'command-names', 'commandNames')]

// --- sandboxes ------------------------------------------------------------------------------------------------------------------------
const BASE_MESSAGE = `chore: commander.js ${UPSTREAM.tag} (${UPSTREAM.sha.slice(0, 7)}), upstream tree`
export function setupBare(sb, { dry = false } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  return seedUpstream(sb, upstream(), BASE_MESSAGE)
}

// Onboarding of an existing repo: the base is upstream's tree; rig is initialised on top, with the unit sensor on upstream's own suite. Upstream is green, so
// the baseline's knownRed stays empty. (The brief lane of the shop variants does not apply: each task is its own /rig-start change.)
export const CLAUDE_MD = '# commander.js\n\nsdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.\n\n## Map\n- lib/ the library: command.js, option.js, argument.js, help.js, suggestSimilar.js, error.js\n- tests/ jest tests, one file per feature\n'
export async function setupRig(sb, { dry = false, registry = {} } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  const base = seedUpstream(sb, upstream(), BASE_MESSAGE)
  const reg = { ...registry, sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }
  delete reg.contracts
  must(sb.sdlc(['init']), 'init')
  sb.write('.rig/sensors.json', withScriptSensors(JSON.stringify(reg), ['test-all'])) // test-all runs test-esm too
  sb.write('CLAUDE.md', CLAUDE_MD)
  must(sb.sdlc(['init', '--full']), 'init --full')
  // What /rig:init does for a repo-wide linter: commander's typed `eslint .` would fail on the vendored .rig/bin/*.ts otherwise.
  sb.write('eslint.config.js', sb.read('eslint.config.js').replace('module.exports = tseslint.config(', "module.exports = tseslint.config(\n  { ignores: ['.rig/', '.claude/'] },"))
  must(sb.sdlc(['sync']), 'sync')
  must(sb.sdlc(['baseline']), 'baseline')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('brownfield onboarding')
  await assertOnboarding(c, sb, { lane: 'brownfield', modules: ['lib/', 'tests/'] })
  if (c.failed.length) throw new Error(`onboarding failed: ${c.failed.map(f => f.name).join('; ')}`)
  return base
}

// What a perfect bare session leaves behind: the four reference implementations.
export function dryBare(sb) { for (const t of TASKS) applyPatch(sb.dir, t, 'ref') }

// --- hidden checks --------------------------------------------------------------------------------------------------------------------
const quiet = () => ({ writeErr() {}, writeOut() {} })
const parse = (c, build, argv) => {
  const program = new c.Command().exitOverride().configureOutput(quiet())
  build(program)
  try { program.parse(['node', 'test', ...argv]); return { program } } catch (e) { return { error: String(e.message), program } }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const CHECKS = [
  // requires: given means given on the command line (or env), never a default
  repo => {
    const c = createRequire(path.join(repo, 'package.json'))('./index.js')
    const { Option } = c
    const want = "error: option '--cert <file>' requires option '--key <file>'"
    const plain = (cert, key) => p => p.addOption(cert(new Option('--cert <file>').requires('key'))).addOption(key(new Option('--key <file>')))
    const id = o => o
    let r = parse(c, plain(id, id), ['--cert', 'a.pem'])
    if (r.error !== want) return `--cert without --key gave ${JSON.stringify(r.error)}, want ${JSON.stringify(want)}`
    r = parse(c, plain(id, id), ['--cert', 'a.pem', '--key', 'a.key'])
    if (r.error || !same(r.program.opts(), { cert: 'a.pem', key: 'a.key' })) return `--cert with --key gave ${JSON.stringify(r.error ?? r.program.opts())}`
    r = parse(c, plain(id, o => o.default('k.pem')), ['--cert', 'a.pem'])
    if (r.error !== want) return `when --key only has its own value (an option with a preset value is not given), --cert alone gave ${JSON.stringify(r.error)}, want ${JSON.stringify(want)}`
    r = parse(c, plain(o => o.default('c.pem'), id), [])
    if (r.error) return `an option that was not used on the command line still demanded its required option: ${r.error}`
    return true
  },
  // intParser: from require and from an ES module import of the package entry
  repo => {
    const c = createRequire(path.join(repo, 'package.json'))('./index.js')
    if (typeof c.intParser !== 'function') return 'require("commander").intParser is not a function'
    const probe = `import { intParser } from ${JSON.stringify(path.join(repo, 'esm.mjs'))}
const p = intParser(-10, 10), out = []
for (const v of ['5', '-5', '10', '-10']) out.push(p(v))
const bad = []
for (const v of ['11', '-11', '5.5', '1e1', '0x5', ' 5', '', 'abc', '+5']) { try { p(v); bad.push(v) } catch (e) { if (e.name !== 'InvalidArgumentError' && e.constructor.name !== 'InvalidArgumentError') bad.push('wrong error for ' + v) } }
console.log(JSON.stringify({ out, bad, msg: (() => { try { p('99') } catch (e) { return e.message } })() }))`
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: repo, encoding: 'utf8', timeout: 30_000 })
    if (r.status !== 0) return `import { intParser } from 'commander' failed: ${String(r.stderr).split('\n').find(l => /Error/.test(l)) ?? `exit ${r.status}`}`
    let got
    try { got = JSON.parse(r.stdout.trim().split('\n').at(-1)) } catch { return `the import probe printed ${JSON.stringify(r.stdout.slice(0, 80))}` }
    if (!same(got.out, [5, -5, 10, -10]) || got.bad.length || got.msg !== 'Not an integer from -10 to 10.') return `through the ES module: ${JSON.stringify(got)}`
    const q = c.intParser(1, 65535)
    const run = v => parse(c, p => p.option('-p, --port <number>', 'port', q), ['--port', v])
    return (run('8080').program.opts().port === 8080 && run('99999').error === "error: option '-p, --port <number>' argument '99999' is invalid. Not an integer from 1 to 65535.") || 'through require, --port 8080 or the message for 99999 was wrong'
  },
  // keyValue: the value is everything after the first =
  repo => {
    const c = createRequire(path.join(repo, 'package.json'))('./index.js')
    const r = parse(c, p => p.addOption(new c.Option('-D, --define <pair>').keyValue()), ['-D', 'a=1', '--define', 'url=http://h/?q=1&x=2', '--define=eq=a=b', '-D', 'z=='])
    const want = { a: '1', url: 'http://h/?q=1&x=2', eq: 'a=b', z: '=' }
    return (!r.error && same(r.program.opts().define, want)) || `-D with a value that has = in it gave ${JSON.stringify(r.error ?? r.program.opts().define)}, want ${JSON.stringify(want)}`
  },
  // commandNames: right on a small tree, then fast on 30 000 subcommands each with an alias, nested two deep
  repo => {
    const c = createRequire(path.join(repo, 'package.json'))('./index.js')
    const small = new c.Command()
    small.command('remove').alias('rm'); small.command('remote').command('add'); small.command('add')
    if (!same(small.commandNames(), ['add', 'remote', 'remove', 'rm'])) return `commandNames of the issue's example gave ${JSON.stringify(small.commandNames())}`
    const { program, want } = bigProgram(c)
    const ms = () => { const t0 = performance.now(); const got = program.commandNames(); return [performance.now() - t0, got] }
    let [t, got] = ms()
    if (t >= NFR_BOUND_MS) t = Math.min(t, ms()[0])
    if (!same(got, want)) return `commandNames of ${NFR_COMMANDS} subcommands was not the sorted unique list (${got?.length} names, want ${want.length})`
    return t < NFR_BOUND_MS || `commandNames took ${Math.round(t)} ms on ${NFR_COMMANDS} subcommands with an alias each, want under ${NFR_BOUND_MS} ms`
  },
]
// 30 000 subcommands, each with an alias, built through the public API: 150 groups of 199 commands (registering them all at one level is itself
// quadratic in upstream). A few leaf names are shared between groups.
function bigProgram(c) {
  const program = new c.Command()
  const names = new Set()
  const GROUPS = 150, LEAVES = 199
  for (let g = 0; g < GROUPS; g++) {
    const group = program.command(`group-${String(g).padStart(3, '0')}`).alias(`g${g}`)
    names.add(group.name()); names.add(`g${g}`)
    for (let i = 0; i < LEAVES; i++) {
      const n = g * LEAVES + i
      const sub = group.command(i === 0 && g % 25 === 0 ? 'shared' : `command-${String(n).padStart(6, '0')}`).alias(`c${n}`)
      names.add(sub.name()); names.add(`c${n}`)
    }
  }
  return { program, want: [...names].sort() }
}
const NAMES = TASKS

// Each check runs in a child that writes its verdict to a file the harness names; it runs in its own process group, killed whole at the limit.
function runChild(repo, arg, { timeoutMs, tmp }) {
  const verdict = path.join(tmp, `verdict-${arg}.json`)
  return new Promise(resolve => {
    const child = spawn(process.execPath, [import.meta.filename, repo, String(arg), verdict], { cwd: repo, detached: true, stdio: 'ignore' })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, timeoutMs)
    const done = (code, err) => {
      clearTimeout(timer)
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
      try { resolve(JSON.parse(fs.readFileSync(verdict, 'utf8')).r) } catch { resolve(timedOut ? 'check timed out' : `check crashed: ${err ?? `exit ${code}`}`) }
    }
    child.on('exit', code => done(code))
    child.on('error', e => done(127, e.message))
  })
}
export async function checks(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-bf-')) } = {}) {
  const results = []
  for (let i = 0; i < CHECKS.length; i++) results.push(await runChild(repo, i, { timeoutMs, tmp }))
  return { traps: Object.fromEntries(NAMES.map((n, i) => [n, results[i] === true])), failures: NAMES.flatMap((n, i) => (results[i] === true ? [] : [`${n}: ${results[i]}`])) }
}
// The ms the check's own timing call takes on the repo (a spec measures the naive version against the bound with it).
export async function timeNames(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-bf-')) } = {}) {
  const r = await runChild(repo, 'time', { timeoutMs, tmp })
  return typeof r === 'number' ? Math.round(r) : r
}

// The scorer's branch (score.mjs hands over its bounded runner and tamper judge): upstream's own suite, then the four checks.
export async function score(sb, { timeoutMs, runBounded, tamper }) {
  const t = await runBounded('npm', ['test', '--silent'], { cwd: sb.dir, timeoutMs, env: sb.env })
  const npmTest = t.status === 0
  const { traps, failures } = await checks(sb.dir)
  const failed = Object.keys(traps).filter(n => !traps[n])
  // A trap escaped only if its behaviour's test file exists and npm test passed; no test file means the behaviour was never built.
  const missing = failed.filter(n => !fs.existsSync(path.join(sb.dir, TRAP_TEST[n])))
  const all = [npmTest, ...Object.values(traps)]
  const n = all.filter(Boolean).length
  return { checks: n, of: all.length, accepted: n === all.length, npmTest, traps, trapFailures: failures, escaped: npmTest ? failed.length - missing.length : null, missing, layerViolations: null, tamper: tamper() }
}

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  let r
  try {
    if (process.argv[3] === 'time') {
      const c = createRequire(path.join(process.argv[2], 'package.json'))('./index.js')
      const { program } = bigProgram(c)
      const t0 = performance.now(); program.commandNames(); r = performance.now() - t0
    } else r = await CHECKS[Number(process.argv[3])](process.argv[2])
  } catch (e) { r = `check crashed: ${String(e?.message ?? e).split('\n')[0]}` }
  fs.writeFileSync(process.argv[4], JSON.stringify({ r }))
  process.exit(0)
}
