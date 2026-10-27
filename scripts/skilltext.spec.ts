// Skill-text pickups (proposal 2026-10-25 A2-A4): the rules live in the skills, so a spec pins that they stay there.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const text = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8')

test('plan asks for end-to-end phases as a checkbox list, and points at the show-me views', () => {
  const plan = text('skills/plan/SKILL.md')
  assert.match(plan, /## Phases/)
  assert.match(plan, /- \[ \] Phase N/)
  assert.match(plan, /thin end-to-end step/)
  assert.match(plan, /templates\/show-me\.md/)
})

test('build ticks phases and resumes at the first unticked one', () => {
  assert.match(text('skills/build/SKILL.md'), /first unticked phase/)
})

test('the pr outline and the plan share one show-me template that has the diff, tree and call-tree views', () => {
  assert.match(text('skills/pr/SKILL.md'), /templates\/show-me\.md/)
  const t = text('templates/show-me.md')
  for (const w of ['`diff`', 'file tree', 'call tree']) assert.ok(t.includes(w), w)
})

test('start keeps open questions a person\'s, orders documents by recency and asks about the design system for UI', () => {
  const start = text('skills/start/SKILL.md')
  assert.match(start, /only a person closes an open question/)
  assert.match(start, /the latest wins/)
  assert.match(start, /design system/)
})

test('start is a grill and reports the weight; plan writes light plans itself in 30 lines', () => {
  const start = text('skills/start/SKILL.md'), plan = text('skills/plan/SKILL.md')
  assert.match(start, /one question at a time/)
  assert.match(start, /S weight <slug>/)
  assert.match(start, /--full/)
  assert.match(plan, /S weight <slug>/)
  assert.match(plan, /`light`: do not invoke `superpowers:writing-plans`[^]*at most 30 lines/)
  assert.match(plan, /`full`: invoke `superpowers:writing-plans`/)
})
