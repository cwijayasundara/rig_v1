// The "ui" variant (W5, U0): two behaviours on the built hard shop (B1-B19), an endpoint (B20) and a screen (B21), scored by a real browser.
// Traps (each passes the unit tests a careful model writes; only a browser sees them): error (the endpoint's 404 must show as an alert, not a blank table)
// and field (a line shows the product name from the catalog, not the sku the endpoint gives).
// patches/ref.u20.patch then ref.u21.patch turn the built hard shop into the reference; error.slip.patch and field.slip.patch apply on top of both.
// The base is not imported (setup.mjs imports this module): setup.mjs registers it with useBase.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { createSandbox } from '../../tests/e2e/lib/sandbox.mjs'
import { stateOf } from './rules.mjs'
import { browserAvailable } from '../lib/browser.mjs'
import { CHECKS } from './ui/checks.mjs'

const HERE = import.meta.dirname
export const TASKS = ['ui']
export const TRAPS = ['error', 'field']
// The test file each behaviour is asked for; a trap whose test file was never written is missing, not escaped.
export const TRAP_TEST = { error: 'test/customer-page.test.js', field: 'test/customer-page.test.js' }
// Words that name a trap or its cause: no prompt or issue contains one (a spec checks).
export const TRAP_WORDS = ['alert', 'aria', 'catalog', '/products', 'playwright', 'chromium', 'trap', 'hidden', 'blank', 'undefined']

