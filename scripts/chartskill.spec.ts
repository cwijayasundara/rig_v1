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
  assert.equal(skill.match(/git commit/g)?.length, 3, 'the allowed-tools grant, the base commit of init output and the one chart commit')
})

test('chart skill: the gap pass is one batched question set that skips when there are no gaps', () => {
  assert.match(skill, /one `AskUserQuestion`[^\n]*(?:batch|at most 4)/i)
  assert.match(skill, /no gaps[^\n]*skip|skip[^\n]*no gaps/i)
})

test('chart skill: ends at the approve gate and does not hand the person a second command', () => {
  assert.doesNotMatch(skill, /Next: `?\/rig:testplan/)
  assert.match(skill, /\/rig:approve chart-<N>/)
})

// A live run of `/rig:chart 1` in shop_app committed the chart on `rig/chart-1` in a repo with no commits: init's output was
// never committed, so there was no `main` for approve, the PR or CI to diff against.
test('chart skill: commits init output as the base after asking, instead of stopping, before any work', () => {
  assert.match(skill, /allowed-tools:[^\n]*Bash\(git rev-parse\*\)/)
  const step1 = skill.slice(skill.indexOf('1. **Which sprint'), skill.indexOf('2. **Architect'))
  assert.match(step1, /git rev-parse --verify HEAD[^\n]*fails/i)
  assert.match(step1, /git status --porcelain[^\n]*\.rig\/sensors\.json/)
  assert.match(step1, /AskUserQuestion[^\n]*Commit init/)
  assert.match(step1, /git commit -m "chore: rig init scaffold"/)
  assert.ok(skill.indexOf('git rev-parse --verify HEAD') < skill.indexOf('**Take it as given.**'), 'checked before the PRD is copied')
})

test('chart skill: names the QA agent model by alias and never launches the architect with a model override', () => {
  assert.match(skill, /model `?sonnet`?/)
  assert.doesNotMatch(skill, /claude-(?:opus|sonnet|haiku)-\d/)
})

test('chart step 2 invokes superpowers:brainstorming by name before the architect and fixes the design doc path and ## Intents shape', () => {
  const body = skill.slice(skill.indexOf('\n---\n', 4))
  assert.match(body, /superpowers:brainstorming/)
  assert.ok(body.indexOf('superpowers:brainstorming') < body.indexOf('rig:architect'))
  assert.match(body, /docs\/superpowers\/specs\/<date>-sprint-<N>-design\.md/)
  assert.match(body, /- <slug>: <one-line scope> \(<PRD ids>\)/)
  assert.doesNotMatch(body, /What's the moment you find yourself wishing/, 'the skill names the brainstorm, it does not restate it')
})

test('the architect brief names the design doc and the design: frontmatter line', () => {
  const architect = fs.readFileSync(path.resolve(import.meta.dirname, '../agents/architect.md'), 'utf8')
  assert.match(architect, /design: <repo-relative path>/)
  assert.match(architect, /one intent per line of the design doc's `## Intents`/)
  assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../templates/architecture-format.md'), 'utf8'), /design: <path or none>/)
})
