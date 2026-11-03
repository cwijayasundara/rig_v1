// code-modernization's hostile.test.ts, for rig: every reader that takes text from a target repo (a PRD, an intent, a review, a diff,
// rules.json, sensors.json, wiki citations) gets 100,000-character lines of the shapes that make a backtracking regex freeze.
// Several of these run inside Stop and PostToolUse hooks, where a stall freezes the session, so each must finish well inside a second.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { section, parseRules, parseUnifiedDiff, matchesAny, SECRET_PATTERNS } from './model.ts'
import { parseRegistry } from './registry.ts'
import { TAMPER_PATTERNS, SUPPRESSIONS } from './sensors.ts'
import { prdLines, prdIds, parseIntent, parseCases, parseLedger, prdBlocks, parseReview, parseAccess, intentSpecProblems } from './chartcheck.ts'
import { prdFormatProblems, prdOrigins, parseMap } from './prdformat.ts'
import { parseCoverage } from './prdcoverage.ts'
import { parseCites, findSymbol } from './wikicite.ts'
import { parseFindings } from './claims.ts'
import { parseLessons } from './learnfile.ts'
import { namingText } from './actrace.ts'

const N = 100_000
const LIMIT_MS = 1500
// What backtracking needs: long runs of one character, near-matches of each table/bullet/citation shape, and nested openers.
const RUNS = ['a', ' ', '-', '*', '[', '(', '"', '`', '|', '\t', '#', '@', '0', '.', ':', ',', '\\']
const SHAPES = [
  '- FR-1 [rule] prd.md:1 "', '- FR-1 (AC-1.1) [rule] prd.md:1 "', '| FR-1 | rule | ', '- B1 (FR-1, AC-1.1): ', '- AC-1.1: WHEN ',
  '### FR-1: ', '## ', '- [ ] ', '- A1 (B1): ', '[`src/a.ts:1-2`] ', 'src/a.ts#', 'src/a.ts:12-', '`', '- TC-1 (B1): ', '- F1 [high] ', '- F1 [high] a.ts:1 ',
  'a.ts:1 → ', '+++ b/', '--- a/', '@@ -1,1 +1,1 @@', '#### ', '---\n', 'a: [', '- FR-1.', 'AC-', 'B1 B1 B1 ', 'ac_1_', 'FR-1 FR-1 FR-1 ',
]
const inputs = (): [string, string][] => [
  ...RUNS.map((c): [string, string] => [`${JSON.stringify(c)} x ${N}`, c.repeat(N)]),
  ...SHAPES.flatMap((s): [string, string][] => [[`${JSON.stringify(s)} then a long run`, s + 'a'.repeat(N)], [`${JSON.stringify(s)} repeated`, s.repeat(Math.ceil(N / s.length))], [`${JSON.stringify(s)} on many lines`, `${s}x\n`.repeat(Math.ceil(N / (s.length + 2)))]]),
]

const READERS: [string, (t: string) => unknown][] = [
  ['section', t => section(t, 'Behaviours')],
  ['parseRules', parseRules],
  ['parseUnifiedDiff', parseUnifiedDiff],
  ['matchesAny (as the glob)', t => matchesAny(t, [t])],
  // Paths come from git and are short; a glob with several non-adjacent stars is polynomial on a long path, which is why the path is capped here.
  ['matchesAny (as the path)', t => matchesAny(t.slice(0, 4096), ['**/*.test.*', 'src/**', '*a*b', '**/test/**/*.ts'])],
  ['parseRegistry', parseRegistry],
  ['prdLines', prdLines],
  ['prdIds', prdIds],
  ['parseIntent', t => parseIntent('x', t)],
  ['parseCases', parseCases],
  ['parseLedger', parseLedger],
  ['prdBlocks', t => prdBlocks(t)],
  ['prdBlocks (all sections)', t => prdBlocks(t, { allSections: true })],
  ['parseReview', parseReview],
  ['parseAccess', parseAccess],
  ['intentSpecProblems', t => intentSpecProblems(parseIntent('x', t), t)],
  ['prdFormatProblems', prdFormatProblems],
  ['prdOrigins', t => prdOrigins(t, t)],
  ['parseMap', parseMap],
  ['parseCoverage', parseCoverage],
  ['parseCites', parseCites],
  ['findSymbol', t => findSymbol(t, 'name', 'a.ts')],
  ['parseFindings', parseFindings],
  ['parseLessons', parseLessons],
  ['namingText', namingText],
]

for (const [name, read] of READERS) {
  test(`${name} reads 100,000-character hostile lines inside ${LIMIT_MS} ms and does not throw`, () => {
    for (const [what, text] of inputs()) {
      const t = performance.now()
      try { read(text) } catch (e) { assert.fail(`${name} threw on ${what}: ${(e as Error).message}`) }
      const ms = performance.now() - t
      assert.ok(ms < LIMIT_MS, `${name} took ${Math.round(ms)} ms on ${what}`)
    }
  })
}

// The line patterns the sensors run over every added line of a diff, and the secret scan over all of it.
test('the tamper, suppression and secret patterns scan 100,000-character lines inside the limit', () => {
  const patterns = [...TAMPER_PATTERNS.map(p => [p.id, p.re] as const), ...SUPPRESSIONS.map((re, i) => [`suppression ${i}`, re] as const), ...SECRET_PATTERNS.map(([id, re]) => [`secret ${id}`, re] as const)]
  for (const [id, re] of patterns) for (const [what, text] of inputs()) {
    const t = performance.now()
    re.test(text)
    assert.ok(performance.now() - t < LIMIT_MS, `${id} took ${Math.round(performance.now() - t)} ms on ${what}`)
  }
})
