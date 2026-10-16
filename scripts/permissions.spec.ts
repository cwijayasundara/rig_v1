// The settings template must allow every skill and gh command a skill tells the model to run: the eval pilot's denials (2026-10-16).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const allow = (): string[] => JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/settings.json'), 'utf8')).permissions.allow
const SKILLS = fs.readdirSync(path.join(ROOT, 'skills'))
const MODEL_SKILLS = fs.readdirSync(path.join(ROOT, 'skills')).filter(s => !/^disable-model-invocation: true$/m.test(fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8')))

test('every skill or gh command a skill tells the model to run is allowed', () => {
  const rules = allow()
  for (const s of MODEL_SKILLS) {
    const text = fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '')
    for (const [, name] of text.matchAll(/\/rig:([a-z]+)/g)) {
      if (name === 'approve' || name === 'waive' || name === s || !SKILLS.includes(name)) continue // the person runs these; a self-reference is no chain; /rig:x is a placeholder
      assert.ok(rules.includes(`Skill(rig:${name})`) && rules.includes(`Skill(rig:${name} *)`), `${s} runs /rig:${name}`)
    }
    for (const [, sub] of text.matchAll(/`gh pr ([a-z]+)/g)) assert.ok(rules.includes(`Bash(gh pr ${sub} *)`), `${s} runs gh pr ${sub}`)
  }
})

test('the template never lets the model invoke approve or waive, or the Skill tool unscoped', () => {
  const rules = allow()
  assert.deepEqual(rules.filter(r => /^Skill\(rig:(approve|waive)\b/.test(r) || r === 'Skill' || /^Skill\(rig ?\*?\)$/.test(r) || r === 'Bash(gh *)'), [])
})

test('init --full adds the new allow rules to an existing settings.json and keeps the team\'s', () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(make test)'] } }, null, 2))
  sdlc(repo, ['init', '--full'])
  const got: string[] = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')).permissions.allow
  assert.ok(got.includes('Bash(make test)'), 'the team rule stays')
  assert.ok(got.includes('Skill(rig:test *)') && got.includes('Bash(gh pr comment *)'), JSON.stringify(got))
})
