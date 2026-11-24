// Computed dependents (pilot §3, pstack blast-radius): the files outside a change that import the files it changes, found by a static search of the
// import lines, never by a model. The spec's `## Blast radius` is the agent's claim of what the change may touch; this is the code's answer to
// what the change can reach. TypeScript, JavaScript and Python are read; a changed file in another language is named as not analysed, never "none".
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHANGES, SENSORS_JSON, gitIn, read, exists, fail, checkSlug, type Args } from './core.ts'
import { matchesAny, isTest, blastRadius } from './model.ts'
import { parseRegistry } from './registry.ts'

const JS = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/, PY = /\.py$/
const OTHER = /\.(?:go|java|kt|cs|rs|rb|php|c|cpp|h|swift)$/
const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"\n]+)['"]/g
const MAX_FILES = 5000, MAX_BYTES = 300_000, DEPTH = 2

// The module specifiers a source file names: JS and TS `import ... from`, `export ... from`, `import()` and `require()`; Python `import a.b` and `from a.b import c`.
export function importsOf(file: string, text: string): string[] {
  if (JS.test(file)) return [...text.matchAll(JS_IMPORT)].map(m => m[1]!)
  if (!PY.test(file)) return []
  return text.split('\n').flatMap(l => {
    const from = /^\s*from\s+(\.*)([\w.]*)\s+import\s+(.+?)\s*(?:#.*)?$/.exec(l)
    if (from) { const mod = from[1]! + from[2]!, names = from[3]!.replace(/[()]/g, '').split(',').map(n => n.trim().split(/\s+as\s+/)[0]!).filter(n => /^\w+$/.test(n)); return [...names.map(n => `${mod}${mod.endsWith('.') || !mod ? '' : '.'}${n}`), mod] }
    const imp = /^\s*import\s+([\w., ]+?)\s*(?:#.*)?$/.exec(l)
    return imp ? imp[1]!.split(',').map(s => s.trim().split(/\s+as\s+/)[0]!).filter(Boolean) : []
  })
}

// Python modules by every path suffix, so `a.b` finds `src/pkg/a/b.py` or `src/pkg/a/b/__init__.py`.
function pyIndex(files: string[]): Map<string, string> {
  const idx = new Map<string, string>()
  for (const f of files.filter(x => PY.test(x))) {
    const parts = f.replace(/(?:\/__init__)?\.py$/, '').split('/')
    for (let i = 0; i < parts.length; i++) { const k = parts.slice(i).join('/'); if (!idx.has(k)) idx.set(k, f) }
  }
  return idx
}

function resolveImport(from: string, spec: string, files: Set<string>, py: Map<string, string>): string | null {
  if (JS.test(from)) {
    if (!spec.startsWith('.')) return null // a package, or an alias this search cannot see
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)), stem = base.replace(/\.(?:js|jsx|mjs|cjs)$/, '')
    for (const c of [base, ...['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].flatMap(e => [`${base}.${e}`, `${stem}.${e}`, `${base}/index.${e}`])]) if (files.has(c)) return c
    return null
  }
  const dots = /^\.*/.exec(spec)![0].length, rest = spec.slice(dots).replace(/\./g, '/')
  if (dots) { const dir = path.posix.join(path.posix.dirname(from), ...Array(dots - 1).fill('..')), t = path.posix.normalize(path.posix.join(dir, rest)); return [`${t}.py`, `${t}/__init__.py`].find(c => files.has(c)) ?? null }
  return py.get(rest) ?? null
}

export type Dependents = { all: { file: string; via: string }[]; unsupported: string[]; limited: boolean }

// Files outside `changed` that import it, directly or through up to two hops (the nearest changed file is named as `via`).
export function dependentsOf(changed: string[], files: string[], read: (f: string) => string): Dependents {
  const src = files.filter(f => JS.test(f) || PY.test(f)), limited = src.length > MAX_FILES, set = new Set(files), py = pyIndex(files)
  const importers = new Map<string, string[]>()
  for (const f of src.slice(0, MAX_FILES)) for (const s of new Set(importsOf(f, read(f)))) { const t = resolveImport(f, s, set, py); if (t && t !== f) importers.set(t, [...(importers.get(t) ?? []), f]) }
  const gone = new Set(changed), seen = new Map<string, string>()
  let frontier = changed.filter(f => JS.test(f) || PY.test(f)).map(f => ({ f, via: f }))
  for (let d = 0; d < DEPTH && frontier.length; d++) {
    const next: { f: string; via: string }[] = []
    for (const { f, via } of frontier) for (const i of importers.get(f) ?? []) if (!gone.has(i) && !seen.has(i)) { seen.set(i, via); next.push({ f: i, via }) }
    frontier = next
  }
  return { all: [...seen].map(([file, via]) => ({ file, via })).sort((a, b) => (a.file < b.file ? -1 : 1)), unsupported: changed.filter(f => OTHER.test(f)), limited }
}

// The dependents not covered by the spec's blast radius (a path, a directory, or a glob).
export const outsideRadius = (deps: Dependents['all'], radius: string[]): Dependents['all'] =>
  deps.filter(d => !radius.some(e => matchesAny(d.file, [e, `${e.replace(/\/+$/, '')}/**`])))

// The working tree's tracked files, read from disk (bounded: a file over 300 KB is skipped).
export function repoDependents(changed: string[]): Dependents {
  const files = (gitIn(ROOT, ['ls-files']) ?? '').split('\n').filter(Boolean)
  return dependentsOf(changed, files, f => { try { const p = path.join(ROOT, f); return fs.statSync(p).size > MAX_BYTES ? '' : fs.readFileSync(p, 'utf8') } catch { return '' } })
}

// What already imports the files the spec's blast radius names, as lines for the plan's author: printed by `dependents <slug>` and by
// `approve <slug> --check`, which every plan runs (a skill line alone was skipped: rig_v1_test list-items, 2026-11-24). A new file has no
// importer, so a greenfield change gets no lines; in a repo with code this is the regression set and the files the spec may have missed.
export function dependentsLines(slug: string): string[] {
  const radius = blastRadius(read(path.join(CHANGES, slug, 'spec.md'))) ?? []
  const tracked = (gitIn(ROOT, ['ls-files']) ?? '').split('\n').filter(Boolean)
  const mine = radius.length ? tracked.filter(f => !outsideRadius([{ file: f, via: f }], radius).length) : []
  if (!mine.length) return []
  const d = repoDependents(mine), { paths } = parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry
  const row = (x: { file: string; via: string }): string => `- ${x.file} (via ${x.via})`
  const tests = d.all.filter(x => isTest(x.file, paths)), rest = d.all.filter(x => !isTest(x.file, paths))
  return [
    `dependents: ${mine.length} file(s) of the blast radius exist already; ${d.all.length} file(s) outside it import them, within two hops, by a static search of the import lines.`,
    ...(tests.length ? ['Existing tests that import them, the regression set (name in plan.md ## Tests each one whose expectation this change makes wrong; the others must stay green unedited):', ...tests.map(row)] : []),
    ...(rest.length ? ['Other files that import them (one this change must edit goes into spec.md ## Blast radius; the others must keep working unedited):', ...rest.map(row)] : []),
    ...(d.unsupported.length ? [`Not analysed (a language this search does not read): ${d.unsupported.join(', ')}`] : []),
    ...(d.limited ? ['The search read only the first 5000 source files.'] : [])]
}

export function cmdDependents(args: Args): void {
  const slug = args.pos[0] ? checkSlug(args.pos[0]) : ''
  if (!slug || !exists(path.join(CHANGES, slug))) return fail('usage: dependents <slug>')
  const lines = dependentsLines(slug)
  process.stdout.write(`${lines.length ? lines.join('\n') : `dependents: no file of ${slug}'s blast radius exists yet, so nothing imports it`}\n`)
}
