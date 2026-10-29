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
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
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

test('hook scripts stay mode 755', { skip: process.platform === 'win32' && 'no exec bits on Windows' }, () => {
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

test('VERSION is bookkeeping: never a conflict, and apply brings it current even when an edit is kept', () => {
  const repo = committed()
  const ver = '.rig/bin/VERSION'
  const to = fs.readFileSync(path.join(repo, ver), 'utf8')
  write(repo, ver, '0.5.0\n')
  write(repo, CORE, 'local\n')
  fs.rmSync(manifestPath(repo))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'no manifest')
  const p = plan(repo)
  assert.equal(p.files[ver], 'replace')
  assert.equal(p.files[CORE], 'conflict')
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [ver]: 'mine' })]).code === 0, false)
  const r = sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [CORE]: 'mine' })])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(repo, ver), 'utf8'), to)
  assert.equal(manifestOf(repo).files[ver], sha(to))
  const after = plan(repo)
  assert.equal(after.from, after.to)
  assert.deepEqual(after.migrations, [])
})

test('with a manifest an old VERSION is replace', () => {
  const repo = committed()
  const ver = '.rig/bin/VERSION'
  lag(repo, ver, '0.5.0\n')
  assert.equal(plan(repo).files[ver], 'replace')
})

// Final-review fixes.
const pluginRepo = (sensors: string): string => {
  const repo = makeRepo()
  write(repo, '.rig/sensors.json', sensors)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'sensors')
  return repo
}

test('plugin mode with a registry-shaped sensors.json has no migration and bare --apply is already current', () => {
  const repo = pluginRepo(SENSORS)
  assert.deepEqual(plan(repo).migrations, [])
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /already current/)
  assert.equal(gitIn(repo, 'branch', '--list', 'chore/*'), '')
  assert.equal(status(repo), '')
})

test('plugin mode: an empty {} sensors.json is absent, an old-shape one gets the migration', () => {
  assert.deepEqual(plan(pluginRepo('{}')).migrations, [])
  const repo = pluginRepo(JSON.stringify({ stack: 'node', lint: 'x' }))
  assert.deepEqual(plan(repo).migrations, ['pre-registry-sensors'])
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /pre-registry format/)
  assert.match(gitIn(repo, 'branch', '--list', 'chore/*'), /chore\/rig-upgrade-/)
})

test('a manifest key outside the harness is ignored, reported, and never read, written or deleted', () => {
  const repo = committed()
  const outside = path.join(path.dirname(repo), `outside-${path.basename(repo)}.txt`)
  fs.writeFileSync(outside, 'keep me\n')
  write(repo, 'CLAUDE.md', 'mine\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'claude')
  const bad = ['../outside.txt', `../${path.basename(outside)}`, outside, 'CLAUDE.md']
  editManifest(repo, m => { for (const k of bad) m.files[k] = sha('x') })
  gitIn(repo, 'commit', '-qam', 'bad manifest')
  const p = plan(repo) as ReturnType<typeof plan> & { ignoredManifestKeys: string[] }
  for (const k of bad) { assert.equal(p.files[k], undefined, k); assert.ok(p.ignoredManifestKeys.includes(k), k) }
  assert.match(sdlc(repo, ['upgrade']).stdout, /ignored 4 manifest entries outside the harness/)
  assert.equal(sdlc(repo, ['upgrade', '--diff', '../outside.txt']).code, 1)
  assert.equal(sdlc(repo, ['upgrade', '--diff', 'CLAUDE.md']).code, 1)
  lag(repo, SKILL, 'old\n')
  assert.equal(sdlc(repo, ['upgrade', '--apply']).code, 0)
  assert.equal(fs.readFileSync(outside, 'utf8'), 'keep me\n')
  assert.ok(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8').startsWith('mine\n')) // the merge may add the guides block, never replace or delete it
})

test('the dry run says already current when every file is noop or keep', () => {
  const repo = committed()
  const want = fs.readFileSync(path.join(repo, SKILL), 'utf8')
  lag(repo, SKILL, 'old\n')
  write(repo, SKILL, 'old\nteam note\n')
  gitIn(repo, 'commit', '-qam', 'edit')
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [SKILL]: 'mine' })]).code, 0)
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'upgrade')
  assert.equal(plan(repo).files[SKILL], 'keep')
  assert.equal(manifestOf(repo).files[SKILL], sha(want))
  const r = sdlc(repo, ['upgrade'])
  assert.match(r.stdout, /already current/)
})

