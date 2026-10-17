const held = new Map()
export function reserveUnits(orderId, lines) { held.set(orderId, lines) }
export function releaseUnits(orderId) { held.delete(orderId) }
