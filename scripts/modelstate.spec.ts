import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readModelState, recordSessionModel, recordLaunch, recordResolved, transcriptModel, transcriptContext, pinnedModel, sessionModel, modelRoleFindings, latestAgents } from './modelstate.ts'
import { defaultRegistry } from './registry.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rig-model-'))
const line = (v: unknown) => JSON.stringify(v) + '\n'

test('a missing or unreadable state file reads as empty', () => {
  const d = tmp()
  assert.deepEqual(readModelState(path.join(d, 'none.json')), { sessions: {}, launches: [] })
  fs.writeFileSync(path.join(d, 'bad.json'), '{')
  assert.deepEqual(readModelState(path.join(d, 'bad.json')), { sessions: {}, launches: [] })
})

test('the transcript gives the last assistant model and survives a cut first line, a missing file and no model', () => {
  const d = tmp()
  const f = path.join(d, 't.jsonl')
  fs.writeFileSync(f, '{"partial":' + '\n' + line({ type: 'assistant', message: { model: 'claude-sonnet-5-5' } }) + line({ type: 'user', message: { content: 'hi' } }) + line({ type: 'assistant', message: { model: 'claude-opus-5-5' } }))
  assert.equal(transcriptModel(f), 'claude-opus-5-5')
  assert.equal(transcriptModel(path.join(d, 'none.jsonl')), null)
  assert.equal(transcriptModel(undefined), null)
  fs.writeFileSync(f, line({ type: 'user', message: { content: 'x' } }))
  assert.equal(transcriptModel(f), null)
})

test('only the tail of a large transcript is read', () => {
  const d = tmp()
  const f = path.join(d, 't.jsonl')
  fs.writeFileSync(f, line({ type: 'assistant', message: { model: 'claude-haiku-5-5' } }) + 'x'.repeat(400 * 1024) + '\n' + line({ type: 'assistant', message: { model: 'claude-opus-5-5' } }))
  assert.equal(transcriptModel(f), 'claude-opus-5-5')
  fs.writeFileSync(f, line({ type: 'assistant', message: { model: 'claude-haiku-5-5' } }) + 'x'.repeat(400 * 1024) + '\n')
  assert.equal(transcriptModel(f), null, 'a model beyond the tail is not found')
})

test('a switch record wins, then the transcript, then a session-start record, then the pinned setting', () => {
  const d = tmp()
  const state = path.join(d, 'state', 'model.json')
  const t = path.join(d, 't.jsonl')
  fs.writeFileSync(t, line({ type: 'assistant', message: { model: 'claude-opus-5-5' } }))
  fs.mkdirSync(path.join(d, '.claude'))
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify({ model: 'claude-haiku-5-5' }))
  assert.equal(pinnedModel(d), 'claude-haiku-5-5')
  assert.equal(sessionModel(state, 's1', undefined, d), 'claude-haiku-5-5')
  recordSessionModel(state, 's1', 'claude-sonnet-5-5', 'session-start', 'now')
  assert.equal(sessionModel(state, 's1', undefined, d), 'claude-sonnet-5-5')
  assert.equal(sessionModel(state, 's1', t, d), 'claude-opus-5-5', 'the transcript beats a session-start record')
  recordSessionModel(state, 's1', 'claude-sonnet-5-5', 'switch', 'now')
  assert.equal(sessionModel(state, 's1', t, d), 'claude-sonnet-5-5', 'a switch beats the transcript')
  assert.equal(sessionModel(state, undefined, undefined, tmp()), null)
})

test('launches are recorded, resolved by tool use id, and capped', () => {
  const state = path.join(tmp(), 'model.json')
  for (let i = 0; i < 55; i++) recordLaunch(state, { session: 's1', id: `t${i}`, agent: 'Explore', requested: null, resolved: null, at: 'now' })
  recordResolved(state, 't54', 'claude-haiku-5-5')
  recordResolved(state, 'unknown', 'claude-opus-5-5')
  const s = readModelState(state)
  assert.equal(s.launches.length, 50)
  assert.equal(s.launches.at(-1)?.resolved, 'claude-haiku-5-5')
})

