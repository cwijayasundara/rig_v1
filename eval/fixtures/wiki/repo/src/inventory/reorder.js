export const replenishmentThreshold = sku => (sku.startsWith('hot-') ? 50 : 10)
