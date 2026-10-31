import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pinEvaluator } from './driver-live.mjs'

const sandbox = text => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-'))
  fs.mkdirSync(path.join(dir, '.claude/agents'), { recursive: true })
  if (text) fs.writeFileSync(path.join(dir, '.claude/agents/rig-evaluator.md'), text)
  const commits = []
  return { dir, read: f => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : ''), write: (f, t) => fs.writeFileSync(path.join(dir, f), t), commitAll: m => { commits.push(m); return true }, commits }
}

test('pinEvaluator changes the evaluator model line to sonnet and commits it as a test pin', () => {
  const sb = sandbox('---\nname: evaluator\nmodel: opus\neffort: high\n---\nbody\n')
  assert.equal(pinEvaluator(sb, 'sonnet'), true)
  assert.match(sb.read('.claude/agents/rig-evaluator.md'), /^model: sonnet$/m)
  assert.match(sb.read('.claude/agents/rig-evaluator.md'), /effort: high/)
  assert.deepEqual(sb.commits, ['chore: e2e pins the evaluator to sonnet (cost)'])
})

test('pinEvaluator reports false and changes nothing when the agent file or its model line is missing', () => {
  assert.equal(pinEvaluator(sandbox(null), 'sonnet'), false)
  const sb = sandbox('---\nname: evaluator\n---\n')
  assert.equal(pinEvaluator(sb, 'sonnet'), false)
  assert.deepEqual(sb.commits, [])
})
