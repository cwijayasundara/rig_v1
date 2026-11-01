import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeJourneyReport } from './report.mjs'

test('the journey report lists test configuration lines such as a pinned evaluator', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rep-'))
  const log = { open: () => [], accepted: () => [], all: () => [] }
  writeJourneyReport(out, { results: [], log, sandbox: '/sb', recordedSet: 'live', costUsd: 0, minutes: 0, extras: null, config: ['evaluator pinned to sonnet (rig ships it on opus)'] })
  assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /Test configuration\n\n- evaluator pinned to sonnet \(rig ships it on opus\)/)
})
