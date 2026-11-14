import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CLI = path.join(import.meta.dirname, '../bin/shop.mjs')
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
const HEADER = 'id,customer,payableCents,placedAt'

test('B16 export prints the orders placed on or after the date as CSV, oldest first', () => {
  const r = run('export', '--since', '2026-02-01', '--format', 'csv')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout, `${HEADER}\nORD-0004,linus,2500,2026-02-01T08:00:00Z\nORD-0005,grace,3000,2026-02-01T08:00:00Z\n`)
})

test('B16 --flag=value works as well as --flag value', () => {
  assert.equal(run('export', '--since=2026-02-01', '--format=csv').stdout, run('export', '--since', '2026-02-01', '--format', 'csv').stdout)
})

test('B16 an unknown flag exits 2 and names it', () => {
  const r = run('export', '--since', '2026-02-01', '--format', 'csv', '--bogus')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown flag: --bogus/)
})

test('B16 a format other than csv exits 2', () => {
  assert.equal(run('export', '--since', '2026-02-01', '--format', 'xml').status, 2)
})
