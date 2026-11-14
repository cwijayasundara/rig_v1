// The orders as CSV: one row per order, newest first.
import { listOrders } from '../orders/orders.js'
import { dollars } from '../money.js'

const HEADER = 'id,customer,status,units,total,unitAvg'

export function ordersCsv(filter = () => true) {
  const rows = listOrders().filter(filter).map(o => {
    const units = o.lines.reduce((n, l) => n + l.qty, 0)
    return [o.id, o.customer, o.status, units, dollars(o.payableCents / 100), dollars(o.payableCents / 100 / units)].join(',')
  })
  return [HEADER, ...rows].join('\n')
}
