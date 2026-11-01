import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const RUN = path.join(import.meta.dirname, '../run.mjs')
const go = (extra = []) => {
  const given = extra.indexOf('--out')
  const out = given >= 0 ? extra[given + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'run-'))
  const drv = extra.indexOf('--driver')
  const rest = (given >= 0 ? extra.filter((_, i) => i !== given && i !== given + 1) : extra).filter((_, i, a) => drv < 0 || (a.indexOf('--driver') !== i && a.indexOf('--driver') + 1 !== i))
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', RUN, '--driver', extra.includes('--driver') ? extra[extra.indexOf('--driver') + 1] : 'scripted', '--no-extras', '--no-notify', '--out', out, ...rest], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } })
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

test('an accepted violation is logged but neither alerts, halts nor fails the run', () => {
  const triage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tri-')), 'triage.json')
  fs.writeFileSync(triage, JSON.stringify({ 'J1.1': { decision: 'accept', reason: 'known' } }))
  const { out, r } = go(['--recorded', 'bad/chart-missing-ac', '--triage', triage])
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.doesNotMatch(r.stdout, /1 open violation/)
  assert.match(fs.readFileSync(path.join(out, 'violations.md'), 'utf8'), /## Accepted \(1\)/)
  assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /## J6: pass/)
})

test('--from resumes a kept sandbox and runs only the later stages', () => {
  const first = go()
  assert.equal(first.r.status, 0)
  const again = go(['--from', 'J4', '--out', first.out].filter(a => a !== undefined))
  assert.equal(again.r.status, 0, again.r.stdout + again.r.stderr)
  const report = fs.readFileSync(path.join(first.out, 'report.md'), 'utf8')
  assert.doesNotMatch(report, /## J0/)
  assert.match(report, /## J4: pass/)
})

test('two runs in a row with the default output folder both succeed and out/latest follows the newest', () => {
  const run = () => spawnSync('node', ['--disable-warning=ExperimentalWarning', RUN, '--driver', 'scripted', '--no-extras', '--no-notify'], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } })
  const a = run(), b = run()
  assert.equal(a.status, 0, a.stdout + a.stderr)
  assert.equal(b.status, 0, b.stdout + b.stderr)
  const newest = /report and sandbox: (.+)/.exec(b.stdout)[1]
  assert.equal(fs.realpathSync(path.join(import.meta.dirname, '../out/latest')), fs.realpathSync(newest))
})

test('the sandbox is created outside the rig repo and its path is recorded for --from', () => {
  const { out, r } = go()
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const sandbox = fs.readFileSync(path.join(out, 'sandbox-path.txt'), 'utf8').trim()
  const repo = path.resolve(import.meta.dirname, '../../..')
  assert.ok(!path.resolve(sandbox).startsWith(repo + path.sep), `${sandbox} is inside ${repo}`)
  assert.ok(fs.existsSync(path.join(sandbox, 'journey/repo/.git')))
})

test('a sandbox inside the rig repo is refused: sessions there cannot write CLAUDE.md', () => {
  const inside = path.join(import.meta.dirname, '../out/refused-sandbox')
  const { r } = go(['--sandbox', inside])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /outside the rig repo/)
  assert.ok(!fs.existsSync(inside))
})

test('live fast mode refuses before spending anything when the approved-chart snapshots were never recorded', () => {
  const { r } = go(['--driver', 'live', '--cap', '0', '--mode', 'fast', '--recorded', 'synthetic'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /recorded J2 snapshot.*npm run e2e:record/s)
})

test('an unknown mode is refused, and --record only works in full mode', () => {
  assert.equal(go(['--mode', 'nope']).r.status, 2)
  const rec = go(['--driver', 'live', '--cap', '0', '--mode', 'fast', '--record'])
  assert.equal(rec.r.status, 2)
  assert.match(rec.r.stderr, /--record needs --mode full/)
})

test('--seed J2 in a full live run refuses before spending when that snapshot was never recorded', () => {
  const { r } = go(['--driver', 'live', '--cap', '0', '--mode', 'full', '--seed', 'J2', '--recorded', 'synthetic'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /recorded J2 snapshot/)
})
