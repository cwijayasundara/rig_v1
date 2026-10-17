import { bus } from './bus.js'
import { reserveUnits, releaseUnits } from '../inventory/stock.js'
import { charge, refund } from '../payments/gateway.js'

// Dependencies handed to use cases, so they never import adapters directly.
export const deps = { bus, stock: { reserveUnits, releaseUnits }, gateway: { charge, refund } }
