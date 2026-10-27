// Captured evidence: every verdict reads exit codes recorded here, never what the model says happened.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { maskSecrets } from './model.ts'
import { ROOT, CHANGES, now } from './core.ts'

export type RunRow = { at: string; cmd: string; cwd?: string; exit: number; ms: number; tail: string; expectFail?: true; timedOut?: true; source?: 'gate' | 'ship'; tree?: string }

const TAIL_LINES = 30
const TIMED_OUT = 124

// spawnSync's own timeout kills only the shell, then waits for any grandchild still holding stdout
// (a test command spawning worker processes). This wrapper runs the command in its own process group and kills
// the whole group on timeout (taskkill /T on Windows), so a hang can never outlive the budget.
const WRAPPER = `
const cp = require('node:child_process')
const [cmd, ms] = process.argv.slice(1)
const win = process.platform === 'win32'
const child = cp.spawn(cmd, { shell: true, detached: !win, stdio: ['ignore', 'inherit', 'inherit'] })
const kill = () => { try { win ? cp.spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']) : process.kill(-child.pid, 'SIGKILL') } catch {} }
const timer = setTimeout(() => { kill(); process.exit(${TIMED_OUT}) }, Number(ms))
child.on('exit', code => { clearTimeout(timer); process.exit(code ?? 1) })
child.on('error', () => process.exit(127))
`

// Evidence is committed with the change: the repo root and the home directory become stable names (shop_app 2026-10-27: runs.jsonl held /Users/... paths).
export function portable(text: string, root = ROOT, home = os.homedir()): string {
  const swap = (t: string, dir: string, name: string): string => (dir.length > 1 ? t.replace(new RegExp(`${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`, 'g'), name) : t)
  return swap(swap(text, root, '<repo>'), home, '~')
}

export function runCommand(cmd: string, opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string>; unsetEnv?: RegExp } = {}): RunRow {
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 600_000
  // A declared `node --test` must really run even when sdlc itself runs inside a node test process.
  const env = { ...process.env, ...(opts.env ?? {}) }
  if (opts.unsetEnv) for (const k of Object.keys(env)) if (opts.unsetEnv.test(k)) delete env[k]
  delete env.NODE_TEST_CONTEXT
  // The PR's own test commands run here at CI; the review-lookup token is for sdlc itself, not for them.
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  const r = spawnSync(process.execPath, ['-e', WRAPPER, cmd, String(timeoutMs)], { cwd: opts.cwd ?? ROOT, env, encoding: 'utf8', timeout: timeoutMs + 5_000, maxBuffer: 64 * 1024 * 1024 })
  // stderr first: a ratchet reads the last line, so the number on stdout must come last.
  const text = `${r.stderr ?? ''}${r.stdout ?? ''}`.replace(/\r\n/g, '\n').trimEnd()
  const ms = Date.now() - started
  const timedOut = (r.status === TIMED_OUT && ms >= timeoutMs) || (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT'
  const row: RunRow = { at: now(), cmd, exit: r.status ?? TIMED_OUT, ms, tail: portable(maskSecrets(text.split('\n').slice(-TAIL_LINES).join('\n'))) }
  if (opts.cwd && opts.cwd !== ROOT) row.cwd = opts.cwd
  if (timedOut) row.timedOut = true
  return row
}

const runsFile = (slug: string): string => path.join(CHANGES, slug, 'evidence', 'runs.jsonl')

export function recordRun(slug: string, row: RunRow): void {
  fs.mkdirSync(path.dirname(runsFile(slug)), { recursive: true })
  fs.appendFileSync(runsFile(slug), JSON.stringify(row) + '\n')
}

export const normCmd = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ')

