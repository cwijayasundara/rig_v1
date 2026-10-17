// Wiki steering file, build state and read-only staleness (wiki design 2026-10-17, "Against stale content").
import { citeHash } from './wikicite.ts'
import { pageCitations } from './wikivalidate.ts'

export type WikiPage = { title: string; purpose: string; parent?: string; notes?: string[] }
export type WikiConfig = { notes: string[]; pages: WikiPage[] }
export type PageState = { builtAt: string; hashes: Record<string, string> }
export type WikiState = { pages: Record<string, PageState> }
export type Stale = { page: string; cite: string; why: 'changed' | 'missing' | 'unresolved' }

export const MAX_PAGES = 30

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

// A string result is the error: the person reads it and edits .rig/wiki.json.
export function parseWikiConfig(json: string): WikiConfig | string {
  let v: unknown
  try { v = JSON.parse(json) } catch { return 'wiki.json is not valid JSON' }
  if (!isObj(v) || !strs(v.notes)) return 'wiki.json needs "notes" (an array of strings; use [] when empty)'
  if (!Array.isArray(v.pages) || v.pages.length === 0) return 'wiki.json needs at least one page'
  if (v.pages.length > MAX_PAGES) return `wiki.json has ${v.pages.length} pages; the limit is ${MAX_PAGES}`
  const pages: WikiPage[] = []
  for (const p of v.pages) {
    if (!isObj(p) || !str(p.title)) return 'every page needs a title'
    if (!str(p.purpose)) return `page "${p.title}" needs a purpose`
    if (p.parent !== undefined && !str(p.parent)) return `page "${p.title}" has an invalid parent`
    if (p.notes !== undefined && !strs(p.notes)) return `page "${p.title}" notes must be an array of strings`
    pages.push({ title: p.title, purpose: p.purpose, ...(p.parent ? { parent: p.parent } : {}), ...(p.notes ? { notes: p.notes } : {}) })
  }
  const titles = new Set<string>()
  for (const p of pages) {
    if (titles.has(p.title)) return `duplicate page title "${p.title}"`
    titles.add(p.title)
  }
  const parentOf = new Map(pages.map(p => [p.title, p.parent]))
  for (const p of pages) if (p.parent && !titles.has(p.parent)) return `page "${p.title}" has unknown parent "${p.parent}"`
  for (const p of pages) {
    const seen = new Set<string>([p.title])
    for (let at = p.parent; at; at = parentOf.get(at)) {
      if (seen.has(at)) return `parent cycle through "${at}"`
      seen.add(at)
    }
  }
  return { notes: v.notes, pages }
}

export const slugOf = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const keyOf = (c: { path: string; symbol?: string }): string => (c.symbol === undefined ? c.path : `${c.path}#${c.symbol}`)

function codeCites(pageText: string): { key: string; path: string; symbol?: string }[] {
  const seen = new Map<string, { key: string; path: string; symbol?: string }>()
  for (const { cite } of pageCitations(pageText)) if (cite.kind === 'code') seen.set(keyOf(cite), { key: keyOf(cite), path: cite.path, ...(cite.symbol === undefined ? {} : { symbol: cite.symbol }) })
  return [...seen.values()]
}

// What a build records: a hash per code citation. A why citation (ADR, commit, PR) never changes, so it records nothing.
export function snapshot(pageText: string, read: (p: string) => string | null, commit: string): PageState {
  const hashes: Record<string, string> = {}
  for (const c of codeCites(pageText)) {
    const h = citeHash({ kind: 'code', path: c.path, ...(c.symbol === undefined ? {} : { symbol: c.symbol }) }, read)
    if (h !== null) hashes[c.key] = h
  }
  return { builtAt: commit, hashes }
}

// Pure and read-only: compares the recorded hashes with the files as they are now.
export function wikiStatus(state: WikiState, pages: Record<string, string>, read: (p: string) => string | null): Stale[] {
  const out: Stale[] = []
  for (const [page, text] of Object.entries(pages)) {
    const recorded = state.pages[page]?.hashes ?? {}
    for (const c of codeCites(text)) {
      const now = citeHash({ kind: 'code', path: c.path, ...(c.symbol === undefined ? {} : { symbol: c.symbol }) }, read)
      if (now === null) out.push({ page, cite: c.key, why: read(c.path) === null ? 'missing' : 'unresolved' })
      else if (recorded[c.key] !== now) out.push({ page, cite: c.key, why: 'changed' })
    }
  }
  return out
}
