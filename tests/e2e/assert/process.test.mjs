import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSession, SLEEP_GAP_MS } from './process.mjs'

const tmp = lines => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-proc-')), 's.jsonl'); fs.writeFileSync(f, lines.map(l => JSON.stringify(l)).join('\n')); return f }
const at = (min) => new Date(Date.UTC(2026, 9, 30, 16, min)).toISOString()
const msg = (id, model, min, out = 100, inp = 1000) => ({ type: 'assistant', timestamp: at(min), message: { id, model, content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, cache_read_input_tokens: inp, output_tokens: out } } })

test('a session killed before its result is priced from the tokens it streamed, once per message id, and marked estimated', () => {
  const s = readSession(tmp([msg('m1', 'claude-sonnet-5-5', 0, 50), msg('m1', 'claude-sonnet-5-5', 0, 100), msg('m2', 'claude-sonnet-5-5', 1)]))
  assert.equal(s.ended, false)
  assert.equal(s.estimated, true)
  assert.equal(s.models['claude-sonnet-5-5'].outputTokens, 200, 'm1 counts its last usage only')
  assert.ok(s.costUsd > 0 && s.costUsd < 0.01, String(s.costUsd))
})

test('a session that printed a result keeps the reported cost and is not estimated', () => {
  const s = readSession(tmp([msg('m1', 'claude-haiku-5-5', 0), { type: 'result', total_cost_usd: 0.5, num_turns: 3 }]))
  assert.deepEqual([s.ended, s.estimated, s.costUsd], [true, false, 0.5])
})

test('a gap over five minutes between events, or the sleep error text, marks the session as slept', () => {
  assert.equal(SLEEP_GAP_MS, 300_000)
  assert.equal(readSession(tmp([msg('m1', 'claude-haiku-5-5', 0), msg('m2', 'claude-haiku-5-5', 16)])).slept, true)
  assert.equal(readSession(tmp([msg('m1', 'claude-haiku-5-5', 0), msg('m2', 'claude-haiku-5-5', 4)])).slept, false)
  const note = { type: 'assistant', timestamp: at(0), message: { id: 'x', content: [{ type: 'text', text: 'API Error: Your computer went to sleep mid-response.' }] } }
  assert.equal(readSession(tmp([note])).slept, true)
})
