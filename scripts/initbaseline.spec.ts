// `sdlc.ts baseline`: /rig:init measures the repo before any change exists. A live init found `run` and `quality` both refuse
// without a change, so the baseline was never recorded and knownRed stayed unset.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write } from './testkit.ts'

const ok = 'node -e "process.exit(0)"'
const bad = 'node -e "process.exit(3)"'

test('baseline: runs fast, levels and quality once with no change; failing fast commands go into knownRed', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', JSON.stringify({
    fast: { test: ok, lint: bad },
    levels: { unit: ok, integration: ok, acceptance: bad },
    quality: { lint: { cmd: 'node -e "console.log(1); console.log(2)"', count: 'lines' }, deps: { cmd: 'no-such-tool-xyz', count: 'lines' } },
  }))
  const r = sdlc(repo, ['baseline'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /fast\.test: pass/)
  assert.match(r.stdout, /fast\.lint: fail \(exit 3\) → knownRed/)
  assert.match(r.stdout, /levels unit, integration: pass/, 'one command serving two levels runs once')
  assert.match(r.stdout, /levels acceptance: FAIL/)
  assert.match(r.stdout, /quality lint: 2 finding\(s\)/)
  assert.match(r.stdout, /quality deps: cannot count/)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/changes')) || !fs.readdirSync(path.join(repo, '.rig/changes')).length, 'no change is created')
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
  assert.deepEqual(cfg.knownRed, ['fast.lint'])
  assert.deepEqual(cfg.fast, { test: ok, lint: bad }, 'the rest of sensors.json is kept')
  assert.match(sdlc(repo, ['baseline']).stdout, /known red: fast\.lint$/m, 'a re-run adds nothing twice')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).knownRed, ['fast.lint'])
})

test('baseline: refuses without sensors.json', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const r = sdlc(repo, ['baseline'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr + r.stdout, /no \.rig\/sensors\.json/)
})
