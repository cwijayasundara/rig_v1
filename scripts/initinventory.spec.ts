// After init a person looks for what rig put in the repo. 2026-11-23 rig_v1_test: the plugin-only default copied no skill or agent, the
// README block described .rig/templates/ and .rig/mod/ that were not there, and nothing said where the sensors are.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

const tpl = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/readme-rig.md'), 'utf8')
const layout = tpl.slice(tpl.indexOf('### Layout'), tpl.indexOf('### User guide'))
const rows = [...layout.matchAll(/^\| `([^`]+)` \| ([^\n]*)$/gm)].map(m => ({ rel: m[1]!, text: m[2]! }))
// Written later by the workflow, not by init.
const LATER = ['.rig/.gate']

function present(repo: string, rel: string): boolean {
  const stem = rel.split(/[*<]/)[0]!
  if (stem.endsWith('/') || stem === rel) return fs.existsSync(path.join(repo, stem))
  const dir = path.join(repo, path.dirname(stem))
  return fs.existsSync(dir) && fs.readdirSync(dir).some(n => n.startsWith(path.basename(stem)))
}

function installed(flag: string): { repo: string; stdout: string } {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['init', '--stack', 'python']).code, 0)
  const r = sdlc(repo, ['init', flag])
  assert.equal(r.code, 0, r.stderr)
  return { repo, stdout: r.stdout }
}

test('every path in the README layout table exists after init --full, unless its row says what else it needs', () => {
  const { repo } = installed('--full')
  assert.ok(rows.length >= 10, 'the layout table was parsed')
  const missing = rows.filter(r => !LATER.includes(r.rel) && !/only with/.test(r.text) && !present(repo, r.rel)).map(r => r.rel)
  assert.deepEqual(missing, [])
})

test('after init --plugin the only layout rows with no file are the ones marked "only after" or "only with"', () => {
  const { repo } = installed('--plugin')
  const missing = rows.filter(r => !LATER.includes(r.rel) && !/only (after|with)/.test(r.text) && !present(repo, r.rel)).map(r => r.rel)
  assert.deepEqual(missing, [])
})

test('the README block names all three git hooks, says where the sensors are and never calls vendor the upgrade', () => {
  assert.match(layout, /`pre-commit`, `commit-msg` and `pre-push`/)
  assert.match(layout, /`\.rig\/sensors\.json` \|[^\n]*built-in sensors[^\n]*`\.rig\/bin\/sensors\.ts`/)
  assert.doesNotMatch(tpl, /To upgrade rig, re-run `vendor/)
  assert.match(tpl, /To upgrade rig,[^\n]*`rig:upgrade` skill/)
})

test('init --full prints an inventory that matches what is on disk: skills, agents, hooks, sensors and guides with their paths', () => {
  const { repo, stdout } = installed('--full')
  const count = (name: string): number => Number(new RegExp(`^  ${name}\\s+(\\d+)  `, 'm').exec(stdout)?.[1] ?? -1)
  const skills = fs.readdirSync(path.join(repo, '.claude/skills')).filter(n => n.startsWith('rig-'))
  assert.ok(skills.length >= 10)
  assert.equal(count('skills'), skills.length)
  assert.equal(count('agents'), fs.readdirSync(path.join(repo, '.claude/agents')).length)
  assert.equal(count('guides'), fs.readdirSync(path.join(repo, '.rig/guides')).length)
  const registry = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')) as { sensors: { id: string }[] }
  assert.equal(count('sensors'), registry.sensors.length + 10, 'command sensors plus the ten built in')
  assert.match(stdout, /skills +\d+  \.claude\/skills\/rig-<name>\/SKILL\.md: [^\n]*\bstart\b/)
  assert.match(stdout, /agents +2  \.claude\/agents\/: rig-architect\.md, rig-evaluator\.md/)
  assert.match(stdout, /hooks +\d+  \.claude\/settings\.json: [^\n]*Stop[^\n]*git hooks in \.rig\/githooks\/: commit-msg, pre-commit, pre-push/)
  assert.match(stdout, /sensors +\d+  \.rig\/sensors\.json, \d+ command sensor\(s\): [^\n]*\bunit\b[^\n]*10 built in \(\.rig\/bin\/sensors\.ts\): secrets/)
})

test('init --plugin says the skills, agents and hooks are not in the repo and how to copy them', () => {
  const { stdout } = installed('--plugin')
  assert.match(stdout, /skills +0  none in this repo: the plugin supplies them[^\n]*`init --full` copies them here/)
  assert.match(stdout, /hooks +0  none in \.claude\/settings\.json: the plugin runs them/)
})
