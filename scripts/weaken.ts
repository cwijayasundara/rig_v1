// The weakening check (readiness doc R6): a spec behaviour keeps the never, the limits and the numbers of the requirements.md rows it
// cites (2026-10 tester run: "ids are never reused" lost its never on the way to the spec). A warning, never a refusal: the person
// approving decides; `approve --check` prints it and /rig:plan shows it before the hand-over. Lexical, so a behaviour that says the
// same in other words passes through the equivalents below; what is left is for a person to read, not proof of a weakening.
import path from 'node:path'
import { CHANGES, read } from './core.ts'

// Each strong word of a requirement, and the wordings that keep it in a behaviour.
const STRONG: [string, string[]][] = [
  ['never', ['never', 'must not', 'cannot', 'can not', 'may not', 'is not allowed']],
  ['always', ['always', 'at all times', 'every time', 'each time', 'stays?', 'remains?']],
  ['at most', ['at most', 'no more than', 'not more than', 'more than', 'up to', 'maximum']],
  ['at least', ['at least', 'no fewer than', 'no less than', 'fewer than', 'less than', 'minimum']],
  ['exactly', ['exactly', 'precisely']],
  ['every', ['every', 'each', 'all', 'any']],
  ['unique', ['unique', 'never reused', 'distinct', 'no two']],
]
const re = (w: string): RegExp => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i')
const kept = (text: string, words: string[]): boolean => words.some(w => re(w).test(text))

// The numbers a rule states: not its example literals (quoted strings, call arguments), its ids or its own table cell.
function limits(quote: string): string[] {
  let q = quote.replace(/^\s*[A-Z]+-\d+(?:\.\d+)*\s*\|/, ' ')
  for (let prev = ''; prev !== q;) { prev = q; q = q.replace(/\([^()]*\)/g, ' ') }
  q = q.replace(/"[^"]*"|`[^`]*`/g, ' ').replace(/\b[A-Za-z]+-\d+(?:\.\d+)*\b/g, ' ')
  return [...new Set(q.match(/\b\d+(?:\.\d+)?\b/g) ?? [])]
}
const keepsNumber = (text: string, n: string): boolean => re(n).test(text) || (n === '0' && kept(text, ['no', 'none', 'zero', 'never']))

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
      for (const [word, ways] of STRONG) if (re(word).test(quote) && !kept(text, ways)) found.push(`${b} cites ${id} but drops "${word}"`)
      for (const n of limits(quote)) if (!keepsNumber(text, n)) found.push(`${b} cites ${id} but drops "${n}"`)
    }
  }
  return [...new Set(found)]
}

export function weakeningLines(slug: string): string[] {
  const dir = path.join(CHANGES, slug)
  const spec = read(path.join(dir, 'spec.md')), requirements = read(path.join(dir, 'requirements.md'))
  return spec && requirements ? weakenings(spec, requirements).map(w => `WARNING weakened: ${w}`) : []
}
