// The "knex" variant (W5): two small tasks on knex 3.1.0 (MIT, pinned by tag and sha, never committed here), four traps that upstream's `npm test` passes.
// Same machinery as brownfield.mjs; the hidden checks live in two files, one per task (knex/checks.t1.mjs, knex/checks.t2.mjs), each an array of
// { task, trap, run(repo) -> true | string }. Traps: caller, types (task notLike); rule, dialect (task emptyUpsert).
// patches/<task>/{ref,slip}.patch and tasks/<task>.md are written per task; they are read when used, so this module loads without them.
// The harness's own edits to the base (knex/base.patch): upstream's `npm test` needs a database server and its db-less suite requires two files that crash
// on this Node (mock-fs), so `npm test` is the sqlite3 unit config, 1532 passing. `test:sqlite` (the database suite) stays as upstream has it.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { cloneUpstream, seedUpstream } from '../lib/upstream.mjs'
import { installedPlugins } from '../../tests/e2e/lib/sandbox.mjs'
import { assertOnboarding } from '../../tests/e2e/assert/onboarding.mjs'
import { Checks, must } from '../../tests/e2e/lib/checks.mjs'
import T1_CHECKS from './knex/checks.t1.mjs'
import T2_CHECKS from './knex/checks.t2.mjs'

const HERE = import.meta.dirname
const LOCKFILE = path.join(HERE, 'knex/package-lock.json')
const BASE_PATCH = path.join(HERE, 'knex/base.patch')
export const UPSTREAM = { url: 'https://github.com/knex/knex', tag: '3.1.0', sha: '4ca3dd5bc28e0665c5bed55026fac2ec45489d81', name: 'knex', lockfile: LOCKFILE, rebuild: ['sqlite3'] }
export const TASKS = ['notLike', 'emptyUpsert']
export const TRAP_TEST = { notLike: 'test/unit/query/where-not-like.js', emptyUpsert: 'test/unit/query/empty-upsert.js' }
// Trap names, in report order, and the task each belongs to.
export const TRAPS = { caller: 'notLike', types: 'notLike', rule: 'emptyUpsert', dialect: 'emptyUpsert' }
const NAMES = Object.keys(TRAPS)
// Words that name a trap or its cause; no prompt may contain one (a spec checks).
export const TRAP_WORDS = ['trap', 'hidden', 'collate', 'onConflict', 'types/index.d.ts', 'test:sqlite', 'typings', 'mock-fs']
export const CHECKS = [...T1_CHECKS, ...T2_CHECKS]

const issueOf = task => {
  try { return fs.readFileSync(path.join(HERE, `knex/tasks/${task}.md`), 'utf8').trim() } catch { return `TODO issue for ${task}.\n\nTODO: the issue text is written with the task.` }
}
const ISSUES = Object.fromEntries(TASKS.map(t => [t, issueOf(t)]))
const patchOf = (task, kind) => path.join(HERE, `knex/patches/${task}/${kind}.patch`)
const upstream = () => cloneUpstream(UPSTREAM)

export const BARE_PROMPT = `The repository is knex ${UPSTREAM.tag}. Implement the two issues below in it, editing the existing code, with mocha tests in test/ (issue 1 in ${TRAP_TEST.notLike}, issue 2 in ${TRAP_TEST.emptyUpsert}) and \`npm test\` passing. Work until it is done. In this unattended session, read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no cd, pipes, redirects, &&, ; or heredocs): compound commands are denied.\n\n${TASKS.map((t, i) => `Issue ${i + 1}: ${ISSUES[t]}`).join('\n\n')}`

