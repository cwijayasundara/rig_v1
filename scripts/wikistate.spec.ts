// Wiki steering file, build state and read-only staleness (wiki design 2026-10-17, "Against stale content").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWikiConfig, slugOf, snapshot, wikiStatus, type WikiState } from './wikistate.ts'

const cfg = (pages: unknown[], extra: Record<string, unknown> = {}): string => JSON.stringify({ notes: [], pages, ...extra })
const pg = (title: string, parent?: string) => ({ title, purpose: `about ${title}`, ...(parent ? { parent } : {}) })

test('parseWikiConfig accepts a two-page config with a parent', () => {
  const r = parseWikiConfig(cfg([pg('Billing'), pg('Invoices', 'Billing')]))
  assert.equal(typeof r, 'object')
  assert.deepEqual((r as { pages: { title: string }[] }).pages.map(p => p.title), ['Billing', 'Invoices'])
})

test('parseWikiConfig returns an error string for each bad config', () => {
  const bad = (json: string, re: RegExp): void => assert.match(String(parseWikiConfig(json)), re)
  bad('{nope', /JSON/)
  bad(cfg([]), /at least one page/)
  bad(cfg(Array.from({ length: 31 }, (_, i) => pg(`P${i}`))), /30/)
  bad(cfg([pg('A'), pg('A')]), /duplicate/i)
  bad(cfg([pg('A', 'Zed')]), /unknown parent/)
  bad(cfg([pg('A', 'B'), pg('B', 'A')]), /cycle/)
  bad('[]', /object/)
  bad(cfg([{ title: 'A' }]), /purpose/)
})

test('slugOf makes a file-safe lowercase name', () => {
  assert.equal(slugOf('Billing & Invoices!'), 'billing-invoices')
})

const A = 'export function f(a: number): number {\n  return a\n}\nexport function g(a: number): number {\n  return a * 2\n}\n'
const files = (m: Record<string, string>) => (p: string): string | null => m[p] ?? null
const PAGE_FG = '- Doubles. [src/a.ts#g]\n- Passes through. [src/a.ts#f]\n- Chosen. [adr:0001]\n'
const PAGE_F = '- Passes through. [src/a.ts#f]\n'

test('editing one symbol marks exactly the pages that cite it', () => {
  const read = files({ 'src/a.ts': A })
  const state: WikiState = { pages: { both: snapshot(PAGE_FG, read, 'c1'), onlyf: snapshot(PAGE_F, read, 'c1') } }
  const pages = { both: PAGE_FG, onlyf: PAGE_F }
  assert.deepEqual(wikiStatus(state, pages, read), [])
  const edited = files({ 'src/a.ts': A.replace('a * 2', 'a * 3') })
  assert.deepEqual(wikiStatus(state, pages, edited), [{ page: 'both', cite: 'src/a.ts#g', why: 'changed' }])
})

test('a comment-only or whitespace edit does not make a page stale', () => {
  const read = files({ 'src/a.ts': A })
  const state: WikiState = { pages: { both: snapshot(PAGE_FG, read, 'c1') } }
  const noisy = files({ 'src/a.ts': A.replace('return a * 2', '// doubled\n  return   a * 2') })
  assert.deepEqual(wikiStatus(state, { both: PAGE_FG }, noisy), [])
})

test('a deleted file is missing and a symbol declared twice is unresolved', () => {
  const read = files({ 'src/a.ts': A })
  const state: WikiState = { pages: { onlyf: snapshot(PAGE_F, read, 'c1') } }
  assert.deepEqual(wikiStatus(state, { onlyf: PAGE_F }, files({})), [{ page: 'onlyf', cite: 'src/a.ts#f', why: 'missing' }])
  const dup = files({ 'src/a.ts': A + 'function f() {}\n' })
  assert.deepEqual(wikiStatus(state, { onlyf: PAGE_F }, dup), [{ page: 'onlyf', cite: 'src/a.ts#f', why: 'unresolved' }])
})

test('a why citation is never stale and snapshot records the commit', () => {
  const read = files({ 'src/a.ts': A })
  const s = snapshot('- Chosen. [adr:0001]\n', read, 'abc1234')
  assert.deepEqual(s, { builtAt: 'abc1234', hashes: {} })
  assert.deepEqual(wikiStatus({ pages: { w: s } }, { w: '- Chosen. [adr:0001]\n' }, files({})), [])
})

test('a page may scope its sources with paths, and two titles with the same slug are refused', () => {
  const ok = parseWikiConfig(cfg([{ ...pg('Billing'), paths: ['src/billing/', 'src/util/money.ts'] }]))
  assert.deepEqual((ok as { pages: { paths?: string[] }[] }).pages[0]!.paths, ['src/billing/', 'src/util/money.ts'])
  assert.match(String(parseWikiConfig(cfg([{ ...pg('A'), paths: '/etc' }]))), /paths/)
  assert.match(String(parseWikiConfig(cfg([{ ...pg('A'), paths: ['../x'] }]))), /paths/)
  assert.match(String(parseWikiConfig(cfg([pg('Order flow'), pg('Order-flow')]))), /same file name/)
})

test('a wiki.json with legacy top-level notes still loads, and the config carries none', () => {
  const c = parseWikiConfig(JSON.stringify({ notes: ['old'], pages: [{ title: 'A', purpose: 'a' }] }))
  assert.equal(typeof c, 'object')
  assert.ok(!('notes' in (c as object)))
})
