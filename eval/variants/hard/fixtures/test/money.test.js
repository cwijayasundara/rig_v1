import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dollars } from '../src/money.js'

test('B16 a price rounds half up to the cent', () => {
  assert.deepEqual([dollars(2.675), dollars(1.005), dollars(0.125), dollars(7)], ['2.68', '1.01', '0.13', '7.00'])
})

test('B16 a price below the half cent rounds down', () => {
  assert.equal(dollars(2.674), '2.67')
})
