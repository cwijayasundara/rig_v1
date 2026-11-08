// What a map's ## Formal command actually checks (incorporations spec 2026-11-08, item 3): the files it names and the local code its
// checker imports, so the ship gate can tell a checker bound to the shipped code from one that checks a copy of it.
import fs from 'node:fs'
import path from 'node:path'

const INTERPRETERS = new Set(['python', 'python3', 'node', 'tsx', 'ts-node', 'bun', 'deno', 'ruby', 'sh', 'bash'])
const SCRIPT = /\.(py|js|mjs|cjs|ts)$/
const EXT = ['', '.ts', '.js', '.mjs', '.cjs', '/index.js']
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
    for (const m of text.matchAll(/(?:from\s+|require\(\s*|import\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) first(EXT.map(e => path.join(dir, `${m[1]}${e}`)))
  }
  return found
}

export function formalTargets(command: string, root: string): string[] {
  const words = command.trim().split(/\s+/)
  const fileAt = (i: number): string | undefined => { const w = (words[i] ?? '').replace(/^\.\//, ''); return w && isFile(path.join(root, w)) ? posix(path.normalize(w)) : undefined }
  const at = INTERPRETERS.has(words[0] ?? '') ? 1 : 0
  const checker = fileAt(at)
  const named = words.map((_, i) => fileAt(i)).filter((f): f is string => Boolean(f) && f !== checker)
  const imported = checker && SCRIPT.test(checker) ? importsOf(checker, root).filter(f => path.dirname(f) !== path.dirname(checker)) : []
  return [...new Set([...named, ...imported])]
}
