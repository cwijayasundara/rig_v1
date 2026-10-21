import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { checkout } from '../src/orders/orders.js'

const shop = (...products) => {
  const c = new Catalog()
  for (const p of products) c.add(p)
  return c
}

test('B8 a product keeps an optional stock, and omitted means unlimited', () => {
  const c = shop({ sku: 'TEA-001', name: 'Green tea', priceCents: 450, stock: 5 }, { sku: 'MUG-002', name: 'Mug', priceCents: 1200 })
  assert.equal(c.get('TEA-001').stock, 5)
  assert.equal('stock' in c.get('MUG-002'), false)
  assert.throws(() => c.add({ sku: 'ABC-123', name: 'x', priceCents: 1, stock: -1 }), /stock/)
})

test('B8 an order for more than the stock fails whole and changes nothing', () => {
  const c = shop({ sku: 'TEA-001', name: 'Green tea', priceCents: 450, stock: 2 }, { sku: 'MUG-002', name: 'Mug', priceCents: 1200, stock: 5 })
  const cart = new Cart(c)
  cart.add('MUG-002', 1)
  cart.add('TEA-001', 3)
  assert.throws(() => checkout(cart), /insufficient stock: TEA-001/)
  assert.equal(c.get('TEA-001').stock, 2)
  assert.equal(c.get('MUG-002').stock, 5)
  assert.equal(cart.lines().length, 2)
})

test('B8 a line of 10 is fine and a line of 11 is over the limit', () => {
  const c = shop({ sku: 'TEA-001', name: 'Green tea', priceCents: 100 })
  const cart = new Cart(c)
  cart.add('TEA-001', 10)
  assert.equal(checkout(cart).subtotalCents, 1000)
  cart.add('TEA-001', 11)
  assert.throws(() => checkout(cart), /quantity over limit: TEA-001/)
})

test('B8 the stock check comes before the line limit', () => {
  const c = shop({ sku: 'TEA-001', name: 'Green tea', priceCents: 100, stock: 5 })
  const cart = new Cart(c)
  cart.add('TEA-001', 11)
  assert.throws(() => checkout(cart), /insufficient stock/)
})

test('B8 10% off at 5000 cents and above, none below', () => {
  const order = cents => { const c = shop({ sku: 'TEA-001', name: 'x', priceCents: cents }); const cart = new Cart(c); cart.add('TEA-001', 1); return checkout(cart) }
  assert.equal(order(5000).discountCents, 500)
  assert.equal(order(4999).discountCents, 0)
})

test('B8 the discount rounds half up to whole cents', () => {
  const c = shop({ sku: 'TEA-001', name: 'x', priceCents: 5005 })
  const cart = new Cart(c)
  cart.add('TEA-001', 1)
  const o = checkout(cart)
  assert.deepEqual([o.discountCents, o.totalCents], [501, 4504])
})

test('B8 the discount is on the order subtotal, a code replaces it, and stock goes down', () => {
  const c = shop({ sku: 'TEA-001', name: 'x', priceCents: 3000, stock: 4 }, { sku: 'MUG-002', name: 'y', priceCents: 3000, stock: 4 })
  const cart = new Cart(c)
  cart.add('TEA-001', 1)
  cart.add('MUG-002', 1)
  assert.equal(checkout(cart).discountCents, 600)
  assert.equal(checkout(cart, { code: 'SAVE20' }).discountCents, 1200)
  assert.equal(c.get('TEA-001').stock, 2)
})

test('B9 adding a SKU already in the cart replaces its quantity, still one line', () => {
  const cart = new Cart(shop({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 }))
  cart.add('TEA-001', 2)
  cart.add('TEA-001', 1)
  assert.deepEqual(cart.lines(), [{ sku: 'TEA-001', qty: 1, unitCents: 450 }])
  assert.equal(cart.subtotalCents(), 450)
})
