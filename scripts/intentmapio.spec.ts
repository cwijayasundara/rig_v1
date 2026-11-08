import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { makeRepo, sdlc, write } from './testkit.ts'

const FIX = path.resolve(import.meta.dirname, '../eval/fixtures/intent-map')
const plan = fs.readFileSync(path.join(FIX, 'login/intent-plan.md'), 'utf8')
let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); sdlc(repo, ['new', 'demo', '--type', 'feature', '--title', 'Demo']) })

test('intent-record runs the command and the script writes status, command and commit outside the map', () => {
  write(repo, '.rig/changes/demo/intent-map.md', plan)
  const r = sdlc(repo, ['intent-record', 'demo', 'E1', '--', 'node -e "process.exit(0)"'])
  assert.equal(r.code, 0, r.stderr)
  const rec = JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/intent-results.json'), 'utf8'))
  assert.equal(rec.E1.status, 'pass')
  assert.match(rec.E1.commit, /^[0-9a-f]{7,}$/)
  assert.match(rec.E1.command, /process\.exit\(0\)/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/changes/demo/intent-map.md'), 'utf8'), plan)
  assert.equal(sdlc(repo, ['intent-record', 'demo', 'E1', '--', 'node -e "process.exit(3)"']).code, 1)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/intent-results.json'), 'utf8')).E1.status, 'fail')
})

test('intent-record refuses an unknown scenario, a change with no map, and a missing command', () => {
  assert.notEqual(sdlc(repo, ['intent-record', 'demo', 'E1', '--', 'true']).code, 0)
  write(repo, '.rig/changes/demo/intent-map.md', plan)
  assert.notEqual(sdlc(repo, ['intent-record', 'demo', 'E9', '--', 'true']).code, 0)
  assert.notEqual(sdlc(repo, ['intent-record', 'demo', 'E1']).code, 0)
})

test('a change with no map gets no intent-map findings from verify', () => {
  const v = sdlc(repo, ['verify', 'demo'])
  assert.doesNotMatch(v.stdout + v.stderr, /formal-failed|unmapped-said|empirical-open/)
})

test('a change with a formal row and no ## Formal command fails verify closed with formal-failed', () => {
  write(repo, '.rig/changes/demo/intent-map.md', fs.readFileSync(path.join(FIX, 'login/intent-plan.md'), 'utf8'))
  const v = sdlc(repo, ['verify', 'demo'])
  assert.match(v.stdout + v.stderr, /formal-failed/)
  assert.notEqual(v.code, 0)
})

test('intentReceipt prints the recorded evidence and the last formal verdict, and nothing without a map', () => {
  const run = (code: string): string => {
    const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as M from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, 'intentmapio.ts')).href)}; console.log(JSON.stringify(await (async () => { ${code} })()))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
    assert.equal(r.status, 0, r.stderr)
    return JSON.parse(r.stdout.trim())
  }
  assert.equal(run(`return M.intentReceipt('demo')`), '')
  write(repo, '.rig/changes/demo/intent-map.md', plan.replace('## Not promised', '## Formal command\npython3 formal.py\n\n## Not promised'))
  write(repo, '.rig/changes/demo/intent-results.json', JSON.stringify({ E1: { status: 'pass', command: 'x', commit: 'abc1234' }, E2: { status: 'pass', command: 'x', commit: 'abc1234' } }))
  assert.match(run(`return M.intentReceipt('demo')`), /R1 formal: C2 fails, C3 fails/)
  write(repo, '.rig/changes/demo/evidence/runs.jsonl', JSON.stringify({ at: 't', cmd: 'python3 formal.py', exit: 0, ms: 1, tail: JSON.stringify({ clauses: { C2: true, C3: false, C7: true, C8: true, C9: true } }) }) + '\n')
  const text = run(`return M.intentReceipt('demo')`)
  assert.match(text, /R1 formal: C2 holds, C3 fails/)
  assert.match(text, /Commands: E1 `x`/)
  assert.match(text, /T1 empirical: E1 evidence @ abc1234, E2 evidence @ abc1234 \(evidence, not proof\)/)
})

