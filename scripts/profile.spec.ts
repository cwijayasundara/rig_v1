// The core profile: `vendor --standalone --profile core` copies only rig-core (readiness doc §2 Step 0), and keeps it that way.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'
import { CORE_SKILLS, OFF_COMMANDS } from './profile.ts'
import { harnessFiles } from './vendor.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const dirs = (repo: string, rel: string): string[] => fs.existsSync(path.join(repo, rel)) ? fs.readdirSync(path.join(repo, rel)).sort() : []
const json = (repo: string, rel: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'))
const coreRepo = (): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const r = sdlc(repo, ['vendor', '--standalone', '--profile', 'core'])
  assert.equal(r.code, 0, r.stderr)
  return repo
}

test('vendor --standalone --profile core writes only the core skills and agents', () => {
  const repo = coreRepo()
  assert.deepEqual(dirs(repo, '.claude/skills'), CORE_SKILLS.map(s => `rig-${s}`).sort())
  assert.deepEqual(dirs(repo, '.claude/agents'), ['rig-evaluator.md'])
  assert.equal(fs.existsSync(path.join(repo, '.rig/mod')), false)
  const settings = json(repo, '.claude/settings.json')
  assert.equal('rig@rig-local' in (settings.enabledPlugins ?? {}), false)
  assert.equal('rig-local' in (settings.extraKnownMarketplaces ?? {}), false)
})

test('the core manifest records the profile and hashes only what was written', () => {
  const repo = coreRepo()
  const manifest = json(repo, '.rig/bin/MANIFEST.json')
  assert.equal(manifest.profile, 'core')
  const missing = Object.keys(manifest.files).filter(rel => !fs.existsSync(path.join(repo, rel)))
  assert.deepEqual(missing, [])
})

test('plain --standalone is unchanged and records no profile key', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  const all = fs.readdirSync(path.join(ROOT, 'skills')).filter(s => s !== 'upgrade').map(s => `rig-${s}`).sort()
  assert.deepEqual(dirs(repo, '.claude/skills'), all)
  assert.equal(json(repo, '.rig/bin/MANIFEST.json').profile, undefined)
})

test('switching full to core removes untouched off skills and keeps an edited one', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  fs.appendFileSync(path.join(repo, '.claude/skills/rig-wiki/SKILL.md'), '\nmy note\n')
  const r = sdlc(repo, ['vendor', '--standalone', '--profile', 'core'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fs.existsSync(path.join(repo, '.claude/skills/rig-chart')), false)
  assert.equal(fs.existsSync(path.join(repo, '.claude/agents/rig-architect.md')), false)
  assert.equal(fs.existsSync(path.join(repo, '.claude/skills/rig-wiki/SKILL.md')), true)
  assert.match(r.stdout, /kept \.claude\/skills\/rig-wiki\/SKILL\.md \(edited\)/)
})

test('bad profile values fail', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  for (const bad of [['--profile'], ['--profile', 'Core'], ['--profile', 'lite']]) {
    const r = sdlc(repo, ['vendor', '--standalone', ...bad])
    assert.equal(r.code, 1, bad.join(' '))
    assert.match(r.stderr, /use core or full/)
  }
  const r = sdlc(repo, ['vendor', '--profile', 'core'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /--profile needs --standalone/)
})

test('no core skill or core README names an off command', () => {
  const off = new RegExp(`/rig[:-](${OFF_COMMANDS.join('|')})\\b`)
  assert.equal(off.test('/rig:approve'), false)
  const named = [...harnessFiles(true, 'core')]
    .filter(([rel]) => rel.endsWith('SKILL.md') || rel === '.rig/templates/readme-rig.md')
    .filter(([, text]) => off.test(text)).map(([rel, text]) => `${rel}: ${text.match(off)?.[0]}`)
  assert.deepEqual(named, [])
})

test('the core README block is the core template', () => {
  const text = fs.readFileSync(path.join(coreRepo(), '.rig/templates/readme-rig.md'), 'utf8')
  assert.match(text, /<!-- rig:begin/)
  assert.match(text, /\/rig-start/)
  assert.doesNotMatch(text, /\/rig-chart|\.rig\/product\//)
})

test('full vendors no core template', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.equal(fs.existsSync(path.join(repo, '.rig/templates/readme-rig-core.md')), false)
})
