'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { cents, format } = require('../lib/money')

test('format puts the decimal point and pads cents', () => {
  assert.equal(format(1205), '12.05')
  assert.equal(format(-5), '-0.05')
})
test('cents refuses a non-integer', () => {
  assert.throws(() => cents(1.5), TypeError)
})
