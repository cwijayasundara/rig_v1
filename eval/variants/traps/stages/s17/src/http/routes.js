import { receipt } from './receipt.js'
import { topCustomers } from './reports.js'

export const routes = [
  { method: 'GET', path: /^\/orders\/([^/]+)\/receipt$/, handle: receipt },
  { method: 'GET', path: /^\/reports\/top-customers$/, handle: topCustomers },
]
