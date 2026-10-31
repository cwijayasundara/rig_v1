// The product catalog: an in-memory list of products keyed by SKU.
// The path of a product's own page: the one place it is spelled.
export const productPath = sku => `/products/${sku}`

const FLAGS = ['taxable', 'digital']

export class Catalog {
  #products = new Map()

  // `stock` is optional: omitted means unlimited. `taxable` (default true) and `digital` (default false) are optional booleans.
  add({ sku, name, priceCents, stock, taxable, digital }) {
    if (!/^[A-Z]{3}-\d{3}$/.test(sku)) throw new Error(`invalid sku: ${sku}`)
    if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error('priceCents must be a positive integer')
    if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) throw new Error('stock must be a non-negative integer')
    const flags = { taxable, digital }
    for (const f of FLAGS) if (flags[f] !== undefined && typeof flags[f] !== 'boolean') throw new Error(`${f} must be a boolean`)
    const product = { sku, name, priceCents }
    if (stock !== undefined) product.stock = stock
    for (const f of FLAGS) if (flags[f] !== undefined) product[f] = flags[f]
    this.#products.set(sku, product)
    return { ...product }
  }

  get(sku) {
    const p = this.#products.get(sku)
    return p ? { ...p } : null
  }

  list() {
    return [...this.#products.values()].map(p => ({ ...p }))
  }

  // Take `qty` units out of a product's stock; a product with no stock is unlimited and is left alone.
  reserve(sku, qty) {
    const p = this.#products.get(sku)
    if (p && p.stock !== undefined) p.stock -= qty
  }

  // Put `qty` units back (a cancelled order).
  restock(sku, qty) {
    const p = this.#products.get(sku)
    if (p && p.stock !== undefined) p.stock += qty
  }
}
