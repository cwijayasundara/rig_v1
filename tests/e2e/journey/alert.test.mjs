import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createViolationLog } from './violations.mjs'
import { alert, summarise } from './alert.mjs'

const mk = triage => createViolationLog({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'alert-')), run: 'r', sandbox: '/sb', triage })
const add = (log, item) => log.add({ stage: item.split('.')[0], item, severity: 'block', evidence: `e-${item}`, note: 'n', session: 's', area: 'unknown' })
const spies = () => { const c = { notify: 0, bell: 0, lines: [] }; return { c, opts: { notify: () => c.notify++, bell: () => c.bell++, print: l => c.lines.push(l) } } }

test('alert returns 0 and stays quiet when only accepted violations exist', () => {
  const log = mk({ 'J1.1': { decision: 'accept', reason: 'r' } }); add(log, 'J1.1')
  const { c, opts } = spies()
  assert.equal(alert(log, opts), 0)
  assert.equal(c.notify, 0); assert.equal(c.bell, 0)
})

test('alert returns 1 and rings and notifies once each for an open violation', () => {
  const log = mk({}); add(log, 'J1.1')
  const { c, opts } = spies()
  assert.equal(alert(log, opts), 1)
  assert.equal(c.notify, 1); assert.equal(c.bell, 1)
  assert.ok(c.lines.join('\n').includes('e-J1.1'))
})

test('summarise shows at most five open violations with evidence and the violations.md path', () => {
  const log = mk({}); for (let i = 1; i <= 7; i++) add(log, `J1.${i}`)
  const s = summarise(log, { stages: [{ stage: 'J1', status: 'fail' }], costUsd: 1.5, minutes: 3 })
  assert.equal((s.match(/e-J1\./g) ?? []).length, 5)
  assert.match(s, /violations\.md/)
  assert.match(s, /\$1\.50/)
})
