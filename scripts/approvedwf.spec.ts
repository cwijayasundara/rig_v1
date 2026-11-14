// templates/rig-approved.yml re-runs the rig-check job when a review lands, so an approval grants requested waivers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const yml = fs.readFileSync(path.join(ROOT, 'templates/rig-approved.yml'), 'utf8')

test('rig-approved.yml triggers on submitted and dismissed reviews, with actions: write', () => {
  assert.match(yml, /on:\s*\n\s+pull_request_review:\s*\n\s+types: \[submitted, dismissed\]/)
  assert.match(yml, /actions: write/)
})

test('rig-approved.yml re-runs only the rig-check job, for same-repo PRs', () => {
  assert.match(yml, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/)
  assert.match(yml, /select\(\.name == "rig-check"\)/)
  assert.match(yml, /gh run rerun "\$run" --job "\$job"/)
  assert.match(yml, /workflows\/rig-check\.yml\/runs\?head_sha=/)
})

test('vendoring workflows writes .github/workflows/rig-approved.yml', () => {
  const repo = makeRepo()
  const r = sdlc(repo, ['init', '--full', '--workflows'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(fs.readFileSync(path.join(repo, '.github/workflows/rig-approved.yml'), 'utf8'), yml)
})
