// Contracts (behavioural harness spec 2026-10-16 §6): per-file freeze at plan approval, validate before run, turn runs on contract diffs.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const HUMAN = { env: { SDLC_HUMAN: '1' } }
const registry = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], ...v })); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const approvals = () => fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
// A feature change whose design the person approves, with api/openapi.yaml as its frozen contract.
const approved = () => {
  registry({ contracts: { files: ['api/**'] } })
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.equal(r.code, 0, r.stderr)
}
const commitCheck = () => { gitIn(repo, 'add', '.'); return sdlc(repo, ['check', '--at', 'commit']) }
// The design approval's state, read through core.ts (status text also depends on the tier's other gates).
const designState = () => {
  const core = path.resolve(import.meta.dirname, 'core.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { approvalOf } from ${JSON.stringify(core)}; console.log(approvalOf('demo', 'design'))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  return r.stdout.trim()
}

test('approving the design records a hash per contract file', () => {
  approved()
  const row = approvals().at(-1)
  assert.deepEqual(Object.keys(row.contracts), ['api/openapi.yaml'])
  assert.match(row.contracts['api/openapi.yaml'], /^[0-9a-f]{16}$/)
})

test('a frozen contract edited after approval blocks at commit and names the file', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = commitCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[harness-tamper\][\s\S]*api\/openapi\.yaml[\s\S]*frozen/)
})

test('a frozen contract deleted after approval blocks', () => {
  approved()
  fs.rmSync(path.join(repo, 'api/openapi.yaml'))
  assert.match(commitCheck().stdout, /\[harness-tamper\][\s\S]*api\/openapi\.yaml/)
})

test('a frozen contract edit blocks at the edit itself (PostToolUse, exit 2)', () => {
  approved()
  hook(repo, 'prompt-submit', {})
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'api/openapi.yaml') } })
  assert.equal(r.code, 2)
  assert.match(r.stderr, /frozen/)
})

test('a person\'s waiver for the file clears the block; the approval stays current', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  assert.equal(sdlc(repo, ['waive', 'harness-tamper', 'api/openapi.yaml', 'agreed with consumers'], HUMAN).code, 0)
  const r = commitCheck()
  assert.doesNotMatch(r.stdout, /\[harness-tamper\]/)
  assert.equal(designState(), 'approved')
})

test('re-approving after a contract edit records fresh hashes and clears the block', () => {
  approved()
  const first = approvals().at(-1).contracts['api/openapi.yaml']
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.doesNotMatch(r.stdout, /already approved/)
  assert.notEqual(approvals().at(-1).contracts['api/openapi.yaml'], first)
  assert.doesNotMatch(commitCheck().stdout, /\[harness-tamper\]/)
})

test('CI honours a contract waiver that is already on the base branch', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  sdlc(repo, ['waive', 'harness-tamper', 'api/openapi.yaml', 'agreed'], HUMAN)
  fs.writeFileSync(path.join(repo, 'api/openapi.yaml'), 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'change, approval and waiver on main')
  gitIn(repo, 'checkout', '-qb', 'feature')
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  write(repo, '.rig/changes/demo/evidence/note.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'edit')
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main'])
  assert.doesNotMatch(r.stdout, /\[harness-tamper\][^\n]*api\/openapi\.yaml/)
})

test('a legacy behavioral repo keeps digest staleness and records no per-file freeze', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ behavioral: { validate: 'node -e 0' } }))
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.equal(approvals().at(-1).contracts, undefined)
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\npaths: {}\n')
  assert.equal(designState(), 'stale')
})

import os from 'node:os'

// Each command appends its name to a marker outside the repo, so the turn diff never sees it.
const marker = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-c-')), 'ran.txt')
const mark = (file: string, name: string, exit = 0) => `node -e "require('fs').appendFileSync('${file}', '${name}\\n'); process.exit(${exit})"`
const ran = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [])

test('at commit, validate runs first and a failing validate skips run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate', 1), run: mark(m, 'run') } })
  write(repo, 'src/a.js', 'export const a = 1\n')
  const r = commitCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[behavioral\][\s\S]*examples do not match the specs/)
  assert.deepEqual(ran(m), ['validate'])
})

test('at commit, a passing validate is followed by run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate'), run: mark(m, 'run', 4) } })
  write(repo, 'src/a.js', 'export const a = 1\n')
  assert.match(commitCheck().stdout, /the behavioural suite failed \(exited 4/)
  assert.deepEqual(ran(m), ['validate', 'run'])
})

const turnAt = (rel: string) => { hook(repo, 'prompt-submit', {}); write(repo, rel, `x ${Math.random()}\n`); return hook(repo, 'stop', { session_id: 's1' }) }

test('a turn that touches no contract runs no contract command', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], run: mark(m, 'run') } })
  turnAt('src/a.js')
  assert.deepEqual(ran(m), [])
})

test('a turn that edits a contract file runs validate then run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate'), run: mark(m, 'run') } })
  turnAt('api/openapi.yaml')
  assert.deepEqual(ran(m), ['validate', 'run'])
})

test('a turn that edits only a .rig/contracts file still runs the contract commands', () => {
  const m = marker()
  registry({ contracts: { files: ['.rig/contracts/**'], run: mark(m, 'run') } })
  turnAt('.rig/contracts/api.yaml')
  assert.deepEqual(ran(m), ['run'])
})

test('a turn that edits source under contracts.covers runs the contract commands', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], covers: ['src/http/**'], run: mark(m, 'run') } })
  turnAt('src/http/orders.js')
  assert.deepEqual(ran(m), ['run'])
})

test('under final policy a turn never runs the contract commands', () => {
  const m = marker()
  registry({ policy: { default: 'final', haiku: 'final', sonnet: 'final', opus: 'final' }, contracts: { files: ['api/**'], run: mark(m, 'run') } })
  turnAt('api/openapi.yaml')
  assert.deepEqual(ran(m), [])
})
