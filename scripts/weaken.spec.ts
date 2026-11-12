// The weakening check (readiness doc R6): a spec behaviour keeps the never, limit and numbers of the requirements.md row it cites.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weakenings } from './weaken.ts'
import { makeRepo, sdlc, write } from './testkit.ts'

const REQ = '# Requirements: x\n\n- AC-1 [rule] prd.md:4 "an id is never reused, at most 3 loans"\n- DR-2 [rule] prd.md:9 "a loan lasts exactly 14 days"\n'
const spec = (...lines: string[]): string => `# Spec\n\n## Behaviours\n${lines.join('\n')}\n\n## Open questions\nnone\n`

test('a dropped "never" and a dropped limit are named; a kept number passes', () => {
  assert.deepEqual(weakenings(spec('- B1 (FR-1, AC-1): ids are reused rarely; up to 3 loans'), REQ), ['B1 cites AC-1 but drops "never"', 'B1 cites AC-1 but drops "at most"'])
})

test('kept words in any case pass, and several cited ids are unioned', () => {
  assert.deepEqual(weakenings(spec('- B1 (AC-1, DR-2): an id is Never reused, At Most 3 loans, each exactly 14 days'), REQ), [])
  assert.deepEqual(weakenings(spec('- B1 (AC-1, DR-2): an id is never reused, at most 3 loans, each lasting 2 weeks'), REQ), ['B1 cites DR-2 but drops "exactly"', 'B1 cites DR-2 but drops "14"'])
})

test('a cited id without a row, and an uncited behaviour, give nothing', () => {
  assert.deepEqual(weakenings(spec('- B1 (FR-9, AC-9): anything', '- B2: no citation at all'), REQ), [])
  assert.deepEqual(weakenings(spec('- B1 (AC-1): weaker'), ''), [])
})

test('failure behaviours are checked too', () => {
  const s = '# Spec\n\n## Behaviours\n- B1 (AC-1): an id is never reused, at most 3 loans\n\n### Failure behaviour\n- B2 (DR-2): a loan lasts 14 days\n'
  assert.deepEqual(weakenings(s, REQ), ['B2 cites DR-2 but drops "exactly"'])
})

const change = (requirements: string | null, specText: string): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'loans', '--type', 'feature'])
  write(repo, '.rig/changes/loans/spec.md', specText)
  write(repo, '.rig/changes/loans/plan.md', '# Plan\n\n## Files\n- src/\n\n## Open questions\nnone\n')
  if (requirements !== null) write(repo, '.rig/changes/loans/requirements.md', requirements)
  return repo
}

test('approve --check prints the warning and still exits 0', () => {
  const r = sdlc(change(REQ, spec('- B1 (AC-1): ids are reused rarely, at most 3 loans')), ['approve', 'loans', '--check'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /WARNING weakened: B1 cites AC-1 but drops "never"\nok: loans can be approved/)
})

test('approve --check with no requirements.md is unchanged', () => {
  const r = sdlc(change(null, spec('- B1 (AC-1): ids are reused rarely')), ['approve', 'loans', '--check'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'ok: loans can be approved')
})
