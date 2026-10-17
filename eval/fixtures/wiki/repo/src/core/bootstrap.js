import { bus } from './bus.js'
import { createInvoice } from '../billing/invoice.js'
import { sendReceipt } from '../notify/mailer.js'
import { record } from '../audit/trail.js'
import { awardPoints } from '../loyalty/points.js'

// The only place subscribers are attached to events.
export function bootstrap() {
  bus.on('order.placed', createInvoice)
  bus.on('order.placed', sendReceipt)
  bus.on('order.placed', awardPoints)
  bus.on('order.placed', e => record('order.placed', e))
  bus.on('order.refunded', e => record('order.refunded', e))
}
