// The orders as CSV: one row per order, newest first.
import { listOrders } from '../orders/orders.js'

const HEADER = 'id,customer,status,units,total,unitAvg'
const fmt = n => { const c = Math.round(n * 100); return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}` }

export function ordersCsv(filter = () => true) {
  const rows = listOrders().filter(filter).map(o => {
    const units = o.lines.reduce((n, l) => n + l.qty, 0)
    return [o.id, o.customer, o.status, units, fmt(o.payableCents / 100), fmt(o.payableCents / 100 / units)].join(',')
  })
  return [HEADER, ...rows].join('\n')
}
