// The PR body (proposal 2026-10-25 A1): why in one sentence, the behaviours, blast radius, door, evidence, and the outline the pr skill wrote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prBody } from './prbody.ts'

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
  assert.match(prBody({ intent, spec, plan, verify, outline: '', review: '', risk }), /## How to revert\n\nRevert the merge commit: `git revert -m 1 <merge sha>`\./)
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
