// A live run of `/rig-chart sprint 0: docs/prd/shopping-cart-app-prd.md` stopped because the PRD was a free-form draft,
// not .rig/product/prd/sprint-0.md. init already tells the person to copy such a PRD; chart must do it, not stop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skill = fs.readFileSync(path.resolve(import.meta.dirname, '../skills/chart/SKILL.md'), 'utf8')

test('chart skill: a draft PRD path is converted to the sprint PRD, not a reason to stop', () => {
  assert.match(skill, /\*\*Take it as given\.\*\*[^\n]*\.rig\/product\/prd\/sprint-<N>\.md/)
  assert.match(skill, /FR-n/)
  assert.match(skill, /never invent/i)
})

test('chart skill: the draft is converted only when a path is given, and a missing PRD with no path still stops', () => {
  assert.match(skill, /no path[^\n]*stop/i)
})

test('chart skill: argument-hint accepts any PRD path', () => {
  assert.match(skill, /argument-hint: '<sprint number \| [^']*PRD path/)
})

// A live run of `/rig-chart 1 docs/prd/shopping-cart-app-prd.md` stopped: the argument had no `sprint N:` prefix, so the
// PRD was judged to be in the wrong format. The person's PRD is accepted in any format, from any path; chart only asks
// for what it lacks (technology, NFRs).
test('chart skill: a number and a path in any order is accepted, with no format gate', () => {
  assert.match(skill, /any format/i)
  assert.match(skill, /`<N> <path>`|<N> <path>/)
  assert.doesNotMatch(skill, /written by the product owner and BA from/i)
})

test('chart skill: asks the person for the technology and the NFRs the PRD lacks, and records the answers', () => {
  assert.match(skill, /AskUserQuestion/)
  assert.match(skill, /technology/i)
  assert.match(skill, /NFR/)
  assert.match(skill, /never invent/i)
})
