import { receipt } from './receipt.js'

export const routes = [
  { method: 'GET', path: /^\/orders\/([^/]+)\/receipt$/, handle: receipt },
]
