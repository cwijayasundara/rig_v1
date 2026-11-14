import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'
import { loadOrders } from '../src/orders/orders.js'

const order = (id, status = 'paid') => ({ id, customer: 'ada', status, version: 1, lines: [{ sku: 'TEA-001', qty: 1 }], payableCents: 450, placedAt: new Date().toISOString() })
const post = (handle, id) => handle({ method: 'POST', path: `/orders/${id}/refund` })

test('B15 a refund answers 200 with the order refunded', () => {
  loadOrders([order('ORD-0201')])
  const r = post(createHandler(new Catalog()), 'ORD-0201')
  assert.deepEqual([r.status, r.body.status], [200, 'refunded'])
})

test('B15 an unknown order is 404', () => {
  loadOrders([])
  assert.equal(post(createHandler(new Catalog()), 'ORD-9999').status, 404)
})

test('B15 an order already refunded or cancelled is 409', () => {
  loadOrders([order('ORD-0202', 'refunded'), order('ORD-0203', 'cancelled')])
  const handle = createHandler(new Catalog())
  assert.deepEqual([post(handle, 'ORD-0202').status, post(handle, 'ORD-0203').status], [409, 409])
})
