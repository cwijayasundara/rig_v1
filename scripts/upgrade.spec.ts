// `sdlc upgrade` dry run: prints the plan, changes nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, gitIn, sdlc, write } from './testkit.ts'

const status = (repo: string): string => gitIn(repo, 'status', '--porcelain', '-uall')
const vendored = (): string => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  return repo
}
const manifestPath = (repo: string): string => path.join(repo, '.rig/bin/MANIFEST.json')
const editManifest = (repo: string, f: (m: { version: string; files: Record<string, string> }) => void): void => {
  const m = JSON.parse(fs.readFileSync(manifestPath(repo), 'utf8')) as { version: string; files: Record<string, string> }
  f(m)
  fs.writeFileSync(manifestPath(repo), JSON.stringify(m, null, 2) + '\n')
}
const plan = (repo: string, extra: string[] = []) => {
  const before = status(repo)
  const r = sdlc(repo, ['upgrade', '--json', ...extra])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(status(repo), before, 'the dry run changes nothing')
  return JSON.parse(r.stdout) as { from: string; to: string; standalone: boolean; files: Record<string, string>; counts: Record<string, number>; migrations: string[]; proposals: unknown }
}

test('dry run on a fresh vendor reports everything noop and no branch', () => {
  const repo = vendored()
  const before = status(repo)
  const p = plan(repo)
  assert.equal(p.standalone, true)
  assert.deepEqual(p.files, {})
  assert.equal((p.counts.noop ?? 0) > 10 && p.counts.conflict === 0 && p.counts.replace === 0, true)
  const text = sdlc(repo, ['upgrade'])
  assert.match(text.stdout, /already current/)
  assert.equal(status(repo), before)
  assert.equal(gitIn(repo, 'branch', '--list').includes('upgrade'), false)
})

test('a locally edited skill with unchanged upstream is keep', () => {
  const repo = vendored()
  const rel = '.claude/skills/rig-start/SKILL.md'
  fs.appendFileSync(path.join(repo, rel), '\nteam note\n')
  const p = plan(repo)
  assert.equal(p.files[rel], 'keep')
})

test('an edited .rig/bin script after the plugin changed it is conflict', () => {
  const repo = vendored()
  const rel = '.rig/bin/core.ts'
  fs.appendFileSync(path.join(repo, rel), '\n// local\n')
  editManifest(repo, m => { m.files[rel] = 'deadbeefdeadbeef' })
  const p = plan(repo)
  assert.equal(p.files[rel], 'conflict')
  const text = sdlc(repo, ['upgrade'])
  assert.match(text.stdout, /conflicts[\s\S]*\.rig\/bin\/core\.ts/)
})

test('no manifest: edited files are conflicts, untouched ones noop', () => {
  const repo = vendored()
  fs.appendFileSync(path.join(repo, '.rig/bin/core.ts'), '\n// local\n')
  fs.rmSync(manifestPath(repo))
  const p = plan(repo)
  assert.deepEqual(p.files, { '.rig/bin/core.ts': 'conflict' })
})

test('plugin mode lists no files, only migrations and proposals', () => {
  const repo = makeRepo()
  write(repo, '.rig/bin/VERSION', '0.5.0\n')
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: {} }))
  const p = plan(repo)
  assert.equal(p.standalone, false)
  assert.deepEqual(p.files, {})
  assert.deepEqual(p.migrations, ['pre-registry-sensors'])
})

test('refuses a downgrade without --force', () => {
  const repo = vendored()
  fs.writeFileSync(path.join(repo, '.rig/bin/VERSION'), '99.0.0\n')
  const before = status(repo)
  const r = sdlc(repo, ['upgrade'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /newer than this plugin/)
  assert.equal(sdlc(repo, ['upgrade', '--force']).code, 0)
  assert.equal(status(repo), before)
})

test('refuses invalid settings.json', () => {
  const repo = vendored()
  write(repo, '.claude/settings.json', '{ // comment\n}')
  const before = status(repo)
  const r = sdlc(repo, ['upgrade'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /not plain JSON/)
  assert.equal(status(repo), before)
})

test('ignores *.rig-new files', () => {
  const repo = vendored()
  write(repo, '.rig/bin/core.ts.rig-new', 'proposal\n')
  write(repo, '.rig/sensors.json.rig-new', '{}\n')
  const p = plan(repo)
  assert.deepEqual(p.files, {})
})

test('--diff prints the diff for one file', () => {
  const repo = vendored()
  const rel = '.rig/bin/core.ts'
  fs.appendFileSync(path.join(repo, rel), '\n// local\n')
  const before = status(repo)
  const r = sdlc(repo, ['upgrade', '--diff', rel])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /^-\/\/ local$/m)
  assert.equal(status(repo), before)
  assert.equal(sdlc(repo, ['upgrade', '--diff', 'nope.txt']).code, 1)
})
