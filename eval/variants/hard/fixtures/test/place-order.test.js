import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'
import { seedStock } from '../src/inventory/inventory.js'

const setup = () => {
  const catalog = new Catalog()
  catalog.add({ sku: 'GIZ-001', name: 'Gizmo', priceCents: 1000 })
  seedStock({ 'GIZ-001': 3 })
  return createHandler(catalog)
}
const place = (handle, qty) => handle({ method: 'POST', path: '/orders/place', body: { customer: 'ada', sku: 'GIZ-001', qty } })

test('B17 placing an order answers 201 and reserves the stock', async () => {
  const handle = setup()
  const r = await place(handle, 2)
  assert.deepEqual([r.status, r.body.customer, r.body.lines[0].qty], [201, 'ada', 2])
  assert.equal((await place(handle, 2)).status, 409, 'only one unit is left')
})

test('B17 with less stock than asked, it is 409 and nothing is reserved', async () => {
  const handle = setup()
  assert.equal((await place(handle, 4)).status, 409)
  assert.equal((await place(handle, 3)).status, 201, 'the failed order reserved nothing')
})
