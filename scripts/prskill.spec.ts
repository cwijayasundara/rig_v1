// Native review (design 2026-10-21): /rig:pr reviews the delta with the bundled /code-review and /security-review before the PR opens.
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoText = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')
const pr = (): string => repoText('skills/pr/SKILL.md')

test('pr skill reviews with /code-review and /security-review before sdlc.ts pr', () => {
  const t = pr()
  assert.match(t, /\/code-review/)
  assert.match(t, /\/security-review/)
  assert.ok(t.indexOf('/code-review') < t.indexOf('pr <slug> --message'), 'the review comes before the PR is opened')
})

test('pr skill reviews the delta since the verified base, and passes an explicit effort', () => {
  const t = pr()
  assert.match(t, /all changes since <base>, committed and uncommitted/)
  assert.match(t, /`medium`/)
  assert.match(t, /`high`[^\n]*tier L/)
})

test('pr skill no longer launches the evaluator', () => {
  assert.doesNotMatch(pr(), /rig:evaluator/)
})

test('pr skill keeps the review.md categories, the security fallback and a single commit', () => {
  const t = pr()
  assert.match(t, /\[category:/)
  assert.match(t, /review\.md/)
  assert.match(t, /no `origin` remote[^\n]*general-purpose/, 'security review has a fallback for a repo without a remote')
  assert.doesNotMatch(t, /fix\(review\)|docs\(review\)/)
})

test('evaluator is chart-only', () => {
  const ev = repoText('agents/evaluator.md')
  assert.match(ev, /## Chart mode|^You review a sprint chart/m)
  assert.doesNotMatch(ev, /git diff <base>/)
  assert.doesNotMatch(ev, /\*\*Security:\*\*/)
})

test('init writes a Review block into CLAUDE.md, and REVIEW.md defers to it', () => {
  const init = repoText('skills/init/SKILL.md')
  assert.match(init, /## Review/)
  assert.match(init, /plan\.md `## Contracts`/)
  assert.match(init, /non-goals/)
  const rv = repoText('templates/REVIEW.md')
  assert.match(rv, /CLAUDE\.md/)
  assert.doesNotMatch(rv, /## Review passes/)
})
