// Captured evidence: every verdict reads exit codes recorded here, never what the model says happened.
import fs from 'node:fs'
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

// `stdout`, when given, receives the command's whole stdout (no stderr, no tail cap) for callers that parse it.
export function runCommand(cmd: string, opts: { cwd?: string; timeoutMs?: number; stdout?: (text: string) => void } = {}): RunRow {
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 600_000
  // A declared `node --test` must really run even when sdlc itself runs inside a node test process.
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  // The PR's own test commands run here at CI; the review-lookup token is for sdlc itself, not for them.
  delete env.GH_TOKEN
  delete env.GITHUB_TOKEN
  const r = spawnSync(process.execPath, ['-e', WRAPPER, cmd, String(timeoutMs)], { cwd: opts.cwd ?? ROOT, env, encoding: 'utf8', timeout: timeoutMs + 5_000, maxBuffer: 64 * 1024 * 1024 })
  opts.stdout?.((r.stdout ?? '').replace(/\r\n/g, '\n'))
  const text = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\r\n/g, '\n').trimEnd()
  const ms = Date.now() - started
  const timedOut = (r.status === TIMED_OUT && ms >= timeoutMs) || (r.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT'
  const row: RunRow = { at: now(), cmd, exit: r.status ?? TIMED_OUT, ms, tail: maskSecrets(text.split('\n').slice(-TAIL_LINES).join('\n')) }
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

