import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { RULES, check, applyResults, freezeFor, parse, scenarioHash, shipCheck, behavioursFrom, type Results, type Adjudication } from './intentmap.ts'

const FIX = path.resolve(import.meta.dirname, '../eval/fixtures/intent-map')
const read = (...p: string[]): string => fs.readFileSync(path.join(FIX, ...p), 'utf8')
const rules = (r: { findings: { rule: string }[] }): string[] => r.findings.map(f => f.rule)
const ALL = { C2: true, C3: true, C7: true, C8: true, C9: true }

test('plan-time login map has no findings and every scenario is planned', () => {
  const text = read('login/intent-plan.md')
  assert.deepEqual(check(text, { phase: 'plan' }).findings, [])
  assert.equal(parse(text).scenarios.every(s => s.status === 'planned'), true)
})

test('ship-time login map passes with clause verdicts, rejected mutants and recorded evidence', () => {
  const text = read('login/intent.md')
  const mutants = JSON.parse(read('login/mutants.json')).map((m: { id: string; clause: string }) => ({ id: m.id, clause: m.clause, holds: false }))
  const r = check(text, { phase: 'ship', freeze: JSON.parse(read('login/freeze.json')), clauses: ALL, mutants })
  assert.deepEqual(r.findings, [])
  assert.equal(r.pass, true)
  assert.match(r.receipt, /R1 formal: C2 holds, C3 holds/)
  assert.match(r.receipt, /T1 empirical: E1 evidence @ 8b8b70f, E2 evidence @ 8b8b70f \(evidence, not proof\)/)
  assert.match(r.receipt, /N1 not promised: Login finishes/)
})

test('the committed freeze is the scenario hash of the approved text', () => {
  assert.deepEqual(JSON.parse(read('login/freeze.json')), freezeFor(read('login/intent.md')))
  const s = parse(read('login/intent.md')).scenarios[0]
  assert.equal(scenarioHash(s!),freezeFor(read('login/intent.md')).E1)
})

test('a said sentence with no row is unmapped-said, and one-way both-ways is refused', () => {
  assert.ok(rules(check(read('cases/gap.md'), { phase: 'plan' })).includes('unmapped-said'))
  assert.ok(rules(check(read('cases/one-way.md'), { phase: 'plan' })).includes('both-ways'))
})

test('early result, stale scenario, vacuous clause, missing mutant and prune each fail', () => {
  assert.ok(rules(check(read('login/intent-plan.md').replace('status: planned', 'status: pass'), { phase: 'plan' })).includes('empirical-early'))
  const ship = read('login/intent.md')
  const freeze = freezeFor(ship); freeze.E1 = 'deadbeef'
  assert.ok(rules(check(ship, { phase: 'ship', freeze, clauses: ALL, mutants: [] })).includes('stale-scenario'))
  const clauses = parse(ship).clauses
  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: ALL, mutants: clauses.map(c => ({ id: 'noop', clause: c.id, holds: true })) })).includes('vacuous'))
  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: ALL, mutants: [] })).includes('unmutated'))
  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: { ...ALL, C2: false }, mutants: clauses.map(c => ({ id: c.id, clause: c.id, holds: false })), tests: [read('cases/prune.py')] })).includes('prune'))
  assert.ok(rules(check(ship, { phase: 'ship', freeze: freezeFor(ship), clauses: { ...ALL, C2: false }, mutants: [] })).includes('formal-failed'))
})

test('parity: the port returns the oracle rule list on the fixtures', async () => {
  const oracle = await import(path.join(FIX, '../../intent-map.mjs'))
  for (const [file, phase] of [['login/intent-plan.md', 'plan'], ['cases/gap.md', 'plan'], ['cases/one-way.md', 'plan']] as const) {
    const text = read(file)
    assert.deepEqual(rules(check(text, { phase })), rules(oracle.check(text, { phase })), file)
  }
})

test('crlf: a Windows line ending parses the same as a newline', () => {
  const text = read('login/intent-plan.md').replace(/\n/g, '\r\n')
  assert.deepEqual(check(text, { phase: 'plan' }).findings, [])
})

test('applyResults merges recorded results into planned scenarios', () => {
  const plan = read('login/intent-plan.md')
  const shipText = read('login/intent.md')
  const results = Object.fromEntries(parse(shipText).scenarios.map(s => [s.id, { status: s.status, command: s.command, commit: s.commit }]))
  const merged = applyResults(plan, { ...results, E99: { status: 'pass', command: 'x', commit: 'abc1234' } })
  assert.deepEqual(parse(merged).scenarios, parse(shipText).scenarios)
  assert.deepEqual(freezeFor(merged), freezeFor(plan))
  const noCommit = applyResults(plan, { E1: { status: 'pass', command: 'x' }, E2: { status: 'planned' } })
  const r = check(noCommit, { phase: 'ship', clauses: ALL, mutants: [] })
  assert.ok(rules(r).includes('empirical-unrecorded'))
  assert.ok(rules(r).includes('empirical-open'))
})