const read = rel => fs.readFileSync(path.join(HERE, rel), 'utf8')
const [, ...SECTIONS] = read('ui/tasks/ui.md').split(/^## /m)
export const ISSUES = SECTIONS.map(s => s.trim())
const patch = name => path.join(HERE, `ui/patches/${name}.patch`)
const EDIT = 'Edit the existing files, do not rewrite them.'

export const BARE_PROMPT = `The shop described in BRIEF.md already has behaviours B1–B19 built and passing. Implement the two issues below, editing the existing files in src/, with node --test tests in test/ (issue 1 in test/customer-orders.test.js, issue 2 in ${TRAP_TEST.field}) and \`npm test\` passing. Work until it is done. In this unattended session, read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no cd, pipes, redirects, &&, ; or heredocs): compound commands are denied.\n\n${ISSUES.map((t, i) => `Issue ${i + 1}: ${t}`).join('\n\n')}`

// --- the base and the reference -------------------------------------------------------------------------------------
let baseFn
let staged
// setup.mjs registers the hard-shop builder: base(sb) leaves B1-B19 built in sb.dir.
export function useBase(fn) { baseFn = fn; staged = undefined }
export function applyPatch(dir, name) {
  execFileSync('git', ['apply', '--whitespace=nowarn', patch(name)], { cwd: dir, stdio: 'pipe' })
}
const filesOf = name => [...read(`ui/patches/${name}.patch`).matchAll(/^diff --git a\/(\S+) b\//gm)].map(m => m[1])
// What the reference leaves in each file after each step, cut from a built base once; the scripted driver copies them.
function stage() {
  if (staged) return staged
  if (!baseFn) throw new Error('ui base not registered: import setup.mjs first')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ui-stage-'))
  const sb = createSandbox({ name: 'ui-stage', out: path.join(root, 'sb') })
  baseFn(sb)
  for (const step of ['ref.u20', 'ref.u21']) {
    execFileSync('git', ['apply', '--whitespace=nowarn', patch(step)], { cwd: sb.dir, stdio: 'pipe' })
    for (const f of filesOf(step)) { fs.mkdirSync(path.dirname(path.join(root, step, f)), { recursive: true }); fs.copyFileSync(path.join(sb.dir, f), path.join(root, step, f)) }
  }
  return (staged = root)
}
const files = (step, keep) => filesOf(step).filter(keep).map(f => ({ src: path.join(stage(), step, f), dest: f }))

const phase = (id, step, slug, title, behaviour, issue, problem) => {
  const impl = filesOf(step).filter(f => !f.startsWith('test/'))
  const p = stateOf(id, slug, title, behaviour, `/rig-start A feature, as the issue below states it. ${EDIT} Put its tests in test/${behaviour.test}.\n\n${issue}`, { problem }, [], impl, `feat: ${title.toLowerCase()}`)
  Object.defineProperties(p, { tests: { enumerable: true, get: () => files(step, f => f.startsWith('test/')) }, impl: { enumerable: true, get: () => files(step, f => !f.startsWith('test/')) } })
  return Object.assign(p, { contracts: [], acceptance: 'ui' })
}
export const PHASE_U20 = phase('U20', 'ref.u20', 'customer-orders', 'Customer orders endpoint',
  { id: 'B20', text: 'GET /customers/<name>/orders answers the customer\'s orders, newest first; no orders is 404.', test: 'customer-orders.test.js' }, ISSUES[0], 'Support cannot see what one customer has bought.')
export const PHASE_U21 = phase('U21', 'ref.u21', 'customer-page', 'Customer orders screen',
  { id: 'B21', text: '/ui/customers/<name> shows what the endpoint answers, as a table with one row per order.', test: 'customer-page.test.js' }, ISSUES[1], 'There is no screen for a customer\'s orders.')
export const PHASES = [PHASE_U20, PHASE_U21]

// What a perfect bare session leaves behind: the built hard shop, then the reference.
export function dryBare(sb, { base = baseFn } = {}) {
  base(sb)
  for (const step of ['ref.u20', 'ref.u21']) applyPatch(sb.dir, step)
}

// --- hidden checks --------------------------------------------------------------------------------------------------
// Each check runs in a child that writes its verdict to a file the harness names; its process group is killed whole at the limit.
function runChild(repo, trap, { timeoutMs, tmp }) {
  const verdict = path.join(tmp, `verdict-${trap}.json`)
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(HERE, 'ui/checks.mjs'), repo, trap, verdict], { cwd: repo, detached: true, stdio: 'ignore' })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, timeoutMs)
    const done = (code, err) => {
      clearTimeout(timer)
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
      const why = timedOut ? 'check timed out' : `check crashed: ${err ?? `exit ${code}`}`
      try { resolve(JSON.parse(fs.readFileSync(verdict, 'utf8')).r) } catch { resolve({ basic: why, trap: why }) }
    }
    child.on('exit', code => done(code))
    child.on('error', e => done(127, e.message))
  })
}
// -> { traps: { error, field } -> boolean, basic: { error, field } -> boolean, failures: string[] }
export async function checks(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ui-')) } = {}) {
  const unavailable = browserAvailable()
  const results = []
  for (const n of TRAPS) results.push(unavailable !== true ? { basic: 'check crashed: browser unavailable (run eval/setup-browser.mjs)', trap: 'check crashed: browser unavailable' } : await runChild(repo, n, { timeoutMs, tmp }))
  const ok = (i, k) => results[i][k] === true
  return {
    traps: Object.fromEntries(TRAPS.map((n, i) => [n, ok(i, 'basic') && ok(i, 'trap')])),
    basic: Object.fromEntries(TRAPS.map((n, i) => [n, ok(i, 'basic')])),
    failures: TRAPS.flatMap((n, i) => (ok(i, 'basic') && ok(i, 'trap') ? [] : [`${n}: ${ok(i, 'basic') ? results[i].trap : `basic behaviour: ${results[i].basic}`}`])),
  }
}

// The scorer's branch (score.mjs hands over its bounded runner and tamper judge): the shop's own suite, then the two browser checks.
// A trap whose test file is absent or whose basic behaviour failed was never built: missing, not escaped. checksFn is a seam for specs.
export async function score(sb, { timeoutMs, runBounded, tamper, checksFn = checks }) {
  const t = await runBounded('npm', ['test', '--silent'], { cwd: sb.dir, timeoutMs, env: sb.env })
  const npmTest = t.status === 0
  const { traps, basic, failures } = await checksFn(sb.dir)
  const failed = TRAPS.filter(n => !traps[n])
  const missing = failed.filter(n => !fs.existsSync(path.join(sb.dir, TRAP_TEST[n])) || basic?.[n] !== true)
  const all = [npmTest, ...Object.values(traps)]
  const n = all.filter(Boolean).length
  return { checks: n, of: all.length, accepted: n === all.length, npmTest, traps, basic, trapFailures: failures, escaped: npmTest ? failed.length - missing.length : null, missing, layerViolations: null, tamper: tamper() }
}
