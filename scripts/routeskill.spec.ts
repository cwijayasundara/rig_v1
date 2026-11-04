// /rig:start takes the quick path only when `S route-check` says `route: quick`; the skill text must carry that wiring.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const text = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/start/SKILL.md'), 'utf8')
const START_LINES = 22

test('start skill: argument-hint accepts --no-route', () => {
  assert.match(text, /argument-hint: '"<request>" \[--full\] \[--no-route\]/)
})

test('start skill: step 1 runs route-check for a free-text request and puts --no-route after the request', () => {
  assert.match(text, /S route-check <type> '<request>'/)
  assert.doesNotMatch(text, /route-check <type> "<request>"/)
  assert.match(text, /each `'` inside the request written `'\\''`/)
  assert.match(text, /append `--no-route` after the request/)
  assert.match(text, /Say "full" to take the full conversation/)
})

test('start skill: a "full" reply before approval discards the seeded spec and runs the whole conversation', () => {
  assert.match(text, /before `\/rig:approve`[^\n]*discard the seeded `spec\.md` behaviours and run step 2 in full/)
})

test('start skill: the quick path never lets a default stand in for a person closing an open question', () => {
  assert.match(text, /a person answers it, never a default you record/)
})

test('start skill: route: quick skips the brainstorm and the question batch', () => {
  assert.match(text, /`route: quick`[^\n]*skip the `superpowers:brainstorming` call and the `AskUserQuestion` batch/)
  assert.match(text, /unchanged: <what>/)
})

test('start skill: the router adds at most 12 lines', () => {
  assert.ok(text.trimEnd().split('\n').length <= START_LINES + 12)
})
