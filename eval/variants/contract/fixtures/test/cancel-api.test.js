import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'

const shop = (n = 1) => {
  const catalog = new Catalog()
  catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  const handle = createHandler(catalog)
  for (let i = 0; i < n; i++) { handle({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty: 1 } }); handle({ method: 'POST', path: '/checkout' }) }
  return handle
}
const cancel = (handle, id, headers = {}) => handle({ method: 'POST', path: `/orders/${id}/cancel`, headers })
const etag = (handle, id) => handle({ method: 'GET', path: `/orders/${id}` }).headers.etag
const last = handle => handle({ method: 'GET', path: '/orders?limit=1' }).body.items[0].id

test('B14 cancel needs the current etag: 404 first, then 428, then 412', () => {
  const handle = shop(), id = last(handle)
  assert.equal(cancel(handle, 'ORD-9999').status, 404)
  assert.match(cancel(handle, id).body.type, /precondition-required$/)
  assert.deepEqual([cancel(handle, id, { 'if-match': '"stale"' }).status, cancel(handle, id, { 'if-match': '"stale"' }).headers['content-type']], [412, 'application/problem+json'])
})

test('B14 cancel succeeds with a new etag, and a second cancel is 409', () => {
  const handle = shop(), id = last(handle)
  const ok = cancel(handle, id, { 'if-match': etag(handle, id) })
  assert.deepEqual([ok.status, ok.body.status, ok.body.version, ok.headers.etag], [200, 'cancelled', 2, `"${id}-v2"`])
  assert.match(cancel(handle, id, { 'if-match': etag(handle, id) }).body.type, /already-cancelled$/)
  assert.equal(cancel(handle, id, { 'if-match': `"${id}-v1"` }).status, 412)
})

test('B14 an idempotency key replays a success, refuses another order, and does not remember a failure', () => {
  const handle = shop(2)
  const [b, a] = handle({ method: 'GET', path: '/orders' }).body.items.map(o => o.id)
  assert.equal(cancel(handle, a, { 'idempotency-key': 'k1' }).status, 428)
  const first = cancel(handle, a, { 'if-match': etag(handle, a), 'idempotency-key': 'k1' })
  const replay = cancel(handle, a, { 'idempotency-key': 'k1' })
  assert.deepEqual([first.status, replay.status, replay.headers['idempotent-replay'], replay.headers.etag, replay.body], [200, 200, 'true', first.headers.etag, first.body])
  assert.equal(first.headers['idempotent-replay'], undefined)
  assert.match(cancel(handle, b, { 'if-match': etag(handle, b), 'idempotency-key': 'k1' }).body.type, /idempotency-conflict$/)
})
