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

// The first live run of `/rig-chart 1` found four PRD gaps only after the architect ran, kept the answers out of the PRD, ended at
// "Next: /rig:testplan" and had no independent review (design 2026-10-18-chart-one-turn-and-reviewer).
test('chart skill: runs gap pass, architect, QA and review before one commit', () => {
  for (const w of ['answered at chart', 'chart-review.md', 'rig:evaluator', 'general-purpose', 'sonnet']) assert.ok(skill.includes(w), w)
  assert.ok(skill.indexOf('chart-review.md') < skill.lastIndexOf('git commit'), 'the commit comes after the review')
  assert.equal(skill.match(/git commit/g)?.length, 2, 'one commit instruction plus the allowed-tools grant')
})

test('chart skill: the gap pass is one batched question set that skips when there are no gaps', () => {
  assert.match(skill, /one `AskUserQuestion`[^\n]*(?:batch|at most 4)/i)
  assert.match(skill, /no gaps[^\n]*skip|skip[^\n]*no gaps/i)
})

test('chart skill: ends at the approve gate and does not hand the person a second command', () => {
  assert.doesNotMatch(skill, /Next: `?\/rig:testplan/)
  assert.match(skill, /\/rig:approve chart-<N>/)
})

test('chart skill: names the QA agent model by alias and never launches the architect with a model override', () => {
  assert.match(skill, /model `?sonnet`?/)
  assert.doesNotMatch(skill, /claude-(?:opus|sonnet|haiku)-\d/)
})
