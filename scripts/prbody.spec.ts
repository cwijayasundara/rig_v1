// The PR body (proposal 2026-10-25 A1): why in one sentence, the behaviours, blast radius, door, evidence, and the outline the pr skill wrote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prBody } from './prbody.ts'
import type { RunRow } from './runs.ts'

const intent = '---\nslug: demo\n---\n# Demo\n\n## Intent\n\nUsers cannot export a report. They need a CSV so finance can reconcile. Done is a download button.\n\n## Open questions\nnone\n'
const spec = '# Spec\n\n## Behaviours\n- B1: export downloads a CSV\n- B2: empty report exports a header row\n\n## Blast radius\n- src/export/\n- test/export.test.ts\n\n## Open questions\nnone\n'
const plan = '# Plan\n\n## Files\n- src/export/csv.ts\n\n## Contracts\nnone\n'
const risk = { tier: 0 as const, reasons: [] }
const verify = { at: '2026-10-25T10:00:00Z', tree: 'abc', base: 'main', pass: true, blocks: ['tests', 'lint'] }

test('the body opens with one-sentence Why taken from the intent', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '', review: '', risk })
  assert.match(b, /## Why the change\n\nUsers cannot export a report\.\n/)
  assert.doesNotMatch(b, /finance/)
})

test('the body lists behaviours and the blast radius from the spec', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '', review: '', risk })
  assert.match(b, /- B1: export downloads a CSV\n- B2: empty report exports a header row/)
  assert.match(b, /## Blast radius\n\n- src\/export\/\n- test\/export\.test\.ts/)
})

test('the door is two-way without contracts and one-way when the plan edits one', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /Door: two-way/)
  const withContract = plan.replace('none', '- .rig/contracts/api.yaml')
  assert.match(prBody({ intent, spec, plan: withContract, verify, outline: '', review: '', risk }), /Door: one-way \(contracts: \.rig\/contracts\/api\.yaml\)/)
})

test('the evidence quotes verify.json, and a missing verify says so', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /## Evidence\n\nverify: pass on tree abc \(tests, lint\)/)
  assert.match(prBody({ intent, spec, plan, verify: null, outline: '', review: '', risk }), /verify: none/)
})

test('the outline the skill wrote is appended, and absent sections stay out', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '## Change outline\n\n```diff\n+ src/export/csv.ts\n```\n', review: '', risk })
  assert.match(b, /## Change outline\n\n```diff/)
  assert.doesNotMatch(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /Change outline/)
})

test('an intent with no text still gives a body', () => {
  const b = prBody({ intent: '', spec: '', plan: '', verify: null, outline: '', review: '', risk })
  assert.match(b, /## Why the change\n\nnone recorded/)
})

const review = 'verdict: changes-needed\n## Findings\n- [severity: high] [category: tests] a.ts:1: p → f → fixed (confirmed)\n- [severity: medium] [category: data] b.ts:2: q → g → reopened: still drops rows\n## Dismissed\n- c.ts:3 r → dismissed: spec B2 says so\n## Unverifiable\n- the CSV opens in Excel → settle by: a journey\n'

test('Risk shows the tier and its reasons, and a tier 0 says so', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '', review, risk: { tier: 1, reasons: ['one-way door', '1 finding still open'] } })
  assert.match(b, /## Risk\n\nTier 1\n\n- one-way door\n- 1 finding still open\n/)
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /## Risk\n\nTier 0: none of the signals\n/)
})

test('How to revert depends on the door', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /## How to revert\n\nRevert the change: `git revert <sha>` for a plain commit on the trunk, or `git revert -m 1 <merge sha>` for a merge commit\./)
  assert.match(prBody({ intent, spec, plan: plan.replace('none', '- api.yaml'), verify, outline: '', review: '', risk }), /## How to revert\n\nReverting the code does not undo the contract change to api\.yaml/)
})

test('What the checks would miss quotes the Unverifiable list, and says so when there is none', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review, risk }), /## What the checks would miss\n\n- the CSV opens in Excel → settle by: a journey/)
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: 'verdict: pass\n', risk }), /## What the checks would miss\n\nnothing the reviewer named/)
})

