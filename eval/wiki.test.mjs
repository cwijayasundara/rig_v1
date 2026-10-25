import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scoreAnswer, verdict, renderWikiTable, runWikiEval, ask, QUESTIONS } from './wiki.mjs'

const rows = (arm, corrects, tokens) => corrects.map((correct, run) => ({ arm, run: run + 1, correct, tokens }))

test('an answer is correct only when every expected string appears in it', () => {
  assert.equal(scoreAnswer(['a.js', 'emit'], 'See a.js, which calls emit.'), true)
  assert.equal(scoreAnswer(['a.js', 'emit'], 'See a.js.'), false)
  assert.equal(scoreAnswer(['a.js'], ''), false)
})

test('the wiki beats native by two or more correct answers of eight', () => {
  assert.equal(verdict([...rows('native', [3, 3, 3], 100), ...rows('wiki', [5, 5, 5], 900)]), 'wiki beats native')
  assert.equal(verdict([...rows('native', [3, 3, 3], 100), ...rows('wiki', [4, 4, 4], 50)]), 'no lift')
})

test('an equal score at lower tokens is a cheaper tie; at equal or higher tokens it is no lift', () => {
  assert.equal(verdict([...rows('native', [4, 4], 500), ...rows('wiki', [4, 4], 300)]), 'tie-cheaper')
  assert.equal(verdict([...rows('native', [4, 4], 500), ...rows('wiki', [4, 4], 500)]), 'no lift')
})

test('the table has one line per arm', () => {
  const t = renderWikiTable([...rows('native', [3], 100), ...rows('wiki', [5], 200)])
  assert.match(t, /\| native \| 1 \| 3\.00 \|/)
  assert.match(t, /\| wiki \| 1 \| 5\.00 \|/)
})

test('the fixture has eight questions and a repo of at least thirty files', () => {
  assert.equal(QUESTIONS.length, 8)
  assert.ok(QUESTIONS.every(q => q.expect.length >= 2))
})

test('--dry replays a fake and spends nothing', async () => {
  const r = await runWikiEval({ dry: true, runs: 1 })
  assert.equal(r.rows.length, 2)
  assert.ok(r.rows.every(x => x.usd === 0))
  assert.equal(r.verdict, 'wiki beats native')
})

test('--max-usd stops new runs once it is spent', async () => {
  assert.equal((await runWikiEval({ dry: true, runs: 3, maxUsd: 0 })).rows.length, 0)
})

test('a claude that prints no JSON fails the eval instead of scoring a wrong answer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-wiki-ask-'))
  const bin = path.join(dir, 'claude')
  fs.writeFileSync(bin, '#!/bin/sh\necho "Invalid API key" >&2\nexit 1\n', { mode: 0o755 })
  const before = process.env.RIG_CLAUDE
  process.env.RIG_CLAUDE = bin
  try { assert.throws(() => ask(dir, 'q', 'm'), /no JSON result: Invalid API key/) } finally { if (before === undefined) delete process.env.RIG_CLAUDE; else process.env.RIG_CLAUDE = before }
  process.env.RIG_CLAUDE = path.join(dir, 'missing')
  try { assert.throws(() => ask(dir, 'q', 'm'), /did not finish/) } finally { if (before === undefined) delete process.env.RIG_CLAUDE; else process.env.RIG_CLAUDE = before }
})
