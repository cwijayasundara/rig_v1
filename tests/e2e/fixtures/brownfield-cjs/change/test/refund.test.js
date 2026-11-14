'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Ledger } = require('../lib/ledger')

test('B1: a refund reverses part of an account balance', () => {
  const l = new Ledger().add('cash', 500).refund('cash', 200)
  assert.equal(l.balance('cash'), 300)
})
test('B2: a refund above the balance or not positive is refused', () => {
  const l = new Ledger().add('cash', 100)
  assert.throws(() => l.refund('cash', 101), /exceeds balance/)
  assert.throws(() => l.refund('cash', 0), /positive/)
})
