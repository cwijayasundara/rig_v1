#!/usr/bin/env node
// The shop's command line: node bin/shop.mjs <command> [flags]. Commands: help, count. See docs/cli-conventions.md.
import fs from 'node:fs'
import path from 'node:path'
import { loadOrders, listOrders } from '../src/orders/orders.js'

const DATA = path.join(import.meta.dirname, '../data/orders.json')

function parseArgs(argv) {
  const _ = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i]
    else _.push(argv[i])
  }
  return { _, flags }
}

const COMMANDS = {
  help: { flags: [], run: () => console.log('commands: help, count') },
  count: { flags: [], run: () => { loadOrders(JSON.parse(fs.readFileSync(DATA, 'utf8'))); console.log(listOrders().length) } },
}

const [name = 'help', ...rest] = process.argv.slice(2)
const command = COMMANDS[name]
if (!command) { console.error(`unknown command: ${name}`); process.exit(2) }
command.run(parseArgs(rest).flags)
