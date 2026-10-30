// shop_app sprint 0 (2026-10-28): three /rig:start runs failed on "skill not found" while the superpowers plugin was disabled.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { superpowersState, superpowersWarning, SUPERPOWERS } from './superpowers.ts'
import { makeRepo, sdlc, write } from './testkit.ts'

const home = (entries: object[] | null): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-home-'))
  if (entries) write(dir, 'plugins/installed_plugins.json', JSON.stringify({ version: 2, plugins: { [SUPERPOWERS]: entries } }))
  return dir
}

test('superpowers: missing without an install, ok with a user install or one for this repo, disabled when the repo switches it off', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-repo-'))
  assert.equal(superpowersState(repo, home(null)), 'missing')
  assert.equal(superpowersState(repo, home([{ scope: 'project', projectPath: '/somewhere/else' }])), 'missing')
  assert.equal(superpowersState(repo, home([{ scope: 'user' }])), 'ok')
  assert.equal(superpowersState(repo, home([{ scope: 'project', projectPath: repo }])), 'ok')
  write(repo, '.claude/settings.json', JSON.stringify({ enabledPlugins: { [SUPERPOWERS]: false } }))
  assert.equal(superpowersState(repo, home([{ scope: 'user' }])), 'disabled')
})

test('superpowers: a missing plugin is one warning line that names the install command, and none when it is usable', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-repo-'))
  assert.match(superpowersWarning(repo, home(null)), /^WARNING: superpowers is not installed.*\/plugin install superpowers@claude-plugins-official/)
  assert.equal(superpowersWarning(repo, home([{ scope: 'user' }])), '')
})

test('start-brief and `superpowers` warn, never fail, when the plugin is absent', () => {
  const repo = makeRepo()
  const env = { CLAUDE_CONFIG_DIR: home(null) }
  const brief = sdlc(repo, ['start-brief'], { env })
  assert.equal(brief.code, 0, brief.stderr)
  assert.match(brief.stdout, /WARNING: superpowers is not installed/)
  const cmd = sdlc(repo, ['superpowers'], { env })
  assert.equal(cmd.code, 0)
  assert.match(cmd.stdout, /WARNING: superpowers/)
  const ok = sdlc(repo, ['superpowers'], { env: { CLAUDE_CONFIG_DIR: home([{ scope: 'user' }]) } })
  assert.equal(ok.stdout.trim(), 'superpowers: ok')
})

test('start, plan, chart and init tell the model what to do without superpowers', () => {
  const skill = (n: string) => fs.readFileSync(path.resolve(import.meta.dirname, `../skills/${n}/SKILL.md`), 'utf8')
  assert.match(skill('start'), /superpowers `WARNING`, skip the `Skill` call/)
  assert.match(skill('plan'), /`S superpowers` prints a `WARNING`/)
  assert.match(skill('chart'), /Run `S superpowers`: on a `WARNING`/)
  assert.match(skill('init'), /\*\*Superpowers\.\*\*/)
})

test('superpowers: user settings disable it, the project overrides the user, the local file overrides the project', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-repo-'))
  const h = home([{ scope: 'user' }])
  write(h, 'settings.json', JSON.stringify({ enabledPlugins: { [SUPERPOWERS]: false } }))
  assert.equal(superpowersState(repo, h), 'disabled')
  write(repo, '.claude/settings.json', JSON.stringify({ enabledPlugins: { [SUPERPOWERS]: true } }))
  assert.equal(superpowersState(repo, h), 'ok')
  write(repo, '.claude/settings.json', JSON.stringify({ enabledPlugins: { [SUPERPOWERS]: false } }))
  write(repo, '.claude/settings.local.json', JSON.stringify({ enabledPlugins: { [SUPERPOWERS]: true } }))
  assert.equal(superpowersState(repo, h), 'ok')
})

test('superpowers: a project install matches the repo through symlinks', () => {
  const real = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-real-')))
  const link = `${real}-link`
  fs.symlinkSync(real, link)
  assert.equal(superpowersState(link, home([{ scope: 'project', projectPath: real }])), 'ok')
})
