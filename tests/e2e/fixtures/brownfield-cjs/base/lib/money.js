'use strict'
// Amounts are integer cents; formatting is the only place a decimal point appears.
function cents(amount) {
  if (!Number.isInteger(amount)) throw new TypeError('amount must be an integer number of cents')
  return amount
}
function format(amount) {
  const sign = cents(amount) < 0 ? '-' : ''
  const abs = Math.abs(amount)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
module.exports = { cents, format }
