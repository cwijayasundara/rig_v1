// Wiki citations (wiki design 2026-10-17): the forms a page may cite, the declaration a citation names, and its hash. Pure over text.
import { createHash } from 'node:crypto'

export type Cite = { kind: 'code'; path: string; symbol?: string } | { kind: 'why'; type: 'adr' | 'commit' | 'pr'; ref: string }

const WHY = { adr: /^\d{1,6}$/, commit: /^[0-9a-f]{7,40}$/, pr: /^\d{1,7}$/ }
const SYMBOL = /^[A-Za-z_$][\w$]*$/
const PATH = /^[\w@.\/-]+$/

function parseOne(tok: string): Cite | null {
  const why = /^(adr|commit|pr):(.+)$/.exec(tok)
  if (why) return WHY[why[1] as keyof typeof WHY].test(why[2]!) ? { kind: 'why', type: why[1] as 'adr' | 'commit' | 'pr', ref: why[2]! } : null
  const [p, symbol, ...rest] = tok.split('#')
  if (!p || rest.length || !PATH.test(p) || p.startsWith('/') || p.split('/').includes('..')) return null
  if (symbol === undefined) return { kind: 'code', path: p }
  return SYMBOL.test(symbol) ? { kind: 'code', path: p, symbol } : null
}

// The citations a line ends with, in order. Any malformed one, or none at the end, gives [].
export function parseCites(line: string): Cite[] {
  const tail = /((?:\s*\[[^\]\s]+\])+)\s*$/.exec(line)?.[1]
  if (!tail) return []
  const out: Cite[] = []
  for (const m of tail.matchAll(/\[([^\]\s]+)\]/g)) {
    const c = parseOne(m[1]!)
    if (!c) return []
    out.push(c)
  }
  return out
}

// One scanner for strings, comments and brackets, shared by comment stripping and span finding.
type Tok = { i: number; ch: string; kind: 'code' | 'string' | 'comment' }
function* scan(text: string): Generator<Tok> {
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '/' && text[i + 1] === '/') {
      const e = text.indexOf('\n', i)
      const end = e < 0 ? text.length : e
      for (; i < end; i++) yield { i, ch: text[i]!, kind: 'comment' }
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2)
      const end = e < 0 ? text.length : e + 2
      for (; i < end; i++) yield { i, ch: text[i]!, kind: 'comment' }
    } else if (c === '"' || c === "'" || c === '`') {
      yield { i, ch: c, kind: 'string' }
      i++
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') { yield { i, ch: text[i]!, kind: 'string' }; i++ }
        if (i < text.length) yield { i, ch: text[i]!, kind: 'string' }
        i++
      }
      if (i < text.length) { yield { i, ch: c, kind: 'string' }; i++ }
    } else { yield { i, ch: c, kind: 'code' }; i++ }
  }
}

// Comments become one space, runs of whitespace one space.
export function normalise(text: string): string {
  let out = ''
  let inComment = false
  for (const t of scan(text)) {
    if (t.kind === 'comment') { if (!inComment) out += ' '; inComment = true } else { inComment = false; out += t.ch }
  }
  return out.replace(/\s+/g, ' ').trim()
}

export const hashText = (text: string): string => createHash('sha256').update(normalise(text)).digest('hex').slice(0, 16)

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Declaration heads for a name: keyword declarations, and a method head (`name(...) {` at the start of a line).
function heads(source: string, name: string): number[] {
  const n = esc(name)
  const decl = new RegExp(`^[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:function\\*?|class|interface|type|enum|const|let|var)\\s+${n}\\b`, 'gm')
  const method = new RegExp(`^[ \\t]*(?:(?:public|private|protected|static|async|get|set|readonly|override)\\s+)*${n}\\s*(?:<[^>\\n]*>)?\\s*\\([^\\n]*\\)\\s*(?::\\s*[^{;=\\n]+)?\\{[ \\t]*$`, 'gm')
  const at = new Set<number>()
  for (const re of [decl, method]) for (const m of source.matchAll(re)) at.add(m.index! + m[0].length - m[0].trimStart().length)
  return [...at]
}

const CONTINUES = /[=,|&(+\-*/?:<]$/

// From a head to the end of its declaration: the matching close of the first brace group, else the statement end.
function spanEnd(source: string, from: number): number {
  let depth = 0
  let sawBrace = false
  let last = from
  const rest = source.slice(from)
  for (const t of scan(rest)) {
    last = from + t.i
    if (t.kind !== 'code') continue
    const c = t.ch
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === '{') { depth++; sawBrace = true } else if (c === '}') {
      depth--
      if (depth === 0 && sawBrace && !/^\s*=>/.test(rest.slice(t.i + 1, t.i + 40))) return from + t.i + 1
    } else if (depth === 0 && (c === ';' || c === '\n')) {
      if (c === '\n') {
        const before = rest.slice(0, t.i).trimEnd()
        const after = rest.slice(t.i).trimStart()
        if (CONTINUES.test(before) || /^[|&?:.+]/.test(after) || sawBrace) continue
      }
      return from + t.i
    }
  }
  return from + (last - from) + 1
}

// The declaration text of `symbol`, or null when it is absent or declared more than once (overloads, shadowing).
export function findSymbol(source: string, symbol: string): string | null {
  const at = heads(source, symbol)
  const start = at[0]
  if (at.length !== 1 || start === undefined) return null
  return source.slice(start, spanEnd(source, start)).trim()
}

// The hash a citation records, or null when the file is missing or the symbol does not resolve to exactly one declaration.
export function citeHash(cite: Cite & { kind: 'code' }, read: (p: string) => string | null): string | null {
  const text = read(cite.path)
  if (text === null) return null
  if (cite.symbol === undefined) return hashText(text)
  const decl = findSymbol(text, cite.symbol)
  return decl === null ? null : hashText(decl)
}
