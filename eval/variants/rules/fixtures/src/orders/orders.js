// Orders: a checkout freezes a cart into an order. Rules, in order: stock, the per-line cap, then one discount.
import { productPath } from '../catalog/products.js'

const DISCOUNTS = { SAVE10: 0.1, SAVE20: 0.2 }
const LINE_LIMIT = 10
const AUTO_THRESHOLD_CENTS = 5000

export function checkout(cart, { code } = {}) {
  const lines = cart.lines().map(l => ({ ...l, href: productPath(l.sku) }))
  if (!lines.length) throw new Error('cart is empty')
  for (const l of lines) {
    const stock = cart.catalog.get(l.sku).stock
    if (stock !== undefined && l.qty > stock) throw new Error(`insufficient stock: ${l.sku}`)
  }
  for (const l of lines) if (l.qty > LINE_LIMIT) throw new Error(`quantity over limit: ${l.sku}`)
  const subtotal = cart.subtotalCents()
  let discount = 0
  if (code) {
    const rate = DISCOUNTS[code]
    if (rate === undefined) throw new Error(`unknown discount code: ${code}`)
    discount = Math.round(subtotal * rate)
  } else if (subtotal >= AUTO_THRESHOLD_CENTS) {
    discount = Math.floor((subtotal + 5) / 10) // 10% of the order, half up, in integer cents
  }
  for (const l of lines) cart.catalog.reserve(l.sku, l.qty)
  return { lines, subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount }
}
