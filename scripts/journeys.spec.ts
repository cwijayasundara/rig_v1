// Journeys (harness readiness 2.1): a change that keeps the unit tests green and breaks the running app is caught only by a journey.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures/journeys')
const HUMAN = { SDLC_HUMAN: '1' }
const BUG = 'body: raw ? JSON.parse(raw) : {}'
let repo: string

const npmTest = (): number | null => spawnSync('npm', ['test', '--silent'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } }).status
const state = (): string => sdlc(repo, ['app', 'status']).stdout.trim()
const ship = (extra: string[] = []) => sdlc(repo, ['check', '--at', 'ship', '--base', 'main', ...extra])

// A repo with the shop, rig onboarded, the helper installed and the driver and feature map in place (a draft until approved).
beforeEach(() => {
  repo = makeRepo()
  for (const f of ['package.json', 'src', 'test']) fs.cpSync(path.join(FX, f), path.join(repo, f), { recursive: true })
  sdlc(repo, ['init'])
  sdlc(repo, ['app', 'init'])
  fs.cpSync(path.join(FX, 'journey'), path.join(repo, '.rig/verify/shop'), { recursive: true })
  sdlc(repo, ['sync'])
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'work')
})

test('a driver nobody approved is a draft: not enforced, and named as not configured', () => {
  assert.match(state(), /shop: draft \(never approved, not enforced\)/)
  const r = ship(['--json'])
  assert.equal(r.code, 0, r.stdout)
  assert.ok(JSON.parse(r.stdout).inert.some((i: { id: string; reason: string }) => i.id === 'journeys' && /shop is a draft/.test(i.reason)), 'listed as not configured')
  assert.equal(JSON.parse(sdlc(repo, ['status', '--json']).stdout).sensors.inert.some((i: { id: string }) => i.id === 'journeys'), true)
})

test('approval is a person\'s, needs a passing run, and records the driver\'s hash', () => {
  const refused = sdlc(repo, ['app', 'approve', 'shop'])
  assert.equal(refused.code, 3)
  assert.match(refused.stderr, /human-only/)
  const ok = sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(state(), /shop: current/)
  assert.ok(fs.existsSync(path.join(repo, '.rig/verify/shop.approved.json')))
})

test('a unit-green change that breaks the running app is blocked by journeys, and only by journeys', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  assert.equal(ship().code, 0, 'the working app passes')
  // the server stops reading request bodies; the handler, and so every unit test, is untouched
  write(repo, 'src/server.js', fs.readFileSync(path.join(repo, 'src/server.js'), 'utf8').replace(BUG, 'body: {}'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'a change that only breaks the server')
  assert.equal(npmTest(), 0, 'the unit tests are still green')
  const r = ship()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[journeys\][\s\S]*a journey of shop failed[\s\S]*FAIL a shopper adds tea to the cart: POST \/cart: 400/)
  // deleting the journeys to get past them is a harness weakening, and blocks
  fs.rmSync(path.join(repo, '.rig/verify'), { recursive: true })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'remove the journeys')
  const gone = ship()
  assert.equal(gone.code, 1)
  assert.match(gone.stdout, /harness-tamper[\s\S]*\.rig\/verify\/[\s\S]*deleted/)
})

test('without journeys the same broken app passes every other check', () => {
  fs.rmSync(path.join(repo, '.rig/verify'), { recursive: true })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'never had journeys', '--allow-empty')
  gitIn(repo, 'checkout', '-q', 'main')
  gitIn(repo, 'merge', '-q', 'work')
  gitIn(repo, 'checkout', '-qb', 'fresh')
  write(repo, 'src/server.js', fs.readFileSync(path.join(repo, 'src/server.js'), 'utf8').replace(BUG, 'body: {}'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'a change that only breaks the server')
  assert.equal(npmTest(), 0)
  assert.equal(ship().code, 0, 'unit tests green, no journey: nothing sees the broken app')
})

test('approval is refused while a journey fails', () => {
  write(repo, 'src/server.js', fs.readFileSync(path.join(repo, 'src/server.js'), 'utf8').replace(BUG, 'body: {}'))
  const r = sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  assert.equal(r.code, 1)
  assert.match(r.stderr, /not approving: a journey failed/)
  assert.match(state(), /draft/)
})

test('editing the driver after approval is a warning, not a block, and a new approval makes it current', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  write(repo, '.rig/verify/shop/journey.mjs', fs.readFileSync(path.join(repo, '.rig/verify/shop/journey.mjs'), 'utf8') + '\n// builder tweak\n')
  assert.match(state(), /shop: changed since approved/)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'builder edits the journey')
  const r = sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--json'])
  assert.equal(r.code, 0, 'a warning does not block')
  const f = JSON.parse(r.stdout).findings
  assert.ok(f.some((x: { sensor: string; severity: string; message: string }) => x.sensor === 'journeys' && x.severity === 'warn' && /changed since a person approved it/.test(x.message)))
  assert.ok(f.some((x: { sensor: string; file?: string }) => x.sensor === 'harness-tamper' && x.file === '.rig/verify/shop/journey.mjs'), 'the harness file change shows for review')
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  assert.match(state(), /shop: current/)
})

test('a feature map that names a missing path is stale: it blocks, and cannot be approved', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  fs.rmSync(path.join(repo, 'src/server.js'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'the server file moved')
  assert.match(state(), /shop: stale/)
  const r = ship()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /feature map names a path that no longer exists \(checkout\.md: src\/server\.js\)/)
  assert.match(sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN }).stderr, /not approving: the feature map names a path that does not exist/)
})

test('a run stops only what it started: no server is left behind, however often it runs', () => {
  for (let i = 0; i < 2; i++) {
    const r = sdlc(repo, ['app', 'run', 'shop'])
    assert.equal(r.code, 0, r.stdout)
    const pid = Number(/server pid (\d+)/.exec(r.stdout)?.[1])
    assert.ok(pid > 0, 'the driver reported its server pid')
    assert.throws(() => process.kill(pid, 0), 'the server process is gone')
  }
  assert.equal(fs.existsSync(path.join(repo, '.rig/state/verify/shop/pids')), false, 'the recorded pids are cleared')
  assert.ok(JSON.parse(fs.readFileSync(path.join(repo, '.rig/state/verify/shop/evidence.json'), 'utf8')).ok, 'evidence is kept')
})

test('the commit hook does not run journeys: they run at verify, ship and CI', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  write(repo, 'src/server.js', fs.readFileSync(path.join(repo, 'src/server.js'), 'utf8').replace(BUG, 'body: {}'))
  gitIn(repo, 'add', 'src/server.js')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.doesNotMatch(r.stdout, /journeys/)
})
