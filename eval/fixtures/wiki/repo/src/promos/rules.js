import { lookup } from './codes.js'
export const discountFor = (code, cents) => { const c = lookup(code); return c ? Math.round(cents * c.rate) : 0 }