test('no review.md is never read as a clean one', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /## What the checks would miss\n\nno review\.md/)
})

test('amendments recorded after approval are listed under their own heading, and "none" adds nothing', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '', review: '', risk, amendments: '## Amendments\n- A1 (B2): an empty report also exports a BOM.\n' })
  assert.match(b, /## Amendments after approval\n\n- A1 \(B2\): an empty report also exports a BOM\./)
  assert.doesNotMatch(prBody({ intent, spec, plan, verify, outline: '', review: '', risk, amendments: '## Amendments\nnone\n' }), /Amendments/)
})

// shop_app cart-storage 2026-10-27: the spec listed five files one per line without bullets and the body said "none recorded"; the revert text always said -m 1.
test('the blast radius reads path lines without bullets, and the revert text fits a plain commit as well as a merge', () => {
  const plain = spec.replace('- src/export/\n- test/export.test.ts', 'src/export/csv.ts\ntest/export.test.ts')
  assert.match(prBody({ intent, spec: plain, plan, verify, outline: '', review: '', risk }), /## Blast radius\n\n- src\/export\/csv\.ts\n- test\/export\.test\.ts/)
  assert.doesNotMatch(prBody({ intent, spec: plain, plan, verify, outline: '', review: '', risk }), /none recorded/)
  const b = prBody({ intent, spec, plan, verify, outline: '', review: '', risk })
  assert.match(b, /`git revert <sha>`/)
  assert.match(b, /`git revert -m 1 <merge sha>`/)
})

// Verification evidence item 2: the Evidence section shows what the recorded runs show, not what anyone claims.
const run = (o: Partial<RunRow>): RunRow => ({ at: 't', cmd: 'pytest -q', exit: 0, ms: 1, tail: '', source: 'ship', ...o })
const evidence = (runs: RunRow[], tests?: string): string => { const b = prBody({ intent, spec, plan, verify, outline: '', review: '', risk, runs, tests }); return b.slice(b.indexOf('## Evidence')) }

test('evidence quotes the failure lines of the red run on the base, and flags a red that is only a missing import or symbol', () => {
  const assertion = evidence([run({ cwd: '/tmp/rig-red-1', tail: '..\n' }), run({ cwd: '/tmp/rig-red-1', exit: 1, expectFail: true, tail: 'collected 3 items\nFAILED tests/test_export.py::test_b1_downloads - AssertionError: no csv\n1 failed, 2 passed' })])
  assert.match(assertion, /Red proof: the change's tests ran on the base code and failed \(exit 1, `pytest -q`\):\n\n```\nFAILED tests\/test_export.py::test_b1_downloads - AssertionError: no csv\n1 failed, 2 passed\n```/)
  assert.doesNotMatch(assertion, /Weak red/)
  const weak = (tail: string): boolean => /Weak red/.test(evidence([run({ cwd: '/tmp/r', exit: 1, expectFail: true, tail })]))
  assert.ok(weak("E   ModuleNotFoundError: No module named 'cart.errors'\n!!! Interrupted: 1 error during collection !!!"), 'pytest')
  assert.ok(weak("✖ test/cart.test.mjs (54ms)\nSyntaxError: The requested module '../src/cart.js' does not provide an export named 'clear'\nnot ok 1"), 'node --test: a file that fails to load prints ✖ too')
  assert.ok(weak('FAIL test/cart.test.ts\nError: Failed to load url ../src/cart (resolved id: ../src/cart). Does the file exist?'), 'vitest')
  assert.ok(weak("src/cart.test.ts(1,10): error TS2305: Module '\"./cart\"' has no exported member 'clear'."), 'tsc')
  assert.ok(weak('./cart_test.go:9:2: undefined: Clear\nFAIL\tshop/cart [build failed]'), 'go')
  assert.ok(weak("error CS0103: The name 'Clear' does not exist in the current context"), 'dotnet')
  assert.ok(weak('error[E0425]: cannot find function `clear` in this scope\nerror: could not compile `cart`'), 'rust')
  assert.ok(!weak('✖ clear empties the cart (2ms)\n  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n  3 !== 0'), 'node assertion')
  assert.ok(!weak("--- FAIL: TestClear (0.00s)\n    cart_test.go:12: got 3, want 0\nFAIL"), 'go assertion')
  assert.match(evidence([]), /Red proof: no run of the new tests on the base code is recorded\./)
})

test('a red run that passed on the base (red-proof waived) is never reported as failing, and a refactor shows its green proof', () => {
  const waived = evidence([run({ cwd: '/tmp/r', exit: 0, expectFail: true, tail: '3 passed' })])
  assert.match(waived, /Red proof: none\. The new tests passed on the base code \(`pytest -q`\), and verify passed only because red-proof was waived\./)
  assert.doesNotMatch(waived, /and failed/)
  assert.match(evidence([run({ sensor: 'red-proof', cwd: '/tmp/r', tail: 'ok' }), run({ sensor: 'red-proof', cwd: '/tmp/r', tail: '5 passed' })]), /Green proof \(refactor\): the change's tests ran on the base code and passed, `pytest -q`\./)
})

test('evidence lists the latest head-tree run of each check by sensor id, never a base-tree run or an older run', () => {
  const e = evidence([run({ sensor: 'unit', exit: 1, tail: '1 failed' }), run({ sensor: 'red-proof', cwd: '/tmp/r', tail: 'base ok' }), run({ sensor: 'unit', tail: '\x1b[32m12 passed\x1b[0m\n' }), run({ sensor: 'sast', cmd: 'semgrep scan', exit: 1, tail: 'finding: sql injection in @scope/pkg' })])
  assert.match(e, /Checks on the head tree \(the latest verify's run of each\):\n\n- unit: pass, `12 passed`\n- sast: fail \(exit 1\), `finding: sql injection in @scope\/pkg`/)
  assert.doesNotMatch(e, /base ok|1 failed/)
})

test("only the latest verify's runs count: a check it did not re-run is not shown from an earlier verify", () => {
  const b = prBody({ intent, spec, plan, verify: { ...verify, from: '2026-10-29T10:00:00.000Z' }, outline: '', review: '', risk, runs: [run({ at: '2026-10-28T09:00:00.000Z', sensor: 'lint', exit: 1, tail: 'old lint failure' }), run({ at: '2026-10-29T10:00:01.000Z', sensor: 'unit', tail: '12 passed' })] })
  assert.match(b, /- unit: pass/)
  assert.doesNotMatch(b, /old lint failure/)
})

test("a test's output can never close the evidence fence", () => {
  const e = evidence([run({ cwd: '/tmp/r', exit: 1, expectFail: true, tail: 'diff:\n```\n## Not code anymore' })])
  assert.match(e, /````\ndiff:\n```\n## Not code anymore\n````/)
})

test('evidence names each behaviour no test of the change names, by the traceability rule', () => {
  assert.match(evidence([], 'def test_b1_downloads_csv(): """B1"""'), /No test this change adds or edits names B2: check those behaviours by hand\./)
  assert.match(evidence([], '# B1 csv\ntest("B2 empty report", ...)'), /Every behaviour \(B1, B2\) is named by a test this change adds or edits\./)
  assert.match(evidence([], 'b1 = Basket(); b2 = Basket(); color = "#b1ff00"; B12'), /names B1, B2/, 'lowercase names and B12 are not B1')
  assert.doesNotMatch(evidence([]), /behaviour/, 'no test text given: no claim either way')
})

test('a review.md that records no agent review says so, instead of "nothing the reviewer named"', () => {
  const skipped = 'reviewer: none\nverdict: pass\n## Findings\n\n## One thing\nNot reviewed by an agent: tier 0.\n'
  const b = prBody({ intent, spec, plan, verify, outline: '', review: skipped, risk })
  assert.match(b, /## What the checks would miss\n\nNo agent reviewed this change \(tier 0\)/)
  assert.doesNotMatch(b, /nothing the reviewer named/)
})
