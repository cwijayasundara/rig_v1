#!/usr/bin/env node
// The shop's command line: node bin/shop.mjs <command> [flags]. Commands: help, count, export. See docs/cli-conventions.md.
import fs from 'node:fs'
import path from 'node:path'
import { loadOrders, listOrders } from '../src/orders/orders.js'

const DATA = path.join(import.meta.dirname, '../data/orders.json')

function parseArgs(argv, known = null) {
  const _ = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { _.push(arg); continue }
    const eq = arg.indexOf('=')
    const flag = eq < 0 ? arg.slice(2) : arg.slice(2, eq)
    if (known && !known.includes(flag)) throw new Error(`unknown flag: --${flag}`)
    flags[flag] = eq < 0 ? argv[++i] : arg.slice(eq + 1)
  }
  return { _, flags }
}

const fail = message => { console.error(message); process.exit(2) }
const load = () => loadOrders(JSON.parse(fs.readFileSync(DATA, 'utf8')))

function exportOrders({ since, format }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since ?? '')) fail('--since must be a date like 2026-01-31')
  if (format !== 'csv') fail(`unsupported format: ${format}`)
  load()
  const rows = listOrders().filter(o => o.placedAt.slice(0, 10) >= since).sort((a, b) => a.placedAt.localeCompare(b.placedAt) || a.id.localeCompare(b.id))
  console.log(['id,customer,payableCents,placedAt', ...rows.map(o => [o.id, o.customer, o.payableCents, o.placedAt].join(','))].join('\n'))
}

const COMMANDS = {
  help: { flags: [], run: () => console.log('commands: help, count, export') },
  count: { flags: [], run: () => { load(); console.log(listOrders().length) } },
  export: { flags: ['since', 'format'], run: exportOrders },
}

const [name = 'help', ...rest] = process.argv.slice(2)
const command = COMMANDS[name]
if (!command) fail(`unknown command: ${name}`)
let parsed
try { parsed = parseArgs(rest, command.flags) } catch (err) { fail(err.message) }
command.run(parsed.flags)
