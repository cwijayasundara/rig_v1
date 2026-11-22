// One copy of rig per repo: `init --plugin` is for a person who loads rig as a plugin (claude --plugin-dir). It installs only the checker
// (.rig/bin), git hooks and settings permissions; skills, agents and hooks come from the plugin, so nothing is listed twice.
// It also removes a standalone copy an earlier `init --full` left behind (the shop-app "installed twice" warning).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write } from './testkit.ts'

const has = (repo: string, rel: string): boolean => fs.existsSync(path.join(repo, rel))
const settings = (repo: string): Record<string, any> => JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))

test('init --plugin installs the checker and permissions but no skills, agents or settings hooks', () => {
  const repo = makeRepo()
  const r = sdlc(repo, ['init', '--plugin'])
  assert.equal(r.code, 0, r.stderr)
  assert.ok(has(repo, '.rig/bin/sdlc.ts'))
  assert.equal(has(repo, '.claude/skills/rig-start'), false)
  assert.equal(has(repo, '.claude/agents'), false)
  assert.equal(settings(repo).hooks, undefined)
  assert.ok(settings(repo).permissions.deny.length > 0)
})

test('init --plugin removes the standalone copy an earlier init --full wrote, keeps edited files and the project\'s own hooks', () => {
  const repo = makeRepo()
  sdlc(repo, ['init', '--full'])
  assert.ok(has(repo, '.claude/skills/rig-start/SKILL.md'))
  write(repo, '.claude/skills/rig-chart/SKILL.md', 'mine\n')
  const s = settings(repo); s.hooks.Stop = [...s.hooks.Stop, { hooks: [{ type: 'command', command: 'echo mine' }] }]
  write(repo, '.claude/settings.json', JSON.stringify(s))
  const r = sdlc(repo, ['init', '--plugin'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(has(repo, '.claude/skills/rig-start'), false)
  assert.equal(has(repo, '.claude/agents/rig-evaluator.md'), false)
  assert.equal(has(repo, '.claude/skills/rig-chart/SKILL.md'), true, 'an edited file stays')
  assert.match(r.stdout, /kept .claude\/skills\/rig-chart\/SKILL.md/)
  assert.deepEqual(Object.keys(settings(repo).hooks), ['Stop'])
  assert.equal(settings(repo).hooks.Stop[0].hooks[0].command, 'echo mine')
  assert.doesNotMatch(JSON.stringify(settings(repo).hooks), /rig\/bin\/sdlc/)
})

test('init --plugin twice changes nothing the second time', () => {
  const repo = makeRepo()
  sdlc(repo, ['init', '--plugin'])
  const before = fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')
  assert.equal(sdlc(repo, ['init', '--plugin']).code, 0)
  assert.equal(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'), before)
})
