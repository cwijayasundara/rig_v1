import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Catalog } from '../src/catalog/products.js'
import { createHandler } from '../src/http/handler.js'

const shop = (n = 0) => {
  const catalog = new Catalog()
  catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  const handle = createHandler(catalog)
  for (let i = 0; i < n; i++) { handle({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty: 1 } }); handle({ method: 'POST', path: '/checkout' }) }
  return handle
}
const get = (handle, path, headers = {}) => handle({ method: 'GET', path, headers })

test('B13 an unknown order is a problem document with a request id', () => {
  const r = get(shop(), '/orders/ORD-9999', { 'x-request-id': 'abc' })
  assert.deepEqual([r.status, r.headers['content-type'], r.headers['x-request-id']], [404, 'application/problem+json', 'abc'])
  assert.deepEqual(r.body, { type: 'https://shop.example/errors/not-found', title: 'Not Found', status: 404, detail: r.body.detail })
  assert.match(get(shop(), '/orders/ORD-9999').headers['x-request-id'], /^req-/)
})

test('B13 the list pages newest first with an opaque cursor', () => {
  const handle = shop(5)
  const a = get(handle, '/orders?limit=2'), b = get(handle, `/orders?limit=2&cursor=${a.body.nextCursor}`), c = get(handle, `/orders?limit=2&cursor=${b.body.nextCursor}`)
  const ids = r => r.body.items.map(o => o.id.slice(4))
  assert.deepEqual([ids(a), ids(b), ids(c), c.body.nextCursor], [[expect(5), expect(4)].map(Number).map(n => String(n).padStart(4, '0')), ['0003', '0002'], ['0001'], null])
  assert.equal(a.headers['cache-control'], 'no-store')
})
const expect = n => n

test('B13 a bad limit or cursor is a 400 problem, and the default limit is 20', () => {
  const handle = shop(21)
  for (const q of ['limit=0', 'limit=51', 'limit=abc']) assert.match(get(handle, `/orders?${q}`).body.type, /invalid-limit$/)
  assert.match(get(handle, '/orders?cursor=nonsense').body.type, /invalid-cursor$/)
  assert.equal(get(handle, '/orders').body.items.length, 20)
})

test('B13 an order has a version and a strong etag, and a matching if-none-match is a 304 without a body', () => {
  const handle = shop(1)
  const r = get(handle, '/orders/ORD-0001')
  assert.deepEqual([r.status, r.body.version, r.headers.etag], [200, 1, '"ORD-0001-v1"'])
  const again = get(handle, '/orders/ORD-0001', { 'if-none-match': '"ORD-0001-v1"' })
  assert.deepEqual([again.status, again.body, again.headers.etag], [304, undefined, '"ORD-0001-v1"'])
})

test('B13 a method the path does not serve is a 405 with allow', () => {
  const handle = shop(1)
  assert.deepEqual([handle({ method: 'POST', path: '/orders' }).status, handle({ method: 'POST', path: '/orders' }).headers.allow], [405, 'GET'])
  assert.equal(handle({ method: 'DELETE', path: '/orders/ORD-0001' }).headers.allow, 'GET')
})
