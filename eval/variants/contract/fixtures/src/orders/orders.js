// Orders: a checkout freezes a cart into an order. Checks, in order: empty cart, stock, the per-line cap, the code (unknown, already used,
// minimum), then the discount, its allocation to lines, tax and shipping. totalCents stays subtotal - discount; payableCents adds shipping and tax.
import { productPath } from '../catalog/products.js'

const PERCENT = { SAVE10: 0.1, SAVE20: 0.2 }
const FIVEOFF = { cents: 500, minCents: 2000 }
const CODES = [...Object.keys(PERCENT), 'FIVEOFF', 'SHIPFREE']
const LINE_LIMIT = 10
const AUTO_THRESHOLD_CENTS = 5000
const TAX_BASIS_POINTS = 825
const SHIPPING_CENTS = 599
const FREE_SHIPPING_CENTS = 7500

const orders = [] // { order, catalog }, oldest first
const used = new Set() // `${customer}|${code}`

const halfUp = (n, d) => Math.floor((2 * n + d) / (2 * d))

// The discount split across lines in proportion to their amounts; the cents left over go one each to the earliest lines.
function allocate(discount, amounts) {
  const total = amounts.reduce((a, b) => a + b, 0)
  const shares = amounts.map(a => Math.floor((discount * a) / total))
  let left = discount - shares.reduce((a, b) => a + b, 0)
  return shares.map(s => (left-- > 0 ? s + 1 : s))
}

export function checkout(cart, { code, customer = 'guest' } = {}) {
  const lines = cart.lines().map(l => ({ ...l, href: productPath(l.sku) }))
  if (!lines.length) throw new Error('cart is empty')
  for (const l of lines) {
    const stock = cart.catalog.get(l.sku).stock
    if (stock !== undefined && l.qty > stock) throw new Error(`insufficient stock: ${l.sku}`)
  }
  for (const l of lines) if (l.qty > LINE_LIMIT) throw new Error(`quantity over limit: ${l.sku}`)
  const subtotal = cart.subtotalCents()
  if (code !== undefined && !CODES.includes(code)) throw new Error(`unknown discount code: ${code}`)
  if (code && used.has(`${customer}|${code}`)) throw new Error(`coupon already used: ${code}`)
  if (code === 'FIVEOFF' && subtotal < FIVEOFF.minCents) throw new Error('coupon minimum not met: FIVEOFF')
  let discount = 0
  if (code in PERCENT) discount = Math.round(subtotal * PERCENT[code])
  else if (code === 'FIVEOFF') discount = FIVEOFF.cents
  else if (!code && subtotal >= AUTO_THRESHOLD_CENTS) discount = Math.floor((subtotal + 5) / 10) // 10% of the order, half up
  const amounts = lines.map(l => l.qty * l.unitCents)
  const shares = allocate(discount, amounts)
  lines.forEach((l, i) => {
    const product = cart.catalog.get(l.sku)
    l.discountCents = shares[i]
    l.taxCents = product.taxable === false ? 0 : halfUp((amounts[i] - shares[i]) * TAX_BASIS_POINTS, 10000)
  })
  const taxCents = lines.reduce((n, l) => n + l.taxCents, 0)
  const digital = lines.every(l => cart.catalog.get(l.sku).digital === true)
  const shippingCents = digital || code === 'SHIPFREE' || subtotal - discount >= FREE_SHIPPING_CENTS ? 0 : SHIPPING_CENTS
  for (const l of lines) cart.catalog.reserve(l.sku, l.qty)
  if (code) used.add(`${customer}|${code}`)
  const totalCents = subtotal - discount
  const order = {
    id: `ORD-${String(orders.length + 1).padStart(4, '0')}`, status: 'placed', version: 1, customer, ...(code ? { code } : {}),
    lines, subtotalCents: subtotal, discountCents: discount, totalCents, shippingCents, taxCents, payableCents: totalCents + shippingCents + taxCents,
  }
  orders.push({ order, catalog: cart.catalog })
  return structuredClone(order)
}

export function cancelOrder(id) {
  const entry = orders.find(o => o.order.id === id)
  if (!entry) throw new Error(`unknown order: ${id}`)
  if (entry.order.status === 'cancelled') throw new Error(`order already cancelled: ${id}`)
  for (const l of entry.order.lines) entry.catalog.restock(l.sku, l.qty)
  if (entry.order.code) used.delete(`${entry.order.customer}|${entry.order.code}`)
  entry.order.status = 'cancelled'
  entry.order.version += 1
  return structuredClone(entry.order)
}

// One order by id, or null.
export function getOrder(id) {
  const entry = orders.find(o => o.order.id === id)
  return entry ? structuredClone(entry.order) : null
}

export function listOrders() {
  return orders.map(o => structuredClone(o.order)).reverse()
}
