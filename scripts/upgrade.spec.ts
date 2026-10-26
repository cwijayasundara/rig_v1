// `sdlc upgrade` dry run: prints the plan, changes nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, gitIn, sdlc, write, registry } from './testkit.ts'
import { sha } from './core.ts'

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

// --apply: a vendored, committed project whose copies lag the plugin. Disk text + manifest hash = "installed an older version".
const SKILL = '.claude/skills/rig-start/SKILL.md'
const CORE = '.rig/bin/core.ts'
const SENSORS = registry({ turn: { x: 'true' }, extra: { stack: 'node' } })
const committed = (): string => {
  const repo = vendored()
  write(repo, '.rig/sensors.json', SENSORS)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'vendor')
  return repo
}
const lag = (repo: string, rel: string, old: string): void => {
  write(repo, rel, old)
  editManifest(repo, m => { m.files[rel] = sha(old) })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'lag')
}
const manifestOf = (repo: string) => JSON.parse(fs.readFileSync(manifestPath(repo), 'utf8')) as { version: string; files: Record<string, string> }

test('apply replaces an unchanged file and records the new hash', () => {
  const repo = committed()
  const want = fs.readFileSync(path.join(repo, SKILL), 'utf8')
  lag(repo, SKILL, 'old\n')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(repo, SKILL), 'utf8'), want)
  assert.equal(manifestOf(repo).files[SKILL], sha(want))
  assert.match(r.stdout, /review and merge; nothing was pushed/)
  assert.equal(plan(repo).files[SKILL], undefined)
})

test('apply keeps a local edit and next dry run is noop for it', () => {
  const repo = committed()
  const want = fs.readFileSync(path.join(repo, SKILL), 'utf8')
  lag(repo, SKILL, 'old\n')
  write(repo, SKILL, 'old\nteam note\n')
  gitIn(repo, 'commit', '-qam', 'edit')
  assert.equal(plan(repo).files[SKILL], 'conflict')
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [SKILL]: 'mine' })]).code, 0)
  assert.equal(fs.readFileSync(path.join(repo, SKILL), 'utf8'), 'old\nteam note\n')
  assert.equal(manifestOf(repo).files[SKILL], sha(want))
  assert.equal(plan(repo).files[SKILL], 'keep')
})

test('conflict with decision new overwrites, mine keeps, later keeps and writes .rig-new', () => {
  const repo = committed()
  const rels = [SKILL, CORE, '.rig/bin/sdlc.ts']
  const want = rels.map(rel => fs.readFileSync(path.join(repo, rel), 'utf8'))
  for (const rel of rels) { lag(repo, rel, 'old\n'); write(repo, rel, 'local\n') }
  gitIn(repo, 'commit', '-qam', 'edit')
  const d = { [rels[0]!]: 'new', [rels[1]!]: 'mine', [rels[2]!]: 'later' }
  const r = sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify(d)])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(repo, rels[0]!), 'utf8'), want[0])
  assert.equal(fs.readFileSync(path.join(repo, rels[1]!), 'utf8'), 'local\n')
  assert.equal(fs.readFileSync(path.join(repo, rels[2]!), 'utf8'), 'local\n')
  assert.equal(fs.readFileSync(path.join(repo, `${rels[2]!}.rig-new`), 'utf8'), want[2])
  assert.equal(fs.existsSync(path.join(repo, `${rels[1]!}.rig-new`)), false)
})

test('apply without a decision for a conflict refuses and writes nothing', () => {
  const repo = committed()
  lag(repo, CORE, 'old\n')
  write(repo, CORE, 'local\n')
  gitIn(repo, 'commit', '-qam', 'edit')
  const branch = gitIn(repo, 'branch', '--show-current')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /undecided[\s\S]*\.rig\/bin\/core\.ts/)
  assert.equal(status(repo), '')
  assert.equal(gitIn(repo, 'branch', '--show-current'), branch)
  const bad = sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [CORE]: 'maybe' })])
  assert.equal(bad.code, 1)
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ 'nope.txt': 'new' })]).code, 1)
  assert.equal(status(repo), '')
})