test('later overwrites an existing .rig-new and the dry run no longer promises a .rig-new', () => {
  const repo = committed()
  const want = fs.readFileSync(path.join(repo, CORE), 'utf8')
  lag(repo, CORE, 'old\n')
  write(repo, CORE, 'local\n')
  write(repo, `${CORE}.rig-new`, 'stale\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'edit')
  const dry = sdlc(repo, ['upgrade']).stdout
  assert.match(dry, /you choose mine, new or later/)
  assert.doesNotMatch(dry, /goes beside/)
  assert.equal(sdlc(repo, ['upgrade', '--apply', '--decide', JSON.stringify({ [CORE]: 'later' })]).code, 0)
  assert.equal(fs.readFileSync(path.join(repo, `${CORE}.rig-new`), 'utf8'), want)
})

test('on a detached HEAD the recovery line names the HEAD sha, and sync and baseline by name', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  const head = gitIn(repo, 'rev-parse', 'HEAD').trim()
  gitIn(repo, 'checkout', '-q', '--detach')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.ok(r.stdout.includes(`git checkout ${head} `), r.stdout)
  assert.match(r.stdout, /sdlc\.ts sync and sdlc\.ts baseline/)
})

const WORKFLOW = '.github/workflows/rig-check.yml'
const template = (): string => fs.readFileSync(path.resolve(import.meta.dirname, '../templates/rig-check.yml'), 'utf8')

test('a rig-check.yml that differs from the template is flagged, and apply writes .rig-new beside it, never over it', () => {
  const repo = committed()
  write(repo, WORKFLOW, 'name: rig-check\n# an older copy\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'old workflow')
  assert.equal((plan(repo) as { workflow?: string }).workflow, 'differs')
  assert.match(sdlc(repo, ['upgrade']).stdout, /\.github\/workflows\/rig-check\.yml differs from the plugin's template/)
  assert.equal(sdlc(repo, ['upgrade', '--apply']).code, 0)
  assert.equal(fs.readFileSync(path.join(repo, WORKFLOW), 'utf8'), 'name: rig-check\n# an older copy\n')
  assert.equal(fs.readFileSync(path.join(repo, `${WORKFLOW}.rig-new`), 'utf8'), template())
})

test('a current or absent rig-check.yml is left out of the plan', () => {
  const repo = committed()
  assert.equal((plan(repo) as { workflow?: string }).workflow, 'absent')
  write(repo, WORKFLOW, template())
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'current workflow')
  assert.equal((plan(repo) as { workflow?: string }).workflow, 'same')
  assert.doesNotMatch(sdlc(repo, ['upgrade']).stdout, /rig-check\.yml differs/)
})

test('apply leaves one commit on chore/rig-upgrade-*, without .rig-new files (shop_app 2026-10-27)', () => {
  const repo = committed()
  lag(repo, SKILL, 'old\n')
  const r = sdlc(repo, ['upgrade', '--apply'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(gitIn(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), /^chore\/rig-upgrade-/)
  assert.match(gitIn(repo, 'log', '-1', '--format=%s'), /^chore: rig upgrade .* → /)
  assert.match(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.claude\/skills\/rig-/)
  assert.doesNotMatch(gitIn(repo, 'show', '--name-only', '--format=', 'HEAD'), /\.rig-new/)
})
