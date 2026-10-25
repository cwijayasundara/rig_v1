// The PR body (proposal 2026-10-25 A1): why in one sentence, the behaviours, blast radius, door, evidence, and the outline the pr skill wrote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prBody } from './prbody.ts'

const intent = '---\nslug: demo\n---\n# Demo\n\n## Intent\n\nUsers cannot export a report. They need a CSV so finance can reconcile. Done is a download button.\n\n## Open questions\nnone\n'
const spec = '# Spec\n\n## Behaviours\n- B1: export downloads a CSV\n- B2: empty report exports a header row\n\n## Blast radius\n- src/export/\n- test/export.test.ts\n\n## Open questions\nnone\n'
const plan = '# Plan\n\n## Files\n- src/export/csv.ts\n\n## Contracts\nnone\n'
const verify = { at: '2026-10-25T10:00:00Z', tree: 'abc', base: 'main', pass: true, blocks: ['tests', 'lint'] }

test('the body opens with one-sentence Why taken from the intent', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '' })
  assert.match(b, /## Why the change\n\nUsers cannot export a report\.\n/)
  assert.doesNotMatch(b, /finance/)
})

test('the body lists behaviours and the blast radius from the spec', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '' })
  assert.match(b, /- B1: export downloads a CSV\n- B2: empty report exports a header row/)
  assert.match(b, /## Blast radius\n\n- src\/export\/\n- test\/export\.test\.ts/)
})

test('the door is two-way without contracts and one-way when the plan edits one', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '' }), /Door: two-way/)
  const withContract = plan.replace('none', '- .rig/contracts/api.yaml')
  assert.match(prBody({ intent, spec, plan: withContract, verify, outline: '' }), /Door: one-way \(contracts: \.rig\/contracts\/api\.yaml\)/)
})

test('the evidence quotes verify.json, and a missing verify says so', () => {
  assert.match(prBody({ intent, spec, plan, verify, outline: '' }), /## Evidence\n\nverify: pass on tree abc \(tests, lint\)/)
  assert.match(prBody({ intent, spec, plan, verify: null, outline: '' }), /verify: none/)
})

test('the outline the skill wrote is appended, and absent sections stay out', () => {
  const b = prBody({ intent, spec, plan, verify, outline: '## Change outline\n\n```diff\n+ src/export/csv.ts\n```\n' })
  assert.match(b, /## Change outline\n\n```diff/)
  assert.doesNotMatch(prBody({ intent, spec, plan, verify, outline: '' }), /Change outline/)
})

test('an intent with no text still gives a body', () => {
  const b = prBody({ intent: '', spec: '', plan: '', verify: null, outline: '' })
  assert.match(b, /## Why the change\n\nnone recorded/)
})
