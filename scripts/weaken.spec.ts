// The weakening check (readiness doc R6): a spec behaviour keeps the never, limit and numbers of the requirements.md row it cites.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weakenings } from './weaken.ts'
import { makeRepo, sdlc, write } from './testkit.ts'

const REQ = '# Requirements: x\n\n- AC-1 [rule] prd.md:4 "an id is never reused, at most 3 loans"\n- DR-2 [rule] prd.md:9 "a loan lasts exactly 14 days"\n'
const spec = (...lines: string[]): string => `# Spec\n\n## Behaviours\n${lines.join('\n')}\n\n## Open questions\nnone\n`

test('a dropped "never" and a dropped limit are named; a kept number passes', () => {
  assert.deepEqual(weakenings(spec('- B1 (FR-1, AC-1): ids are reused rarely; 3 loans each'), REQ), ['B1 cites AC-1 but drops "never"', 'B1 cites AC-1 but drops "at most"'])
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

// The journey's own sprint-1 rows (tests/e2e/journey/prd/sprint-1-library-desk.md), as the ledger quotes them.
const JOURNEY = [
  '- AC-4.1 [ac] prd.md:76 "Given a book with a free copy, when check_out("m1", "978-1", date(2026, 3, 1)) is called, then a loan is recorded with the due date set by the desk\'s loan period and the book has one free copy fewer"',
  '- AC-5.3 [ac] prd.md:90 "Given a book with 2 copies, when check_out and return_book calls are applied in any order, then available("978-1") is always between 0 and 2"',
  '- DR-4 [rule] prd.md:97 "A member may hold at most 3 books on loan at the same time."',
  '- DR-5 [rule] prd.md:98 "A book is lent for 14 days; the due date is 14 days after the day it is checked out."',
  '- NFR-1 [nfr] prd.md:106 "NFR-1 | reliability | Writes are atomic (write a temp file, then rename) | 0 half-written files after a failed or interrupted write | unit test"',
].join('\n')

test('faithful behaviours against the journey ledger give no warning (example literals, ids, table cells, equivalent wording)', () => {
  assert.deepEqual(weakenings(spec(
    '- B1 (FR-4, AC-4.1, DR-5): checking out a book with a free copy records a loan due 14 days later and frees one copy fewer',
    '- B3 (AC-5.3): copies stay between 0 and 2 whatever the order of check-outs and returns',
    '- B4 (NFR-1): a write goes to a temp file then a rename, so no half-written file is ever left',
    '- B7 (DR-4): a member must not hold more than 3 books at once',
  ), JOURNEY), [])
})

test('a real weakening of a journey rule is still caught', () => {
  assert.deepEqual(weakenings(spec('- B7 (DR-4): a member may hold several books'), JOURNEY), ['B7 cites DR-4 but drops "at most"', 'B7 cites DR-4 but drops "3"'])
  assert.deepEqual(weakenings(spec('- B2 (DR-5): a book is lent for two weeks'), JOURNEY), ['B2 cites DR-5 but drops "14"'])
})
