// Integration: a registry-shaped .rig/sensors.json drives Stop, the baseline, the ratchet and frozen contract files.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

let repo: string
let n = 0
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const sensor = (id: string, cadence: string, cmd: string, extra: object = {}) => ({ id, cmd, cadence, blocks: true, count: 'exit', guide: `${id} must pass.`, ...extra })
const registry = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify(v)); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const turn = (rel = 'src/x.js') => { hook(repo, 'prompt-submit', {}); write(repo, rel, `export const x = ${++n}\n`) }
const stop = (extra: object = {}) => hook(repo, 'stop', { session_id: 's1', ...extra })
const sensorsJson = () => JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))

test('Stop runs a registry turn sensor and blocks on its failure', () => {
  registry({ sensors: [sensor('unit', 'turn', 'node -e "process.exit(3)"')] })
  turn()
  const out = JSON.parse(stop().stdout)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /fast\.unit failed \(exit 3\)/)
})

test('a non-blocking registry sensor warns instead of blocking', () => {
  registry({ sensors: [sensor('dup', 'turn', 'node -e "process.exit(1)"', { blocks: false })] })
  turn()
  const r = stop()
  assert.doesNotMatch(r.stdout, /"decision":"block"/)
  assert.match(r.stdout, /fast\.dup/)
})

test('a disabled built-in does not judge the turn', () => {
  registry({ sensors: [{ id: 'test-tamper', builtin: true, enabled: false }] })
  hook(repo, 'prompt-submit', {})
  write(repo, 'test/a.test.js', "it.only('x', () => {})\n")
  assert.doesNotMatch(stop().stdout, /test-tamper/)
})

test('baseline writes failing registry sensors as ids, and a passing known-red sensor is cleared at Stop', () => {
  registry({ sensors: [sensor('lint', 'turn', 'node -e "process.exit(3)"')] })
  assert.equal(sdlc(repo, ['baseline']).code, 0)
  assert.deepEqual(sensorsJson().knownRed, ['lint'])
  assert.ok(Array.isArray(sensorsJson().sensors), 'still a registry')
  registry({ sensors: [sensor('lint', 'turn', 'node -e ""')], knownRed: ['lint'] })
  turn()
  stop()
  assert.deepEqual(sensorsJson().knownRed, [])
  assert.equal(sensorsJson().fast, undefined, 'no legacy keys written')
})

test('a registry freezes contracts.files', () => {
  registry({ sensors: [], contracts: { files: ['api/**'] } })
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  const core = path.resolve(import.meta.dirname, 'core.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { behavioralFiles } from ${JSON.stringify(core)}; console.log(JSON.stringify(behavioralFiles('x')))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.deepEqual(JSON.parse(r.stdout), ['api/openapi.yaml'], r.stderr)
})
