import { receipt } from './receipt.js'
import { topCustomers } from './reports.js'
import { ordersPage } from './orders-page.js'

export const routes = [
  { method: 'GET', path: /^\/orders\/view$/, handle: ordersPage },
  { method: 'GET', path: /^\/orders\/([^/]+)\/receipt$/, handle: receipt },
  { method: 'GET', path: /^\/reports\/top-customers$/, handle: topCustomers },
]
