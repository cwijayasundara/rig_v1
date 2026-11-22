// Interrogate (pilot §3, pstack): adversaries on different models try to break a change and prove each finding by running it. Models only report;
// this script decides. A finding is kept only when its command fails on a clean checkout of the committed code and the failure breaks the intent.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, checkSlug, dirtyFiles, exists, fail, out, readJsonl, writeAtomic, type Args } from './core.ts'
import { runCommand } from './runs.ts'
import { withBaseTree } from './basetree.ts'
import { SECRETISH } from './app.ts'
import { treeStamp } from './stamp.ts'

export type Row = { id: string; adversary: string; title: string; breaks: string; cmd: string; match?: string; exit: number; tail: string }
export type Verdict = { status: 'reproduced' | 'dismissed'; why?: string }
export type Result = { tree: string | null; at: string; found: number; reproduced: number; dismissed: number; rows: (Row & Verdict)[] }
const MAX_FINDINGS = 20, TIMEOUT = 60_000
const rowsPath = (slug: string): string => path.join(CHANGES, slug, 'interrogate.jsonl')
export const resultPath = (slug: string): string => path.join(CHANGES, slug, 'evidence', 'interrogate.json')

// The rule, with no model in it: the command must fail on the clean checkout, show the stated failure, and name what it breaks.
export function judge(r: Pick<Row, 'breaks' | 'match'>, rerun: { exit: number; tail: string }): Verdict {
  if (!r.breaks.trim()) return { status: 'dismissed', why: 'it cites no behaviour or criterion it breaks' }
  if (rerun.exit === 124) return { status: 'dismissed', why: 'the command timed out' }
  if (rerun.exit === 0) return { status: 'dismissed', why: 'the command passes on a clean checkout of the committed code' }
  if (r.match) { try { if (!new RegExp(r.match).test(rerun.tail)) return { status: 'dismissed', why: 'the output does not show the stated failure' } } catch { return { status: 'dismissed', why: 'the match is not a valid pattern' } } }
  return { status: 'reproduced' }
}

const run = (cmd: string, cwd: string) => runCommand(cmd, { cwd, timeoutMs: TIMEOUT, unsetEnv: SECRETISH })
const str = (args: Args, k: string): string => (typeof args.opt[k] === 'string' ? (args.opt[k] as string).trim() : '')

function record(slug: string, args: Args): void {
  const cmd = (args.rest ?? []).join(' ').trim(), title = str(args, 'title'), breaks = str(args, 'breaks'), adversary = str(args, 'adversary')
  if (!cmd || title.length < 5 || !breaks || !adversary) fail('usage: interrogate record <slug> --adversary <model> --title "<finding>" --breaks "<B-number, AC id or the intent it breaks>" [--match <regex>] -- <command that exits non-zero while the bug is present>')
  const rows = readJsonl<Row>(rowsPath(slug))
  if (rows.length >= MAX_FINDINGS) fail(`interrogate: ${MAX_FINDINGS} findings recorded already (the limit per change)`)
  if (rows.some(r => r.cmd === cmd)) return out('interrogate: this command is already recorded')
  const r = run(cmd, ROOT)
  if (r.exit === 0) fail('interrogate: the command passed, so nothing is proven; a reproduction exits non-zero while the bug is present. Not recorded.', 1)
  const row: Row = { id: `I-${rows.length + 1}`, adversary, title, breaks, cmd, ...(str(args, 'match') ? { match: str(args, 'match') } : {}), exit: r.exit, tail: r.tail.slice(-1500) }
  fs.appendFileSync(rowsPath(slug), JSON.stringify(row) + '\n')
  out(`interrogate: recorded ${row.id} (exit ${r.exit}); \`interrogate verify ${slug}\` reruns it on a clean checkout`)
}

function verify(slug: string): void {
  const rows = readJsonl<Row>(rowsPath(slug))
  const dirty = dirtyFiles().filter(f => !f.startsWith('.rig/'))
  if (dirty.length) fail(`interrogate: commit first; the rerun uses the committed code and ${dirty.length} file(s) are not committed (${dirty.slice(0, 3).join(', ')})`)
  const reran = withBaseTree('HEAD', dir => rows.map(r => run(r.cmd, dir)))
  if (!reran.ok) fail(`interrogate: ${reran.error}`)
  const judged = rows.map((r, i) => ({ ...r, ...judge(r, reran.value[i]!), ...{ tail: reran.value[i]!.tail.slice(-1500), exit: reran.value[i]!.exit } }))
  const result: Result = { tree: treeStamp(), at: new Date().toISOString(), found: rows.length, reproduced: judged.filter(r => r.status === 'reproduced').length, dismissed: judged.filter(r => r.status === 'dismissed').length, rows: judged }
  writeAtomic(resultPath(slug), JSON.stringify(result, null, 2) + '\n')
  out([`interrogate: ${result.found} found, ${result.reproduced} reproduced, ${result.dismissed} dismissed`, ...judged.map(r => `${r.id} ${r.status}${r.why ? ` (${r.why})` : ''}: ${r.title} [${r.adversary}; breaks ${r.breaks}]\n    ${r.cmd}`)].join('\n'))
  process.exitCode = result.reproduced ? 1 : 0
}

export function cmdInterrogate(args: Args): void {
  const sub = args.pos[0], slug = checkSlug(args.pos[1] ?? fail('usage: interrogate (record | verify) <slug> ...'))
  if (!exists(path.join(CHANGES, slug))) fail(`no change ${slug}`)
  if (sub === 'record') return record(slug, args)
  if (sub === 'verify') return verify(slug)
  fail('usage: interrogate (record | verify) <slug> ...')
}
