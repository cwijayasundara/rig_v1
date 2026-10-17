// The learning-loop eval (learning loop design 2026-10-17, "Measurement"): over six changes that each tempt the same mistake (a bare-string
// error reply where the contract wants { code, message }), does having the lesson loaded make the mistake recur less often?
// Arms: `off` (no loop) and `loop` (after change 2 the dream step writes one lesson, and CLAUDE.md imports it). Recurrence is scored by a
// regex over the added lines, never by a model. The native auto-memory arm is not run: headless `claude -p` gives no way to turn it on per run.
// node eval/learn.mjs [--runs 3] [--model claude-haiku-5-5] [--max-usd 5] [--results FILE] [--dry]
// Live runs cost money and a person starts them. --dry replays a fake and writes nothing.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { resultsAllowed } from './run.mjs'
import { claudeRunner } from '../scripts/wikigen.ts'
import { formatLesson } from '../scripts/learnfile.ts'

const FIX = path.join(import.meta.dirname, 'fixtures/learn')
const SDLC_TS = path.join(import.meta.dirname, '../scripts/sdlc.ts')
export const TASKS = JSON.parse(fs.readFileSync(path.join(FIX, 'tasks.json'), 'utf8'))
export const KEY = 'error-shape'
export const LAG_FROM = 4
export const WIN_BY = 0.34
export const COST_SLACK = 1.1

