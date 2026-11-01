// Claims against evidence (docs/superpowers/specs/2026-11-01-run-your-claims-design.md): what review.md and plan.md say, checked against the tree.
// Every rule only suggests; none blocks a ship.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFindings, fileRows } from './claims.ts'

const review = [
  'verdict: changes-needed',
  '## Findings',
  '- [severity: high] [category: correctness] src/a.ts:12: boom. Fails when: x=1. Repro: node --test t.js -k a:b → return early → fixed (confirmed)',
  '- [severity: medium] [category: tests] test/b.test.ts:3: weak. Fails when: y → add assert',
  '## Deferred',
  '- [severity: medium] [category: tests] src/z.ts:9: not a finding → nope',
  '## Pre-existing',
  '- src/old.ts:1: old → x',
].join('\n')

test('parseFindings reads only the Findings section, with file, line, repro and fixed state', () => {
  const f = parseFindings(review)
  assert.equal(f.length, 2)
  assert.deepEqual({ file: f[0]!.file, line: f[0]!.line, fixed: f[0]!.fixed, confirmed: f[0]!.confirmed, repro: f[0]!.repro },
    { file: 'src/a.ts', line: 12, fixed: true, confirmed: true, repro: 'node --test t.js -k a:b' })
  assert.deepEqual({ fixed: f[1]!.fixed, confirmed: f[1]!.confirmed, repro: f[1]!.repro }, { fixed: false, confirmed: false, repro: null })
})

test('parseFindings gives [] without a Findings heading, and for a tier-0 review', () => {
  assert.deepEqual(parseFindings('no headings here'), [])
  assert.deepEqual(parseFindings('reviewer: none\nverdict: pass\n## Findings\n\n## Dismissed\n'), [])
})

const base = { findings: parseFindings(review), exists: (f: string) => f !== 'test/b.test.ts', lineCount: () => 10, planFiles: ['src/a.ts', 'src/c.ts'], changed: (f: string) => f === 'src/a.ts', amendments: '## Amendments\n- A1 (B9): load catches X\n', behaviourIds: ['B1', 'B2'] }
const by = (rows: ReturnType<typeof fileRows>, rule: string) => rows.filter(r => r.rule === rule)

test('C1 suggests for a missing file and for a line past the end, for findings not marked fixed', () => {
  const open = { ...base, findings: base.findings.map(f => ({ ...f, fixed: false })) }
  const rows = by(fileRows(open), 'C1')
  assert.equal(rows.length, 2)
  assert.equal(rows[0]!.status, 'suggest') // src/a.ts:12 of 10 lines
  assert.match(rows[0]!.detail, /src\/a\.ts:12/)
  assert.equal(rows[1]!.status, 'suggest') // test/b.test.ts missing
  assert.equal(by(fileRows({ ...open, lineCount: () => 99, exists: () => true }), 'C1').every(r => r.status === 'ok'), true)
  assert.equal(by(fileRows(base), 'C1').length, 1, 'the fixed finding is not checked')
})

test('C1 does not throw on an empty or absolute path', () => {
  const odd = parseFindings('## Findings\n- [severity: high] [category: tests] /etc/x:1: p → f\n')
  assert.doesNotThrow(() => fileRows({ ...base, findings: odd, exists: () => false }))
})

test('C3 suggests a look at a planned file with no change', () => {
  const rows = by(fileRows(base), 'C3')
  assert.deepEqual(rows.map(r => [r.status, r.detail.includes('src/c.ts')]), [['ok', false], ['suggest', true]])
})

test('C4 suggests for an amendment that cites a behaviour the spec lacks, and not for "none"', () => {
  assert.equal(by(fileRows(base), 'C4')[0]!.status, 'suggest')
  assert.equal(by(fileRows({ ...base, amendments: '## Amendments\nnone\n' }), 'C4').length, 0)
})

test('C5 asks to re-run the repro of a confirmed finding, and only of that one', () => {
  const rows = by(fileRows(base), 'C5')
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.status, 'suggest')
  assert.match(rows[0]!.detail, /node --test t\.js/)
})

// The CLI: `S claims stamp <slug>` marks the cited files before the fix wave; `S claims <slug>` suggests, and always exits 0.
import fs from 'node:fs'
import { makeRepo, write, sdlc } from './testkit.ts'

const REVIEW = '## Findings\n- [severity: high] [category: correctness] src/a.ts:1: p. Fails when: x → fix\n'
function changeRepo(reviewText: string): string {
  const repo = makeRepo()
  write(repo, 'src/a.ts', 'export const a = 1\n')
  write(repo, '.rig/changes/demo/review.md', reviewText)
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- B1: works\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- src/a.ts\n')
  return repo
}
const stampOf = (repo: string): Record<string, string | null> => JSON.parse(fs.readFileSync(`${repo}/.rig/changes/demo/claims-stamp.json`, 'utf8'))

