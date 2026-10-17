import { reserveUnits } from '../inventory/stock.js'
import { releaseUnits } from '../inventory/stock.js'

export function exchange(orderId, oldLines, newLines) {
  reserveUnits(orderId + '-x', newLines)
  releaseUnits(orderId)
}
