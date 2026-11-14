import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'
import { loadOrders } from '../src/orders/orders.js'

const order = (id, customer, payableCents, status = 'placed') => ({ id, customer, status, version: 1, lines: [], payableCents })
const get = path => createHandler(new Catalog())({ method: 'GET', path })

test('B17 top customers by spend: cancelled orders do not count, ties go by name, limit bounds the list', () => {
  loadOrders([order('1', 'ada', 500), order('2', 'bob', 900), order('3', 'ada', 400), order('4', 'cy', 900), order('5', 'dee', 5000, 'cancelled')])
  const r = get('/reports/top-customers?limit=2')
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.items, [{ customer: 'ada', spendCents: 900, orders: 2 }, { customer: 'bob', spendCents: 900, orders: 1 }])
  assert.equal(get('/reports/top-customers').body.items.length, 3)
})

test('B17 a limit out of range is a 400 invalid-limit problem', () => {
  for (const q of ['0', '101', 'abc']) assert.equal(get(`/reports/top-customers?limit=${q}`).status, 400)
})
