import { createOrder, refundOrderHandler } from './handlers/orders.js'
import { requireSession } from './middleware/auth.js'
import { throttleByIp } from './middleware/ratelimit.js'

export const routes = {
  'POST /orders': [throttleByIp, requireSession, createOrder],
  'POST /orders/refund': [requireSession, refundOrderHandler],
}
