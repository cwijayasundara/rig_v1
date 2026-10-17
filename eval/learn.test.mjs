import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { scoreChange, verdict, renderLearnTable, runLearnEval, TASKS } from './learn.mjs'

const rows = (arm, recurredByChange, usd = 1) => recurredByChange.map((recurred, i) => ({ arm, run: 1, change: i + 1, recurred, usd, tokens: 100 }))

test('a bare-string error reply recurs; the contract shape and a success reply do not', () => {
  assert.equal(scoreChange(["  return res.status(404).send('not found')"]).recurred, true)
  assert.equal(scoreChange(['  res.send("nope")']).recurred, true)
  assert.equal(scoreChange(["  return fail(res, 404, 'not-found', 'no such item')"]).recurred, false)
  assert.equal(scoreChange(['  res.status(201).json(item)', '  res.send(item)']).recurred, false)
})

test('the loop beats off when changes 4 to 6 recur a third less often at no more than 10% extra cost per accepted change', () => {
  const off = rows('off', [1, 1, 1, 1, 1, 0])
  assert.equal(verdict([...off, ...rows('loop', [1, 1, 0, 0, 0, 0], 1.05)]), 'loop beats off')
  assert.equal(verdict([...off, ...rows('loop', [1, 1, 0, 0, 0, 0], 20)]), 'no lift')
})

test('a baseline that accepts no change has unbounded cost per accepted change, so a loop that accepts some beats it at any cost', () => {
  assert.equal(verdict([...rows('off', [1, 1, 1, 1, 1, 1]), ...rows('loop', [1, 1, 0, 0, 0, 0], 50)]), 'loop beats off')
})

test('equal recurrence at lower cost per accepted change is a cheaper tie; otherwise no lift; a missing arm is unmeasured', () => {
  assert.equal(verdict([...rows('off', [1, 1, 1, 1, 1, 0], 2), ...rows('loop', [1, 1, 1, 1, 1, 0], 1)]), 'tie-cheaper')
  assert.equal(verdict([...rows('off', [1, 1, 1, 1, 1, 0]), ...rows('loop', [1, 1, 1, 1, 1, 0])]), 'no lift')
  assert.equal(verdict(rows('off', [1, 1, 1, 1, 1, 1])), 'unmeasured')
})

test('the table has one line per arm', () => {
  const t = renderLearnTable([...rows('off', [1, 1, 1, 1, 1, 1]), ...rows('loop', [1, 1, 0, 0, 0, 0])])
  assert.match(t, /\| off \| 1 \| 1\.00 \|/)
  assert.match(t, /\| loop \| 1 \| 0\.00 \|/)
  assert.match(t, /\| off \| 1 \| 1\.00 \| .*none accepted/)
})

test('the fixture has six tasks with valid slugs, and a contract the agent can find', () => {
  assert.equal(TASKS.length, 6)
  for (const t of TASKS) assert.match(t.slug, /^[a-z0-9][a-z0-9-]{1,60}$/)
  assert.ok(fs.existsSync(path.join(import.meta.dirname, 'fixtures/learn/repo/CONTRACT.md')))
})

test('the dry replay measures both arms without a model and the loop wins', async () => {
  const r = await runLearnEval({ dry: true, runs: 2 })
  assert.equal(r.rows.length, 2 * 2 * 6)
  assert.equal(r.verdict, 'loop beats off')
})

test('--dry exits 0, prints a verdict and writes no results file', () => {
  const file = path.join(import.meta.dirname, 'results', 'must-not-exist-learn.jsonl')
  const r = spawnSync('node', [path.join(import.meta.dirname, 'learn.mjs'), '--dry', '--runs', '1'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /verdict: loop beats off/)
  assert.equal(fs.existsSync(file), false)
})

test('a failed model run is not scored as learned: failed rows are left out of the verdict', () => {
  const failed = rows('loop', [0, 0, 0, 0, 0, 0]).map(r => ({ ...r, failed: true }))
  assert.equal(verdict([...rows('off', [1, 1, 1, 1, 1, 1]), ...failed]), 'unmeasured')
})

test('a baseline that never makes the mistake measures nothing, however the cost compares', () => {
  assert.equal(verdict([...rows('off', [0, 0, 0, 0, 0, 0], 2), ...rows('loop', [0, 0, 0, 0, 0, 0], 1)]), 'unmeasured')
})

test('the fixture tempts the mistake: its existing handlers send bare-string errors while the contract forbids them', () => {
  const handlers = fs.readFileSync(path.join(import.meta.dirname, 'fixtures/learn/repo/src/handlers.js'), 'utf8')
  assert.ok(handlers.split('\n').filter(l => scoreChange([l]).recurred).length >= 2)
  assert.doesNotMatch(handlers, /fail\(/)
})
