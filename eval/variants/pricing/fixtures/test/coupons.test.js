import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { checkout } from '../src/orders/orders.js'

const cartOf = (priceCents, qty = 1, stock) => {
  const catalog = new Catalog()
  catalog.add({ sku: 'AAA-001', name: 'a', priceCents, ...(stock === undefined ? {} : { stock }) })
  const cart = new Cart(catalog)
  cart.add('AAA-001', qty)
  return cart
}

test('B11 FIVEOFF takes 500 cents off an order of 2000 or more and refuses a smaller one', () => {
  assert.throws(() => checkout(cartOf(1999), { code: 'FIVEOFF', customer: 'c1' }), /coupon minimum not met: FIVEOFF/)
  assert.equal(checkout(cartOf(2000), { code: 'FIVEOFF', customer: 'c1' }).discountCents, 500)
})

test('B11 SHIPFREE removes the shipping and replaces the large-order discount', () => {
  const o = checkout(cartOf(6000), { code: 'SHIPFREE', customer: 'c2' })
  assert.deepEqual([o.discountCents, o.shippingCents], [0, 0])
})

test('B11 a coupon works once per customer', () => {
  checkout(cartOf(3000), { code: 'FIVEOFF', customer: 'c3' })
  assert.throws(() => checkout(cartOf(3000), { code: 'FIVEOFF', customer: 'c3' }), /coupon already used: FIVEOFF/)
  assert.equal(checkout(cartOf(3000), { code: 'FIVEOFF', customer: 'c4' }).discountCents, 500)
})

test('B11 a failed order does not use the coupon up', () => {
  assert.throws(() => checkout(cartOf(1000), { code: 'FIVEOFF', customer: 'c5' }), /minimum/)
  assert.equal(checkout(cartOf(2500), { code: 'FIVEOFF', customer: 'c5' }).discountCents, 500)
})

test('B11 the stock check comes before the code check', () => {
  assert.throws(() => checkout(cartOf(1000, 3, 2), { code: 'NOPE', customer: 'c6' }), /insufficient stock: AAA-001/)
  assert.throws(() => checkout(cartOf(1000), { code: 'NOPE', customer: 'c6' }), /unknown discount code: NOPE/)
})
