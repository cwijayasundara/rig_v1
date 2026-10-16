// CI/CD templates and the incident skill: what remains after step 4a (rig-review goes in Task 4 of that plan).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const yml = (name: string): string => fs.readFileSync(path.join(ROOT, 'templates', name), 'utf8')
const jobsOf = (t: string): Record<string, string> => {
  const body = t.slice(t.indexOf('\njobs:\n') + 7)
  const parts = body.split(/\n(?=  [\w-]+:\n)/)
  return Object.fromEntries(parts.map(p => [p.trim().split(':')[0], p]))
}
const spendJob = (name: string): string => {
  const j = jobsOf(yml(name)).spend
  assert.ok(j && j.includes('contents: write'), `${name} has a spend job`)
  return j
}

test('the incident skill records when service was restored', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'skills/incident/SKILL.md'), 'utf8'), /`restored:`/)
})

test('rig-review passes the one change slug to the spend job through env, never inline', () => {
  const t = yml('rig-review.yml'), job = spendJob('rig-review.yml')
  assert.match(t, /slug: \$\{\{ steps\.model\.outputs\.slug \}\}/)
  assert.match(job, /SLUG: \$\{\{ needs\.review\.outputs\.slug \}\}/)
  assert.match(job, /\$\{SLUG:\+--slug "\$SLUG"\}/)
  assert.doesNotMatch(job.slice(job.indexOf('run: |')), /\$\{\{/, 'no expression inside the run script')
})
