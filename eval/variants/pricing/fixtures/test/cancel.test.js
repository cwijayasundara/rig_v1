import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { checkout, cancelOrder, listOrders } from '../src/orders/orders.js'

const shop = (stock = 5) => {
  const catalog = new Catalog()
  catalog.add({ sku: 'AAA-001', name: 'a', priceCents: 2500, stock })
  const cart = new Cart(catalog)
  cart.add('AAA-001', 2)
  return { catalog, cart }
}

test('B12 orders get sequential ids and status placed, and a failed checkout does not use an id', () => {
  const { cart } = shop()
  const a = checkout(cart)
  assert.throws(() => checkout(new Cart(new Catalog())), /cart is empty/)
  const b = checkout(cart)
  assert.deepEqual([a.status, Number(b.id.slice(4)) - Number(a.id.slice(4))], ['placed', 1])
  assert.match(a.id, /^ORD-\d{4}$/)
})

test('B12 cancelling puts the stock back and marks the order cancelled', () => {
  const { catalog, cart } = shop(5)
  const o = checkout(cart)
  assert.equal(catalog.get('AAA-001').stock, 3)
  assert.equal(cancelOrder(o.id).status, 'cancelled')
  assert.equal(catalog.get('AAA-001').stock, 5)
})

test('B12 cancelling frees the coupon for that customer', () => {
  const { cart } = shop()
  const o = checkout(cart, { code: 'FIVEOFF', customer: 'z1' })
  assert.throws(() => checkout(cart, { code: 'FIVEOFF', customer: 'z1' }), /already used/)
  cancelOrder(o.id)
  assert.equal(checkout(cart, { code: 'FIVEOFF', customer: 'z1' }).discountCents, 500)
})

test('B12 cancelling twice or an unknown id throws, and listOrders is newest first', () => {
  const { cart } = shop()
  const first = checkout(cart), second = checkout(cart)
  cancelOrder(first.id)
  assert.throws(() => cancelOrder(first.id), new RegExp(`order already cancelled: ${first.id}`))
  assert.throws(() => cancelOrder('ORD-9999'), /unknown order: ORD-9999/)
  const ids = listOrders().map(o => o.id)
  assert.ok(ids.indexOf(second.id) < ids.indexOf(first.id))
  assert.equal(listOrders().find(o => o.id === first.id).status, 'cancelled')
})
