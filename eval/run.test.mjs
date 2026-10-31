import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { orderArms, runOne, sessionTrace, phasesFor, taskOf } from './run.mjs'
import { setupBare, BARE_PROMPT_DELTA } from './setup.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { EVAL_ALLOW, nextRunAllowed, resultsAllowed } from './lib/cli.mjs'
import { ARMS } from './arms.mjs'

test('nextRunAllowed refuses a run that could cross the total cap', () => {
  assert.equal(nextRunAllowed(0, 6, 300), true)
  assert.equal(nextRunAllowed(294, 6, 300), true)
  assert.equal(nextRunAllowed(294.01, 6, 300), false)
})

test('--dry refuses to write under eval/results', () => {
  assert.match(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), true) ?? '', /dry runs never write under eval\/results/)
  assert.equal(resultsAllowed(path.join(os.tmpdir(), 'x.jsonl'), true), null)
  assert.equal(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), false), null)
})

test('a dry bare run and a dry rig run are accepted 3/3 at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-bare', 'haiku-rig-final']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6 })
    assert.deepEqual([row.arm, row.accepted, row.checks, row.usd, row.error], [id, true, 3, 0, undefined], JSON.stringify(row))
  }
})

test('a run that throws is recorded with its error and its spend', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  const row = await runOne({ id: 'broken', model: 'x', rig: true, policy: 'continuous' }, 1, { dry: true, out, capRunUsd: 6, failAt: 'build' })
  assert.equal(row.accepted, false)
  assert.match(row.error, /build/)
  assert.equal(typeof row.usd, 'number')
})

test('final review: every eval arm may run npm and node, so bare arms can test their code like rig arms', () => {
  assert.ok(EVAL_ALLOW.includes('Bash(npm *)') && EVAL_ALLOW.includes('Bash(node *)'))
})

test('final review: a bare session that fails still has its work committed, so tamper can judge it', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  const row = await runOne(ARMS.find(a => a.id === 'haiku-bare'), 1, { dry: true, out, capRunUsd: 6, failAt: 'session' })
  assert.match(row.error, /session/)
  assert.ok(row.commits >= 1, JSON.stringify(row))
  assert.equal(typeof row.denials, 'number')
})

import { BARE_PROMPT } from './setup.mjs'

test('final review (denials): the bare prompt gives the same tool advice rig sessions get', () => {
  assert.match(BARE_PROMPT, /read files with Read, Grep and Glob and change them with Edit or Write/)
  assert.match(BARE_PROMPT, /run each command as its own Bash call/)
})

test('orderArms: the same seed repeats an order, and across runs no arm is always first', () => {
  assert.deepEqual(orderArms(ARMS, 7, 1).map(a => a.id), orderArms(ARMS, 7, 1).map(a => a.id))
  const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(n => orderArms(ARMS, 7, n)[0].id))
  assert.ok(firsts.size > 1, [...firsts].join())
  assert.deepEqual(orderArms(ARMS, 7, 2).map(a => a.id).sort(), ARMS.map(a => a.id).sort())
})

test('a dry rules run is accepted with full marks for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'rules' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.rules.b8, row.rules.b9, row.usd, row.error], [true, 11, 11, 6, true, 0, undefined], JSON.stringify(row))
  }
})

test('sessionTrace: one entry per session with its label, cost, turns, denied tools, agents and per-model cost', () => {
  const s = [
    { file: '/x/sessions/00-s8-start.jsonl', costUsd: 0.5, turns: 12, ms: 41_600, denials: [{ tool_name: 'Bash', tool_input: { command: 'git add -A && git commit -m x' } }], agents: ['rig:evaluator'], skills: ['rig-plan'], models: { 'claude-opus-5-5': { costUsd: 0.4 }, 'claude-haiku-5-5': { costUsd: 0.1 } } },
    { file: '/x/sessions/01-s8-build.jsonl', costUsd: 1.234567, turns: 3, denials: [], agents: [], skills: [], models: {} },
  ]
  assert.deepEqual(sessionTrace(s), [
    { label: 's8-start', usd: 0.5, turns: 12, seconds: 42, denied: ['Bash: git add -A && git commit -m x'], agents: ['rig:evaluator'], skills: ['rig-plan'], models: { opus: 0.4, haiku: 0.1 } },
    { label: 's8-build', usd: 1.2346, turns: 3, seconds: 0, denied: [], agents: [], skills: [], models: {} },
  ])
})

test('sessionTrace: two model ids of one family add up under one name', () => {
  const [row] = sessionTrace([{ file: '/x/00-a.jsonl', costUsd: 1, turns: 1, denials: [], agents: [], skills: [], models: { 'claude-sonnet-5-5': { costUsd: 0.25 }, 'claude-sonnet-4-5': { costUsd: 0.5 } } }])
  assert.deepEqual(row.models, { sonnet: 0.75 })
})

// The delta variant (eval 2026-10-31): the rules task from a finished B1-B7 shop, so a rig arm pays for B8 and B9 only, not for S2, S3 and S7 as well.
test('delta: rig arms build only B8 and B9, and the task is scored as rules', () => {
  assert.deepEqual(phasesFor('delta').map(p => p.id), ['S8', 'S9'])
  assert.deepEqual(phasesFor('rules').map(p => p.id), ['S2', 'S3', 'S7', 'S8', 'S9'])
  assert.equal(taskOf('delta'), 'rules')
  assert.equal(taskOf('links'), 'links')
})

test('delta: every arm starts with B1-B7 built and committed, and none of B8-B9', () => {
  const sb = createSandbox({ name: 'delta-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'delta' })
  for (const f of ['src/cart/cart.js', 'src/http/handler.js', 'test/links.test.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  assert.ok(!fs.existsSync(path.join(sb.dir, 'test/rules.test.js')))
  assert.equal(sb.git('status', '--porcelain').trim(), '', 'the seed is committed in the base')
  assert.match(BARE_PROMPT_DELTA, /already[^.]*B1–B7[^]*B8[^]*B9/)
})

test('a dry delta run is accepted with full marks for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'delta' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.rules.b8, row.rules.b9, row.usd, row.error], [true, 11, 11, 6, true, 0, undefined], JSON.stringify(row))
  }
})
