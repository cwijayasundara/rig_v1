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

test('the start walk is for uncharted changes and asks before inventing a mechanism', () => {
  const line = read('skills/start/SKILL.md').split('\n').find(l => l.includes('edge-cases.md')) ?? ''
  assert.match(line, /no charted intent/)
  assert.match(line, /ADR/)
  assert.match(line, /## Open questions/)
})

test('concurrency rules defer to a declared single writer and do not trust a rename', () => {
  assert.match(read('guides/engineering.md'), /single writer/)
  assert.match(read('guides/engineering.md'), /atomic rename alone does not stop lost updates/)
  assert.match(read('guides/engineering.md'), /click|commander/)
  assert.match(read('templates/REVIEW.md'), /single writer/)
})

test('the plan step shows the weakening warnings to the person before approval', () => {
  assert.match(read('skills/plan/SKILL.md'), /WARNING weakened/)
})

test('J3 concurrency follows the journey PRD\'s single-process decision, and J3.11 lets equivalent wording pass', () => {
  const j3 = read('tests/e2e/journey/rubrics/J3.md')
  assert.match(read('tests/e2e/journey/prd/sprint-1-library-desk.md'), /single user, one process at a time: no locking/)
  assert.match(j3.split('\n').find(l => l.startsWith('- J3.10')) ?? '', /no locking|adds no lock/)
  assert.match(j3.split('\n').find(l => l.startsWith('- J3.11')) ?? '', /other words/)
})
