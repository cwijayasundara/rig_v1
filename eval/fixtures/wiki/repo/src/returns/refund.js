import { releaseUnits } from '../inventory/stock.js'

export async function refundOrder(deps, orderId) {
  await deps.gateway.refund(orderId, 0)
  releaseUnits(orderId)
  deps.bus.emit('order.refunded', { id: orderId })
}
