import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { check, checkLogin, freezeFor, parse } from './intent-map.mjs'

const HERE = import.meta.dirname
const LOGIN = path.join(HERE, 'fixtures/intent-map/login')
const CASES = path.join(HERE, 'fixtures/intent-map/cases')
const read = file => fs.readFileSync(file, 'utf8')
const rules = result => result.findings.map(f => f.rule)

test('the plan-time login map is acceptable before any body or test result exists', () => {
  const result = checkLogin('plan')
  assert.deepEqual(result.findings, [])
  assert.equal(parse(read(path.join(LOGIN, 'intent-plan.md'))).scenarios.every(s => s.status === 'planned'), true)
})

test('the ship-time login map passes only with the good implementation, rejected mutants, and recorded evidence', () => {
  const result = checkLogin('ship')
  assert.deepEqual(result.findings, [], result.findings.map(f => f.detail).join('\n'))
  assert.match(result.receipt, /R1 formal: C2 holds, C3 holds/)
  assert.match(result.receipt, /T1 empirical: E1 evidence @ 8b8b70f, E2 evidence @ 8b8b70f \(evidence, not proof\)/)
  assert.match(result.receipt, /N1 not promised: Login finishes/)
  assert.equal(result.receipt.includes('proof)') && result.receipt.includes('E1 evidence'), true)
})

test('the committed freeze is the hash of the approved scenario text', () => {
  const text = read(path.join(LOGIN, 'intent.md'))
  assert.deepEqual(JSON.parse(read(path.join(LOGIN, 'freeze.json'))), freezeFor(text))
})

test('a said sentence with no row is a gap, and both-ways with only one direction is refused', () => {
  assert.ok(rules(check(read(path.join(CASES, 'gap.md')), { phase: 'plan' })).includes('unmapped-said'))
  const oneWay = check(read(path.join(CASES, 'one-way.md')), { phase: 'plan' })
  assert.ok(rules(oneWay).includes('both-ways'))
})

test('a result recorded before ship, a stale scenario, a vacuous clause, and a test that repeats a formal clause each fail', () => {
  const plan = read(path.join(LOGIN, 'intent-plan.md')).replace('status: planned', 'status: pass')
  assert.ok(rules(check(plan, { phase: 'plan' })).includes('empirical-early'))

  const ship = read(path.join(LOGIN, 'intent.md'))
  const freeze = freezeFor(ship)
  freeze.E1 = 'deadbeef'
  assert.ok(rules(check(ship, { phase: 'ship', freeze, clauses: { C2: true, C3: true, C7: true, C8: true, C9: true }, mutants: [] })).includes('stale-scenario'))

  const parsed = parse(ship)
  const mutants = parsed.clauses.map(c => ({ id: 'noop', clause: c.id, holds: true }))
  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: { C2: true, C3: true, C7: true, C8: true, C9: true }, mutants })).includes('vacuous'))

  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: { C2: true, C3: true, C7: true, C8: true, C9: true }, mutants: parsed.clauses.map(c => ({ id: c.id, clause: c.id, holds: false })), tests: [read(path.join(CASES, 'prune.py'))] })).includes('prune'))
})

test('every mutant of a clause is read: a surviving second mutant is vacuous, a duplicate id is formal-failed, only zero mutants is unmutated', () => {
  const ship = read(path.join(LOGIN, 'intent.md'))
  const all = { C2: true, C3: true, C7: true, C8: true, C9: true }
  const rejected = Object.keys(all).map(c => ({ id: `m-${c}`, clause: c, holds: false }))
  const run = mutants => check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: all, mutants })
  assert.deepEqual(rules(run([...rejected, { id: 'late', clause: 'C2', holds: true }])), ['vacuous'])
  assert.deepEqual(rules(run([...rejected, { id: 'm-C2', clause: 'C2', holds: false }])), ['formal-failed'])
  assert.deepEqual(rules(run(rejected.filter(m => m.clause !== 'C3'))), ['unmutated'])
})

test('an adjudicated non-bug with a by and a reason clears a surviving mutant; clause-vacuous or no by does not', () => {
  const ship = read(path.join(LOGIN, 'intent.md'))
  const all = { C2: true, C3: true, C7: true, C8: true, C9: true }
  const mutants = [...Object.keys(all).filter(c => c !== 'C2').map(c => ({ id: `m-${c}`, clause: c, holds: false })), { id: 'm1', clause: 'C2', holds: true }]
  const run = a => check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: all, mutants, adjudications: { m1: { verdict: 'non-bug', because: 'commutes', by: 'Ana', clause: 'C2', ...a } } })
  assert.deepEqual(rules(run({})), [])
  assert.deepEqual(rules(run({ verdict: 'clause-vacuous' })), ['vacuous'])
  assert.deepEqual(rules(run({ by: '' })), ['vacuous'])
  assert.deepEqual(rules(run({ clause: 'C3' })), ['vacuous'])
})

test('one-way-unjustified: a silent one-way formal row fails, a stated reason clears it, and the login map is clean', () => {
  const silent = read(path.join(CASES, 'silent-one-way.md'))
  assert.deepEqual(rules(check(silent, { phase: 'plan' })).filter(r => r === 'one-way-unjustified'), ['one-way-unjustified'])
  const said = silent.replace('## Decisions\n', '## Decisions\n- D2: one-way-because: the words only say which role an admin gets\n').replace('said S1. kind', 'said S1. decision D2. kind')
  assert.equal(rules(check(said, { phase: 'plan' })).includes('one-way-unjustified'), false)
  assert.equal(rules(check(read(path.join(LOGIN, 'intent-plan.md')), { phase: 'plan' })).includes('one-way-unjustified'), false)
})

test('trusted-unpinned: an unnamed backticked symbol fails, a pinned Trusted entry clears it, and the login map is clean', () => {
  const base = read(path.join(CASES, 'silent-one-way.md')).replace('## Decisions\n', '## Decisions\n- D2: one-way-because: only the admin role is promised\n').replace('said S1. kind', 'said S1. decision D2. kind').replace('The admin role only for a username with no email sent.', 'The admin role only when `lookup()` finds an admin row.')
  const hits = text => rules(check(text, { phase: 'plan' })).filter(r => r === 'trusted-unpinned')
  assert.deepEqual(hits(base), ['trusted-unpinned'])
  assert.deepEqual(hits(base.replace('`lookup()`', '`admin`')), [])
  assert.deepEqual(hits(base.replace('## Not promised', '## Trusted\n- lookup: returns the row. pin: pytest -q\n\n## Not promised')), [])
  assert.deepEqual(hits(base.replace('## Not promised', '## Trusted\n- lookup: returns the row. pin: \n\n## Not promised')), ['trusted-unpinned'])
  assert.deepEqual(hits(read(path.join(LOGIN, 'intent-plan.md'))), [])
})
