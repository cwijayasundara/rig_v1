// Wiki page writing and claim review (wiki design 2026-10-17): the model steps, tested against a scripted Runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPage, reviewPage, dropClaims, estimateUsd, planConfig, type Runner } from './wikigen.ts'
import type { PageEnv } from './wikivalidate.ts'

const SOURCES = { 'src/a.ts': 'export function f(a: number): number {\n  return a\n}\n' }
const env: PageEnv = { read: p => (SOURCES as Record<string, string>)[p] ?? null, whyExists: () => false }
const PAGE = { title: 'Billing', purpose: 'Money rules.' }
const four = (tag = ''): string => `# Billing\n\n> Money rules.\n\n${[1, 2, 3, 4].map(n => `- Claim ${n}${tag}. [src/a.ts#f]`).join('\n')}\n`
const verdicts = (...v: string[]): string => JSON.stringify(v.map((verdict, i) => ({ line: 5 + i, verdict })))
const ALL_OK = verdicts('supported', 'supported', 'supported', 'supported')
const HALF = verdicts('supported', 'unsupported', 'supported', 'contradicted')

// A Runner that answers from a script per role and records every prompt.
function scripted(script: { write?: string[]; review?: string[]; plan?: string[] }): { run: Runner; calls: { role: string; prompt: string }[] } {
  const q = { write: [...(script.write ?? [])], review: [...(script.review ?? [])], plan: [...(script.plan ?? [])] }
  const calls: { role: string; prompt: string }[] = []
  const run: Runner = ({ role, prompt }) => {
    calls.push({ role, prompt })
    const text = q[role].shift()
    if (text === undefined) throw new Error(`unexpected ${role} call #${calls.length}`)
    return { text, usd: 0.01 }
  }
  return { run, calls }
}

test('buildPage returns a clean page and sums the cost of every call', () => {
  const { run, calls } = scripted({ write: [four()], review: [ALL_OK] })
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.equal(r.text, four())
  assert.deepEqual(r.findings, [])
  assert.equal(r.dropped, 0)
  assert.equal(calls.length, 2)
  assert.ok(Math.abs(r.usd - 0.02) < 1e-9)
})

test('the rewrite hint quotes each offending line, since a bare line number tells the model nothing', () => {
  const bad = four().replace('- Claim 4. [src/a.ts#f]', '- Claim 4 with no citation.')
  const { run, calls } = scripted({ write: [bad, four()], review: [ALL_OK] })
  buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.match(calls[1]!.prompt, /line 8: .* -> - Claim 4 with no citation\./)
})

test('an uncited first write triggers exactly one rewrite that carries the finding', () => {
  const bad = four().replace('- Claim 4. [src/a.ts#f]', '- Claim 4 with no citation.')
  const { run, calls } = scripted({ write: [bad, four()], review: [ALL_OK] })
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.equal(r.text, four())
  assert.deepEqual(calls.map(c => c.role), ['write', 'write', 'review'])
  assert.match(calls[1]!.prompt, /does not end with a citation/)
})

test('a write that is still invalid after the rewrite gives text null and its findings', () => {
  const bad = '# Billing\n\n> Money rules.\n\n- Nothing cited.\n'
  const { run, calls } = scripted({ write: [bad, bad] })
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.equal(r.text, null)
  assert.deepEqual(r.findings.map(f => f.rule), ['uncited'])
  assert.equal(calls.length, 2)
})

test('dropping more than the allowed share regenerates once', () => {
  const { run, calls } = scripted({ write: [four('a'), four('b')], review: [HALF, ALL_OK] })
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.equal(r.text, four('b'))
  assert.deepEqual(calls.map(c => c.role), ['write', 'review', 'write', 'review'])
  assert.match(calls[2]!.prompt, /Claim 2a/)
})

test('a second bad result is returned with a finding and no third write', () => {
  const { run, calls } = scripted({ write: [four('a'), four('b')], review: [HALF, HALF] })
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run })
  assert.equal(calls.length, 4)
  assert.equal(r.dropped, 2)
  assert.ok(r.text && !/Claim 2b/.test(r.text) && /Claim 1b/.test(r.text))
  assert.deepEqual(r.findings.map(f => f.rule), ['unsupported'])
})