const good = (ok = true) => JSON.stringify({ clauses: ALL, mutants: ['C2', 'C3', 'C7', 'C8', 'C9'].map(clause => ({ id: `m-${clause}`, clause, holds: !ok })) })
const withCmd = (text: string): string => text.replace('## Not promised', '## Formal command\npython3 formal.py\n\n## Not promised')
const recorded = (): Results => Object.fromEntries(parse(read('login/intent.md')).scenarios.map(s => [s.id, { status: s.status!, command: s.command, commit: s.commit }]))
const ship = (over: Partial<Parameters<typeof shipCheck>[0]> = {}) => shipCheck({ text: withCmd(read('login/intent-plan.md')), results: recorded(), freeze: JSON.parse(read('login/freeze.json')), tests: [], run: () => ({ exit: 0, tail: `noise\n${good()}` }), ...over })

test('shipCheck: planned map plus recorded results plus a good formal verdict has no findings', () => {
  assert.deepEqual(ship().findings, [])
})

test('shipCheck fails closed: no command, non-zero exit, invalid JSON and a vacuous mutant are formal-failed or vacuous', () => {
  assert.ok(rules(shipCheck({ text: read('login/intent-plan.md'), results: recorded(), tests: [], run: () => ({ exit: 0, tail: good() }) })).includes('formal-failed'))
  assert.ok(rules(ship({ run: () => ({ exit: 1, tail: good() }) })).includes('formal-failed'))
  assert.ok(rules(ship({ run: () => ({ exit: 0, tail: 'not json' }) })).includes('formal-failed'))
  assert.ok(rules(ship({ run: () => ({ exit: 0, tail: good(false) }) })).includes('vacuous'))
})

test('shipCheck: open scenario, a pass with no commit, and a prune test are each reported', () => {
  assert.ok(rules(ship({ results: {} })).includes('empirical-open'))
  assert.ok(rules(ship({ results: { E1: { status: 'pass', command: 'x' }, E2: { status: 'pass', command: 'x', commit: 'abc1234' } } })).includes('empirical-unrecorded'))
  assert.ok(rules(ship({ tests: [read('cases/prune.py')] })).includes('prune'))
})

test('behavioursFrom lists each said sentence with its id, words and kind', () => {
  assert.equal(behavioursFrom(parse(read('login/intent-plan.md'))), [
    '- S1: You only get a token with the right password. (formal C2, C3)',
    '- S2: Only admin accounts get admin tokens. (formal C7, C8)',
    '- S3: Email wins when both an email and a username are sent. (formal C9)',
  ].join('\n'))
})

test('review: a scenario recorded as fail blocks ship, and a test naming a C-looking token outside the map is not pruned', () => {
  assert.ok(rules(ship({ results: { E1: { status: 'fail', command: 'x', commit: 'abc1234' }, E2: { status: 'pass', command: 'x', commit: 'abc1234' } } })).includes('empirical-open'))
  assert.deepEqual(rules(ship({ tests: ['def test_sku():\n    assert sku == "C12"\n'] })), [])
  assert.ok(rules(ship({ tests: ['# proves C2\n'] })).includes('prune'))
})

// Wave 1, item 8: every mutant of a clause is read, not only the last.
const SHIP = read('login/intent.md')
const killed = (id: string, clause: string): { id: string; clause: string; holds: boolean } => ({ id, clause, holds: false })
const rejectedAll = ['C2', 'C3', 'C7', 'C8', 'C9'].map(c => killed(`m-${c}`, c))
const shipWith = (mutants: { id: string; clause: string; holds: boolean }[], extra = {}): ReturnType<typeof check> => check(SHIP, { phase: 'ship', freeze: freezeFor(SHIP), clauses: ALL, mutants, ...extra })

test('two mutants for one clause: a surviving second one is vacuous even when the first is rejected', () => {
  const r = shipWith([...rejectedAll, { id: 'm-C2-late', clause: 'C2', holds: true }])
  assert.deepEqual(rules(r), ['vacuous'])
  assert.match(r.findings[0]!.detail, /m-C2-late/)
})

