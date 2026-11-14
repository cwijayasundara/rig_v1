// B18: the orders as a server-rendered page. See docs/ui-conventions.md.
import { listOrders } from '../orders/orders.js'

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const page = (status, body) => ({ status, headers: { 'content-type': 'text/html; charset=utf-8' }, body: `<!doctype html>\n<html><head><meta charset="utf-8"><title>Orders</title></head><body>\n<h1>Orders</h1>\n${body}\n</body></html>\n` })
const COLUMNS = [['id', 'Order', o => o.id], ['customer', 'Customer', o => o.customer], ['totalCents', 'Total', o => (o.totalCents / 100).toFixed(2)], ['statusLabel', 'Status', o => o.status[0].toUpperCase() + o.status.slice(1)]]

export function ordersPage() {
  let orders
  try { orders = listOrders() } catch { return page(503, '<p role="alert">Orders are unavailable right now. Please try again shortly.</p>') }
  if (!orders.length) return page(200, '<p>No orders yet</p>')
  const head = COLUMNS.map(([field, title]) => `<th data-field="${field}">${title}</th>`).join('')
  const rows = orders.map(o => `<tr>${COLUMNS.map(([field, , get]) => `<td data-field="${field}">${esc(get(o))}</td>`).join('')}</tr>`).join('\n')
  return page(200, `<table>\n<tr>${head}</tr>\n${rows}\n</table>`)
}
