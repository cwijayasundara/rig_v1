// Helpers every eval runner copied: argv, JSONL, the shared allow-list and the spend / dry-run guards.
import fs from 'node:fs'
import path from 'node:path'

const RESULTS = path.resolve(import.meta.dirname, '..', 'results')
// The same extra permissions for every arm: a bare model must be able to run its own tests, as a rig arm does through sdlc.ts.
export const EVAL_ALLOW = ['Bash(npm *)', 'Bash(node *)', 'Bash(git *)', 'Bash(ls *)', 'Bash(mkdir *)', 'Bash(cat *)']

export const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
export const readJsonl = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
export const mean = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
export const nextRunAllowed = (spent, capRun, capTotal) => spent + capRun <= capTotal + 1e-9
export const resultsAllowed = (file, dry) => (dry && path.resolve(file).startsWith(RESULTS + path.sep) ? 'dry runs never write under eval/results: they replay fixtures, not a model' : null)
