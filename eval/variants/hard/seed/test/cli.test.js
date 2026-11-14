import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CLI = path.join(import.meta.dirname, '../bin/shop.mjs')
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })

test('count prints the number of orders', () => {
  assert.equal(run('count').stdout.trim(), '4')
})

test('export prints the orders as CSV, newest first', () => {
  const r = run('export')
  assert.equal(r.status, 0, r.stderr)
  const lines = r.stdout.trim().split('\n')
  assert.equal(lines[0], 'id,customer,status,units,total,unitAvg')
  assert.equal(lines[1], 'ORD-0004,linus,placed,2,25.00,12.50')
  assert.equal(lines.length, 5)
})

test('--format=csv works as well as --format csv', () => {
  assert.equal(run('export', '--format=csv').stdout, run('export', '--format', 'csv').stdout)
})

test('an unknown flag exits 2 and names it', () => {
  const r = run('export', '--bogus', 'x')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown flag: --bogus/)
})

test('show prints one order', () => {
  assert.equal(run('show', 'ORD-0002').stdout.trim(), 'ORD-0002 grace paid $18.99')
})
