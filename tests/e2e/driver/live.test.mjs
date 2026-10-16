import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSessions } from './live.mjs'

// A fake sandbox whose `claude` prints whatever the test says and records the budget flag it was given.
const fakeSb = stdout => {
  const calls = []
  return { calls, run: (cmd, args) => { calls.push(args); return { status: 0, stdout, stderr: '' } } }
}
const out = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rig-live-test-'))
const result = cost => JSON.stringify({ type: 'result', is_error: false, total_cost_usd: cost, num_turns: 1, duration_ms: 1, permission_denials: [] })

test('final review: a cap that is not a positive number is refused', () => {
  for (const bad of [NaN, 0, -1, "abc"]) assert.throws(() => createSessions({ sb: fakeSb(result(0)), out: out(), capUsd: bad }), /cap/)
})

test('final review: a session with no result event counts its whole budget as spent', () => {
  const sb = fakeSb('{"type":"assistant","message":{"content":[]}}')
  const s = createSessions({ sb, out: out(), capUsd: 6 })
  s.run('a', 'x')
  assert.equal(s.sessions[0].costUsd, 6)
  assert.throws(() => s.run('b', 'y'), /spend cap/)
})

test('a session that reports its cost is counted at that cost, and the next budget shrinks', () => {
  const sb = fakeSb(result(1.5))
  const s = createSessions({ sb, out: out(), capUsd: 6 })
  s.run('a', 'x')
  s.run('b', 'y')
  const budget = args => args[args.indexOf('--max-budget-usd') + 1]
  assert.equal(budget(sb.calls[0]), '6.00')
  assert.equal(budget(sb.calls[1]), '4.50')
})

import { liveDriver } from './live.mjs'

test('begin(): when /rig-start ends before creating a change, it continues with the skill invocation itself (plain text loses the skill\'s allowed tools)', async () => {
  const prompts = []
  const sb = {
    run: (cmd, args) => { prompts.push({ prompt: args[1], cont: args.includes('--continue') }); return { status: 0, stdout: result(0.1), stderr: '' } },
    sdlc: () => ({ status: 0, stdout: JSON.stringify({ active: prompts.length >= 3 ? 'c' : null }), stderr: '' }),
  }
  const sessions = createSessions({ sb, out: out(), capUsd: 6 })
  const slug = await liveDriver(sb, { id: 'PX', prompt: '/rig-start do the thing' }, { sessions }).begin()
  assert.equal(slug, 'c')
  assert.deepEqual(prompts.map(p => p.prompt), ['/rig-start do the thing', '/rig-start do the thing', '/rig-start do the thing'])
  assert.deepEqual(prompts.map(p => p.cont), [false, true, true])
})

import { PLUGIN } from '../lib/sandbox.mjs'

test('headless sessions carry the template allow rules and env on --settings: -p never trusts the workspace, so the same rules in .claude/settings.json are ignored', () => {
  const sb = fakeSb(result(0))
  createSessions({ sb, out: out(), capUsd: 6 }).run('a', 'x')
  const args = sb.calls[0]
  const inline = JSON.parse(args[args.indexOf('--settings') + 1])
  const template = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'templates/settings.json'), 'utf8'))
  assert.deepEqual(inline, { permissions: { allow: template.permissions.allow }, env: template.env })
  assert.equal(inline.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1', 'subagents return before the headless turn ends')
  assert.ok(inline.permissions.allow.some(r => r.startsWith('Bash(node ') && r.includes('sdlc.ts')))
})

test('final review: build() retries with /rig-build when the first turn stops short of review; /rig-start never builds', async () => {
  const prompts = []
  const sb = {
    run: (cmd, args) => { prompts.push({ prompt: args[1], cont: args.includes('--continue') }); return { status: 0, stdout: result(0.1), stderr: '' } },
    sdlc: () => ({ status: 0, stdout: JSON.stringify({ changes: [{ slug: 'c', status: 'build' }] }), stderr: '' }),
  }
  const sessions = createSessions({ sb, out: out(), capUsd: 6 })
  const d = liveDriver(sb, { id: 'PX', prompt: '/rig-start x' }, { sessions })
  await d.plan('c')
  await d.build('c')
  assert.deepEqual(prompts.map(p => p.prompt.split(' ')[0]), ['/rig-plan', '/rig-build', '/rig-build'])
  assert.ok(prompts.every(p => p.cont))
})

import { readSession, totals } from '../assert/process.mjs'

test('a session records its input and output tokens from the result event, cache included', () => {
  const dir = out()
  const f = path.join(dir, 's.jsonl')
  fs.writeFileSync(f, JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.5, num_turns: 3, duration_ms: 10, permission_denials: [], usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 300, output_tokens: 50 } }) + '\n')
  const s = readSession(f)
  assert.equal(s.inputTokens, 420)
  assert.equal(s.outputTokens, 50)
  assert.deepEqual([totals([s, s]).inputTokens, totals([s, s]).outputTokens], [840, 100])
})

test('final review (6): an eval session can add allow rules and env on top of the template', () => {
  const sb = fakeSb(result(0))
  createSessions({ sb, out: out(), capUsd: 6, allow: ['Bash(npm *)'], env: { CLAUDE_CODE_SUBAGENT_MODEL: 'claude-haiku-5-5' } }).run('a', 'x')
  const args = sb.calls[0]
  const inline = JSON.parse(args[args.indexOf('--settings') + 1])
  assert.ok(inline.permissions.allow.includes('Bash(npm *)'))
  assert.ok(inline.permissions.allow.some(r => /sdlc\.ts/.test(r)), 'the template rules stay')
  assert.equal(inline.env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-haiku-5-5')
})

test('final review (6): tokens and cost per model come from modelUsage when the result has it (subagents included)', () => {
  const f = path.join(out(), 's.jsonl')
  fs.writeFileSync(f, JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 1, num_turns: 2, duration_ms: 5, permission_denials: [], usage: { input_tokens: 1, output_tokens: 1 },
    modelUsage: { 'claude-haiku-5-5': { inputTokens: 100, cacheReadInputTokens: 50, cacheCreationInputTokens: 10, outputTokens: 20, costUSD: 0.2 }, 'claude-opus-5-5': { inputTokens: 40, outputTokens: 5, costUSD: 0.8 } } }) + '\n')
  const s = readSession(f)
  assert.deepEqual([s.inputTokens, s.outputTokens], [200, 25])
  assert.deepEqual(Object.keys(totals([s, s]).models).sort(), ['claude-haiku-5-5', 'claude-opus-5-5'])
  assert.equal(totals([s, s]).models['claude-opus-5-5'].costUsd, 1.6)
})
