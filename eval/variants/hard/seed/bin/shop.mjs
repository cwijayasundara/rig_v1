#!/usr/bin/env node
// The shop's command line: node bin/shop.mjs <command> [flags]. Commands: help, count, show <id>, export.
import fs from 'node:fs'
import path from 'node:path'
import { loadOrders, listOrders, getOrder } from '../src/orders/orders.js'
import { ordersCsv } from '../src/reports/csv.js'
import { dollars } from '../src/money.js'

const DATA = process.env.ORDERS_FILE ?? path.join(import.meta.dirname, '../data/orders.json')
const load = () => loadOrders(JSON.parse(fs.readFileSync(DATA, 'utf8')))

function parseArgs(argv) {
  const _ = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { _.push(a); continue }
    const eq = a.indexOf('=')
    if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1)
    else flags[a.slice(2)] = argv[++i]
  }
  return { _, flags }
}

const COMMANDS = {
  help: { flags: [], run: () => console.log('commands: help, count, show <id>, export [--format csv]') },
  count: { flags: [], run: () => { load(); console.log(listOrders().length) } },
  show: { flags: [], run: (_flags, [id]) => { load(); const o = getOrder(id); if (!o) { console.error(`unknown order: ${id}`); process.exit(1) } console.log(`${o.id} ${o.customer} ${o.status} $${dollars(o.payableCents / 100)}`) } },
  export: { flags: ['format'], run: flags => { if ((flags.format ?? 'csv') !== 'csv') { console.error(`unsupported format: ${flags.format}`); process.exit(2) } load(); console.log(ordersCsv()) } },
}

const [name = 'help', ...rest] = process.argv.slice(2)
const command = COMMANDS[name]
if (!command) { console.error(`unknown command: ${name}`); process.exit(2) }
const { _, flags } = parseArgs(rest)
for (const f of Object.keys(flags)) if (!command.flags.includes(f)) { console.error(`unknown flag: --${f}`); process.exit(2) }
command.run(flags, _)
