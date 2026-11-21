// The journey dashboard is opt-in (`--dashboard`): it needs Claude Code's experimental Code Mode, so a plain standalone install ships no mod,
// marketplace or plugin entries, and --dashboard adds them plus the Code Mode flag in the person's settings.local.json (never the team's settings.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write } from './testkit.ts'

const json = (repo: string, rel: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'))
const has = (repo: string, rel: string): boolean => fs.existsSync(path.join(repo, rel))
const installed = (flags: string[] = []): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const r = sdlc(repo, ['vendor', '--standalone', ...flags])
  assert.equal(r.code, 0, r.stderr)
  return repo
}

test('a plain standalone install ships no dashboard: no mod, marketplace, plugin entry or Code Mode flag', () => {
  const repo = installed()
  assert.equal(has(repo, '.rig/mod'), false)
  assert.equal(has(repo, '.claude-plugin/marketplace.json'), false)
  assert.equal(has(repo, '.claude/settings.local.json'), false)
  const settings = json(repo, '.claude/settings.json')
  assert.equal('rig@rig-local' in (settings.enabledPlugins ?? {}), false)
  assert.equal('rig-local' in (settings.extraKnownMarketplaces ?? {}), false)
  assert.equal(settings.env?.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE, undefined)
})

test('--dashboard installs the mod and turns Code Mode on in settings.local.json, keeping what is already there', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.claude/settings.local.json', JSON.stringify({ env: { MINE: '1' }, model: 'x' }))
  const r = sdlc(repo, ['vendor', '--standalone', '--dashboard'])
  assert.equal(r.code, 0, r.stderr)
  assert.ok(has(repo, '.rig/mod/hooks/dashboard.tsx'))
  assert.equal(json(repo, '.claude-plugin/marketplace.json').plugins[0].source, './.rig/mod')
  assert.equal(json(repo, '.claude/settings.json').enabledPlugins['rig@rig-local'], true)
  assert.deepEqual(json(repo, '.claude/settings.local.json'), { env: { MINE: '1', CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' }, model: 'x' })
  assert.equal(json(repo, '.claude/settings.json').env?.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE, undefined, 'the team file never carries the experimental flag')
  assert.match(r.stdout, /Code Mode/)
})

test('a re-run without --dashboard keeps an installed dashboard', () => {
  const repo = installed(['--dashboard'])
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.ok(has(repo, '.rig/mod/hooks/dashboard.tsx'))
  assert.equal(json(repo, '.claude/settings.json').enabledPlugins['rig@rig-local'], true)
})

test('--dashboard needs --standalone and the full profile', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.notEqual(sdlc(repo, ['vendor', '--dashboard']).code, 0)
  const core = sdlc(repo, ['vendor', '--standalone', '--profile', 'core', '--dashboard'])
  assert.notEqual(core.code, 0)
  assert.match(core.stderr + core.stdout, /full profile/)
})

test('init --full --dashboard passes the flag through', () => {
  const repo = makeRepo()
  const r = sdlc(repo, ['init', '--full', '--dashboard'])
  assert.equal(r.code, 0, r.stderr)
  assert.ok(has(repo, '.rig/mod/hooks/dashboard.tsx'))
})

test('the plugin session-start hook warns when the repo also carries a standalone copy', () => {
  const repo = installed()
  const r = sdlc(repo, ['hook', 'session-start'], { input: '{}' })
  assert.equal(r.code, 0)
  assert.match(r.stdout, /both the plugin and a standalone copy/)
  assert.match(r.stdout, /--plugin-dir|disable the plugin/)
})

test('a plugin-only repo gets no double-install warning', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const r = sdlc(repo, ['hook', 'session-start'], { input: '{}' })
  assert.doesNotMatch(r.stdout, /both the plugin and a standalone copy/)
})
