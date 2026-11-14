'use strict'
const { cents } = require('./money')

class Ledger {
  constructor() { this.entries = [] }
  add(account, amount) {
    if (!account) throw new Error('account is required')
    this.entries.push({ account, amount: cents(amount) })
    return this
  }
  // A refund is an entry that reverses an earlier one; it cannot exceed what the account holds.
  refund(account, amount) {
    if (cents(amount) <= 0) throw new Error('refund must be positive')
    if (amount > this.balance(account)) throw new Error('refund exceeds balance')
    return this.add(account, -amount)
  }
  balance(account) {
    return this.entries.filter(e => e.account === account).reduce((sum, e) => sum + e.amount, 0)
  }
  accounts() {
    return [...new Set(this.entries.map(e => e.account))].sort()
  }
}
module.exports = { Ledger }
