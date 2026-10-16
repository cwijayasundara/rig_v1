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
