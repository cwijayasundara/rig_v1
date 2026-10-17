import { isOptedOut } from '../users/prefs.js'
import { receiptBody } from './templates.js'
import { env } from '../config/env.js'

export function sendReceipt(order) {
  if (isOptedOut(order.customer)) return null
  return { from: env.MAIL_FROM, to: order.customer, body: receiptBody(order) }
}
