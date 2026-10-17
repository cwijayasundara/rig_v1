import { withBackoff } from './retry.js'
import { env } from '../config/env.js'

const call = (path, body) => fetch(env.PAYMENT_URL + path, { method: 'POST', body: JSON.stringify(body) })
export const charge = (card, cents) => withBackoff(() => call('/charge', { card, cents }))
export const refund = (chargeId, cents) => call('/refund', { chargeId, cents })
