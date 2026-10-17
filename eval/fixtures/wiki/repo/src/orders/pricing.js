import { total } from './cart.js'
import { discountFor } from '../promos/rules.js'
export const priceOrder = (lines, code) => total(lines) - discountFor(code, total(lines))