// --- the rig phases: each task is one change; the dry driver copies the reference files, staged cumulatively from the pinned clone ----------
const filesOf = task => [...fs.readFileSync(patchOf(task, 'ref'), 'utf8').matchAll(/^diff --git a\/(\S+) b\//gm)].map(m => m[1])
export function applyPatch(dir, task, kind) {
  execFileSync('git', ['apply', '--whitespace=nowarn', patchOf(task, kind)], { cwd: dir, stdio: 'pipe' })
}
let staged
function stage() {
  if (staged) return staged
  const base = upstream()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-kx-stage-'))
  const work = path.join(root, 'work')
  fs.mkdirSync(work)
  for (const task of TASKS) {
    for (const f of filesOf(task)) if (!fs.existsSync(path.join(work, f)) && fs.existsSync(path.join(base, f))) {
      fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.copyFileSync(path.join(base, f), path.join(work, f))
      // The sandbox's base carries base.patch, so a staged file that patch touches starts from its patched form.
      if (fs.readFileSync(BASE_PATCH, 'utf8').includes(`diff --git a/${f} `)) execFileSync('git', ['apply', '--whitespace=nowarn', `--include=${f}`, BASE_PATCH], { cwd: work, stdio: 'pipe' })
    }
    applyPatch(work, task, 'ref')
    for (const f of filesOf(task)) { fs.mkdirSync(path.dirname(path.join(root, task, f)), { recursive: true }); fs.copyFileSync(path.join(work, f), path.join(root, task, f)) }
  }
  return (staged = root)
}
const files = (task, keep) => filesOf(task).filter(keep).map(f => ({ src: path.join(stage(), task, f), dest: f }))

const phase = (n, slug, task) => {
  const [title, ...rest] = ISSUES[task].split('\n\n')
  const p = {
    id: `N${n}`, slug, type: 'feature', title: title.trim(),
    prompt: `/rig:start A feature, as the issue below states it. Edit the existing files, do not rewrite them. Put its mocha tests in ${TRAP_TEST[task]}.\n\n${ISSUES[task]}`,
    intent: { problem: (rest[0] ?? title).trim(), outcome: `N${n} holds as the issue says and the upstream tests still pass.`, nonGoals: 'Anything the issue does not ask for.' },
    spec: `# Spec: ${title.trim()}\n\n## Behaviours\n- N${n}: ${title.trim()}\n\n## Out of scope\n- Anything the issue does not ask for.\n\n## Open questions\nnone\n`,
    contracts: [], commit: `feat: ${title.trim().split(':')[0].toLowerCase()}`, acceptance: 'brownfield',
  }
  // The files exist only once the pinned clone and the reference patch do, so they (and the plan that lists them) are read when the scripted driver copies them.
  const plan = () => `# Plan: ${title.trim()}\n\n## Files\n${filesOf(task).map(f => `- ${f}`).join('\n')}\n\n## Tests\n- N${n}: ${TRAP_TEST[task]} (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n`
  Object.defineProperties(p, { plan: { enumerable: true, get: plan }, tests: { enumerable: true, get: () => files(task, f => f.startsWith('test/')) }, impl: { enumerable: true, get: () => files(task, f => !f.startsWith('test/')) } })
  return p
}
export const PHASES = [phase(1, 'where-not-like', 'notLike'), phase(2, 'empty-upsert', 'emptyUpsert')]

// --- sandboxes ------------------------------------------------------------------------------------------------------------------------
const BASE_MESSAGE = `chore: knex ${UPSTREAM.tag} (${UPSTREAM.sha.slice(0, 7)}), upstream tree`
const seed = sb => seedUpstream(sb, upstream(), BASE_MESSAGE, { patch: BASE_PATCH })
export function setupBare(sb, { dry = false } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  return seed(sb)
}

// Onboarding of an existing repo: the base is upstream's tree with the base patch; rig is initialised on top, with the unit sensor on `npm test`.
export const CLAUDE_MD = '# knex\n\nrig is on in this repo: work from the request as usual, and its checks and guides run on every turn; /rig:start is the full workflow (spec, plan, approval), used only when the person asks for it. Use superpowers skills only when an sdlc skill names one.\n\n## Map\n- lib/ the library: the query builder, the dialects, the schema builder, the migrations\n- test/ mocha tests; test/unit/query holds the query builder specs\n'
export async function setupRig(sb, { dry = false, registry = {} } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  const base = seed(sb)
  const reg = { ...registry, sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }
  delete reg.contracts
  must(sb.sdlc(['init']), 'init')
  sb.write('.rig/sensors.json', JSON.stringify(reg, null, 2) + '\n')
  sb.write('CLAUDE.md', CLAUDE_MD)
  must(sb.sdlc(['init', '--full']), 'init --full')
  must(sb.sdlc(['baseline']), 'baseline')
  must(sb.sdlc(['sync']), 'sync')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('knex onboarding')
  await assertOnboarding(c, sb, { lane: 'brownfield', modules: ['lib/', 'test/'] })
  if (c.failed.length) throw new Error(`onboarding failed: ${c.failed.map(f => f.name).join('; ')}`)
  return base
}

// What a perfect bare session leaves behind: the two reference implementations.
export function dryBare(sb) { for (const t of TASKS) applyPatch(sb.dir, t, 'ref') }

// --- hidden checks --------------------------------------------------------------------------------------------------------------------
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
// -> { traps: { caller, types, rule, dialect } -> boolean, failures: string[] }. A trap with no check yet fails.
export async function checks(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-kx-')) } = {}) {
  const results = []
  for (const n of NAMES) {
    const i = CHECKS.findIndex(c => c.trap === n)
    results.push(i < 0 ? 'no check written for this trap' : await runChild(repo, i, { timeoutMs, tmp }))
  }
  return { traps: Object.fromEntries(NAMES.map((n, i) => [n, results[i] === true])), failures: NAMES.flatMap((n, i) => (results[i] === true ? [] : [`${n}: ${results[i]}`])) }
}

// The scorer's branch (score.mjs hands over its bounded runner and tamper judge): upstream's own suite (the base's `npm test`), then the four checks.
export async function score(sb, { timeoutMs, runBounded, tamper }) {
  const t = await runBounded('npm', ['test', '--silent'], { cwd: sb.dir, timeoutMs, env: sb.env })
  const npmTest = t.status === 0
  const { traps, failures } = await checks(sb.dir)
  const failed = Object.keys(traps).filter(n => !traps[n])
  // A trap escaped only if its task's test file exists and npm test passed; no test file means the behaviour was never built.
  const missing = [...new Set(failed.map(n => TRAPS[n]))].filter(task => !fs.existsSync(path.join(sb.dir, TRAP_TEST[task])))
  const all = [npmTest, ...Object.values(traps)]
  const n = all.filter(Boolean).length
  return { checks: n, of: all.length, accepted: n === all.length, npmTest, traps, trapFailures: failures, escaped: npmTest ? failed.filter(f => !missing.includes(TRAPS[f])).length : null, missing, layerViolations: null, tamper: tamper() }
}

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  let r
  try { r = await CHECKS[Number(process.argv[3])].run(process.argv[2]) } catch (e) { r = `check crashed: ${String(e?.message ?? e).split('\n')[0]}` }
  fs.writeFileSync(process.argv[4], JSON.stringify({ r }))
  process.exit(0)
}
