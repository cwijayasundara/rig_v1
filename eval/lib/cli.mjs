// Helpers every eval runner copied: argv, JSONL, the shared allow-list and the spend / dry-run guards.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { cleanClaudeEnv } from '../../scripts/model.ts'

const RESULTS = path.resolve(import.meta.dirname, '..', 'results')
// The same extra permissions for every arm: a bare model must be able to run its own tests, as a rig arm does through sdlc.ts.
export const EVAL_ALLOW = ['Bash(npm *)', 'Bash(node *)', 'Bash(git *)', 'Bash(ls *)', 'Bash(mkdir *)', 'Bash(cat *)']

export const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
export const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
export const nextRunAllowed = (spent, capRun, capTotal) => spent + capRun <= capTotal + 1e-9
// One headless `claude -p` call that prints a JSON result: the process, the parsed JSON (null if unreadable), and its cost and token sum.
export function claudeJson({ dir, prompt, model, tools, sources }) {
  const bin = process.env.RIG_CLAUDE || 'claude'
  const c = spawnSync(bin, ['-p', prompt, '--output-format', 'json', '--model', model, '--tools', tools, '--allowedTools', tools, '--setting-sources', sources, '--disable-slash-commands', '--no-session-persistence', '--max-turns', '15'], { cwd: dir, env: cleanClaudeEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 600_000 })
  let j = null
  try { j = JSON.parse(c.stdout) } catch { /* the caller decides what an unreadable result means */ }
  const u = j?.usage ?? {}
  return { bin, c, j, usd: j?.total_cost_usd ?? 0, tokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.output_tokens ?? 0) }
}
export const resultsAllowed = (file, dry) => (dry && path.resolve(file).startsWith(RESULTS + path.sep) ? 'dry runs never write under eval/results: they replay fixtures, not a model' : null)
