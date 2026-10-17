import { applyVat } from './tax.js'
import { fromCents } from '../util/money.js'
export function createInvoice(order) {
  return { orderId: order.id, total: fromCents(applyVat(order.cents)) }
}
