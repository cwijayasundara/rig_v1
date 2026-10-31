import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { checkout } from '../src/orders/orders.js'

const shop = (...products) => {
  const catalog = new Catalog()
  for (const p of products) catalog.add(p)
  return { catalog, cart: new Cart(catalog) }
}

test('B10 the discount is split across lines in proportion, leftover cents to the earliest lines, and tax is rounded half up per line', () => {
  const { cart } = shop({ sku: 'AAA-001', name: 'a', priceCents: 3333 }, { sku: 'BBB-002', name: 'b', priceCents: 3333 }, { sku: 'CCC-003', name: 'c', priceCents: 3334 })
  for (const sku of ['AAA-001', 'BBB-002', 'CCC-003']) cart.add(sku, 1)
  const o = checkout(cart, { code: 'SAVE10', customer: 'p1' })
  assert.deepEqual(o.lines.map(l => l.discountCents), [334, 333, 333])
  assert.deepEqual(o.lines.map(l => l.taxCents), [247, 248, 248])
  assert.equal(o.taxCents, 743)
})

test('B10 a product with taxable false pays no tax', () => {
  const { cart } = shop({ sku: 'AAA-001', name: 'a', priceCents: 1000, taxable: false }, { sku: 'BBB-002', name: 'b', priceCents: 1000 })
  cart.add('AAA-001', 1); cart.add('BBB-002', 1)
  assert.equal(checkout(cart).taxCents, 83)
  assert.throws(() => new Catalog().add({ sku: 'AAA-001', name: 'a', priceCents: 1, taxable: 'no' }), /taxable/)
})

test('B10 shipping is 599 unless the order after its discount is 7500 or more', () => {
  const ship = cents => { const { cart } = shop({ sku: 'AAA-001', name: 'a', priceCents: cents }); cart.add('AAA-001', 1); return checkout(cart).shippingCents }
  assert.equal(ship(8333), 0)
  assert.equal(ship(8332), 599)
  assert.equal(ship(2000), 599)
})

test('B10 an order of digital products only ships free, a mixed one does not', () => {
  const { cart } = shop({ sku: 'AAA-001', name: 'a', priceCents: 900, digital: true }, { sku: 'BBB-002', name: 'b', priceCents: 900 })
  cart.add('AAA-001', 1)
  assert.equal(checkout(cart).shippingCents, 0)
  cart.add('BBB-002', 1)
  assert.equal(checkout(cart).shippingCents, 599)
})

test('B10 totalCents is unchanged and payableCents adds shipping and tax', () => {
  const { cart } = shop({ sku: 'AAA-001', name: 'a', priceCents: 2000 })
  cart.add('AAA-001', 1)
  const o = checkout(cart)
  assert.deepEqual([o.totalCents, o.shippingCents, o.taxCents, o.payableCents], [2000, 599, 165, 2764])
})
