// Stock levels for direct placement. The store answers asynchronously (a stand-in for a database): each call takes a moment.
const levels = new Map()
const later = () => new Promise(resolve => setTimeout(resolve, 25))

export const seedStock = map => { for (const [sku, n] of Object.entries(map)) levels.set(sku, n) }
export const inventory = {
  async get(sku) { await later(); return levels.get(sku) },
  async set(sku, n) { await later(); levels.set(sku, n) },
}
