// The shop's behaviour as a plain function: handle({ method, path, body }) -> { status, body }.
const PRODUCTS = [{ sku: 'TEA-001', name: 'Green tea', priceCents: 450 }, { sku: 'MUG-002', name: 'Mug', priceCents: 1200 }]
const cart = new Map()

export function handle({ method, path, body = {} }) {
  if (method === 'GET' && path === '/products') return { status: 200, body: PRODUCTS }
  if (method === 'POST' && path === '/cart') {
    const p = PRODUCTS.find(x => x.sku === body.sku)
    if (!p) return { status: 400, body: { error: `unknown sku: ${body.sku}` } }
    cart.set(p.sku, (cart.get(p.sku) ?? 0) + (body.qty ?? 1))
    return { status: 201, body: [...cart].map(([sku, qty]) => ({ sku, qty })) }
  }
  if (method === 'POST' && path === '/checkout') {
    if (!cart.size) return { status: 400, body: { error: 'cart is empty' } }
    const total = [...cart].reduce((n, [sku, qty]) => n + qty * PRODUCTS.find(x => x.sku === sku).priceCents, 0)
    return { status: 201, body: { totalCents: total } }
  }
  return { status: 404, body: { error: 'not found' } }
}
