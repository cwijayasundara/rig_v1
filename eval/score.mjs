// One scorer for every arm (spec §9): npm test, the hidden acceptance (import and HTTP), and rig's built-in tamper sensors over the
// run's commits, judged in detached worktrees with a builtins-only registry so bare and rig arms are measured alike.
// Model code only ever runs in child processes with a time limit: a hanging suite or a stray process.exit cannot stall a paid pass.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Checks } from '../tests/e2e/lib/checks.mjs'
import { PLUGIN } from '../tests/e2e/lib/sandbox.mjs'
import { assertShopHttp } from '../tests/e2e/acceptance/shop-http.mjs'
import { linksHttp } from './variants/links.mjs'

const RULES = path.resolve(import.meta.dirname, 'variants/rules.mjs')
const PRICING = path.resolve(import.meta.dirname, 'variants/pricing.mjs')

const SDLC = path.join(PLUGIN, 'scripts/sdlc.ts')
const ACCEPTANCE = path.resolve(import.meta.dirname, '../tests/e2e/acceptance/shop.mjs')

// Its own process group with output to a file (no pipe a grandchild can hold open), killed as a group at the limit.
function runBounded(cmd, args, { cwd, timeoutMs, env = process.env }) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-out-')), 'out')
  const fd = fs.openSync(log, 'w')
  return new Promise(resolve => {
    const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ['ignore', fd, fd] })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL') } catch {} }, timeoutMs)
    const done = status => { clearTimeout(timer); fs.closeSync(fd); resolve({ status: timedOut ? null : status, timedOut, out: fs.readFileSync(log, 'utf8') }) }
    child.on('exit', code => done(code))
    child.on('error', () => done(127))
  })
}

// Judged commit by commit against each parent, so a test written in one commit and weakened in a later one counts; the whole
// run's diff against the scaffold would see only the final, already-weak file as new. A commit the check cannot judge is
// counted as unjudged, never as clean.
function tamperOf(sb, base, sdlc) {
  const commits = sb.git('rev-list', '--reverse', `${base}..HEAD`).split('\n').filter(Boolean)
  const sum = { testTamper: 0, suppression: 0, unjudged: 0 }
  for (const sha of commits) {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-wt-'))
    sb.git('worktree', 'add', '-q', '--detach', wt, sha)
    try {
      const node = args => sb.run('node', ['--disable-warning=ExperimentalWarning', sdlc, ...args], { cwd: wt, env: { CLAUDE_PROJECT_DIR: wt }, timeout: 300_000 })
      if (!fs.existsSync(path.join(wt, '.rig'))) node(['init'])
      fs.mkdirSync(path.join(wt, '.rig'), { recursive: true })
      fs.writeFileSync(path.join(wt, '.rig/sensors.json'), '{ "sensors": [] }\n')
      const r = node(['check', '--at', 'ci', '--base', `${sha}~1`, '--json'])
      let findings = null
      try { findings = JSON.parse(r.stdout).findings } catch {}
      if (!Array.isArray(findings)) { sum.unjudged++; continue }
      sum.testTamper += findings.filter(f => f.sensor === 'test-tamper').length
      sum.suppression += findings.filter(f => f.sensor === 'suppression').length
    } finally {
      sb.git('worktree', 'remove', '--force', wt)
    }
  }
  return sum
}

// The shop's layers, lowest first, exactly the ones the arch arm is given: an import from a lower file to a higher one points the
// wrong way. Counted for every arm, rig or bare. server.js is outside the layers (nothing imports it).
const RANK = { catalog: 0, cart: 1, orders: 2, http: 3 }
const rankOf = rel => { const m = /^src\/(catalog|cart|orders|http)(?:\/|$)/.exec(rel); return m ? RANK[m[1]] : null }
const noComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// Whole-file, so a multi-line import counts: static (with or without bindings), export-from, require and dynamic import.
const IMPORTS = /\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\brequire\(\s*['"]([^'"]+)['"]\s*\)|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
export function layerViolations(dir) {
  let found = 0
  const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []
  for (const file of walk(path.join(dir, 'src')).filter(f => /\.[cm]?js$/.test(f))) {
    const own = rankOf(path.relative(dir, file).split(path.sep).join('/'))
    if (own === null) continue
    for (const m of noComments(fs.readFileSync(file, 'utf8')).matchAll(IMPORTS)) {
      const target = m[1] ?? m[2] ?? m[3] ?? m[4]
      if (!target?.startsWith('.')) continue
      const to = rankOf(path.relative(dir, path.resolve(path.dirname(file), target)).split(path.sep).join('/'))
      if (to !== null && to > own) found++
    }
  }
  return found
}

