import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const RUN = path.join(import.meta.dirname, '../run.mjs')
const go = (extra = []) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'run-'))
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', RUN, '--driver', 'scripted', '--no-extras', '--no-notify', '--out', out, ...extra], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } })
  return { out, r }
}

test('the synthetic set exits 0 and writes report, violations and the sandbox', () => {
  const { out, r } = go()
  assert.equal(r.status, 0, r.stdout + r.stderr)
  for (const f of ['report.md', 'report.json', 'violations.jsonl'.replace('.jsonl', '.md')]) assert.ok(fs.existsSync(path.join(out, f)), f)
  assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /## J6: pass/)
})

test('a seeded-bad set exits 1 and violations.md names the expected id', () => {
  const { out, r } = go(['--recorded', 'bad/chart-missing-ac'])
  assert.equal(r.status, 1)
  assert.match(fs.readFileSync(path.join(out, 'violations.md'), 'utf8'), /J1\.1/)
  assert.match(r.stdout, /open violation/)
})

test('the same set exits 0 when the person has accepted the violation', () => {
  const triage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-')), 'triage.json')
  fs.writeFileSync(triage, JSON.stringify({ 'J1.1': { decision: 'accept', reason: 'known' } }))
  const { r } = go(['--recorded', 'bad/chart-missing-ac', '--triage', triage])
  assert.equal(r.status, 0, r.stdout + r.stderr)
})
