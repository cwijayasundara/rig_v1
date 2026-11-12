// The known failure classes (readiness doc R6) reach the one-change flow: the spec step, the guides and the review, in the core profile too.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { harnessFiles } from './vendor.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the core start skill walks the edge-case list from the vendored templates', () => {
  const core = harnessFiles(true, 'core')
  assert.ok(core.get('.claude/skills/rig-start/SKILL.md')?.includes('.rig/templates/edge-cases.md'))
  assert.ok(core.has('.rig/templates/edge-cases.md'))
})

test('the start skill keeps a cited rule\'s words', () => {
  assert.match(read('skills/start/SKILL.md'), /keeps its words/)
})

test('the guides name concurrent writers and option values', () => {
  assert.match(read('guides/engineering.md'), /Concurrent writers/)
  assert.match(read('guides/engineering.md'), /never takes the next flag/)
  assert.match(read('guides/testing.md'), /two writers at once/)
})

test('REVIEW.md has the robustness pass and grades its findings Important', () => {
  const r = read('templates/REVIEW.md')
  assert.match(r, /\*\*Robustness:\*\*/)
  const important = r.slice(r.indexOf('## What counts as Important'), r.indexOf('## Nits'))
  assert.match(important, /concurrent/)
  assert.match(important, /next flag/)
  assert.match(important, /weaker than the requirement/)
})

test('edge-cases.md says /rig:start walks it too', () => {
  assert.match(read('templates/edge-cases.md').split('\n| Item')[0] ?? '', /\/rig:start walks/)
})
