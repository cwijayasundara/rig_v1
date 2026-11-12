// The weakening check (readiness doc R6): a spec behaviour keeps the never, the limits and the numbers of the requirements.md rows it
// cites (2026-10 tester run: "ids are never reused" lost its never on the way to the spec). A warning, never a refusal: the person
// approving decides; `approve --check` prints it before the plan is handed over.
import path from 'node:path'
import { CHANGES, read } from './core.ts'

const STRONG = ['never', 'always', 'must', 'only', 'at most', 'at least', 'exactly', 'every', 'unique']
const has = (text: string, word: string): boolean => new RegExp(`\\b${word.replace(/\./g, '\\.').replace(/ /g, '\\s+')}\\b`, 'i').test(text)

// requirements.md rows: `- <id> [<kind>] prd.md:<line> "<quote>"`; spec behaviours: `- B<n> (<id>, …): <text>`.
export function weakenings(spec: string, requirements: string): string[] {
  const rows = new Map<string, string>()
  for (const m of requirements.matchAll(/^- (\S+) \[[^\]]*\] \S+ "(.*)"\s*$/gm)) rows.set(m[1] as string, m[2] as string)
  const found: string[] = []
  for (const m of spec.matchAll(/^- (B\d+) \(([^)]*)\):\s*(.*)$/gm)) {
    const [, b, ids = '', text = ''] = m
    for (const id of ids.split(',').map(s => s.trim())) {
      const quote = rows.get(id)
      if (quote === undefined) continue
      const numbers = [...new Set(quote.match(/\d+(?:\.\d+)?/g) ?? [])]
      for (const w of [...STRONG.filter(s => has(quote, s)), ...numbers]) if (!has(text, w)) found.push(`${b} cites ${id} but drops "${w}"`)
    }
  }
  return [...new Set(found)]
}

export function weakeningLines(slug: string): string[] {
  const dir = path.join(CHANGES, slug)
  const spec = read(path.join(dir, 'spec.md')), requirements = read(path.join(dir, 'requirements.md'))
  return spec && requirements ? weakenings(spec, requirements).map(w => `WARNING weakened: ${w}`) : []
}