test('reviewPage ignores verdicts for lines that are not claims, and an unparseable reply is an error, not supported', () => {
  const { run } = scripted({ review: [JSON.stringify([{ line: 5, verdict: 'supported' }, { line: 99, verdict: 'supported' }]), 'I think it is fine.'] })
  const ok = reviewPage(four(), SOURCES, run)
  assert.deepEqual(ok.verdicts.map(v => v.line), [5, 6, 7, 8])
  assert.deepEqual(ok.verdicts.map(v => v.verdict), ['supported', 'unsupported', 'unsupported', 'unsupported'])
  const bad = reviewPage(four(), SOURCES, run)
  assert.deepEqual(bad.verdicts, [])
  assert.match(bad.error ?? '', /could not read/)
})

test('dropClaims removes every line that is not supported and counts them', () => {
  const r = dropClaims(four(), [{ line: 5, verdict: 'supported' }, { line: 6, verdict: 'unsupported' }, { line: 7, verdict: 'supported' }, { line: 8, verdict: 'contradicted' }])
  assert.equal(r.dropped, 2)
  assert.equal(r.total, 4)
  assert.equal(r.text, '# Billing\n\n> Money rules.\n\n- Claim 1. [src/a.ts#f]\n- Claim 3. [src/a.ts#f]\n')
})

test('planConfig reads a fenced JSON config and returns the parse error string otherwise', () => {
  const good = '```json\n' + JSON.stringify({ notes: [], pages: [{ title: 'A', purpose: 'a' }] }) + '\n```'
  const a = planConfig(['src/a.ts'], scripted({ plan: [good] }).run)
  assert.equal(typeof a.config, 'object')
  const b = planConfig(['src/a.ts'], scripted({ plan: ['no json here'] }).run)
  assert.equal(typeof b.config, 'string')
})

test('estimateUsd is zero for nothing and grows with pages and source size', () => {
  assert.equal(estimateUsd(0, 0), 0)
  assert.ok(estimateUsd(5, 1000) > estimateUsd(1, 1000))
  assert.ok(estimateUsd(5, 100_000) > estimateUsd(5, 1000))
})

test('a hint passed to buildPage reaches the first write prompt', () => {
  const { run, calls } = scripted({ write: [four()], review: [ALL_OK] })
  buildPage({ page: PAGE, sources: SOURCES, env, run, hint: 'Only src/a.ts changed since the last build.' })
  assert.match(calls[0]!.prompt, /Only src\/a\.ts changed/)
})

test('planConfig keeps the paths the planner proposes', () => {
  const json = JSON.stringify({ notes: [], pages: [{ title: 'A', purpose: 'a', paths: ['src/'] }] })
  const r = planConfig(['src/a.ts'], scripted({ plan: [json] }).run)
  assert.deepEqual((r.config as { pages: { paths?: string[] }[] }).pages[0]!.paths, ['src/'])
})

test('the reviewer sees each cited source once, however many lines cite it', () => {
  const page = '# T\n\n> p\n\n- One. [src/a.ts]\n- Two. [src/a.ts]\n- Three. [src/a.ts]\n'
  const { run, calls } = scripted({ review: [JSON.stringify([5, 6, 7].map(line => ({ line, verdict: 'supported' })))] })
  reviewPage(page, { 'src/a.ts': 'export function f(a: number): number {\n  return a\n}\n' }, run)
  assert.equal(calls[0]!.prompt.split('return a').length - 1, 1)
})

test('an empty reply, or a page whose claims are all dropped, is not a page', () => {
  const empty = buildPage({ page: PAGE, sources: SOURCES, env, run: scripted({ write: ['', ''] }).run })
  assert.equal(empty.text, null)
  assert.ok(empty.findings.length > 0)
  const none = verdicts('unsupported', 'unsupported', 'unsupported', 'unsupported')
  const r = buildPage({ page: PAGE, sources: SOURCES, env, run: scripted({ write: [four('a'), four('b')], review: [none, none] }).run })
  assert.equal(r.text, null)
  assert.ok(r.findings.some(f => f.rule === 'unsupported'))
})

test('the regeneration write keeps the hint', () => {
  const { run, calls } = scripted({ write: [four('a'), four('b')], review: [HALF, ALL_OK] })
  buildPage({ page: PAGE, sources: SOURCES, env, run, hint: 'Only src/a.ts changed since the last build.' })
  assert.match(calls[2]!.prompt, /Only src\/a\.ts changed/)
  assert.match(calls[2]!.prompt, /Claim 2a/)
})