// A bare string sent as a reply: res.send('...') or res.status(n).send("..."), not res.send(item) and not fail(...).
const BARE = /\.send\(\s*(['"`])/
export const scoreChange = addedLines => ({ recurred: addedLines.some(l => BARE.test(l)) })

const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
const late = (rows, arm) => rows.filter(r => r.arm === arm && r.change >= LAG_FROM)
const perChangeUsd = (rows, arm) => mean(rows.filter(r => r.arm === arm).map(r => r.usd))
const recurrence = (rows, arm) => mean(late(rows, arm).map(r => (r.recurred ? 1 : 0)))

// The cut-the-feature rule: a third less recurrence for at most 10% more cost, or the same recurrence for less cost; anything else is no lift.
export function verdict(rows) {
  if (!late(rows, 'off').length || !late(rows, 'loop').length) return 'unmeasured'
  const gain = recurrence(rows, 'off') - recurrence(rows, 'loop')
  const costOk = perChangeUsd(rows, 'loop') <= perChangeUsd(rows, 'off') * COST_SLACK + 1e-9
  if (gain >= WIN_BY && costOk) return 'loop beats off'
  if (Math.abs(gain) < 1e-9 && perChangeUsd(rows, 'loop') < perChangeUsd(rows, 'off')) return 'tie-cheaper'
  return 'no lift'
}

export function renderLearnTable(rows) {
  const arms = [...new Set(rows.map(r => r.arm))]
  return [`| arm | runs | recurrence, changes ${LAG_FROM} to 6 (mean) | USD per change (mean) |`, '|---|---|---|---|',
    ...arms.map(a => `| ${a} | ${new Set(rows.filter(r => r.arm === a).map(r => r.run)).size} | ${recurrence(rows, a).toFixed(2)} | $${perChangeUsd(rows, a).toFixed(4)} |`)].join('\n')
}

const git = (dir, ...args) => spawnSync('git', ['-c', 'user.email=e@e', '-c', 'user.name=eval', ...args], { cwd: dir, encoding: 'utf8' }).stdout ?? ''
const cleanEnv = () => {
  const env = { ...process.env }
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SSE_PORT', 'NODE_TEST_CONTEXT']) delete env[k]
  return env
}

function stage(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rig-eval-learn-${name}-`))
  fs.cpSync(path.join(FIX, 'repo'), dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'fixture')
  return dir
}

// The agent reads CLAUDE.md (project settings only: no user hooks or plugins) and may use only file tools.
function implement(dir, prompt, model) {
  const tools = 'Read,Edit,Write,Grep,Glob'
  const c = spawnSync(process.env.RIG_CLAUDE || 'claude', ['-p', prompt, '--output-format', 'json', '--model', model, '--tools', tools, '--allowedTools', tools, '--setting-sources', 'project', '--disable-slash-commands', '--no-session-persistence', '--max-turns', '15'], { cwd: dir, env: cleanEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 })
  let j = {}
  try { j = JSON.parse(c.stdout) } catch { /* an unreadable result scores as no change and no cost */ }
  const u = j.usage ?? {}
  return { usd: j.total_cost_usd ?? 0, tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0) }
}

// The scripted evaluator: it writes the review.md and pr.md a real change would leave, so `learn mine` sees the same evidence.
function recordChange(dir, slug, recurred) {
  const base = path.join(dir, '.rig/changes', slug)
  fs.mkdirSync(base, { recursive: true })
  fs.writeFileSync(path.join(base, 'review.md'), recurred ? `verdict: changes-needed\n## Findings\n- [severity: high] [category: ${KEY}] src/handlers.js:1: bare string error reply → use fail() from src/respond.js (confidence 90)\n` : 'verdict: pass\n')
  fs.writeFileSync(path.join(base, 'pr.md'), 'pr\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', `ship ${slug}`)
}

// The dream step, applied automatically (an eval only: in real use a person applies the proposal).
function dream(dir, model) {
  spawnSync('node', ['--disable-warning=ExperimentalWarning', SDLC_TS, 'learn', 'mine'], { cwd: dir, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: dir } })
  let candidates = []
  try { candidates = JSON.parse(fs.readFileSync(path.join(dir, '.rig/learn/candidates.json'), 'utf8')).candidates } catch { return 0 }
  const c = candidates.find(x => x.key === KEY)
  if (!c) return 0
  const r = claudeRunner(model)({ role: 'write', prompt: `A review finding recurs in changes ${c.changes.join(', ')}:\n${c.sample}\nReply with exactly one line: ADD ${KEY}: <the lesson an engineer should remember, at most 25 words, no pipe character>` })
  const text = /ADD [\w-]+:\s*(.+)/.exec(r.text)?.[1]?.replace(/\|/g, '/').trim()
  if (!text) return r.usd
  const today = new Date().toISOString().slice(0, 10)
  fs.writeFileSync(path.join(dir, '.rig/lessons.md'), formatLesson({ id: 'L1', text, key: KEY, seen: c.changes, first: today, lastFired: today, status: 'active' }) + '\n')
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '@.rig/lessons.md\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'lesson')
  return r.usd
}

const addedLines = (dir, before) => git(dir, 'diff', '--unified=0', before, 'HEAD', '--', 'src').split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).map(l => l.slice(1))

function runArm(arm, n, model) {
  const dir = stage(`${arm}-${n}`)
  return TASKS.map((task, i) => {
    const before = git(dir, 'rev-parse', 'HEAD').trim()
    const r = implement(dir, task.prompt, model)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-qm', task.slug, '--allow-empty')
    const { recurred } = scoreChange(addedLines(dir, before))
    recordChange(dir, task.slug, recurred)
    const dreamUsd = arm === 'loop' && i === 1 ? dream(dir, 'claude-sonnet-5-5') : 0
    return { arm, run: n, change: i + 1, model, recurred, usd: Number((r.usd + dreamUsd).toFixed(4)), tokens: r.tokens, at: new Date().toISOString() }
  })
}

// The dry replay: off recurs on every change, the loop only on the first three. It exercises the pipeline, not a model.
const fakeRows = (arm, n) => TASKS.map((t, i) => ({ arm, run: n, change: i + 1, model: 'fake', recurred: arm === 'off' || i < 3, usd: 0, tokens: 1000, at: new Date().toISOString() }))

export async function runLearnEval({ dry = false, runs = 3, model = 'claude-haiku-5-5', maxUsd = Infinity } = {}) {
  const rows = []
  let spent = 0
  for (let n = 1; n <= runs && spent < maxUsd; n++) {
    for (const arm of ['off', 'loop']) {
      const got = dry ? fakeRows(arm, n) : runArm(arm, n, model)
      rows.push(...got)
      spent += got.reduce((a, r) => a + r.usd, 0)
    }
  }
  return { rows, verdict: verdict(rows), spent }
}

if (process.argv[1] === import.meta.filename) {
  const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d }
  const dry = process.argv.includes('--dry')
  const results = path.resolve(arg('results', dry ? path.join(os.tmpdir(), 'rig-eval-learn-dry.jsonl') : path.join(import.meta.dirname, 'results', `${new Date().toISOString().slice(0, 10)}-learn.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const r = await runLearnEval({ dry, runs: Number(arg('runs', 3)), model: arg('model', 'claude-haiku-5-5'), maxUsd: Number(arg('max-usd', 5)) })
  if (!dry) {
    fs.mkdirSync(path.dirname(results), { recursive: true })
    for (const row of r.rows) fs.appendFileSync(results, JSON.stringify(row) + '\n')
  }
  console.log(`${renderLearnTable(r.rows)}\n\nspent $${r.spent.toFixed(4)}; the native auto-memory arm is not run\nverdict: ${r.verdict}${dry ? '' : `\n${results}`}`)
}
