import { test } from 'node:test'
import assert from 'node:assert/strict'
import { review } from './reviewer.mjs'

const sb = { dir: '/nonexistent' }

test('review returns reject with reviewer-malformed on prose', async () => {
  const r = await review({ sb, stage: 'J2', artefacts: ['x'], launch: async () => ({ text: 'sure, approve', costUsd: 0.1 }) })
  assert.equal(r.decision, 'reject')
  assert.deepEqual(r.reasons, ['reviewer-malformed'])
})

test('review returns the decision and reasons from valid JSON', async () => {
  const r = await review({ sb, stage: 'J2', artefacts: ['x'], launch: async () => ({ text: '{"decision":"approve","reasons":["traces ok"]}', costUsd: 0.2 }) })
  assert.deepEqual([r.decision, r.reasons, r.costUsd], ['approve', ['traces ok'], 0.2])
})

test('an unknown decision value is a reject', async () => {
  const r = await review({ sb, stage: 'J2', artefacts: [], launch: async () => ({ text: '{"decision":"maybe","reasons":[]}', costUsd: 0 }) })
  assert.equal(r.decision, 'reject')
})
