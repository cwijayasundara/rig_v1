// `sdlc.ts baseline`: /rig:init measures the repo before any change exists. A live init found `run` and `quality` both refuse
// without a change, so the baseline was never recorded and knownRed stayed unset.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, registry } from './testkit.ts'

const ok = 'node -e "process.exit(0)"'
const bad = 'node -e "process.exit(3)"'

test('baseline: runs each sensor up to the commit cadence once with no change; failing ones go into knownRed by id', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', registry({ turn: { test: ok, lint: bad }, ci: { slow: bad } }))
  const r = sdlc(repo, ['baseline'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /^test: pass/m)
  assert.match(r.stdout, /^lint: fail \(exit 3\) → knownRed/m)
  assert.doesNotMatch(r.stdout, /slow/, 'ci-cadence sensors are not measured: the pre-commit hook does not run them')
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes')) || !fs.readdirSync(path.join(repo, '.rig/changes')).length, 'no change is created')
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
  assert.deepEqual(cfg.knownRed, ['lint'])
  assert.equal(cfg.sensors.length, 3, 'the rest of sensors.json is kept')
  assert.match(sdlc(repo, ['baseline']).stdout, /known red: lint$/m, 'a re-run adds nothing twice')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).knownRed, ['lint'])
})

test('baseline: refuses without sensors.json', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const r = sdlc(repo, ['baseline'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr + r.stdout, /no \.rig\/sensors\.json/)
})

test('baseline registers a passing fast test script no sensor runs at cadence turn, once', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'package.json', JSON.stringify({ scripts: { test: ok, 'test:all': 'node -e "process.exit(0 )"' } }))
  write(repo, '.rig/sensors.json', registry({ turn: { unit: ok } }))
  assert.match(sdlc(repo, ['baseline']).stdout, /^script-test-all: registered at cadence turn \(passed in \d+ ms\)/m)
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
  const s = cfg.sensors.find((x: { id: string }) => x.id === 'script-test-all')
  assert.deepEqual({ ...s, guide: undefined }, { id: 'script-test-all', cmd: 'npm run test:all', cadence: 'turn', blocks: true, count: 'exit', guide: undefined })
  const n = cfg.sensors.length
  sdlc(repo, ['baseline'])
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).sensors.length, n, 'a second baseline adds nothing')
})

test('baseline registers a failing test script at cadence ci and never lists it in knownRed', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'package.json', JSON.stringify({ scripts: { test: ok, 'test:all': bad } }))
  write(repo, '.rig/sensors.json', registry({ turn: { unit: ok } }))
  assert.match(sdlc(repo, ['baseline']).stdout, /^script-test-all: registered at cadence ci \(fail \(exit 3\)\)/m)
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
  assert.equal(cfg.sensors.find((x: { id: string }) => x.id === 'script-test-all').cadence, 'ci')
  assert.ok(!(cfg.knownRed ?? []).includes('script-test-all'))
})
