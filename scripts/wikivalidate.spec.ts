// Wiki page validation (wiki design 2026-10-17, "Against wrong claims" step 1): the rules a script can check, no model.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePage, pageCitations, bodyLines, type PageEnv } from './wikivalidate.ts'

const FILES: Record<string, string> = { 'src/a.ts': 'export function f(a: number): number {\n  return a\n}\n', 'src/b.ts': 'export const g = 1\n' }
const env: PageEnv = { read: p => FILES[p] ?? null, whyExists: c => c.type === 'adr' && c.ref === '0001' }
const page = (body: string): string => `---\nhashes: {}\n---\n# Billing\n\n> Money rules.\n\n${body}`
const rules = (text: string): string[] => validatePage(text, env).map(f => `${f.rule}@${f.line}`)

test('a clean page has no findings', () => {
  const text = page('- Adds one. [src/a.ts#f]\n- Holds the constant. [src/b.ts]\n- Chosen for cents. [adr:0001]\n\n```mermaid\ngraph TD\n  A[f] --> B[g] %% [src/a.ts#f]\n```\n')
  assert.deepEqual(rules(text), [])
})

test('each rule fires on its own line', () => {
  assert.deepEqual(rules(page('- No citation here.\n')), ['uncited@8'])
  assert.deepEqual(rules(page('- It adds. It also subtracts. [src/a.ts#f]\n')), ['two-sentences@8'])
  assert.deepEqual(rules(page('- Gone. [src/zzz.ts]\n')), ['path-missing@8'])
  assert.deepEqual(rules(page('- Gone. [src/a.ts#nope]\n')), ['symbol-unresolved@8'])
  assert.deepEqual(rules(page('- Escapes. [../x.ts]\n')), ['path-escapes@8'])
  assert.deepEqual(rules(page('- Why. [commit:deadbee]\n')), ['why-unresolved@8'])
  assert.deepEqual(rules(page('```mermaid\ngraph TD\n  A --> B\n```\n')), ['mermaid@10'])
})

test('abbreviations and version numbers do not read as two sentences', () => {
  assert.deepEqual(rules(page('- Rounds, e.g. half up, in v1.2 only. [src/a.ts#f]\n')), [])
  assert.deepEqual(rules(page('1. Numbered item. [src/a.ts#f]\n')), [])
})

test('CRLF gives the same findings as LF', () => {
  const lf = page('- No citation here.\n- Gone. [src/zzz.ts]\n')
  assert.deepEqual(rules(lf.replace(/\n/g, '\r\n')), rules(lf))
})

test('a page with only headings has no findings and no citations', () => {
  const text = '# Title\n\n## Section\n'
  assert.deepEqual(rules(text), [])
  assert.deepEqual(pageCitations(text), [])
})

test('bodyLines skips front matter, headings, the purpose line and plain code fences', () => {
  const text = page('- Adds. [src/a.ts#f]\n\n```ts\nnot a claim\n```\n')
  assert.deepEqual(bodyLines(text).map(l => l.text), ['- Adds. [src/a.ts#f]'])
})

test('pageCitations lists every citation with its line', () => {
  const cites = pageCitations(page('- Adds. [src/a.ts#f]\n- Both. [src/a.ts] [adr:0001]\n'))
  assert.deepEqual(cites.map(c => c.line), [8, 9, 9])
  assert.deepEqual(cites[0]!.cite, { kind: 'code', path: 'src/a.ts', symbol: 'f' })
})
