import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const CLI = path.join(import.meta.dirname, '../bin/shop.mjs')
const ids = r => r.stdout.trim().split('\n').slice(1).map(l => l.split(',')[0])
const run = (...args) => spawnSync(process.execPath, [CLI, 'export', ...args], { encoding: 'utf8' })

test('B19 --status keeps only the orders with that status', () => {
  assert.deepEqual(ids(run('--status', 'paid')), ['ORD-0002', 'ORD-0001'])
})

test('B19 --status given twice keeps the orders with either status', () => {
  assert.deepEqual(ids(run('--status', 'paid', '--status', 'cancelled')).sort(), ['ORD-0001', 'ORD-0002', 'ORD-0003'])
})
