// The inner loop runs on its own between the two places a person acts (owner, 2026-10-18): start runs through to the plan,
// a person approves, then build runs through code, verify, PR, one review and the fix of its findings.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const skill = (s: string): string => fs.readFileSync(path.resolve(import.meta.dirname, '..', 'skills', s, 'SKILL.md'), 'utf8')

test('start continues into plan in the same turn, and plan stops only for the approval', () => {
  assert.match(skill('start'), /continue with `\/rig:plan <slug>` in this turn/i)
  assert.doesNotMatch(skill('start'), /End with `Next: \/rig:plan/)
  assert.match(skill('plan'), /Next: \/rig:approve <slug> \(a person\), then \/rig:build <slug>/)
})

test('build continues into test, and test into pr, in the same turn', () => {
  assert.match(skill('build'), /continue with `\/rig:test <slug>` in this turn/i)
  assert.match(skill('test'), /continue with `\/rig:pr <slug>` in this turn/i)
})

test('pr fixes every review finding without asking, re-verifies with the script and commits review.md once, in the one PR commit', () => {
  const pr = skill('pr')
  assert.doesNotMatch(pr, /only when the person agrees/)
  assert.match(pr, /every item under `## Findings`[^.]*without asking/i)
  assert.match(pr, /go to Deferred/i)
  // /rig:test would hand back to /rig:pr and review again: the fix wave re-verifies with the script.
  assert.match(pr, /run `S verify <slug>`/)
  assert.doesNotMatch(pr, /rerun `\/rig:test <slug>`, then/)
  assert.match(pr, /S pr <slug> --message "<type\(scope\): summary>"` once/)
  assert.doesNotMatch(pr, /fix\(review\)|docs\(review\)/)
  assert.match(pr, /never a second review/i)
  assert.match(pr, /`S activate <slug>` so the hooks guard the fixes/)
  assert.match(pr, /After a stop in step 4 for an unplanned file[^.]*still ship review\.md/)
  assert.match(pr, /same (check|finding) fails twice[^.]*stop/i)
  assert.match(pr, /stop and tell the person[^.]*plan\.md does not list/i)
})

test('start invokes superpowers:brainstorming on the intent and ends with spec.md holding ## Blast radius; plan invokes superpowers:writing-plans into plan.md', () => {
  const s = skill('start'), p = skill('plan')
  assert.match(s, /superpowers:brainstorming/); assert.match(s, /## Blast radius/); assert.match(s, /the design doc is frozen/)
  assert.doesNotMatch(s, /Delegate code searches to one `Explore` agent/, 'the brainstorm does its own recon')
  assert.match(p, /superpowers:writing-plans/); assert.match(p, /plans hold interfaces and acceptance tests, never code/)
  assert.match(p, /not `docs\/superpowers\/plans\/`[^\n]*skip the skill's execution-method question/)
  assert.match(p, /## Files[^\n]*inside[^\n]*## Blast radius/)
})

test('the chart and start brainstorms are handed the code wiki as cited, warn-only recon', () => {
  for (const name of ['chart', 'start']) { const t = skill(name); assert.match(t, /\.rig\/wiki\/index\.md/, name); assert.match(t, /stale page[^.]*hint[^.]*never as fact/, name) }
})

test('nothing after approve asks the person a question except the existing stop cases', () => {
  // start asks its foreseen questions in one AskUserQuestion batch before the spec (sprint 1 run findings, F7); the rest never ask.
  for (const name of ['build', 'test', 'pr', 'plan']) assert.doesNotMatch(skill(name), /AskUserQuestion/, `${name} must not ask`)
})
