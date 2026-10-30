// shop_app sprint 0 (2026-10-29): 18 questions at /rig:start for intents the chart had already specified; a settled intent asks none.
// The settled line itself is pinned in chart.spec.ts, beside the other `new --source` cases.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('start skill: a settled intent asks nothing; the chart skill and edge-case checklist carry the four items', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', p), 'utf8')
  assert.match(read('skills/start/SKILL.md'), /`settled: yes`: ask nothing/)
  const chart = read('skills/chart/SKILL.md')
  assert.match(chart, /templates\/edge-cases\.md/)
  assert.match(chart, /\(default at chart\)/)
  for (const item of ['Concurrent commands', 'File and path edge cases', 'Option parsing', 'Failure exit codes']) assert.match(read('templates/edge-cases.md'), new RegExp(`\\| ${item} \\|`))
})