const adjFile = (): string => path.join(repo, '.rig/changes/demo/adjudications.json')

test('intent-adjudicate records the verdict, the reason and the approver; without --by or a reason it refuses and writes nothing', () => {
  write(repo, '.rig/changes/demo/intent-map.md', plan)
  const r = sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'non-bug', '--by', 'Ana', '--', 'the reorder commutes'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(JSON.parse(fs.readFileSync(adjFile(), 'utf8')), { m1: { verdict: 'non-bug', because: 'the reorder commutes', by: 'Ana' } })
  fs.rmSync(adjFile())
  assert.notEqual(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'non-bug', '--', 'why']).code, 0)
  assert.notEqual(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'non-bug', '--by', 'Ana']).code, 0)
  assert.notEqual(sdlc(repo, ['intent-adjudicate', 'demo', 'm1', 'maybe', '--by', 'Ana', '--', 'why']).code, 0)
  assert.equal(fs.existsSync(adjFile()), false)
})

test('a malformed adjudications.json reads as no adjudication, and the file is protected from hand edits', () => {
  write(repo, '.rig/changes/demo/adjudications.json', '{not json')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as M from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, 'intentmapio.ts')).href)}; import { isProtected } from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, 'sensors.ts')).href)}; console.log(JSON.stringify([M.readAdjudications('demo'), isProtected('.rig/changes/demo/adjudications.json'), isProtected('.rig/changes/demo/plan.md')]))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout.trim()), [{}, true, false])
})

test('intent-record stores a run id that names its ledger line, and a result without one fails verify as result-unbacked', () => {
  write(repo, '.rig/changes/demo/intent-map.md', plan)
  assert.equal(sdlc(repo, ['intent-record', 'demo', 'E1', '--', 'node -e "process.exit(0)"']).code, 0)
  const resFile = path.join(repo, '.rig/changes/demo/intent-results.json')
  const res = JSON.parse(fs.readFileSync(resFile, 'utf8'))
  assert.equal(res.E1.run, 'r1')
  const ledger = fs.readFileSync(path.join(repo, '.rig/changes/demo/evidence/runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.equal(ledger[0].id, 'r1')
  assert.equal(ledger[0].commit, res.E1.commit)
  delete res.E1.run
  fs.writeFileSync(resFile, JSON.stringify(res))
  const v = sdlc(repo, ['verify', 'demo'])
  assert.match(v.stdout + v.stderr, /result-unbacked/)
})

test('intentReceipt reports the property command from its last ledger run, with the sampled label, and never from a new run', () => {
  const run = (code: string): string => {
    const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as M from ${JSON.stringify(pathToFileURL(path.resolve(import.meta.dirname, 'intentmapio.ts')).href)}; console.log(JSON.stringify(await (async () => { ${code} })()))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
    assert.equal(r.status, 0, r.stderr)
    return JSON.parse(r.stdout.trim())
  }
  write(repo, '.rig/changes/demo/intent-map.md', plan.replace('## Not promised', '## Property command\nnode prop.mjs\n\n## Not promised'))
  assert.match(run(`return M.intentReceipt('demo')`), /- property: not run/)
  write(repo, '.rig/changes/demo/evidence/runs.jsonl', JSON.stringify({ at: 't', cmd: 'node prop.mjs', exit: 0, ms: 1, tail: '' }) + '\n')
  assert.match(run(`return M.intentReceipt('demo')`), /- property: pass \(evidence, sampled, not exhaustive\)/)
  write(repo, '.rig/changes/demo/evidence/runs.jsonl', JSON.stringify({ at: 't', cmd: 'node prop.mjs', exit: 1, ms: 1, tail: '' }) + '\n')
  assert.match(run(`return M.intentReceipt('demo')`), /- property: fails/)
})
