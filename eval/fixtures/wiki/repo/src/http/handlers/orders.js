import { deps } from '../../core/container.js'
import { placeOrder } from '../../orders/checkout.js'
import { refundOrder } from '../../returns/refund.js'

export const createOrder = req => placeOrder(deps, req.body)
export const refundOrderHandler = req => refundOrder(deps, req.body.orderId)
