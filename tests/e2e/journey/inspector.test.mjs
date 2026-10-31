import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseRubric, inspect } from './inspector.mjs'

const RUBRIC = parseRubric('# J1\n- J1.1 [block] every FR appears in requirements.md\n- J1.2 [warn] intents are small\n- J1.3 [block] rules are quoted\n')

const sandbox = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insp-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'a@b.c'); git('config', 'user.name', 'x')
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a'); git('add', '-A'); git('commit', '-qm', 'c')
  return { dir, run: (cmd, args) => ({ stdout: execFileSync(cmd, args, { cwd: dir, encoding: 'utf8' }), status: 0 }) }
}
const answer = items => ({ text: JSON.stringify({ stage: 'J1', items }), costUsd: 0.1 })
const ok = id => ({ id, verdict: 'pass', severity: 'block', evidence: 'a.txt:1', note: 'fine' })

test('parseRubric returns ids, severities and text', () => {
  assert.deepEqual(RUBRIC.map(r => [r.id, r.severity]), [['J1.1', 'block'], ['J1.2', 'warn'], ['J1.3', 'block']])
  assert.equal(RUBRIC[0].text, 'every FR appears in requirements.md')
})

test('a complete answer yields no problems and keeps rubric severities', async () => {
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => answer(RUBRIC.map(x => ok(x.id))) })
  assert.deepEqual(r.problems, [])
  assert.equal(r.items.length, 3)
  assert.equal(r.items.find(i => i.id === 'J1.2').severity, 'warn')
})

test('a missing rubric item becomes a fail', async () => {
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => answer([ok('J1.1'), ok('J1.2')]) })
  const j13 = r.items.find(i => i.id === 'J1.3')
  assert.equal(j13.verdict, 'fail')
  assert.match(j13.note, /inspector-malformed/)
  assert.equal(r.problems.length, 1)
})

test('prose instead of JSON fails every item', async () => {
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => ({ text: 'Looks good to me!', costUsd: 0 }) })
  assert.deepEqual(r.items.map(i => i.verdict), ['fail', 'fail', 'fail'])
})

test('JSON wrapped in a code fence is accepted', async () => {
  const text = '```json\n' + JSON.stringify({ stage: 'J1', items: RUBRIC.map(x => ok(x.id)) }) + '\n```'
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => ({ text, costUsd: 0 }) })
  assert.deepEqual(r.problems, [])
})

test('pass with empty evidence becomes a fail', async () => {
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => answer(RUBRIC.map(x => ({ ...ok(x.id), evidence: x.id === 'J1.1' ? '' : 'a.txt' }))) })
  assert.equal(r.items.find(i => i.id === 'J1.1').verdict, 'fail')
})

test('an unknown item id is a problem and is dropped', async () => {
  const r = await inspect({ sb: sandbox(), stage: 'J1', rubric: RUBRIC, launch: async () => answer([...RUBRIC.map(x => ok(x.id)), ok('J9.9')]) })
  assert.equal(r.items.length, 3)
  assert.equal(r.problems.length, 1)
})

test('a launch that edits the sandbox adds a blocking <stage>.no-edit fail', async () => {
  const sb = sandbox()
  const r = await inspect({ sb, stage: 'J1', rubric: RUBRIC, launch: async () => { fs.writeFileSync(path.join(sb.dir, 'new.txt'), 'x'); return answer(RUBRIC.map(x => ok(x.id))) } })
  const e = r.items.find(i => i.id === 'J1.no-edit')
  assert.equal(e.verdict, 'fail'); assert.equal(e.severity, 'block')
})
