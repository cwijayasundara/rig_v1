'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Ledger } = require('../lib/ledger')

test('balance sums the entries of one account', () => {
  const l = new Ledger().add('cash', 500).add('cash', -120).add('rent', 900)
  assert.equal(l.balance('cash'), 380)
})
test('accounts lists each account once, sorted', () => {
  assert.deepEqual(new Ledger().add('b', 1).add('a', 1).add('b', 2).accounts(), ['a', 'b'])
})
test('add requires an account', () => {
  assert.throws(() => new Ledger().add('', 1), /account is required/)
})