test('apply refuses a dirty tree', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  write(repo, 'untracked.txt', 'x\n')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /not clean/)
  assert.equal(fs.readFileSync(path.join(repo, SKILL), 'utf8'), 'old\n')
  assert.equal(gitIn(repo, 'branch', '--list', 'chore/*'), '')
})

test('apply refuses when the branch exists', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  const to = plan(repo).to
  gitIn(repo, 'branch', `chore/rig-upgrade-${to}`)
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /already exists/)
  assert.equal(fs.readFileSync(path.join(repo, SKILL), 'utf8'), 'old\n')
})

test('apply on a current install creates no branch', () => {
  const repo = vendored()
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'vendor')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /already current/)
  assert.equal(gitIn(repo, 'branch', '--list', 'chore/*'), '')
  assert.equal(status(repo), '')
})

test('apply with only unapplied sensor proposals creates no branch and names them', () => {
  const repo = committed()
  const ids = (plan(repo).proposals as { sensors: { id: string }[] }).sensors.map(x => x.id)
  assert.ok(ids.length > 1)
  for (let i = 0; i < 2; i++) {
    const r = sdlc(repo, ['upgrade', '--apply'])
    assert.equal(r.code, 0, r.stderr)
    assert.match(r.stdout, /already current/)
    assert.match(r.stdout, /--add-sensors/)
    for (const id of ids) assert.ok(r.stdout.includes(id), id)
    assert.equal(gitIn(repo, 'branch', '--list', 'chore/*'), '')
    assert.equal(status(repo), '')
  }
})

test('apply prints how to recover before it runs sync and baseline', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  const at = r.stdout.indexOf('running sync and baseline')
  assert.ok(at > 0)
  assert.match(r.stdout.slice(at), /^running sync and baseline \(if one fails: .*git checkout main .*git branch -D chore\/rig-upgrade-/)
  assert.ok(r.stdout.indexOf('review and merge') > at)
})

test('apply adds chosen sensors to sensors.json and leaves other sensors byte-identical', () => {
  const repo = committed()
  const p = plan(repo)
  const prop = (p.proposals as { sensors: { id: string }[] }).sensors
  assert.ok(prop.length > 1)
  const pick = prop[0]!.id
  const before = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')) as { sensors: object[] }
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--add-sensors', 'nope']).code, 1)
  assert.equal(status(repo), '')
  const r = sdlc(repo, ['upgrade', '--apply', '--add-sensors', pick])
  assert.equal(r.code, 0, r.stderr)
  const after = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')) as { sensors: { id: string }[] }
  assert.equal(after.sensors.length, before.sensors.length + 1)
  assert.deepEqual(after.sensors.slice(0, before.sensors.length), before.sensors)
  assert.equal(after.sensors.at(-1)!.id, pick)
})

test('hook scripts stay mode 755', () => {
  const repo = committed()
  const hooks = Object.keys(manifestOf(repo).files).filter(f => f.startsWith('.rig/githooks/'))
  assert.ok(hooks.length > 0)
  lag(repo, hooks[0]!, '#!/bin/sh\nold\n')
  fs.chmodSync(path.join(repo, hooks[0]!), 0o644)
  gitIn(repo, 'update-index', '--chmod=-x', hooks[0]!)
  gitIn(repo, 'commit', '-qam', 'mode')
  assert.equal(sdlc(repo, ['upgrade', '--apply']).code, 0)
  for (const h of hooks) assert.equal(fs.statSync(path.join(repo, h)).mode & 0o777, 0o755, h)
})

test('apply never pushes', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  const main = gitIn(repo, 'rev-parse', 'main')
  const to = plan(repo).to
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(gitIn(repo, 'branch', '--show-current'), `chore/rig-upgrade-${to}`)
  assert.equal(gitIn(repo, 'rev-parse', 'main'), main)
  assert.equal(gitIn(repo, 'remote'), '')
})
