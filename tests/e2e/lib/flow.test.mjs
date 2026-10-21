// The linear route runner: the model plans, the person approves, the model builds. No next --json loop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChange } from './flow.mjs'

const fakeSb = (approve = { status: 0, stdout: 'approved demo', stderr: '' }) => {
  const calls = []
  return { calls, sdlc: (args, o = {}) => { calls.push(['sdlc', args.join(' '), Boolean(o.human)]); return approve }, commitAll: m => { calls.push(['commit', m]); return true } }
}
const fakeDriver = calls => ({
  begin: async () => { calls.push(['begin']); return 'demo' },
  plan: async slug => { calls.push(['plan', slug]) },
  build: async slug => { calls.push(['build', slug]) },
})

test('runs begin, plan, a human approve, then build, in that order', async () => {
  const sb = fakeSb()
  const r = await runChange(sb, { id: 'S9' }, fakeDriver(sb.calls))
  assert.equal(r.slug, 'demo')
  assert.deepEqual(sb.calls, [['begin'], ['plan', 'demo'], ['sdlc', 'approve demo', true], ['build', 'demo']])
})

test('a refused approval stops the run with the reason and never builds', async () => {
  const sb = fakeSb({ status: 1, stdout: '', stderr: 'resolve the open question(s) first' })
  await assert.rejects(runChange(sb, { id: 'S9' }, fakeDriver(sb.calls)), /approve refused: resolve the open question/)
  assert.ok(!sb.calls.some(c => c[0] === 'build'))
})

test('afterApprove runs between the approval and the build, and its notes come back', async () => {
  const sb = fakeSb()
  const r = await runChange(sb, { id: 'S9' }, fakeDriver(sb.calls), { afterApprove: async () => { sb.calls.push(['after']); return ['stale check ok'] } })
  assert.deepEqual(sb.calls.map(c => c[0]), ['begin', 'plan', 'sdlc', 'after', 'build'])
  assert.deepEqual(r.notes, ['stale check ok'])
})

test('a live driver leaves session evidence; the run commits it after the build', async () => {
  const sb = fakeSb()
  const driver = { ...fakeDriver(sb.calls), sessions: [] }
  await runChange(sb, { id: 'S9' }, driver)
  assert.deepEqual(sb.calls.at(-1), ['commit', 'chore: session leftovers'])
})

// A person answers a change's open questions; in a live run the driver stands in for them, once, then approval is tried again.
const refusal = (why) => ({ status: 1, stdout: '', stderr: why })
const OPEN = 'resolve the open question(s) first: answer each\n  - spec.md: which file?'

test('an approval refused for open questions gets one answer from the driver, then is tried again and the run builds', async () => {
  const calls = []
  const replies = [refusal(OPEN), { status: 0, stdout: 'approved demo', stderr: '' }]
  const sb = { calls, sdlc: (args, o = {}) => { calls.push(['sdlc', args.join(' ')]); return replies.shift() }, commitAll: () => true }
  const driver = { ...fakeDriver(calls), answer: async (slug, why) => { calls.push(['answer', slug, why.includes('which file?')]) } }
  const r = await runChange(sb, { id: 'S9' }, driver)
  assert.equal(r.answered, true, 'the run reports that it answered, so the eval row can say so')
  assert.deepEqual(calls.map(c => c[0]), ['begin', 'plan', 'sdlc', 'answer', 'sdlc', 'build'])
  assert.deepEqual(calls[3], ['answer', 'demo', true], 'the driver is told which questions are open')
})

test('the driver answers only once: a second refusal stops the run', async () => {
  const calls = []
  const sb = { calls, sdlc: () => refusal(OPEN), commitAll: () => true }
  const driver = { ...fakeDriver(calls), answer: async () => { calls.push(['answer']) } }
  await assert.rejects(runChange(sb, { id: 'S9' }, driver), /approve refused: resolve the open question/)
  assert.equal(calls.filter(c => c[0] === 'answer').length, 1)
  assert.ok(!calls.some(c => c[0] === 'build'))
})

test('a refusal that is not about open questions is never answered', async () => {
  const calls = []
  const sb = { calls, sdlc: () => refusal('nothing to approve yet: demo has no plan.md'), commitAll: () => true }
  const driver = { ...fakeDriver(calls), answer: async () => { calls.push(['answer']) } }
  await assert.rejects(runChange(sb, { id: 'S9' }, driver), /nothing to approve yet/)
  assert.ok(!calls.some(c => c[0] === 'answer'))
})
