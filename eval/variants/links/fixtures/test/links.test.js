import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog, productPath } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { checkout } from '../src/orders/orders.js'
import { createHandler } from '../src/http/handler.js'

const catalog = () => {
  const c = new Catalog()
  c.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  return c
}

test('B7 an order line carries the path of its product page', () => {
  const cart = new Cart(catalog())
  cart.add('TEA-001', 2)
  assert.equal(checkout(cart).lines[0].href, productPath('TEA-001'))
  assert.equal(checkout(cart).lines[0].href, '/products/TEA-001')
})

test('B7 GET /products/<sku> serves the product, and 404 when it is unknown', () => {
  const handle = createHandler(catalog())
  assert.deepEqual(handle({ method: 'GET', path: '/products/TEA-001' }), { status: 200, body: { sku: 'TEA-001', name: 'Green tea', priceCents: 450 } })
  assert.equal(handle({ method: 'GET', path: '/products/NOPE-999' }).status, 404)
})
