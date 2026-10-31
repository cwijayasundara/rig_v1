import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createViolationLog, loadTriage } from './violations.mjs'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'viol-'))
const v = (item, over = {}) => ({ stage: item.split('.')[0], item, severity: 'block', evidence: 'src/x.py:1', note: 'n', session: 'sessions/01.jsonl', area: 'unknown', ...over })

test('add writes one JSON line with the spec fields and the id is the item', () => {
  const dir = tmp()
  const log = createViolationLog({ dir, run: 'r1', sandbox: '/sb', triage: {} })
  log.add(v('J1.3'))
  const [line] = fs.readFileSync(path.join(dir, 'violations.jsonl'), 'utf8').trim().split('\n')
  assert.deepEqual(JSON.parse(line), { id: 'J1.3', stage: 'J1', item: 'J1.3', severity: 'block', evidence: 'src/x.py:1', note: 'n', sandbox: '/sb', session: 'sessions/01.jsonl', area: 'unknown', run: 'r1' })
})

test('an accepted id lands in accepted() not open()', () => {
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: '/sb', triage: { 'J1.3': { decision: 'accept', reason: 'known' } } })
  log.add(v('J1.3')); log.add(v('J2.1'))
  assert.deepEqual(log.open().map(x => x.id), ['J2.1'])
  assert.deepEqual(log.accepted().map(x => x.id), ['J1.3'])
})

test('a wontfix id is not open; a fix id stays open', () => {
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: '/sb', triage: { A: { decision: 'wontfix' }, B: { decision: 'fix' } } })
  log.add(v('A.1', { item: 'A' })); log.add(v('B.1', { item: 'B' }))
  assert.deepEqual(log.open().map(x => x.id), ['B'])
})

test('toMarkdown lists open violations before accepted ones', () => {
  const log = createViolationLog({ dir: tmp(), run: 'r', sandbox: '/sb', triage: { 'J1.3': { decision: 'accept', reason: 'known' } } })
  log.add(v('J1.3')); log.add(v('J2.1'))
  const md = log.toMarkdown()
  assert.ok(md.indexOf('J2.1') < md.indexOf('J1.3'), md)
  assert.match(md, /accepted/i)
})

test('loadTriage returns {} for a missing file or invalid JSON', () => {
  const dir = tmp()
  fs.writeFileSync(path.join(dir, 'bad.json'), '{nope')
  assert.deepEqual(loadTriage(path.join(dir, 'missing.json')), {})
  assert.deepEqual(loadTriage(path.join(dir, 'bad.json')), {})
})
