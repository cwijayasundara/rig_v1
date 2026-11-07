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
  assert.match(text, /T1 empirical: E1 evidence @ abc1234, E2 evidence @ abc1234 \(evidence, not proof\)/)
})
