import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handle } from '../src/shop.js'

test('B1 lists the products', () => assert.equal(handle({ method: 'GET', path: '/products' }).body.length, 2))
test('B2 adds to the cart and checks out', () => {
  assert.equal(handle({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty: 2 } }).status, 201)
  assert.equal(handle({ method: 'POST', path: '/checkout' }).body.totalCents, 900)
})
