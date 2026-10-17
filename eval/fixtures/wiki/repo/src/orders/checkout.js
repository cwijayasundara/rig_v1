import { priceOrder } from './pricing.js'
import { quote } from '../shipping/rates.js'
import { isEnabled } from '../config/flags.js'
import { newId } from '../util/ids.js'

export async function placeOrder(deps, body) {
  const id = newId('ord')
  const shipping = quote(body.address, isEnabled('expressShipping') ? 'express' : 'standard')
  const cents = priceOrder(body.lines, body.promoCode) + shipping
  deps.stock.reserveUnits(id, body.lines)
  try {
    await deps.gateway.charge(body.card, cents)
  } catch (err) {
    deps.stock.releaseUnits(id)
    throw err
  }
  deps.bus.emit('order.placed', { id, cents, customer: body.customer, lines: body.lines })
  return { id, cents }
}
