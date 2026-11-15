// The harness scripts form a DAG: no two modules import each other, directly or through others. A cycle works only while every use
// is deferred past module load, and breaks the first time one is not (a const read at the top level, a re-export).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const names = fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts').map(n => n.slice(0, -3))

// Value imports only: `import type` is erased and cannot make a cycle at run time.
const importsOf = (name: string): string[] => {
  const text = fs.readFileSync(path.join(DIR, `${name}.ts`), 'utf8')
  return [...text.matchAll(/^(?:import|export)\s+(?!type\b)[^'\n]*?from\s+'\.\/([\w-]+)\.ts'/gm)].map(m => m[1]!).filter(n => names.includes(n))
}

// Tarjan's strongly connected components: any component with more than one module (or a self-import) is a cycle.
export function cycles(graph: Map<string, string[]>): string[][] {
  let n = 0
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], on = new Set<string>(), found: string[][] = []
  const visit = (v: string): void => {
    index.set(v, n); low.set(v, n); n++; stack.push(v); on.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)) }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = []
      for (let w = ''; w !== v;) { w = stack.pop()!; on.delete(w); comp.push(w) }
      if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) found.push(comp.sort())
    }
  }
  for (const v of graph.keys()) if (!index.has(v)) visit(v)
  return found
}

test('cycles finds a loop through three modules and a self-import, and nothing in a chain', () => {
  assert.deepEqual(cycles(new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['d']], ['e', ['a']]])), [['a', 'b', 'c'], ['d']])
  assert.deepEqual(cycles(new Map([['a', ['b']], ['b', ['c']], ['c', []]])), [])
})

test('no script imports another in a cycle', () => {
  assert.deepEqual(cycles(new Map(names.map(n => [n, importsOf(n)]))), [])
})

// State files are written whole by several processes (hooks, the CLI, CI): a torn write leaves JSON nothing can parse. core.writeAtomic
// writes beside the file and renames it, so every JSON write goes through it.
test('no script writes JSON with fs.writeFileSync: core.writeAtomic does', () => {
  const bad = names.filter(n => n !== 'core').filter(n => /fs\.writeFileSync\([^\n]*JSON\.stringify/.test(fs.readFileSync(path.join(DIR, `${n}.ts`), 'utf8')))
  assert.deepEqual(bad, [])
})

// The path of a state file is named once, in core.ts, so a rename or a relocation cannot leave a stale literal behind.
test('no script spells the autonomy file path: core.AUTONOMY_JSON does', () => {
  const bad = names.filter(n => n !== 'core').filter(n => fs.readFileSync(path.join(DIR, `${n}.ts`), 'utf8').includes("'.rig/autonomy.json'"))
  assert.deepEqual(bad, [])
})
