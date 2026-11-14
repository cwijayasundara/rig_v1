// B17: the customers with the highest total spend, one pass over the orders.
import { listOrders } from '../orders/orders.js'

export function topCustomers({ url, problem, json }) {
  const raw = url.searchParams.get('limit')
  if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100)) return problem(400, 'invalid-limit', 'limit must be an integer from 1 to 100.')
  const spend = new Map()
  for (const o of listOrders()) {
    if (o.status === 'cancelled') continue
    const row = spend.get(o.customer) ?? { customer: o.customer, spendCents: 0, orders: 0 }
    row.spendCents += o.payableCents
    row.orders += 1
    spend.set(o.customer, row)
  }
  const items = [...spend.values()].sort((a, b) => b.spendCents - a.spendCents || (a.customer < b.customer ? -1 : 1)).slice(0, raw === null ? 10 : Number(raw))
  return json(200, { items })
}
