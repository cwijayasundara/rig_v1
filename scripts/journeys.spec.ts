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

// ---------- review findings ----------
const driverPath = (): string => path.join(repo, '.rig/verify/shop/journey.mjs')
const setDriver = (text: string): void => fs.writeFileSync(driverPath(), text)
const original = (): string => fs.readFileSync(driverPath(), 'utf8')

test('an exit 0 with no evidence of any step is a failed run, not a pass', () => {
  setDriver('// a driver that checks nothing\n')
  const run = sdlc(repo, ['app', 'run', 'shop'])
  assert.equal(run.code, 1)
  assert.match(run.stdout, /exited 0 but wrote no evidence of any journey step/)
  const approve = sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  assert.equal(approve.code, 1)
  assert.match(approve.stderr, /not approving: a journey failed/)
  setDriver("import { verify } from '../lib.mjs'\nawait verify('shop', async () => {})\n")
  assert.equal(sdlc(repo, ['app', 'run', 'shop']).code, 1, 'verify() with no steps is hollow too')
})

test('a driver killed on a timeout does not leave the app it launched running', () => {
  fs.writeFileSync(path.join(repo, '.rig/verify/shop/app.json'), JSON.stringify({ run: 'node .rig/verify/shop/journey.mjs', files: ['journey.mjs'], timeoutMs: 4000 }))
  setDriver("import { launch } from '../lib.mjs'\nconst app = await launch('node src/server.js')\nconsole.log(`server pid ${app.pid}`)\nawait new Promise(() => {})\n")
  const r = sdlc(repo, ['app', 'run', 'shop'])
  assert.equal(r.code, 1)
  const pid = Number(/server pid (\d+)/.exec(r.stdout)?.[1])
  assert.ok(pid > 0, r.stdout)
  assert.throws(() => process.kill(pid, 0), 'the server the driver launched was reaped after the driver was killed')
})

test('the driver gets no tokens or secrets from the checker\'s environment', () => {
  setDriver(`import fs from 'node:fs'\nimport { verify } from '../lib.mjs'\nfs.writeFileSync('seen.json', JSON.stringify(Object.keys(process.env).filter(k => /TOKEN|SECRET|API_?KEY|^SDLC_|^GH_/.test(k))))\nawait verify('shop', async ({ step }) => { await step('ran', async () => {}) })\n`)
  const r = sdlc(repo, ['app', 'run', 'shop'], { env: { SDLC_CONSUMERS_TOKEN: 'secret', MY_API_KEY: 'k', GH_TOKEN: 'g' } })
  assert.equal(r.code, 0, r.stdout)
  const seen: string[] = JSON.parse(fs.readFileSync(path.join(repo, 'seen.json'), 'utf8'))
  assert.deepEqual(seen, [], 'no variable that looks like a secret reached the driver, not even its name')
})

test('CI runs only approved journeys: a changed driver is not executed there, but is at a local ship', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'approved')
  gitIn(repo, 'checkout', '-q', 'main')
  gitIn(repo, 'merge', '-q', 'work')
  gitIn(repo, 'checkout', '-qb', 'pr')
  setDriver(original().replace("const call =", "import('node:fs').then(fs => fs.writeFileSync('ran.txt', 'x'))\n  const call ="))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'a PR that supplies its own driver')
  const ci = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json'])
  assert.equal(fs.existsSync(path.join(repo, 'ran.txt')), false, 'the PR\'s driver did not run in CI')
  assert.ok(JSON.parse(ci.stdout).findings.some((f: { sensor: string; message: string }) => f.sensor === 'journeys' && /was not run: CI runs only approved journeys/.test(f.message)))
  const local = ship()
  assert.equal(fs.existsSync(path.join(repo, 'ran.txt')), true, 'on the builder\'s own machine it runs')
  assert.equal(local.code, 0, local.stdout)
})

test('nothing switches journeys off in silence: a bad app.json, a missing driver file, an orphaned approval and an unknown name all say so', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  fs.writeFileSync(path.join(repo, '.rig/verify/shop/app.json'), JSON.stringify({ run: 'node .rig/verify/shop/journey.mjs', files: ['journey.mjs', 'missing.mjs'] }))
  assert.match(sdlc(repo, ['app', 'check']).stdout, /shop: the driver file missing\.mjs does not exist/)
  fs.writeFileSync(path.join(repo, '.rig/verify/shop/app.json'), '{ not json')
  assert.match(sdlc(repo, ['app', 'check']).stdout, /shop: app\.json is not valid/)
  fs.rmSync(path.join(repo, '.rig/verify/shop'), { recursive: true })
  const orphan = sdlc(repo, ['app', 'check'])
  assert.equal(orphan.code, 1)
  assert.match(orphan.stdout, /shop\.approved\.json: approves an app that is not there/)
  const unknown = sdlc(repo, ['app', 'check', 'nope'])
  assert.equal(unknown.code, 1)
  assert.match(unknown.stderr, /no such app: nope/)
})

test('the shared helper is part of what an approval covers, and a path that climbs out of the app folder is ignored', () => {
  sdlc(repo, ['app', 'approve', 'shop'], { env: HUMAN })
  fs.appendFileSync(path.join(repo, '.rig/verify/lib.mjs'), '\n// edited helper\n')
  assert.match(state(), /shop: changed since approved/)
  fs.writeFileSync(path.join(repo, '.rig/verify/shop/app.json'), JSON.stringify({ run: 'true', files: ['../../../etc/passwd', '/etc/passwd', 'journey.mjs'] }))
  const files = JSON.parse(sdlc(repo, ['app', 'status', '--json']).stdout)
  assert.equal(files.length, 1)
  assert.doesNotMatch(sdlc(repo, ['app', 'check']).stdout, /passwd/, 'unsafe paths are dropped, not read')
})
