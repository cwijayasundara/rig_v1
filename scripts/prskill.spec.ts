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
  assert.doesNotMatch(ev, /`?spec\.md`?|(?<!implementation-)plan\.md/, 'it reads a chart, not a change (the sprint implementation-plan.md is a chart file)')
})

test('init writes a Review block into CLAUDE.md, and REVIEW.md defers to it', () => {
  const init = repoText('skills/init/SKILL.md')
  assert.match(init, /## Review/)
  assert.match(init, /plan\.md `## Contracts`/)
  assert.match(init, /non-goals/)
  const rv = repoText('templates/REVIEW.md')
  assert.match(rv, /CLAUDE\.md/)
  assert.match(rv, /## Review passes/, 'the managed service keeps its passes')
  assert.match(rv, /## What failure looks like here/)
  assert.match(rv, /## Skip/)
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

test('the security pass checks every touched action against its ## Access row on each interface', () => {
  assert.match(pr(), /`\/security-review all changes since <base>, committed and uncommitted, and every action in `\.rig\/product\/architecture\.md` `## Access`/)
  assert.match(pr(), /for security: [^\n]*every action in `\.rig\/product\/architecture\.md` `## Access`[^\n]*on each interface/)
  assert.match(repoText('templates/REVIEW.md'), /## Access/)
})

test('pr triage never defers or dismisses a finding that cites a ledger id', () => {
  assert.match(pr(), /cites a ledger id[^\n]*never moved to `## Deferred`[^\n]*never dismissed/)
})

test('pr copies Pre-existing findings to review.md, untagged, never fixed and never changing the verdict', () => {
  const t = pr()
  assert.match(t, /`## Pre-existing`/)
  assert.match(t, /Pre-existing[^.]*never fixed/)
})

test('after the fix wave one fresh agent confirms each fixed finding, raising nothing new', () => {
  const t = pr()
  assert.match(t, /templates\/confirm-brief\.md/)
  assert.match(t, / → fixed \(confirmed\)/)
  assert.match(t, / → reopened: <why>/)
  assert.match(t, /a reopened finding keeps `verdict: changes-needed`/)
  const brief = repoText('templates/confirm-brief.md')
  assert.match(brief, /Raise nothing new/)
  assert.match(brief, /<n>\. confirmed/)
  assert.match(brief, /<n>\. reopened: <why>/)
  assert.ok(brief.trimEnd().split('\n').length <= 30)
})
