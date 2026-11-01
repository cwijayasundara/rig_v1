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
function world({ gateFail = {}, triage = {}, verdict = () => 'pass', actThrows = {}, decision = 'approve', intentsReady = [['a', 1], ['b', 1], ['c', 1], ['d', 2], ['e', 2]], spent = () => 0 } = {}) {
  const calls = []
  const ready = intentsReady.map(([slug, sprint]) => ({ slug, sprint }))
  const sb = { root: tmp(), dir: tmp(), sdlc: args => (args[0] === 'ready' ? { status: 0, stdout: JSON.stringify(ready), stderr: '' } : { status: 0, stdout: '', stderr: '' }) }
  const driver = { spentUsd: () => spent(calls.length), approveChart: s => calls.push(`approve:${s}`), built: [] }
  const mk = (id, extra = {}) => ({ id, title: id, rubric: id, act: async (_c, intent) => { if (actThrows[id]) throw new Error(actThrows[id]); calls.push(`act:${id}${intent ? `:${intent.slug}` : ''}`); if (intent) ready.splice(ready.findIndex(r => r.slug === intent.slug), 1) }, gate: async (c, _x, intent) => { await c.check(`${id} gate`, () => !gateFail[id] || 'gate broke') }, ...extra })
  const stages = ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6'].map(id => mk(id, id === 'J2' || id === 'J5' ? { approve: true, act: async () => { driver.approveChart(id) } } : id === 'J3' || id === 'J6' ? { perIntent: true, sprint: id === 'J3' ? 1 : 2 } : {}))
  const inspector = { inspect: async ({ stage, rubric }) => { calls.push(`inspect:${stage}`); return { items: rubric.map(r => ({ id: r.id, verdict: verdict(r.id), severity: r.severity, evidence: 'e', note: 'n' })), problems: [], costUsd: 0.1 } } }
  const reviewer = { review: async ({ stage }) => { calls.push(`review:${stage}`); return { decision, reasons: decision === 'reject' ? ['bad chart', 'second reason'] : [], costUsd: 0.1 } } }
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: sb.dir, triage })
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
  assert.deepEqual(w.calls.filter(c => c.startsWith('act:J6')), ['act:J6:d', 'act:J6:e'])
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

test('a perIntent stage that built nothing fails instead of passing', async () => {
  const w = world({ intentsReady: [] }); const r = await w.run()
  assert.equal(r[3].status, 'fail')
  assert.match(r[3].checks.failed[0].name, /built no intent/)
  assert.deepEqual(r.slice(4).map(x => x.status), Array(3).fill('not-run'))
})

test('J6 never starts a sprint 1 intent that is still ready', async () => {
  const w = world({ intentsReady: [['a', 1], ['b', 1]] }); const r = await w.run({ intents: 1 })
  assert.ok(!w.calls.includes('act:J6:b'))
  assert.equal(r[6].status, 'fail')
})

test('different act failures get different violation ids', async () => {
  const ids = []
  for (const msg of ['stuck-on-input: chart 1 still questions', 'reviewer rejected the plan: x']) {
    const w = world({ actThrows: { J1: msg } }); await w.run(); ids.push(w.log.all()[0].id)
  }
  assert.notEqual(ids[0], ids[1])
})

test('a throw outside a stage hands back the partial results', async () => {
  const w = world(); w.reviewer.review = async () => { throw new Error('boom') }
  await assert.rejects(() => w.run(), e => e.message === 'boom' && e.partial.length >= 3)
})

test('a reviewer reject with several reasons logs one violation', async () => {
  const w = world({ decision: 'reject' }); await w.run()
  assert.equal(w.log.all().filter(v => v.id === 'J2.reviewer-reject').length, 1)
})

test('startedAt shares one clock across legs: a leg that starts late is already out of time', async () => {
  const w = world(); const r = await w.run({ startedAt: Date.now() - 61 * 60_000 })
  assert.ok(w.log.all().some(v => v.id === 'cap-reached'))
  assert.ok(r.every(x => x.status === 'not-run'))
})

test('a block verdict the person has accepted is still logged but does not halt the journey', async () => {
  const w = world({ verdict: id => (id === 'J1.1' ? 'fail' : 'pass'), triage: { 'J1.1': { decision: 'accept', reason: 'known' } } })
  const r = await w.run()
  assert.equal(r[1].status, 'warn')
  assert.deepEqual(r.map(x => x.status).slice(2), Array(5).fill('pass'))
  assert.deepEqual(w.log.accepted().map(v => v.id), ['J1.1'])
})

test('a block verdict triaged as fix still halts the journey', async () => {
  const w = world({ verdict: id => (id === 'J1.1' ? 'fail' : 'pass'), triage: { 'J1.1': { decision: 'fix' } } })
  const r = await w.run()
  assert.equal(r[1].status, 'fail')
  assert.equal(r[2].status, 'not-run')
})
