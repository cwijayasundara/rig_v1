// The core reads the registry directly (behavioural harness spec 2026-10-16 §3, step 4c).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeRepo, sdlc, hook, write, gitIn, registry } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const commit = (text: string) => { write(repo, '.rig/sensors.json', text); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const turn = (rel = 'src/a.js') => { hook(repo, 'prompt-submit', {}); write(repo, rel, `export const a = ${Math.random()}\n`); return hook(repo, 'stop', { session_id: 's1' }) }
const marker = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-4c-')), 'ran.txt')
const mark = (file: string, name: string, exit = 0) => `node -e "require('fs').appendFileSync('${file}', '${name}\\n'); process.exit(${exit})"`
const ran = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [])

test('an old-shape sensors.json is one clear config error at Stop, commit and status', () => {
  commit(JSON.stringify({ fast: { test: 'node -e 0' } }))
  const stop = JSON.parse(turn().stdout)
  assert.equal(stop.decision, 'block')
  assert.match(stop.reason, /pre-registry format; run sdlc\.ts init --stack/)
  gitIn(repo, 'add', '.')
  assert.match(sdlc(repo, ['check', '--at', 'commit']).stdout, /pre-registry format/)
  assert.equal(sdlc(repo, ['status']).code, 0)
})

test('Stop runs turn sensors, commit runs commit sensors, never nightly', () => {
  const m = marker()
  commit(registry({ turn: { t: mark(m, 'turn') }, commit: { c: mark(m, 'commit') }, extra: { sensors: [{ id: 'n', cmd: mark(m, 'nightly'), cadence: 'nightly', blocks: false, count: 'exit', guide: 'n' }] } }))
  turn()
  assert.deepEqual(ran(m), ['turn'])
  gitIn(repo, 'add', '.')
  sdlc(repo, ['check', '--at', 'commit'])
  assert.deepEqual(ran(m), ['turn', 'turn', 'commit'])
})

test('blocks:false warns; a failing knownRed sensor warns; a passing one leaves knownRed by its id', () => {
  const m = marker()
  commit(registry({ turn: { soft: mark(m, 'soft', 1), red: mark(m, 'red', 1) }, advisory: ['soft'], knownRed: ['red'] }))
  const r = turn()
  assert.doesNotMatch(r.stdout, /"decision":"block"/, r.stdout)
  commit(registry({ turn: { red: mark(m, 'red', 0) }, knownRed: ['red'] }))
  turn()
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).knownRed, [])
})

test('a {files} sensor runs on the whole repo at turn, and on the touched file at edit', () => {
  const m = marker()
  const echo = `node -e "require('fs').appendFileSync('${m}', process.argv.slice(1).join(' ') + '\\n')" {files}`
  commit(registry({ extra: { sensors: [{ id: 'lint', cmd: echo, cadence: 'edit', blocks: true, count: 'exit', guide: 'Lint passes.' }] } }))
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'src/a.js') } })
  hook(repo, 'stop', { session_id: 's1' })
  assert.deepEqual(ran(m), ['src/a.js', '.']) // the shell strips commandFor's quoting before the script sees argv
})

test('red-proof with no unit sensor warns and skips', () => {
  commit(registry({}))
  gitIn(repo, 'checkout', '-qb', 'feature')
  sdlc(repo, ['new', 'demo', '--type', 'feature'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- B1 x\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo'], { env: { SDLC_HUMAN: '1' } })
  write(repo, 'test/a.test.js', '// B1\n')
  const r = JSON.parse(sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--slug', 'demo', '--json']).stdout) as { findings: { sensor: string; severity: string; message: string }[] }
  const proof = r.findings.find(f => f.sensor === 'red-proof')
  assert.equal(proof?.severity, 'warn')
  assert.match(proof?.message ?? '', /no unit sensor/)
})

test('CI with --config-from judges with the base registry; an old-shape base is a config error', () => {
  commit(JSON.stringify({ fast: { test: 'node -e 0' } }))
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/sensors.json', registry({}))
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'pr')
  assert.match(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main']).stdout, /pre-registry format/)
})

test('a failing contract run is reported as the contracts sensor', () => {
  commit(registry({ contracts: { files: ['api/**'], run: 'node -e "process.exit(3)"' } }))
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.')
  assert.match(sdlc(repo, ['check', '--at', 'commit']).stdout, /\[contracts\][\s\S]*behavioural suite failed/)
})

test('a waiver row cannot clear plan-gate, even a hand-written one', () => {
  commit(registry({}))
  sdlc(repo, ['new', 'demo', '--type', 'chore'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- none\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n')
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'demo', sensor: 'plan-gate', file: '*', reason: 'x', by: 'p', at: 't' }) + '\n')
  assert.match(sdlc(repo, ['verify', 'demo']).stdout, /\[plan-gate\]/)
})

test('a resumed session after a passing verify is told to open the PR', () => {
  commit(registry({}))
  sdlc(repo, ['new', 'demo', '--type', 'chore'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- none\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo'], { env: { SDLC_HUMAN: '1' } })
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 0)
  const ctx = JSON.parse(hook(repo, 'session-start', { session_id: 's1' }).stdout).hookSpecificOutput.additionalContext as string
  assert.match(ctx, /Next: \/rig:pr demo/)
})