export async function scoreRun(sb, base, { timeoutMs = 300_000, sdlc = SDLC, variant = null, judgeFrom = base } = {}) {
  // The sandbox's env: the runner's own (a test context, a CI event path) must not leak into the model's suite.
  const t = await runBounded('npm', ['test', '--silent'], { cwd: sb.dir, timeoutMs, env: sb.env })
  const npmTest = t.status === 0
  const a = await runBounded('node', [ACCEPTANCE, sb.dir, 'remove', ...(['rules', 'pricing', 'contract'].includes(variant) ? ['rules'] : [])], { cwd: sb.dir, timeoutMs, env: sb.env })
  const last = a.out.trim().split('\n').at(-1) ?? ''
  const acceptance = a.timedOut ? `timed out after ${timeoutMs} ms` : (() => { try { return JSON.parse(last) } catch { return `acceptance exited ${a.status}: ${last.slice(0, 200)}` } })()
  const c = new Checks('score')
  await assertShopHttp(c, sb.dir, 'remove')
  const http = c.results[0].status === 'PASS' ? true : c.results[0].why
  const withLinks = ['links', 'rules', 'pricing', 'contract'].includes(variant)
  const links = withLinks ? await linksHttp(sb.dir).catch(e => `links acceptance crashed: ${e.message}`) : null
  // B8's six edge cases and B9 each count, so a near miss scores above a total miss.
  let rules = null
  if (['rules', 'pricing', 'contract'].includes(variant)) {
    const r = await runBounded('node', [RULES, sb.dir], { cwd: sb.dir, timeoutMs, env: sb.env })
    try { rules = JSON.parse(r.out.trim().split('\n').at(-1)) } catch { rules = { b8: 0, b9: false, failures: [r.timedOut ? `rules acceptance timed out after ${timeoutMs} ms` : `rules acceptance exited ${r.status}`] } }
  }
  // B10–B12: each exact rule counts, so a near miss scores above a total miss.
  let pricing = null
  if (variant === 'pricing' || variant === 'contract') { // contract keeps B10–B12 in the score: a regression there is a real failure
    const r = await runBounded('node', [PRICING, sb.dir], { cwd: sb.dir, timeoutMs, env: sb.env })
    try { pricing = JSON.parse(r.out.trim().split('\n').at(-1)) } catch { pricing = { b10: 0, b11: 0, b12: 0, failures: [r.timedOut ? `pricing acceptance timed out after ${timeoutMs} ms` : `pricing acceptance exited ${r.status}`] } }
  }
  // B13–B14: each exact wire rule counts. The checks run in their own child processes (contract.mjs), one per check.
  let contract = null
  if (variant === 'contract') {
    const { contractChecks } = await import('./variants/contract.mjs')
    contract = contractChecks(sb.dir)
  }
  const all = [npmTest, acceptance === true, http === true, ...(withLinks ? [links === true] : []), ...(rules ? [...Array.from({ length: 6 }, (_, i) => i < rules.b8), rules.b9] : []), ...(pricing ? [...Array.from({ length: 5 }, (_, i) => i < pricing.b10), ...Array.from({ length: 5 }, (_, i) => i < pricing.b11), ...Array.from({ length: 4 }, (_, i) => i < pricing.b12)] : []), ...(contract ? [...Array.from({ length: 8 }, (_, i) => i < contract.b13), ...Array.from({ length: 7 }, (_, i) => i < contract.b14), ...Array.from({ length: 2 }, (_, i) => i < contract.files)] : [])]
  const checks = all.filter(Boolean).length
  return { checks, of: all.length, accepted: checks === all.length, npmTest, acceptance, http, ...(withLinks ? { links } : {}), ...(rules ? { rules } : {}), ...(pricing ? { pricing } : {}), ...(contract ? { contract } : {}), layerViolations: withLinks && links !== true ? null : layerViolations(sb.dir), tamper: tamperOf(sb, judgeFrom, sdlc) }
}
