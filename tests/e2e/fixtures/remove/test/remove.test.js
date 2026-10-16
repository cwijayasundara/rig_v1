import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { Cart } from '../src/cart/cart.js'
import { createHandler } from '../src/http/handler.js'

const catalog = () => {
  const c = new Catalog()
  c.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  c.add({ sku: 'MUG-002', name: 'Mug', priceCents: 1200 })
  return c
}

test('remove deletes the whole line and throws for an absent SKU', () => {
  const cart = new Cart(catalog())
  cart.add('TEA-001', 2)
  cart.add('MUG-002')
  cart.remove('TEA-001')
  assert.deepEqual(cart.lines().map(l => l.sku), ['MUG-002'])
  assert.equal(cart.subtotalCents(), 1200)
  assert.throws(() => cart.remove('TEA-001'), /not in cart/)
})

test('DELETE /cart/<sku> removes the line through the handler', () => {
  const h = createHandler(catalog())
  h({ method: 'POST', path: '/cart', body: { sku: 'MUG-002', qty: 1 } })
  assert.equal(h({ method: 'DELETE', path: '/cart/MUG-002' }).status, 200)
  assert.equal(h({ method: 'DELETE', path: '/cart/MUG-002' }).status, 400)
})
