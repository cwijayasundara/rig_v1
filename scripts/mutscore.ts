// The changed-line mutation score (three-gates C4): `sdlc mutscore --tool <t> --report <file> [--lines <file:from-to,...>]`. Core neutrality:
// tool ids are matched by pattern and the parsers keyed by their last word; the tools' commands live in templates/stacks.
import path from 'node:path'
import { ROOT, SENSORS_JSON, exists, read, out, fail, optString, toPosix, type Args } from './core.ts'
import { parseRegistry } from './registry.ts'
export type Mutant = { file: string; line: number; mutator: string; killed: boolean }; const TOOL = /^(?:stryker(?:-net)?|mutmut|pitest|\w+-mutants|go-mutesting)$/
const attr = (tag: string, n: string): string => new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag)?.slice(1).find(v => v !== undefined) ?? ''
const inner = (body: string, n: string): string => new RegExp(`<${n}>([\\s\\S]*?)</${n}>`).exec(body)?.[1]?.trim() ?? ''
const need = (ok: boolean, what: string): void => { if (!ok) throw new Error(what) }
const KILLED = ['Killed', 'Timeout', 'CaughtMutant', 'KILLED', 'TIMED_OUT'], SURVIVED = ['Survived', 'NoCoverage', 'MissedMutant', 'SURVIVED', 'NO_COVERAGE']
const mutant = (file: string, line: number, mutator: string, status: string): Mutant[] => [...KILLED, ...SURVIVED].includes(status) ? [{ file: toPosix(file), line, mutator, killed: KILLED.includes(status) }] : []
type Obj = Record<string, any> // Mutation-testing-elements JSON (Stryker JS and .NET), PIT's mutations.xml, an outcomes.json, `mutmut junitxml`, go-mutesting's stdout.
const elements = (text: string): Mutant[] => { const r: Obj = JSON.parse(text); need(typeof r.files === 'object' && r.files !== null, 'no "files"'); return Object.entries<Obj>(r.files).flatMap(([f, v]) => (v.mutants as Obj[]).flatMap(m => mutant(f, m.location.start.line, m.mutatorName, m.status))) }
const outcomes = (text: string): Mutant[] => { const r: Obj = JSON.parse(text); need(Array.isArray(r.outcomes), 'no "outcomes"'); return (r.outcomes as Obj[]).flatMap(o => { const m = o.scenario?.Mutant; return m ? mutant(m.file, m.span.start.line, m.genre ?? m.name, o.summary) : [] }) }
function pit(text: string): Mutant[] { // the file is the class's package plus <sourceFile>
  need(/<mutations\b/.test(text), 'no <mutations>')
  return [...text.matchAll(/<mutation\b([^>]*)>([\s\S]*?)<\/mutation>/g)].flatMap(([, tag = '', b = '']) => mutant(`${inner(b, 'mutatedClass').split('.').slice(0, -1).map(p => `${p}/`).join('')}${inner(b, 'sourceFile')}`, Number(inner(b, 'lineNumber')), inner(b, 'mutator').split('.').pop() ?? '', attr(tag, 'status')))
}
function junit(text: string): Mutant[] { // a <failure> child is a survivor, <skipped> no verdict
  need(/<testsuite\b/.test(text), 'no <testsuite>')
  return [...text.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].flatMap(([, tag = '', b = '']) => /<skipped\b/.test(b) ? [] : mutant(attr(tag, 'file') || attr(tag, 'classname'), Number(attr(tag, 'line')), attr(/<failure\b[^>]*>/.exec(b)?.[0] ?? '', 'message') || 'mutmut', /<failure\b/.test(b) ? 'Survived' : 'Killed'))
}
// `PASS "<tmp>/pkg/a.go.N" with checksum` is killed, `FAIL ...` survived; the line is the first changed line of the diff hunk that follows.
// A mutant with no diff has line 0, which counts for any changed line of its file.
function stdout(text: string): Mutant[] {
  need(/^(?:PASS|FAIL) "|The mutation score is/m.test(text), 'no PASS/FAIL lines')
  const ms: Mutant[] = []
  let cur: Mutant | null = null, inHunk = false, changed = ''
  for (const l of text.split('\n')) {
    const head = /^(PASS|FAIL) "([^"]+?)(?:\.\d+)?"/.exec(l), hunk = /^@@ -(\d+)/.exec(l)
    if (head) { cur = { file: toPosix(head[2] ?? '').replace(/^\/tmp\/go-mutesting-\d+\//, ''), line: 0, mutator: 'mutation', killed: head[1] === 'PASS' }; ms.push(cur); inHunk = false; changed = '' }
    else if (cur && hunk && !cur.line) { cur.line = Number(hunk[1]); inHunk = true }
    else if (cur && inHunk && !changed) { if (l.startsWith(' ')) cur.line++; else if (/^[-+]/.test(l)) { changed = l; cur.mutator = l.slice(1).trim().slice(0, 80) } }
  }
  return ms
}
const PARSERS: Record<string, (text: string) => Mutant[]> = { stryker: elements, net: elements, pitest: pit, mutants: outcomes, mutmut: junit, mutesting: stdout }
const same = (a: string, b: string): boolean => a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`)
export const parseReport = (tool: string, text: string): Mutant[] => { need(TOOL.test(tool), `unknown tool "${tool}"`); return PARSERS[tool.split('-').pop() ?? '']?.(text) ?? [] }
// linesArg is the {changed-lines} argument: file:from-to,file:from-to.
export function mutscoreReport(tool: string, text: string, linesArg: string | undefined, min: number): { exit: number; text: string } {
  let all: Mutant[]
  try { all = parseReport(tool, text) } catch (e) { return { exit: 1, text: `mutation: cannot read the report (${e instanceof Error ? e.message : String(e)}); failing closed` } }
  const ranges = (linesArg ?? '').split(',').filter(Boolean).map(p => { const i = p.lastIndexOf(':'), [a = '', b = a] = p.slice(i + 1).split('-'); return { f: toPosix(p.slice(0, i)), a: Number(a), b: Number(b) } })
  const kept = linesArg === undefined ? all : all.flatMap(m => { const r = ranges.filter(x => same(m.file, x.f)); return r.length && (!m.line || r.some(x => m.line >= x.a && m.line <= x.b)) ? [{ ...m, file: r[0]?.f ?? m.file }] : [] })
  if (!kept.length) return { exit: 0, text: 'mutation: no mutants on changed lines' }
  const survivors = kept.filter(m => !m.killed), killed = kept.length - survivors.length, score = killed / kept.length
  const shown = [...survivors.slice(0, 25).map(m => `${m.file}:${m.line} ${m.mutator}`), ...(survivors.length > 25 ? [`... and ${survivors.length - 25} more survivors`] : [])]
  return { exit: score >= min ? 0 : 1, text: [...shown, `mutation: ${killed}/${kept.length} killed on changed lines (score ${score.toFixed(2)}, min ${min})`].join('\n') } // summary last: a run's recorded tail keeps it
}
export function cmdMutscore(args: Args): void {
  const tool = optString(args, 'tool') ?? fail('usage: mutscore --tool <tool> --report <file> [--lines <file:from-to,...>]'), file = path.resolve(ROOT, optString(args, 'report') ?? fail('mutscore needs --report <file>'))
  const r = mutscoreReport(tool, exists(file) ? read(file) : '', optString(args, 'lines'), parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry.mutation.minScore); out(r.text); process.exitCode = r.exit
}
