// Agent records (proposal 2026-11-14 N5, N6, D2): reports, cost and the launch budget, recorded by the Agent hooks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { makeRepo, sdlc, hook, write } from './testkit.ts'
import { parseReport, responseText, LAUNCH_BUDGET } from './agents.ts'

test('parseReport reads the status line, case-insensitively, and the last one wins', () => {
  assert.deepEqual(parseReport('…\nstatus: DONE'), { status: 'DONE', note: '' })
  assert.deepEqual(parseReport('status: DONE_WITH_CONCERNS — no test for empty input'), { status: 'DONE_WITH_CONCERNS', note: 'no test for empty input' })
  assert.deepEqual(parseReport('status: BLOCKED: no API key'), { status: 'BLOCKED', note: 'no API key' })
  assert.equal(parseReport('status: done').status, 'DONE')
  assert.deepEqual(parseReport('status: BLOCKED x\nstatus: DONE'), { status: 'DONE', note: '' })
  assert.deepEqual(parseReport('all went well'), { status: null, note: '' })
})

test('responseText takes a string or text blocks and gives "" for anything else', () => {
  assert.equal(responseText({ content: 'hi' }), 'hi')
  assert.equal(responseText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] }), 'a\nb')
  assert.equal(responseText(undefined), ''); assert.equal(responseText(7), ''); assert.equal(responseText({ content: 5 }), '')
})

const SLUG = 'cart-add'
function active(): string { const repo = makeRepo(); assert.equal(sdlc(repo, ['new', SLUG]).code, 0); return repo }
const launch = (repo: string, id: string) => hook(repo, 'agent-launch', { session_id: 's1', tool_use_id: id, tool_input: { subagent_type: 'rig:builder', model: 'haiku' } })
const rows = (repo: string): { agent: string; model: string | null; status: string | null; tokens: number | null; toolUses: number | null; ms: number | null }[] =>
  fs.existsSync(path.join(repo, `.rig/changes/${SLUG}/evidence/agents.jsonl`)) ? Object.values(fs.readFileSync(path.join(repo, `.rig/changes/${SLUG}/evidence/agents.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { kind: string; id: string }).reduce<Record<string, object>>((m, r) => ({ ...m, [r.id]: { ...m[r.id], ...r } }), {})) as never : []

test('a launch and its done row merge into one record with the report and the cost', () => {
  const repo = active()
  launch(repo, 't1')
  hook(repo, 'agent-done', { session_id: 's1', tool_use_id: 't1', tool_response: { content: [{ type: 'text', text: 'ok\nstatus: DONE' }], totalTokens: 1200, totalToolUseCount: 7, totalDurationMs: 90000 } })
  const r = rows(repo)
  assert.equal(r.length, 1)
  assert.deepEqual([r[0]!.agent, r[0]!.model, r[0]!.status, r[0]!.tokens, r[0]!.toolUses, r[0]!.ms], ['rig:builder', 'haiku', 'DONE', 1200, 7, 90000])
})

test('a malformed tool_response records nulls and never throws', () => {
  const repo = active()
  launch(repo, 't1')
  assert.equal(hook(repo, 'agent-done', { session_id: 's1', tool_use_id: 't1', tool_response: {} }).code, 0)
  assert.equal(hook(repo, 'agent-done', { session_id: 's1', tool_use_id: 't1', tool_response: { content: 'x', totalTokens: 'many' } }).code, 0)
  const r = rows(repo)[0]!
  assert.deepEqual([r.status, r.tokens, r.toolUses, r.ms], [null, null, null, null])
})

test('five launches pass; the sixth is denied with the draft-PR way out and recorded nowhere', () => {
  const repo = active()
  for (let i = 1; i <= LAUNCH_BUDGET; i++) assert.doesNotMatch(launch(repo, `t${i}`).stdout, /deny/)
  const sixth = launch(repo, 't6')
  const d = JSON.parse(sixth.stdout).hookSpecificOutput
  assert.equal(d.permissionDecision, 'deny'); assert.match(d.permissionDecisionReason, /launch budget/); assert.match(d.permissionDecisionReason, /--draft/)
  assert.equal(rows(repo).length, 5)
})

test('with no active change nothing is recorded and no launch is denied', () => {
  const repo = makeRepo()
  write(repo, '.rig/.keep', '')
  for (let i = 1; i <= LAUNCH_BUDGET + 1; i++) assert.doesNotMatch(launch(repo, `t${i}`).stdout, /deny/)
  hook(repo, 'agent-done', { session_id: 's1', tool_use_id: 't1', tool_response: { content: 'status: DONE' } })
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes')), false)
})

const launchD = (repo: string, id: string, description: string) => hook(repo, 'agent-launch', { session_id: 's1', tool_use_id: id, tool_input: { subagent_type: 'rig:builder', model: 'haiku', description } })

test('the mandatory security review and confirm launches pass past the budget, are recorded, and are not counted', () => {
  const repo = active()
  for (let i = 1; i <= LAUNCH_BUDGET; i++) launch(repo, `t${i}`)
  assert.match(launch(repo, 'x').stdout, /deny/)
  for (const [i, d] of ['rig security review cart-add', 'rig confirm cart-add', 'rig security review cart-add'].entries()) assert.doesNotMatch(launchD(repo, `e${i}`, d).stdout, /deny/, d)
  assert.equal(rows(repo).length, LAUNCH_BUDGET + 3)
  assert.match(launchD(repo, 'y', 'a normal launch').stdout, /deny/, 'exempt rows do not count, and the budget still holds')
  const four = active()
  for (let i = 1; i < LAUNCH_BUDGET; i++) launch(four, `t${i}`)
  for (let i = 0; i < 3; i++) launchD(four, `e${i}`, 'rig confirm cart-add')
  assert.doesNotMatch(launch(four, 'fifth').stdout, /deny/, 'exempt launches did not use the budget')
})

test('parallel launches at four rows: exactly one passes (the check and the record are under one lock)', async () => {
  const repo = active()
  for (let i = 1; i < LAUNCH_BUDGET; i++) launch(repo, `t${i}`)
  const script = path.resolve(import.meta.dirname, 'sdlc.ts')
  const run = (id: string) => new Promise<string>(resolve => {
    const { NODE_TEST_CONTEXT: _n, ...env } = process.env
    const c = spawn('node', ['--disable-warning=ExperimentalWarning', script, 'hook', 'agent-launch'], { cwd: repo, env: { ...env, CLAUDE_PROJECT_DIR: repo, SDLC_HUMAN: '' } })
    let o = ''; c.stdout.on('data', d => { o += d }); c.on('close', () => resolve(o))
    c.stdin.end(JSON.stringify({ session_id: 's1', tool_use_id: id, tool_input: { subagent_type: 'rig:builder', model: 'haiku' } }))
  })
  const outs = await Promise.all(['p1', 'p2', 'p3', 'p4'].map(run))
  assert.equal(outs.filter(o => !/deny/.test(o)).length, 1, outs.join('|'))
  assert.equal(rows(repo).length, LAUNCH_BUDGET)
})