test('model-role warns when the main thread is off the build model or the evaluator ran on another model', () => {
  const r = defaultRegistry()
  assert.deepEqual(modelRoleFindings(r, 'claude-sonnet-5-5', []), [])
  assert.deepEqual(modelRoleFindings(r, null, []), [])
  const main = modelRoleFindings(r, 'claude-haiku-5-5', [])
  assert.equal(main.length, 1)
  assert.equal(main[0]?.severity, 'warn')
  assert.match(main[0]?.message ?? '', /claude-haiku-5-5.*sonnet/)
  const launches = [
    { session: 's1', id: 'a', agent: 'rig:evaluator', requested: 'sonnet', resolved: 'claude-sonnet-5-5', at: 'now' },
    { session: 's1', id: 'b', agent: 'rig-evaluator', requested: null, resolved: 'claude-opus-5-5', at: 'now' },
    { session: 's1', id: 'c', agent: 'Explore', requested: 'haiku', resolved: 'claude-haiku-5-5', at: 'now' },
  ]
  const f = modelRoleFindings(r, 'claude-sonnet-5-5', launches)
  assert.equal(f.length, 1)
  assert.match(f[0]?.message ?? '', /rig:evaluator ran on claude-sonnet-5-5/)
})

test('model-role warns when the architect ran off the design model', () => {
  const r = defaultRegistry()
  const run = (resolved: string) => modelRoleFindings(r, 'claude-sonnet-5-5', [{ session: 's1', id: 'a', agent: 'rig:architect', requested: null, resolved, at: 'now' }])
  assert.deepEqual(run('claude-sonnet-5-5'), [])
  const f = run('claude-opus-5-5')
  assert.equal(f.length, 1)
  assert.match(f[0]?.message ?? '', /rig:architect ran on claude-opus-5-5.*design runs on sonnet/)
})

import { spawn } from 'node:child_process'

test('parallel launch records are all kept', async () => {
  const state = path.join(tmp(), 'model.json')
  const mod = path.resolve(import.meta.dirname, 'modelstate.ts')
  const run = (tag: string) => new Promise<void>(done => {
    const code = `import { recordLaunch } from ${JSON.stringify(mod)}; for (let i = 0; i < 15; i++) recordLaunch(${JSON.stringify(state)}, { session: 's', id: '${tag}' + i, agent: 'x', requested: null, resolved: null, at: 'now' })`
    spawn('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', code], { stdio: 'ignore' }).on('exit', () => done())
  })
  await Promise.all([run('a'), run('b'), run('c')])
  assert.equal(readModelState(state).launches.length, 45)
})

test('latestAgents keeps the newest resolved launch per agent and tolerates a missing file', () => {
  const state = path.join(tmp(), 'state', 'model.json')
  assert.deepEqual(latestAgents(state), [])
  fs.mkdirSync(path.dirname(state), { recursive: true })
  fs.writeFileSync(state, '{"launches":')
  assert.deepEqual(latestAgents(state), [], 'a malformed file reads as empty')
  recordLaunch(state, { session: 's', id: '1', agent: 'rig-architect', requested: null, resolved: 'claude-opus-5-5', at: '2026-10-18T08:00:00Z' })
  recordLaunch(state, { session: 's', id: '2', agent: 'rig-architect', requested: null, resolved: 'claude-sonnet-5-5', at: '2026-10-18T09:00:00Z' })
  recordLaunch(state, { session: 's', id: '3', agent: 'rig-evaluator', requested: 'opus', resolved: null, at: '2026-10-18T09:30:00Z' })
  recordLaunch(state, { session: 's', id: '4', agent: 'Explore', requested: null, resolved: null, at: '2026-10-18T09:40:00Z' })
  assert.deepEqual(latestAgents(state), [
    { agent: 'rig-architect', model: 'claude-sonnet-5-5', at: '2026-10-18T09:00:00Z' },
    { agent: 'rig-evaluator', model: 'opus', at: '2026-10-18T09:30:00Z' },
  ])
})

test('latestAgents tolerates a null or non-object launch entry', () => {
  const state = path.join(tmp(), 'model.json')
  fs.writeFileSync(state, JSON.stringify({ launches: [null, 7, { agent: 'rig-architect', requested: 'sonnet', resolved: null, at: 'a' }] }))
  assert.deepEqual(latestAgents(state), [{ agent: 'rig-architect', model: 'sonnet', at: 'a' }])
})

test('transcriptContext sums the last assistant usage', () => {
  const d = tmp()
  const f = path.join(d, 't.jsonl')
  fs.writeFileSync(f, line({ type: 'assistant', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1, cache_read_input_tokens: 5 } } }) + line({ type: 'user', message: { content: 'hi' } }) + line({ type: 'assistant', message: { model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 120000, cache_creation_input_tokens: 500, output_tokens: 99 } } }))
  assert.equal(transcriptContext(f), 120510)
  assert.equal(transcriptContext(path.join(d, 'none.jsonl')), null)
  assert.equal(transcriptContext(undefined), null)
})
