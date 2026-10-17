import { isEnabled } from '../config/flags.js'
import { record } from '../audit/trail.js'
export function awardPoints(order) {
  if (!isEnabled('loyaltyPoints')) return
  record('points', { customer: order.customer, points: Math.floor(order.cents / 100) })
}
