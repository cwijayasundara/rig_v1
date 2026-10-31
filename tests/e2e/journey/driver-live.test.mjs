import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { journeyDriver, setupSandbox } from './driver-live.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'))

// A stub sandbox: sdlc answers come from a function so a test scripts the repo state.
function world({ sdlc = () => ({ status: 0, stdout: '', stderr: '' }), files = {} } = {}) {
  const runs = [], sdlcCalls = [], git = []
  const sessions = { sessions: [], run: (label, prompt, opts) => { runs.push({ label, prompt, opts }); return { costUsd: 0.1 } } }
  const dir = tmp()
  const put = (f, t = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  for (const [f, t] of Object.entries(files)) put(f, t)
  const sb = {
    dir, put, sessions,
    sdlc: (args, o) => { sdlcCalls.push({ args, human: Boolean(o?.human) }); return sdlc(args) },
    read: f => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : ''), exists: f => fs.existsSync(path.join(dir, f)),
    git: (...a) => { git.push(a.join(' ')); return a[0] === 'rev-parse' ? 'main' : '' },
    commitAll: () => false, run: () => ({ status: 0, stdout: '', stderr: '' }),
  }
  return { sb, sessions, runs, sdlcCalls, git, put }
}
const ready = '[]'
const answersDir = (() => { const d = tmp(); fs.writeFileSync(path.join(d, 'overdue.md'), 'Overdue means due date before today.'); return d })()
const chartState = (kinds) => args => {
  if (args[0] === 'prd') return { status: 0, stdout: 'current', stderr: '' }
  if (args[0] === 'chart') return { status: 0, stdout: JSON.stringify(kinds.shift() ?? []), stderr: '' }
  return { status: 0, stdout: '', stderr: '' }
}

test('chart throws stuck-on-input after 3 continuations while open questions persist', async () => {
  const q = [{ rule: 'open-question', severity: 'block', where: 'prd' }]
  const w = world({ sdlc: args => (args[0] === 'chart' ? { status: 0, stdout: JSON.stringify(q), stderr: '' } : { status: 0, stdout: 'current', stderr: '' }), files: { '.rig/product/sprints/sprint-1/intents/a.md': 'x' } })
  const d = journeyDriver({ sb: w.sb, sessions: w.sessions, answersDir })
  await assert.rejects(() => d.chart(1, 'docs/prd/p.md'), /stuck-on-input/)
  assert.equal(w.runs.length, 4)
})

test('open questions are answered from the answers dir before any reviewer is asked', async () => {
  const q = [{ rule: 'open-question', severity: 'block', where: 'prd' }]
  const w = world({ sdlc: chartState([q, []]), files: { '.rig/product/sprints/sprint-1/intents/a.md': 'x' } })
  let asked = 0
  const d = journeyDriver({ sb: w.sb, sessions: w.sessions, answersDir, reviewer: { review: async () => { asked++; return { decision: 'approve', reasons: [] } } } })
  await d.chart(1, 'docs/prd/p.md')
  assert.equal(asked, 0)
  assert.match(w.runs[1].prompt, /Overdue means due date before today/)
})

test('chart with no intents written yet continues once, then passes', async () => {
  const w = world({ sdlc: chartState([[], []]) })
  w.sessions.run = (label, prompt, opts) => { w.runs.push({ label, prompt, opts }); if (w.runs.length === 2) w.put('.rig/product/sprints/sprint-1/intents/a.md'); return { costUsd: 0 } }
  const d = journeyDriver({ sb: w.sb, sessions: w.sessions, answersDir })
  await d.chart(1, 'docs/prd/p.md')
  assert.equal(w.runs.length, 2)
  assert.match(w.runs[0].prompt, /^\/rig-chart 1 @docs\/prd\/p\.md/)
})

test('approveChart runs sdlc approve chart-N as a human and throws on refusal', async () => {
  const ok = world()
  await journeyDriver({ sb: ok.sb, sessions: ok.sessions, answersDir }).approveChart(1)
  assert.deepEqual(ok.sdlcCalls.find(c => c.args[0] === 'approve'), { args: ['approve', 'chart-1'], human: true })
  const bad = world({ sdlc: args => (args[0] === 'approve' ? { status: 1, stdout: '', stderr: 'blocked' } : { status: 0, stdout: '', stderr: '' }) })
  await assert.rejects(() => journeyDriver({ sb: bad.sb, sessions: bad.sessions, answersDir }).approveChart(1), /approve refused: blocked/)
})

test('buildIntent does not approve the plan when the reviewer rejects it', async () => {
  const w = world()
  const live = { begin: async () => 'loans', plan: async () => {}, build: async () => {}, answer: async () => {} }
  const d = journeyDriver({ sb: w.sb, sessions: w.sessions, answersDir, liveDriverFor: () => live, reviewer: { review: async () => ({ decision: 'reject', reasons: ['plan skips AC-7.2'] }) } })
  const slug = await d.startIntent('.rig/product/sprints/sprint-1/intents/loans.md')
  await assert.rejects(() => d.buildIntent(slug), /reviewer rejected the plan.*AC-7\.2/)
  assert.ok(!w.sdlcCalls.some(c => c.args[0] === 'approve'))
})

test('setupSandbox copies the skeleton and both PRDs and commits them', () => {
  const w = world(); const written = []
  const sb = { ...w.sb, dir: tmp(), isolate: () => {}, commitAll: m => { written.push(m); return true } }
  setupSandbox(sb)
  for (const f of ['pyproject.toml', 'src/library/__init__.py', 'tests/test_smoke.py', 'docs/prd/sprint-1-library-desk.md', 'docs/prd/sprint-2-library-desk-changes.md']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  assert.deepEqual(written, ['chore: scaffold'])
})
