// The changed-line mutation score (three-gates C4): `sdlc mutscore --tool <t> --report <file> [<file>...] [--lines <file:from-to,...>] [--min <0-1>]`. Core neutrality:
// tool ids are matched by pattern and the parsers keyed by their last word; the tools' commands live in templates/stacks.
// The minimum is --min, else the registry at $RIG_BASE (check --config-from sets it: a PR cannot lower the bar it is judged by), else the working copy.
import path from 'node:path'
import { ROOT, SENSORS_JSON, exists, read, out, git, optString, toPosix, type Args } from './core.ts'
import { parseRegistry } from './registry.ts'
export type Mutant = { file: string; line: number; mutator: string; killed: boolean }; const TOOL = /^(?:stryker(?:-net)?|mutmut|pitest|\w+-mutants|go-mutesting)$/
const attr = (tag: string, n: string): string => new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag)?.slice(1).find(v => v !== undefined) ?? ''
const inner = (body: string, n: string): string => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(body)?.[1]?.trim() ?? ''
const need = (ok: boolean, what: string): void => { if (!ok) throw new Error(what) }
// Ignored (Stryker) is a survivor: a PR must not ignore its way to a score. MEMORY_ERROR (PIT) is detected: the mutant broke the test JVM.
const KILLED = ['Killed', 'Timeout', 'CaughtMutant', 'KILLED', 'TIMED_OUT', 'MEMORY_ERROR'], SURVIVED = ['Survived', 'NoCoverage', 'Ignored', 'MissedMutant', 'SURVIVED', 'NO_COVERAGE']
const mutant = (file: string, line: number, mutator: string, status: string): Mutant[] => [...KILLED, ...SURVIVED].includes(status) ? [{ file: toPosix(file), line, mutator, killed: KILLED.includes(status) }] : []
type Obj = Record<string, any> // Mutation-testing-elements JSON (Stryker JS and .NET), PIT's mutations.xml, an outcomes.json, `mutmut junitxml`, go-mutesting's stdout.
const elements = (text: string): Mutant[] => { const r: Obj = JSON.parse(text); need(typeof r.files === 'object' && r.files !== null, 'no "files"'); return Object.entries<Obj>(r.files).flatMap(([f, v]) => (v.mutants as Obj[]).flatMap(m => mutant(f, m.location.start.line, m.mutatorName, m.status))) }
const outcomes = (text: string): Mutant[] => { // a failed baseline means the tests were red before any mutation, and a report with no mutant scenario ran nothing
  const r: Obj = JSON.parse(text); need(Array.isArray(r.outcomes), 'no "outcomes"')
  const os = r.outcomes as Obj[], base = os.find(o => o.scenario === 'Baseline')
  need(!base || base.summary === 'Success', `the baseline run did not pass (${String(base?.summary)}), so no mutant verdict means anything`)
  need(os.some(o => o.scenario?.Mutant), 'no mutant scenarios')
  return os.flatMap(o => { const m = o.scenario?.Mutant; return m ? mutant(m.file, m.span.start.line, m.genre ?? m.name, o.summary) : [] })
}
function pit(text: string): Mutant[] { // the file is the class's package plus <sourceFile>
  need(/<mutations\b/.test(text), 'no <mutations>')
  return [...text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)].flatMap(([, tag = '', b = '']) => mutant(`${inner(b, 'mutatedClass').split('.').slice(0, -1).map(p => `${p}/`).join('')}${inner(b, 'sourceFile')}`, Number(inner(b, 'lineNumber')), inner(b, 'mutator').split('.').pop() ?? '', attr(tag, 'status')))
}
// Assumed: mutmut 2.x writes `line=` 1-based (its junitxml adds one to the stored 0-based line_number); one constant if a real run says otherwise. Unverified against a real run.
export const MUTMUT_LINE_BASE = 1
// `mutmut junitxml --untested-policy=failure --suspicious-policy=failure`: a <failure> is a survivor (survived, untested, suspicious), <skipped> has no verdict.
// An <error> is a timeout, detected, when it says "timeout"; any other error is not distinguishable from a crash, so it counts as a survivor.
function junit(text: string): Mutant[] {
  need(/<testsuite\b/.test(text) && /<testcase\b/.test(text), 'no <testcase> in a <testsuite>')
  return [...text.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].flatMap(([, tag = '', b = '']) => {
    if (/<skipped\b/.test(b)) return []
    const raw = attr(tag, 'line'), line = raw ? Number(raw) - MUTMUT_LINE_BASE + 1 : 0, bad = /<failure\b/.test(b) || (/<error\b/.test(b) && !/timeout/i.test(b))
    return mutant(attr(tag, 'file') || attr(tag, 'classname'), line, attr(/<(?:failure|error)\b[^>]*>/.exec(b)?.[0] ?? '', 'message') || 'mutmut', bad ? 'Survived' : 'Killed')
  })
}
// go-mutesting --debug prints a diff for every mutant, killed or not: `--- orig`, `+++ <tmp>/pkg/a.go.N`, then hunks. `PASS "<tmp>/pkg/a.go.N" with checksum` is killed, FAIL survived.
// Assumed: the diff's `+++` path is the mutant's own file, the one its PASS/FAIL line quotes, so a diff joins its verdict by that name, not by position (it may print before or
// after the verdict). The line is the first changed line of the diff's first hunk; a verdict with no diff has line 0 and is dropped by the caller, never counted.
function stdout(text: string): Mutant[] {
  const verdicts = [...text.matchAll(/^(PASS|FAIL) "([^"]+)"/gm)]
  need(verdicts.length > 0, 'no PASS/FAIL lines')
  const lines = new Map<string, { line: number; what: string }>()
  let name = '', n = 0, scan = false
  for (const l of text.split('\n')) {
    const hunk = /^@@ -(\d+)/.exec(l)
    if (l.startsWith('+++ ')) { name = l.slice(4).split('\t')[0]?.trim() ?? ''; scan = false }
    else if (name && hunk && !lines.has(name)) { n = Number(hunk[1]); scan = true }
    else if (name && scan) { if (l.startsWith(' ')) n++; else if (/^[-+]/.test(l)) { lines.set(name, { line: n, what: l.slice(1).trim().slice(0, 80) }); scan = false } }
  }
  return verdicts.map(([, v, file = '']) => ({ file: toPosix(file).replace(/^.*?go-mutesting-\d+\//, '').replace(/\.\d+$/, ''), line: lines.get(file)?.line ?? 0, mutator: lines.get(file)?.what || 'mutation', killed: v === 'PASS' }))
}
const PARSERS: Record<string, (text: string) => Mutant[]> = { stryker: elements, net: elements, pitest: pit, mutants: outcomes, mutmut: junit, mutesting: stdout }
export const parseReport = (tool: string, text: string): Mutant[] => { need(TOOL.test(tool), `unknown tool "${tool}"`); return PARSERS[tool.split('-').pop() ?? '']?.(text) ?? [] }
type Range = { f: string; a: number; b: number }
// linesArg is the {changed-lines} argument: file:from-to,file:from-to. A file name with a comma is not supported (it cannot be told from the separator): that fails closed.
const ranges = (arg: string): Range[] => arg.split(',').filter(Boolean).map(p => { const m = /^(.+):(\d+)-(\d+)$/.exec(p); need(m !== null, `"${p}" is not file:from-to (a file name with a comma is not supported)`); return { f: toPosix(m?.[1] ?? ''), a: Number(m?.[2]), b: Number(m?.[3]) } })
// A mutant's file is the changed file itself, else the changed file sharing its longest path suffix; two equal best matches are ambiguous.
function locate(file: string, files: string[]): string | undefined {
  if (files.includes(file)) return file
  const score = (f: string): number => (f.endsWith(`/${file}`) || file.endsWith(`/${f}`) ? Math.min(f.split('/').length, file.split('/').length) : 0)
  const best = Math.max(0, ...files.map(score)), top = files.filter(f => best > 0 && score(f) === best)
  need(top.length < 2, `ambiguous: ${file} matches both ${top.join(' and ')}`)
  return top[0]
}
const PRAGMA = /Stryker disable|pragma:\s*no mutate|mutants::skip/
// The added lines that switch mutation off, read from disk at the changed line numbers: a PR cannot opt its own lines out.
export function pragmaHits(linesArg: string, readFile: (f: string) => string | undefined): string[] {
  return ranges(linesArg).flatMap(r => { const ls = readFile(r.f)?.split('\n') ?? []; return ls.map((t, i) => [i + 1, t] as const).filter(([n, t]) => n >= r.a && n <= r.b && PRAGMA.test(t)).map(([n, t]) => `${r.f}:${n} ${t.trim()}`) })
}
const closed = (why: string): { exit: number; text: string } => ({ exit: 1, text: `mutation: ${why}; failing closed` })
export function mutscoreReport(tool: string, texts: string | string[], linesArg: string | undefined, min: number, readFile?: (f: string) => string | undefined): { exit: number; text: string } {
  let all: Mutant[], rs: Range[] = [], where = new Map<string, string | undefined>()
  try { all = [texts].flat().flatMap(t => parseReport(tool, t)) } catch (e) { return closed(`cannot read the report (${e instanceof Error ? e.message : String(e)})`) }
  try {
    rs = ranges(linesArg ?? '')
    for (const m of all) if (!where.has(m.file)) where.set(m.file, linesArg === undefined ? m.file : locate(m.file, [...new Set(rs.map(r => r.f))]))
  } catch (e) { return closed(`cannot read --lines (${e instanceof Error ? e.message : String(e)})`) }
  const on = all.filter(m => where.get(m.file) !== undefined), lined = on.filter(m => m.line > 0)
  const blind = [...new Set(on.filter(m => !m.line).map(m => where.get(m.file) ?? m.file))].filter(f => !lined.some(m => (where.get(m.file) ?? m.file) === f))
  if (blind.length) return closed(`no mutant of ${blind.join(', ')} carries a line number, so none can be tied to a changed line`)
  const kept = linesArg === undefined ? lined : lined.flatMap(m => { const f = where.get(m.file); return rs.some(x => x.f === f && m.line >= x.a && m.line <= x.b) ? [{ ...m, file: f ?? m.file }] : [] })
  const hits = linesArg !== undefined && readFile ? pragmaHits(linesArg, readFile) : []
  const head = hits.length ? [...hits.map(h => `${h} (disables mutation)`), `mutation: ${hits.length} pragma(s) added on changed lines disable mutation; remove them, or the person waives mutation-diff`] : []
  if (!kept.length) return { exit: hits.length ? 1 : 0, text: [...head, 'mutation: no mutants on changed lines'].join('\n') }
  const survivors = kept.filter(m => !m.killed), killed = kept.length - survivors.length, score = killed / kept.length
  const shown = [...survivors.slice(0, 25).map(m => `${m.file}:${m.line} ${m.mutator}`), ...(survivors.length > 25 ? [`... and ${survivors.length - 25} more survivors`] : [])]
  return { exit: score >= min && !hits.length ? 0 : 1, text: [...head, ...shown, `mutation: ${killed}/${kept.length} killed on changed lines (score ${score.toFixed(2)}, min ${min})`].join('\n') } // summary last: a run's recorded tail keeps it
}
export function cmdMutscore(args: Args): void {
  const done = (r: { exit: number; text: string }): void => { out(r.text); process.exitCode = r.exit }
  const tool = optString(args, 'tool'), first = optString(args, 'report'), minArg = optString(args, 'min')
  if (!tool) return done({ exit: 1, text: 'usage: mutscore --tool <tool> --report <file> [<file>...] [--lines <file:from-to,...>] [--min <0-1>]' })
  const files = [first, ...args.pos].filter((f): f is string => !!f).map(f => path.resolve(ROOT, f))
  if (!first || files.some(f => !exists(f))) return done(closed(`cannot read the report (${first ? files.filter(f => !exists(f)).join(', ') : 'no --report given'} is missing)`))
  const base = process.env.RIG_BASE, baseText = base ? git(['show', `${base}:${SENSORS_JSON}`]) : null
  const min = minArg === undefined ? parseRegistry(baseText ?? read(path.join(ROOT, SENSORS_JSON))).registry.mutation.minScore : Number(minArg)
  if (!(min > 0 && min <= 1)) return done(closed('--min must be a number above 0 and at most 1'))
  done(mutscoreReport(tool, files.map(read), optString(args, 'lines'), min, f => (exists(path.resolve(ROOT, f)) ? read(path.resolve(ROOT, f)) : undefined)))
}