test('a duplicate mutant id is formal-failed, and only a clause with zero mutants is unmutated', () => {
  const dup = shipWith([...rejectedAll, killed('m-C2', 'C2')])
  assert.deepEqual(rules(dup), ['formal-failed'])
  assert.match(dup.findings[0]!.detail, /duplicate mutant id m-C2/)
  const none = shipWith(rejectedAll.filter(m => m.clause !== 'C3'))
  assert.deepEqual(rules(none), ['unmutated'])
  assert.match(none.findings[0]!.detail, /C3/)
})

test('the receipt lists each planted bug of a formal row', () => {
  const r = shipWith([...rejectedAll, killed('m-C2-b', 'C2')])
  assert.match(r.receipt, /R1 formal: C2 holds, C3 holds \(planted: m-C2 rejected, m-C3 rejected, m-C2-b rejected\)/)
})

// Wave 1, item 1: a surviving mutant can be adjudicated; only a non-bug with a named approver and a reason clears it.
const survivor = [...rejectedAll.filter(m => m.clause !== 'C2'), { id: 'm1', clause: 'C2', holds: true }]
const adjudicated = (a: Partial<Adjudication>): ReturnType<typeof check> => shipWith(survivor, { adjudications: { m1: { verdict: 'non-bug', because: 'commutes', by: 'Ana', ...a } } })

test('a non-bug adjudication with a by and a reason clears the survivor and the receipt says so', () => {
  const r = adjudicated({})
  assert.deepEqual(r.findings, [])
  assert.match(r.receipt, /m1 adjudicated non-bug: commutes/)
})

test('clause-vacuous, a missing by, a missing reason, or an unrelated id leave the survivor vacuous', () => {
  assert.deepEqual(rules(adjudicated({ verdict: 'clause-vacuous' })), ['vacuous'])
  assert.deepEqual(rules(adjudicated({ by: ' ' })), ['vacuous'])
  assert.deepEqual(rules(adjudicated({ because: '' })), ['vacuous'])
  assert.deepEqual(rules(shipWith(survivor, { adjudications: { other: { verdict: 'non-bug', because: 'x', by: 'Ana' } } })), ['vacuous'])
})

test('an adjudication does not suppress a different surviving mutant of the same clause', () => {
  const r = shipWith([...survivor, { id: 'm2', clause: 'C2', holds: true }], { adjudications: { m1: { verdict: 'non-bug', because: 'commutes', by: 'Ana' } } })
  assert.deepEqual(rules(r), ['vacuous'])
  assert.match(r.findings[0]!.detail, /m2/)
})

// Wave 1, item 6: a pass must be backed by a line of the run ledger.
const backed = (): Results => Object.fromEntries(Object.entries(recorded()).map(([id, r], i) => [id, { ...r, run: `r${i + 1}` }]))
const ledgerOf = (results: Results): { id?: string; cmd: string; exit: number; commit?: string }[] => Object.values(results).map(r => ({ id: r.run, cmd: r.command!, exit: 0, commit: r.commit }))
const shipBacked = (results: Results, runs: ReturnType<typeof ledgerOf>): ReturnType<typeof ship> => ship({ results, runs })

test('result-unbacked: a pass with a matching ledger line is clean', () => {
  const results = backed()
  assert.deepEqual(shipBacked(results, ledgerOf(results)).findings, [])
})

test('result-unbacked: a missing run id, an unknown run id, another command, a failed run, another commit and an empty ledger each fail the scenario', () => {
  const results = backed()
  const ledger = ledgerOf(results)
  const one = (r: ReturnType<typeof ship>): string[] => r.findings.filter(f => f.rule === 'result-unbacked').map(f => f.detail)
  const { run: _dropped, ...noRun } = results.E1!
  assert.equal(one(shipBacked({ ...results, E1: noRun }, ledger)).length, 1)
  assert.equal(one(shipBacked({ ...results, E1: { ...results.E1!, run: 'r99' } }, ledger)).length, 1)
  assert.equal(one(shipBacked(results, ledger.map(l => l.id === 'r1' ? { ...l, cmd: 'something else' } : l))).length, 1)
  assert.equal(one(shipBacked(results, ledger.map(l => l.id === 'r1' ? { ...l, exit: 1 } : l))).length, 1)
  assert.equal(one(shipBacked(results, ledger.map(l => l.id === 'r1' ? { ...l, commit: 'deadbee' } : l))).length, 1)
  const empty = one(shipBacked(results, []))
  assert.equal(empty.length, 2)
  assert.match(empty[0]!, /E1/)
})

test('result-unbacked is a reserved sensor id and a ledger that is not passed is not checked (the pure oracle path)', () => {
  assert.ok(RULES.includes('result-unbacked'))
  assert.deepEqual(ship().findings, [])
})