test('claims stamp records the hash of each cited file', () => {
  const repo = changeRepo(REVIEW)
  const r = sdlc(repo, ['claims', 'stamp', 'demo'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(stampOf(repo)['src/a.ts'] ?? '', /^[0-9a-f]{40}$/)
})

test('a fixed finding whose cited file is unchanged since the stamp is suggested, a changed one is not; exit is 0 either way', () => {
  const repo = changeRepo(REVIEW)
  sdlc(repo, ['claims', 'stamp', 'demo'])
  write(repo, '.rig/changes/demo/review.md', REVIEW.replace('→ fix', '→ fix → fixed'))
  const same = sdlc(repo, ['claims', 'demo'])
  assert.equal(same.code, 0)
  assert.match(same.stdout, /C2 suggest: .*src\/a\.ts/)
  write(repo, 'src/a.ts', 'export const a = 2\n')
  const moved = sdlc(repo, ['claims', 'demo'])
  assert.equal(moved.code, 0)
  assert.doesNotMatch(moved.stdout, /C2 suggest/)
})

test('without a stamp C2 is skipped, with a line saying so, and the exit is still 0', () => {
  const repo = changeRepo(REVIEW.replace('→ fix', '→ fix → fixed'))
  const r = sdlc(repo, ['claims', 'demo'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /C2 skipped/)
})

test('a malformed stamp is treated as no stamp', () => {
  const repo = changeRepo(REVIEW.replace('→ fix', '→ fix → fixed'))
  write(repo, '.rig/changes/demo/claims-stamp.json', '{nope')
  const r = sdlc(repo, ['claims', 'demo'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /C2 skipped/)
})

test('a tier-0 review has nothing to suggest', () => {
  const repo = changeRepo('reviewer: none\nverdict: pass\n## Findings\n\n## Dismissed\n')
  const r = sdlc(repo, ['claims', 'demo'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /claims: nothing to suggest/)
})

// Opus review of the change (2026-11-01): paths in a finding are model text, and the tree moves under a fix.
test('a cited path is resolved inside the repo: an absolute one that points in works, one outside, a ".." one and a directory are suggested, exit 0', () => {
  const repo = changeRepo('')
  const f = (p: string): string => `- [severity: high] [category: tests] ${p}:1: p → f\n`
  write(repo, '.rig/changes/demo/review.md', `## Findings\n${f(`${repo}/src/a.ts`)}${f('../x')}${f('src')}`)
  const r = sdlc(repo, ['claims', 'demo'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal((r.stdout.match(/C1 suggest/g) ?? []).length, 2, r.stdout)
})

test('a correctly fixed finding that cites an absolute path is not reported unchanged', () => {
  const repo = changeRepo('')
  const text = `## Findings\n- [severity: high] [category: tests] ${repo}/src/a.ts:1: p → f\n`
  write(repo, '.rig/changes/demo/review.md', text)
  sdlc(repo, ['claims', 'stamp', 'demo'])
  write(repo, 'src/a.ts', 'export const a = 2\n')
  write(repo, '.rig/changes/demo/review.md', text.replace('→ f', '→ f → fixed'))
  assert.doesNotMatch(sdlc(repo, ['claims', 'demo']).stdout, /C2 suggest/)
})

test('a fixed finding is not checked for its line or file after the fix wave moved the tree', () => {
  const repo = changeRepo('## Findings\n- [severity: high] [category: tests] src/a.ts:50: p → f → fixed\n')
  const r = sdlc(repo, ['claims', 'demo'])
  assert.doesNotMatch(r.stdout, /C1/)
})

test('a fix that changes the file named in the finding\'s fix text counts as a change', () => {
  const repo = changeRepo('')
  write(repo, 'test/a.test.ts', 'one\n')
  const text = '## Findings\n- [severity: high] [category: tests] src/a.ts:1: p → strengthen test/a.test.ts → fixed\n'
  write(repo, '.rig/changes/demo/review.md', text)
  sdlc(repo, ['claims', 'stamp', 'demo'])
  assert.match(sdlc(repo, ['claims', 'demo']).stdout, /C2 suggest/)
  write(repo, 'test/a.test.ts', 'two\n')
  assert.doesNotMatch(sdlc(repo, ['claims', 'demo']).stdout, /C2 suggest/)
})

test('C3 matches a planned directory and a ./ path against the files the change touched', () => {
  const repo = changeRepo('## Findings\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Files\n- tests/\n- ./src/a.ts\n')
  write(repo, '.rig/changes/demo/verify.json', '{"base":"HEAD"}')
  write(repo, 'tests/x.test.ts', 'x\n')
  assert.match(sdlc(repo, ['claims', 'demo']).stdout, /nothing to suggest/)
})
