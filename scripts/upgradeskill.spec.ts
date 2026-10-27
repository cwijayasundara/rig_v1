// /rig:upgrade (design 2026-10-26-rig-upgrade): a dry run first, one batch of questions for the conflicts, then an apply that never pushes.
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const skill = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/upgrade/SKILL.md'), 'utf8')
const body = skill.slice(skill.indexOf('\n---\n', 4))

test('upgrade skill: sonnet, medium effort, under 60 lines', () => {
  assert.match(skill, /^---\nname: upgrade\n[\s\S]*?\nmodel: sonnet\neffort: medium\n[\s\S]*?\n---/)
  assert.ok(skill.trimEnd().split('\n').length < 60, 'the skill is under 60 lines')
})

test('upgrade skill: the dry run comes first, then the decisions, then the apply', () => {
  assert.match(body, /upgrade --json/)
  assert.ok(body.indexOf('upgrade --json') < body.indexOf('AskUserQuestion'), 'the dry run precedes the questions')
  assert.ok(body.indexOf('AskUserQuestion') < body.indexOf('upgrade --apply --decide'), 'the questions precede the apply')
  assert.match(body, /--decide '<json>'/)
  assert.match(body, /--add-sensors/)
})

test('upgrade skill: one AskUserQuestion batch for all conflicts, with the four choices', () => {
  assert.match(body, /ONE `?AskUserQuestion`? (batch|call)/)
  assert.match(body, /one question per conflicting file/)
  assert.match(body, /entries whose value is `"conflict"`/)
  for (const c of ['keep mine', 'take new', 'show diff', 'write .rig-new']) assert.ok(body.includes(c), `choice: ${c}`)
  assert.match(body, /upgrade --diff <file>/)
  assert.match(body, /multiSelect/)
})

test('upgrade skill: never pushes, never hand-edits sensors or the manifest, stops when apply refuses', () => {
  assert.doesNotMatch(skill, /git push/)
  const tools = /^allowed-tools: (.*)$/m.exec(skill)?.[1] ?? ''
  assert.ok(!/git push|git commit|git \*|Write|Edit/.test(tools), `allowed-tools: ${tools}`)
  assert.match(tools, /sdlc\.ts \*\)/)
  assert.match(body, /never edit `\.rig\/sensors\.json` or the manifest by hand/i)
  assert.match(body, /apply refuses[^\n]*stop/i)
  assert.match(body, /Next: review and merge the branch; nothing was pushed/)
})

test('upgrade skill: the apply commits on its branch and the person merges it (shop_app 2026-10-27)', () => {
  assert.match(body, /commits what it wrote in one commit `chore: rig upgrade <from> → <to>`/)
  assert.match(body, /The person merges that branch/)
})
