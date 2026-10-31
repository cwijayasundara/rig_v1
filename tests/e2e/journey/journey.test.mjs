import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runJourney } from './journey.mjs'
import { STAGES } from './stages.mjs'
import { createViolationLog } from './violations.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jr-'))
const rubricDir = (() => {
  const d = tmp()
  for (let i = 0; i <= 6; i++) fs.writeFileSync(path.join(d, `J${i}.md`), `- J${i}.1 [block] structural\n- J${i}.2 [warn] judgement\n`)
  return d
})()

// Fakes: a stage table with simple acts and gates, a sandbox whose `ready` list shrinks as intents are built.
function world({ gateFail = {}, verdict = () => 'pass', decision = 'approve', intentsReady = ['a', 'b', 'c'], spent = () => 0 } = {}) {
  const calls = []
  const ready = [...intentsReady]
  const sb = { root: tmp(), dir: tmp(), sdlc: args => (args[0] === 'ready' ? { status: 0, stdout: JSON.stringify(ready.map(slug => ({ slug }))), stderr: '' } : { status: 0, stdout: '', stderr: '' }) }
  const driver = { spentUsd: () => spent(calls.length), approveChart: s => calls.push(`approve:${s}`), built: [] }
  const mk = (id, extra = {}) => ({ id, title: id, rubric: id, act: async (_c, intent) => { calls.push(`act:${id}${intent ? `:${intent.slug}` : ''}`); if (intent) ready.splice(ready.indexOf(intent.slug), 1) }, gate: async (c, _x, intent) => { await c.check(`${id} gate`, () => !gateFail[id] || 'gate broke') }, ...extra })
  const stages = ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map(id => mk(id, id === 'J2' || id === 'J5' ? { approve: true, act: async () => { driver.approveChart(id) } } : id === 'J3' || id === 'J6' ? { perIntent: true } : {}))
  const inspector = { inspect: async ({ stage, rubric }) => { calls.push(`inspect:${stage}`); return { items: rubric.map(r => ({ id: r.id, verdict: verdict(r.id), severity: r.severity, evidence: 'e', note: 'n' })), problems: [], costUsd: 0.1 } } }
  const reviewer = { review: async ({ stage }) => { calls.push(`review:${stage}`); return { decision, reasons: decision === 'reject' ? ['bad chart'] : [], costUsd: 0.1 } } }
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: sb.dir, triage: {} })
  return { sb, driver, inspector, reviewer, log, stages, calls, run: (o = {}) => runJourney({ sb, driver, inspector, reviewer, log, rubricDir, stages, capUsd: 25, minutes: 60, ...o }) }
}

test('STAGES is J0..J6 with approve at J2 and J5 and perIntent at J3 and J6', () => {
  assert.deepEqual(STAGES.map(s => s.id), ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'])
  assert.deepEqual(STAGES.filter(s => s.approve).map(s => s.id), ['J2', 'J5'])
  assert.deepEqual(STAGES.filter(s => s.perIntent).map(s => s.id), ['J3', 'J6'])
})

test('all stages pass: 7 pass and an empty log', async () => {
  const w = world(); const r = await w.run()
  assert.deepEqual(r.map(x => x.status), Array(7).fill('pass'))
  assert.equal(w.log.all().length, 0)
})

test('a gate failure at J1 skips its inspector and marks J2..J6 not-run', async () => {
  const w = world({ gateFail: { J1: true } }); const r = await w.run()
  assert.equal(r[1].status, 'fail')
  assert.ok(!w.calls.includes('inspect:J1'))
  assert.deepEqual(r.slice(2).map(x => x.status), Array(5).fill('not-run'))
  assert.ok(w.log.all().some(v => v.stage === 'J1' && v.severity === 'block'))
})

test('a reviewer reject at J2 runs no approve command and logs a violation', async () => {
  const w = world({ decision: 'reject' }); const r = await w.run()
  assert.ok(!w.calls.includes('approve:J2'))
  assert.equal(r[2].status, 'fail')
  assert.ok(w.log.all().some(v => v.stage === 'J2' && /bad chart/.test(v.note)))
})

test('an inspector warn item gives status warn and the journey continues', async () => {
  const w = world({ verdict: id => (id === 'J1.2' ? 'warn' : 'pass') }); const r = await w.run()
  assert.equal(r[1].status, 'warn')
  assert.equal(r[6].status, 'pass')
  assert.deepEqual(w.log.all().map(v => v.id), ['J1.2'])
})

test('an inspector fail on a block item halts the journey', async () => {
  const w = world({ verdict: id => (id === 'J3.1' ? 'fail' : 'pass') }); const r = await w.run()
  assert.equal(r[3].status, 'fail')
  assert.deepEqual(r.slice(4).map(x => x.status), Array(3).fill('not-run'))
})

test('intents: 1 builds one intent in J3 and one inspector launch per stage', async () => {
  const w = await world(); await w.run({ intents: 1 })
  assert.deepEqual(w.calls.filter(c => c.startsWith('act:J3')), ['act:J3:a'])
  assert.equal(w.calls.filter(c => c === 'inspect:J3').length, 1)
})

test('default builds every ready intent in J3', async () => {
  const w = world(); await w.run()
  assert.deepEqual(w.calls.filter(c => c.startsWith('act:J3')), ['act:J3:a', 'act:J3:b', 'act:J3:c'])
})

test('from J4 on a fresh sandbox refuses', async () => {
  const w = world()
  await assert.rejects(() => w.run({ from: 'J4' }), /cannot resume at J4: J\d did not pass/)
})

test('from J4 resumes after a run that passed J0..J3', async () => {
  const w = world(); await w.run({ stopAfter: 'J3' })
  const w2 = { ...w }; w.calls.length = 0
  const r = await w.run({ from: 'J4' })
  assert.deepEqual(r.map(x => x.stage), ['J4', 'J5', 'J6'])
})

test('cap reached after J1 logs cap-reached and marks the rest not-run', async () => {
  const w = world({ spent: n => (n >= 3 ? 30 : 0) }); const r = await w.run()
  assert.ok(w.log.all().some(v => v.id === 'cap-reached'))
  assert.ok(r.filter(x => x.status === 'not-run').length >= 1)
  assert.equal(r.length, 7)
})
