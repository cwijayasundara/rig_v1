'use strict'
const { cents } = require('./money')

class Ledger {
  constructor() { this.entries = [] }
  add(account, amount) {
    if (!account) throw new Error('account is required')
    this.entries.push({ account, amount: cents(amount) })
    return this
  }
  balance(account) {
    return this.entries.filter(e => e.account === account).reduce((sum, e) => sum + e.amount, 0)
  }
  accounts() {
    return [...new Set(this.entries.map(e => e.account))].sort()
  }
}
module.exports = { Ledger }
