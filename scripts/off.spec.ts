// `sdlc.ts off` / `on` (readiness doc R5): one committed marker switches rig off for a repo, and only once it is on the trunk.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, gitIn, hook, write } from './testkit.ts'
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

const ROOT = path.resolve(import.meta.dirname, '..')
const workflow = (): string => fs.readFileSync(path.join(ROOT, 'templates/rig-check.yml'), 'utf8')
const GUARD = 'git cat-file -t "origin/$BASE:.rig/off.json"'

test('both ai-review steps pass at once when the marker is on the base or in the PR', () => {
  const yml = workflow()
  const steps = yml.split('      - name: ').filter(s => s.startsWith('Review the diff'))
  assert.equal(steps.length, 2)
  for (const [step, out] of steps.map((s, i) => [s, i === 0 ? 'review.md' : 'security.md'] as const)) {
    const guard = step.indexOf(GUARD)
    assert.ok(guard > 0 && guard < step.indexOf('claude -p'), 'the guard runs before claude')
    assert.ok(step.slice(guard, step.indexOf('\n', guard)).includes(`tee "$RUNNER_TEMP/${out}"; exit 0; fi`))
  }
})

test('the guard satisfies the gate', () => {
  const line = workflow().split('\n').find(l => l.includes(GUARD)) ?? ''
  const echoed = /echo "([^"]*)"/.exec(line)?.[1] ?? ''
  assert.match(echoed, /^verdict: /)
  assert.doesNotMatch(echoed, /\[severity: (critical|high)\]/)
})

test('the runbook covers the four R5 items', () => {
  const book = fs.readFileSync(path.join(ROOT, 'docs/runbook.md'), 'utf8')
  for (const s of ['sdlc.ts off --why', 'sdlc.ts on', '## CI is down', '## The model provider is down', '## Upgrading', '<support owner>', '<response time>']) assert.ok(book.includes(s), s)
})

// The guard itself, run by sh in a repo whose origin/main is the base: exit 0 means it passed the review, 3 means it fell through.
const guardLine = (): string => (workflow().split('\n').find(l => l.includes(GUARD)) ?? '').trim()
function runGuard(setup: (repo: string) => void): number | null {
  const repo = repoWithRig()
  setup(repo)
  gitIn(repo, 'update-ref', 'refs/remotes/origin/main', 'main')
  gitIn(repo, 'checkout', '-qb', 'pr', 'main')
  return spawnSync('sh', ['-c', `${guardLine()}\nexit 3`], { cwd: repo, env: { ...process.env, BASE: 'main', RUNNER_TEMP: fs.mkdtempSync(path.join(repo, '..', 'rt-')) } }).status
}
const onPr = (repo: string, files: Record<string, string>): void => {
  gitIn(repo, 'checkout', '-qb', 'work')
  for (const [rel, text] of Object.entries(files)) write(repo, rel, text)
  commitAll(repo, 'pr')
}

test('the ai-review guard: base marker or an off-only PR pass; a mixed PR or a directory does not', () => {
  assert.equal(runGuard(() => {}), 3, 'no marker: review as normal')
  assert.equal(runGuard(repo => { sdlc(repo, ['off', '--why', 'x']); commitAll(repo, 'off') }), 0, 'marker on the base')
  const pr = (files: Record<string, string>): number | null => {
    const repo = repoWithRig()
    gitIn(repo, 'update-ref', 'refs/remotes/origin/main', 'main')
    onPr(repo, files)
    return spawnSync('sh', ['-c', `${guardLine()}\nexit 3`], { cwd: repo, env: { ...process.env, BASE: 'main', RUNNER_TEMP: fs.mkdtempSync(path.join(repo, '..', 'rt-')) } }).status
  }
  assert.equal(pr({ '.rig/off.json': '{"why":"outage"}\n' }), 0, 'a PR that only adds the marker')
  assert.equal(pr({ '.rig/off.json': '{}\n', 'src/app.js': 'x\n' }), 3, 'a PR that bundles other changes is reviewed')
  assert.equal(runGuard(repo => { write(repo, '.rig/off.json/x', 'x'); commitAll(repo, 'dir') }), 3, 'a directory is not the marker')
})

test('a forged local trunk ref does not switch the local checks off', () => {
  const repo = repoWithRig()
  gitIn(repo, 'checkout', '-qb', 'forged')
  sdlc(repo, ['off', '--why', 'x'])
  commitAll(repo, 'marker')
  gitIn(repo, 'checkout', '-qb', 'agent', 'main')
  gitIn(repo, 'update-ref', 'refs/heads/main', 'forged')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'commit']).stdout, /rig is off/)
  assert.doesNotMatch(hook(repo, 'session-start', {}).stdout, /rig is off/)
})

test('a directory at .rig/off.json on the trunk is not the marker', () => {
  const repo = repoWithRig()
  write(repo, '.rig/off.json/x', 'x')
  commitAll(repo, 'dir')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'commit']).stdout, /rig is off/)
})

test('while off, CI blocks a PR that changes rig\'s own files, and lets the on PR through', () => {
  const repo = repoWithRig()
  sdlc(repo, ['off', '--why', 'x'])
  commitAll(repo, 'off')
  gitIn(repo, 'checkout', '-qb', 'weaken')
  write(repo, '.rig/autonomy.json', '{"rung":3}\n')
  commitAll(repo, 'rung 3')
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /\.rig\/autonomy\.json.*wait until rig is on/)
  gitIn(repo, 'checkout', '-qb', 'switch-on', 'main')
  sdlc(repo, ['on'])
  commitAll(repo, 'on')
  const on = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.equal(on.code, 0, on.stderr)
})
