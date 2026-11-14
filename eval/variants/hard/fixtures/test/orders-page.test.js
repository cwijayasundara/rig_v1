import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'
import { loadOrders } from '../src/orders/orders.js'

const orders = n => Array.from({ length: n }, (_, i) => ({ id: `ORD-${String(i + 1).padStart(4, '0')}`, customer: 'ada', status: 'paid', version: 1, lines: [{ sku: 'TEA-001', qty: 1 }], payableCents: 450, placedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }))
const get = (handle, page) => handle({ method: 'GET', path: `/orders?page=${page}` })

test('B18 a page has 20 orders, newest first, with the total', () => {
  loadOrders(orders(45))
  const handle = createHandler(new Catalog())
  const r = get(handle, 1)
  assert.deepEqual([r.status, r.body.items.length, r.body.items[0].id, r.body.page, r.body.total], [200, 20, 'ORD-0045', 1, 45])
  assert.equal(get(handle, 3).body.items.length, 5)
  assert.equal(get(handle, 4).body.items.length, 0)
})

test('B18 a page that is not a positive integer is 400', () => {
  loadOrders(orders(3))
  assert.equal(get(createHandler(new Catalog()), 0).status, 400)
})
