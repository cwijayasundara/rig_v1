import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'

test('B15 the receipt of an order is plain text with its lines and its payable total', () => {
  const catalog = new Catalog()
  catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  const handle = createHandler(catalog)
  handle({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty: 2 } })
  const order = handle({ method: 'POST', path: '/checkout' }).body
  const r = handle({ method: 'GET', path: `/orders/${order.id}/receipt` })
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /^text\/plain/)
  assert.equal(r.body, `Receipt ${order.id}\n2 x TEA-001\nTotal: ${(order.payableCents / 100).toFixed(2)}\n`)
})

test('B15 a receipt for an unknown order is a 404 problem', () => {
  const r = createHandler(new Catalog())({ method: 'GET', path: '/orders/ORD-9999/receipt' })
  assert.equal(r.status, 404)
  assert.equal(r.headers['content-type'], 'application/problem+json')
})
