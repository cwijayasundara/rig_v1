// A transport-agnostic router: handle({ method, path, body, headers }) -> { status, body, headers }
// The /orders routes follow docs/api-conventions.md; the older routes keep their { status, body } and plain { error } bodies.
import { randomBytes } from 'node:crypto'
import { Cart } from '../cart/cart.js'
import { checkout, listOrders, getOrder } from '../orders/orders.js'
import { productPath } from '../catalog/products.js'

const TITLES = { 400: 'Bad Request', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 412: 'Precondition Failed', 428: 'Precondition Required', 422: 'Unprocessable Entity' }
const problem = (status, slug, detail, headers = {}) => ({
  status, headers: { 'content-type': 'application/problem+json', ...headers },
  body: { type: `https://shop.example/errors/${slug}`, title: TITLES[status], status, detail },
})
const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json', ...headers }, body })
const etagOf = o => `"${o.id}-v${o.version}"`

function ordersRoute({ method, url, headers }, replays) {
  const one = /^\/orders\/([^/]+)$/.exec(url.pathname)
  if (url.pathname === '/orders') {
    if (method !== 'GET') return problem(405, 'method-not-allowed', 'Use GET.', { allow: 'GET' })
    const raw = url.searchParams.get('limit')
    if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 50)) return problem(400, 'invalid-limit', 'limit must be an integer from 1 to 50.')
    const limit = raw === null ? 20 : Number(raw)
    const all = listOrders()
    let start = 0
    const cursor = url.searchParams.get('cursor')
    if (cursor !== null) {
      const at = all.findIndex(o => o.id === Buffer.from(cursor, 'base64url').toString())
      if (at < 0) return problem(400, 'invalid-cursor', 'cursor does not name an order.')
      start = at + 1
    }
    const items = all.slice(start, start + limit)
    const nextCursor = start + limit < all.length ? Buffer.from(items.at(-1).id).toString('base64url') : null
    return json(200, { items, nextCursor }, { 'cache-control': 'no-store' })
  }
  if (one) {
    if (method !== 'GET') return problem(405, 'method-not-allowed', 'Use GET.', { allow: 'GET' })
    const order = getOrder(one[1])
    if (!order) return problem(404, 'not-found', `No order ${one[1]}.`)
    if (headers['if-none-match'] === etagOf(order)) return { status: 304, headers: { etag: etagOf(order) }, body: undefined }
    return json(200, order, { etag: etagOf(order) })
  }
  return problem(404, 'not-found', 'No such route.')
}

export function createHandler(catalog) {
  const cart = new Cart(catalog)
  const replays = new Map() // idempotency-key -> { id, res }
  return function handle({ method, path, body = {}, headers = {} }) {
    const url = new URL(path, 'http://shop')
    if (url.pathname === '/orders' || url.pathname.startsWith('/orders/')) {
      const res = ordersRoute({ method, url, headers }, replays)
      return { ...res, headers: { ...res.headers, 'x-request-id': headers['x-request-id'] ?? `req-${randomBytes(4).toString('hex')}` } }
    }
    try {
      if (method === 'GET' && path === '/products') return { status: 200, body: catalog.list() }
      if (method === 'GET' && path.startsWith('/products/')) {
        const product = catalog.get(decodeURIComponent(path.slice('/products/'.length)))
        return product && path === productPath(product.sku) ? { status: 200, body: product } : { status: 404, body: { error: 'not found' } }
      }
      if (method === 'POST' && path === '/cart') {
        cart.add(body.sku, body.qty)
        return { status: 201, body: cart.lines() }
      }
      if (method === 'DELETE' && path.startsWith('/cart/')) {
        cart.remove(decodeURIComponent(path.slice('/cart/'.length)))
        return { status: 200, body: cart.lines() }
      }
      if (method === 'POST' && path === '/checkout') return { status: 201, body: checkout(cart, { code: body.code }) }
      return { status: 404, body: { error: 'not found' } }
    } catch (err) {
      return { status: 400, body: { error: err.message } }
    }
  }
}
