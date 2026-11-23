import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sensorCites } from './sensorcite.ts'
import { prBody } from './prbody.ts'

const sensors = [{ id: 'lint', blocks: true }, { id: 'types', blocks: true }, { id: 'size', blocks: false }]
const spec = (...lines: string[]): string => `# Spec\n\n## Behaviours\n${lines.join('\n')}\n\n## Blast radius\n- src/\n`

test('a behaviour ending [sensor: ids] of blocking sensors is traced without a test', () => {
  const r = sensorCites(spec('- B1: stores items', '- B2 (NFR-2): ruff and mypy report 0 errors [sensor: lint, types]'), sensors)
  assert.deepEqual(r.traced, ['B2'])
  assert.deepEqual(r.findings, [])
})

test('an unknown or non-blocking id is a block finding that names it, and the behaviour is not traced', () => {
  const r = sensorCites(spec('- B1: clean [sensor: lint, nope]', '- B2: small [sensor: size]'), sensors)
  assert.deepEqual(r.traced, [])
  assert.equal(r.findings.length, 2)
  assert.match(r.findings[0]!.message, /B1 cites \[sensor: nope\]/)
  assert.match(r.findings[1]!.message, /B2 cites \[sensor: size\]/)
  assert.ok(r.findings.every(f => f.severity === 'block'))
})

test('a marker that is not at the end of the line cites nothing', () => {
  assert.deepEqual(sensorCites(spec('- B1: [sensor: lint] then more words'), sensors), { traced: [], rest: [], findings: [] })
})

test('the PR body agrees: a cited behaviour counts as traced', () => {
  const s = spec('- B1: stores items', '- B2: lint is clean [sensor: lint]')
  const b = prBody({ intent: '# D\n\n## Intent\n\nx.\n', spec: s, plan: '# Plan\n\n## Contracts\nnone\n', verify: null, outline: '', review: '', risk: { tier: 0, reasons: [] }, tests: 'test("B1 stores")', sensors: sensors as never })
  assert.match(b, /Every behaviour \(B1, B2\) is named by a test this change adds or edits or traced by a blocking sensor \(B2\)\./)
  const none = prBody({ intent: '# D\n\n## Intent\n\nx.\n', spec: s, plan: '# Plan\n\n## Contracts\nnone\n', verify: null, outline: '', review: '', risk: { tier: 0, reasons: [] }, tests: 'nothing', sensors: sensors as never })
  assert.match(none, /names B1: check/)
})
