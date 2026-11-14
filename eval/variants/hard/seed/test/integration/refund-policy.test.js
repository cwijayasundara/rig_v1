// Integration tests: they run with `npm run test:all`, not with `npm test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../../src/catalog/products.js'
import { createHandler } from '../../src/http/handler.js'
import { loadOrders } from '../../src/orders/orders.js'

const DAY = 86_400_000
const order = (id, daysAgo) => ({ id, customer: 'ada', status: 'paid', version: 1, lines: [{ sku: 'TEA-001', qty: 1 }], payableCents: 450, placedAt: new Date(Date.now() - daysAgo * DAY).toISOString() })
const refund = async (handle, id, headers = {}) => handle({ method: 'POST', path: `/orders/${id}/refund`, headers })

test('refund policy: a refund more than 30 days after placement needs a manager, and is 403 without one', async () => {
  loadOrders([order('ORD-0101', 45), order('ORD-0102', 29)])
  const handle = createHandler(new Catalog())
  assert.equal((await refund(handle, 'ORD-0101')).status, 403)
  assert.equal((await refund(handle, 'ORD-0101', { 'x-manager': 'no' })).status, 403)
  assert.equal((await refund(handle, 'ORD-0101', { 'x-manager': 'yes' })).status, 200)
  assert.equal((await refund(handle, 'ORD-0102')).status, 200)
})
