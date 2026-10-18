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

test('pr fixes every review finding without asking, re-verifies with the script and commits review.md once', () => {
  const pr = skill('pr')
  assert.doesNotMatch(pr, /only when the person agrees/)
  assert.match(pr, /every item under `## Findings`[^.]*without asking/i)
  assert.match(pr, /`## Deferred`[^.]*(leave|stay)/i)
  // /rig:test would hand back to /rig:pr and review again: the fix wave re-verifies with the script.
  assert.match(pr, /run `S verify <slug>`/)
  assert.doesNotMatch(pr, /rerun `\/rig:test <slug>`, then/)
  assert.match(pr, /S pr <slug> --message "fix\(review\): [^"]*"/)
  assert.match(pr, /S pr <slug> --message "docs\(review\): <slug>"/)
  assert.match(pr, /never a second review/i)
  assert.match(pr, /same (check|finding) fails twice[^.]*stop/i)
  assert.match(pr, /stop and tell the person[^.]*plan\.md does not list/i)
})
