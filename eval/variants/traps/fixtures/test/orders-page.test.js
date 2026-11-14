import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'
import { loadOrders, failStore } from '../src/orders/orders.js'

const get = () => createHandler(new Catalog())({ method: 'GET', path: '/orders/view' })

test('B18 the page lists the orders with a status label', () => {
  loadOrders([{ id: 'ORD-0001', customer: 'ada', status: 'cancelled', version: 2, lines: [], totalCents: 450, payableCents: 1000 }])
  const r = get()
  assert.equal(r.status, 200)
  assert.match(r.headers['content-type'], /^text\/html/)
  assert.match(r.body, /data-field="statusLabel">Cancelled</)
  assert.match(r.body, /data-field="id">ORD-0001</)
})

test('B18 an empty store renders the empty state', () => {
  loadOrders([])
  assert.match(get().body, /<p>No orders yet<\/p>/)
})

test('B18 a store that throws renders the error state with 503', () => {
  failStore(new Error('down'))
  try {
    const r = get()
    assert.equal(r.status, 503)
    assert.match(r.body, /<p role="alert">/)
  } finally { failStore(null) }
})
