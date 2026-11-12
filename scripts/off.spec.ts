// `sdlc.ts off` / `on` (readiness doc R5): one committed marker switches rig off for a repo, and only once it is on the trunk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, gitIn, hook } from './testkit.ts'
import { isProtected } from './sensors.ts'

const repoWithRig = (): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'rig')
  return repo
}
const commitAll = (repo: string, msg: string): void => { gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', msg) }

test('off without --why fails; off writes the marker and says how it takes effect', () => {
  const repo = repoWithRig()
  assert.equal(sdlc(repo, ['off']).code, 1)
  const r = sdlc(repo, ['off', '--why', 'provider outage'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/off.json'), 'utf8')).why, 'provider outage')
  assert.match(r.stdout, /code owner/)
})

test('the marker on a feature branch switches nothing off', () => {
  const repo = repoWithRig()
  gitIn(repo, 'checkout', '-qb', 'agent')
  sdlc(repo, ['off', '--why', 'x'])
  commitAll(repo, 'off on a branch')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'commit']).stdout, /rig is off/)
  assert.doesNotMatch(hook(repo, 'session-start', {}).stdout, /rig is off/)
})

test('the marker on the trunk skips check, pre-push and hooks', () => {
  const repo = repoWithRig()
  sdlc(repo, ['off', '--why', 'provider outage'])
  commitAll(repo, 'off')
  const c = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(c.code, 0, c.stderr)
  assert.match(c.stdout, /rig is off on main .*provider outage/)
  assert.match(hook(repo, 'session-start', {}).stdout, /rig is off/)
  const stop = hook(repo, 'stop', {})
  assert.equal(stop.code, 0)
  assert.equal(stop.stdout, '')
  const push = sdlc(repo, ['check', '--at', 'push'])
  assert.equal(push.code, 0, push.stderr)
})

test('check --at ci honours --config-from', () => {
  const repo = repoWithRig()
  gitIn(repo, 'checkout', '-qb', 'switch-off')
  sdlc(repo, ['off', '--why', 'x'])
  commitAll(repo, 'off')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main']).stdout, /rig is off/)
  gitIn(repo, 'checkout', '-q', 'main')
  gitIn(repo, 'merge', '-q', '--ff-only', 'switch-off')
  assert.match(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main']).stdout, /rig is off on main/)
})

test('a malformed marker on the trunk reads as off', () => {
  const repo = repoWithRig()
  fs.writeFileSync(path.join(repo, '.rig/off.json'), '{')
  commitAll(repo, 'broken off')
  assert.match(sdlc(repo, ['check', '--at', 'commit']).stdout, /could not be parsed/)
})

test('no trunk and no remote: nothing is off and nothing throws', () => {
  const repo = repoWithRig()
  gitIn(repo, 'branch', '-qm', 'main', 'work')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.doesNotMatch(r.stdout, /rig is off/)
  assert.doesNotMatch(r.stderr, /\n\s+at /)
})

test('on and off are idempotent', () => {
  const repo = repoWithRig()
  const on = sdlc(repo, ['on'])
  assert.equal(on.code, 0)
  assert.match(on.stdout, /not off/)
  assert.equal(sdlc(repo, ['off', '--why', 'x']).code, 0)
  const again = sdlc(repo, ['off', '--why', 'x'])
  assert.equal(again.code, 0)
  assert.match(again.stdout, /already exists/)
  const back = sdlc(repo, ['on'])
  assert.equal(back.code, 0)
  assert.equal(fs.existsSync(path.join(repo, '.rig/off.json')), false)
})

test('the marker is protected', () => {
  assert.equal(isProtected('.rig/off.json'), true)
})
