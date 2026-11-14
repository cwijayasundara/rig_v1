// B15: the receipt of one order as plain text.
import { getOrder } from '../orders/orders.js'

export function receipt({ params, problem }) {
  const order = getOrder(params[0])
  if (!order) return problem(404, 'not-found', `No order ${params[0]}.`)
  const lines = [`Receipt ${order.id}`, ...order.lines.map(l => `${l.qty} x ${l.sku}`), `Total: ${(order.payableCents / 100).toFixed(2)}`]
  return { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' }, body: `${lines.join('\n')}\n` }
}
