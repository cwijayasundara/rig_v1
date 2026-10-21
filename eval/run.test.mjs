import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { orderArms, nextRunAllowed, resultsAllowed, runOne } from './run.mjs'
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

import { EVAL_ALLOW } from './run.mjs'

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
