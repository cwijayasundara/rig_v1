// Review (designs 2026-10-21, native review then clean-context review): /rig:pr reviews the delta with a fresh reviewer agent and the bundled /security-review before the PR opens.
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const repoText = (f: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8')
const pr = (): string => repoText('skills/pr/SKILL.md')

test('pr skill reviews with a clean-context agent and /security-review before sdlc.ts pr', () => {
  const t = pr()
  assert.match(t, /review-brief\.md/)
  assert.match(t, /\/security-review/)
  const body = t.slice(t.indexOf('\n---\n', 4))
  assert.ok(body.indexOf('review-brief.md') < body.indexOf('pr <slug> --message'), 'the review comes before the PR is opened')
  assert.match(body, /\/security-review all changes since <base>, committed and uncommitted/, 'its built-in diff misses uncommitted work')
  assert.doesNotMatch(body, /\/code-review/, 'the code pass is no longer the in-session native command')
})

test('the reviewer is a fresh agent that is given the brief and nothing else', () => {
  const t = pr()
  assert.match(t, /launch one `Agent` \(`general-purpose`, `model: sonnet`, foreground\)/)
  assert.match(t, /Give it nothing else: not the plan's reasoning, not this conversation/)
  assert.match(t, /`<base>` and `<slug>`/)
})

test('the builder triages: a dismissal needs a reason, security and contract findings are never dismissed by the builder, and dismissals carry no category tag', () => {
  const t = pr()
  assert.match(t, /A dismissal needs a reason that cites a spec line, a non-goal, or code you read/)
  assert.match(t, /Never dismiss a `security`, `contract`, `design` or `unmapped` finding yourself/)
  assert.match(t, /## Dismissed[^\n]*no category tag/)
})

test('pr skill reviews the delta since the verified base and scales scrutiny with contract changes', () => {
  const t = pr()
  assert.match(t, /all changes since <base>, committed and uncommitted/)
  assert.match(t, /plan\.md `## Contracts` lists a change[^\n]*This change edits contracts/)
})

test('pr skill no longer launches the evaluator', () => {
  assert.doesNotMatch(pr(), /rig:evaluator/)
})

test('pr skill keeps the review.md categories, the security fallback and a single commit', () => {
  const t = pr()
  assert.match(t, /do not run `S pr`: leave review\.md for the person/, 'a check that failed twice does not ship')
  assert.match(t, /\[category:/)
  assert.match(t, /review\.md/)
  assert.match(t, /no `origin` remote[^\n]*general-purpose/, 'security review has a fallback for a repo without a remote')
  assert.doesNotMatch(t, /fix\(review\)|docs\(review\)/)
})

test('evaluator is chart-only', () => {
  const ev = repoText('agents/evaluator.md')
  assert.match(ev, /## Chart mode|^You review a sprint chart/m)
  assert.doesNotMatch(ev, /git diff <base>/)
  assert.doesNotMatch(ev, /\*\*Security:\*\*|\*\*Correctness:\*\*|\*\*Design:\*\*|\*\*Contracts:\*\*/)
  assert.doesNotMatch(ev, /`?spec\.md`?|plan\.md/, 'it reads a chart, not a change')
})

test('init writes a Review block into CLAUDE.md, and REVIEW.md defers to it', () => {
  const init = repoText('skills/init/SKILL.md')
  assert.match(init, /## Review/)
  assert.match(init, /plan\.md `## Contracts`/)
  assert.match(init, /non-goals/)
  const rv = repoText('templates/REVIEW.md')
  assert.match(rv, /CLAUDE\.md/)
  assert.match(rv, /## Review passes/, 'the managed service keeps its passes')
})

test('after the fix wave the verdict says what ships: fixed findings are marked and a review with nothing left open is a pass', () => {
  const t = pr()
  assert.match(t, /append ` → fixed` to each line/, 'a fixed finding stays under ## Findings (the learning loop mines it) but says so')
  assert.match(t, /set `verdict: pass` when every item under `## Findings` is now marked fixed/, 'the verdict is rewritten after the fixes, not left at the pre-fix value')
})

test('after a ship the pr skill names the next queued intent at rung 1 or above', () => {
  assert.match(pr(), /`S queue next`[^\n]*rung/)
  assert.match(pr(), /Queue: <next slug> is ready/)
})

test('a design finding is never dismissed by the builder: fixed, or left under Findings with the sentence the doc should change', () => {
  assert.match(pr(), /Never dismiss a `security`, `contract`, `design` or `unmapped` finding yourself/)
  assert.match(pr(), /`design` finding is fixed in the wave[^\n]*stays under `## Findings` \(never `## Deferred`\)[^\n]*naming the sentence of the doc/)
})

test('a design finding whose fix names a doc sentence is left open, never fixed from a change', () => {
  assert.match(pr(), /Leave a `design` or `unmapped` finding open[^\n]*design-doc sentence[^\n]*a change never edits the design doc/)
})

test('an unmapped finding is never dismissed by the builder: removed, or left open naming the doc line to add', () => {
  assert.match(pr(), /correctness, security, contract, design, unmapped, data/)
  assert.match(pr(), /`unmapped` finding is fixed by removing the behaviour[^\n]*stays open under `## Findings`/)
  assert.match(pr(), /`## Unverifiable`[^\n]*never change the verdict/)
})

test('with no design doc, an unmapped finding left open names the intent line a chart edit should add', () => {
  assert.match(pr(), /`unmapped`[^\n]*no design doc[^\n]*intent/)
  assert.match(repoText('templates/review-brief.md'), /the doc line that would cover it \(the design doc's, else the intent's\)/)
})
