// What a map's ## Formal command actually checks (incorporations spec 2026-11-08, item 3): the files it names and the local code its
// checker imports, so the ship gate can tell a checker bound to the shipped code from one that checks a copy of it.
import fs from 'node:fs'
import path from 'node:path'

const INTERPRETERS = new Set(['python', 'python3', 'node', 'tsx', 'ts-node', 'bun', 'deno', 'ruby', 'sh', 'bash'])
const SCRIPT = /\.(py|js|mjs|cjs|ts)$/
const DATA = /\.(json|md|txt|ya?ml|toml|lock|csv)$/i
const EXT = ['', '.ts', '.js', '.mjs', '.cjs', '/index.js']
const DEPTH = 3
const posix = (p: string): string => p.split(path.sep).join('/')
const isFile = (p: string): boolean => { try { return fs.statSync(p).isFile() } catch { return false } }

function importsOf(file: string, root: string): string[] {
  let text = ''
  try { text = fs.readFileSync(path.join(root, file), 'utf8') } catch { return [] }
  const dir = path.dirname(file)
  const found: string[] = []
  const first = (candidates: string[]): void => { const hit = candidates.find(c => isFile(path.join(root, c))); if (hit) found.push(posix(path.normalize(hit))) }
  if (file.endsWith('.py')) {
    for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) {
      const rel = (m[1] ?? m[2] ?? '').replace(/\./g, '/')
      if (rel) first([path.join(dir, `${rel}.py`), path.join(dir, rel, '__init__.py'), `${rel}.py`, path.join(rel, '__init__.py')])
    }
  } else {
    for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const spec = m[1]!
      // A .js specifier may name a TypeScript file.
      first([...EXT.map(e => path.join(dir, `${spec}${e}`)), ...(/\.[mc]?js$/.test(spec) ? [path.join(dir, spec.replace(/\.[mc]?js$/, '.ts'))] : [])])
    }
  }
  return found
}

// The code a ## Formal command checks. The checker is the script an interpreter runs (or the command itself when it is a file); it
// is never a target. Files reached through its imports (three levels) are targets, except its own directory tree, where a side copy
// or helper lives; a checker at the repo root excludes only its exact siblings, since everything is under the root.
function targetsOf(command: string, root: string): string[] {
  const words = command.trim().split(/\s+/)
  const fileAt = (i: number): string | undefined => { const w = (words[i] ?? '').replace(/^["']|["']$/g, '').replace(/^\.\//, ''); return w && isFile(path.join(root, w)) ? posix(path.normalize(w)) : undefined }
  const interp = words.findIndex(w => INTERPRETERS.has(w))
  // python -m pkg.mod runs pkg/mod.py (or pkg/mod/__main__.py)
  const mod = interp >= 0 && words[interp + 1] === '-m' ? (words[interp + 2] ?? '').replace(/\./g, '/') : ''
  const moduleFile = mod ? [`${mod}.py`, `${mod}/__main__.py`].find(f => isFile(path.join(root, f))) : undefined
  const checkerAt = moduleFile ? -2 : interp >= 0 ? words.findIndex((_, i) => i > interp && fileAt(i) && SCRIPT.test(fileAt(i)!)) : fileAt(0) ? 0 : -1
  const checker = moduleFile ?? (checkerAt >= 0 ? fileAt(checkerAt) : undefined)
  const named = words.map((_, i) => fileAt(i)).filter((f): f is string => f !== undefined && f !== checker && !DATA.test(f))
  const reached = new Set<string>()
  if (checker) {
    let frontier = [checker]
    for (let d = 0; d < DEPTH; d++) {
      frontier = frontier.flatMap(f => importsOf(f, root)).filter(f => f !== checker && !reached.has(f))
      frontier.forEach(f => reached.add(f))
    }
  }
  const cdir = checker ? path.posix.dirname(checker) : ''
  const own = (f: string): boolean => Boolean(checker) && (cdir === '.' ? path.posix.dirname(f) === '.' : f.startsWith(`${cdir}/`))
  return [...new Set([...named, ...[...reached].filter(f => !own(f))])]
}

// A command that reaches the checker through a package script (`<runner> [run] <name>`: any word that names a package.json script) or a
// make target expands to the commands it runs. No runner is named here; the script name is the data.
function expand(command: string, root: string): string[] {
  const words = command.trim().split(/\s+/)
  if (!INTERPRETERS.has(words[0] ?? '') && words[0] !== 'make') {
    try {
      const scripts = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
      const name = words.slice(1).find(w => typeof scripts[w] === 'string')
      if (name) return [scripts[name]!]
    } catch { /* no package.json */ }
  }
  if (words[0] === 'make' && words[1]) {
    let text = ''
    try { text = fs.readFileSync(path.join(root, 'Makefile'), 'utf8') } catch { return [] }
    const lines = text.split('\n')
    const at = lines.findIndex(l => l.startsWith(`${words[1]}:`))
    if (at < 0) return []
    const recipe: string[] = []
    for (const l of lines.slice(at + 1)) { if (!/^\t/.test(l)) { if (l.trim() === '' && !recipe.length) continue; break } recipe.push(l.trim().replace(/^[@-]+/, '')) }
    return recipe
  }
  return []
}

export function formalTargets(command: string, root: string): string[] {
  const seen = new Set<string>()
  const walk = (c: string, depth: number): void => { for (const t of targetsOf(c, root)) seen.add(t); if (depth < 3) for (const e of expand(c, root)) walk(e, depth + 1) }
  walk(command, 0)
  return [...seen]
}
