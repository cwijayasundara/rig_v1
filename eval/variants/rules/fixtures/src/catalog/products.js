// The product catalog: an in-memory list of products keyed by SKU.
// The path of a product's own page: the one place it is spelled.
export const productPath = sku => `/products/${sku}`

export class Catalog {
  #products = new Map()

  // `stock` is optional: omitted means unlimited.
  add({ sku, name, priceCents, stock }) {
    if (!/^[A-Z]{3}-\d{3}$/.test(sku)) throw new Error(`invalid sku: ${sku}`)
    if (!Number.isInteger(priceCents) || priceCents <= 0) throw new Error('priceCents must be a positive integer')
    if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) throw new Error('stock must be a non-negative integer')
    const product = stock === undefined ? { sku, name, priceCents } : { sku, name, priceCents, stock }
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
}
