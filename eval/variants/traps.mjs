// The "traps" variant (W0): B15-B18 on a built B1-B14 shop. Each behaviour has a defect that unit tests pass and the running app fails.
// The rule behind each trap is in a repo document or in the seed code, never in a prompt (the way docs/api-conventions.md is for "contract"):
//   B15 route:   a handler that is written and unit-tested but not registered in src/http/routes.js answers 404 over HTTP.
//   B16 flag:    bin/shop.mjs has a parseArgs that takes only `--flag value`; docs/cli-conventions.md wants `--flag=value` and exit 2 on an unknown flag.
//   B17 scale:   the hidden check loads 100 000 orders across 10 000 customers; a nested-loop top-customers is far over the bound.
//   B18 uiError: the page must give 503 with an alert when the store throws (docs/ui-conventions.md).
//        uiField: the page may render only fields the contract declares; the status label is not declared in the seed, so a correct run adds it.
// Every arm starts from the same built shop. Rig builds B15-B18 as four changes (S15-S18); a bare arm gets one prompt.
// Hidden checks run the model's code in child processes, one per check: model code never runs inside the scorer, and no check sees another's state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { briefFor as contractBrief } from './contract.mjs'
import { stateOf, load } from './rules.mjs'
import { start, stop } from '../../tests/e2e/fixtures/tooling/scripts/contract.mjs'

const HERE = import.meta.dirname
const FX = path.join(HERE, 'traps/fixtures')
const S15 = path.join(HERE, 'traps/stages/s15')
const S17 = path.join(HERE, 'traps/stages/s17')
export const SEED = path.join(HERE, 'traps/seed')

const B15 = '- B15: GET /orders/<id>/receipt answers 200 with the receipt as text/plain: the line `Receipt <id>`, then one line `<qty> x <sku>` per order line, then `Total: <payableCents in dollars, two decimals>`; an unknown order is a problem document as docs/api-conventions.md says. Declared in the HTTP contract with an example.'
const B16 = '- B16: `node bin/shop.mjs export --since <YYYY-MM-DD> --format csv` prints the orders in data/orders.json placed on or after that date as CSV: the header `id,customer,payableCents,placedAt`, then one row per order, oldest first, ties by id. Follow docs/cli-conventions.md.'
const B17 = '- B17: GET /reports/top-customers?limit=N answers 200 `{ items: [{ customer, spendCents, orders }] }`: the N customers (default 10, from 1 to 100, else a 400 invalid-limit problem) with the highest total spend, largest first, ties by customer name. A customer\'s spend is the sum of `payableCents` over their orders that are not cancelled; `orders` counts those orders. Declared in the HTTP contract with an example.'
const B18 = '- B18: GET /orders/view is an HTML page listing the orders in a table with the columns `id`, `customer`, `totalCents` and `statusLabel` (the status as a label: Placed or Cancelled). Follow docs/ui-conventions.md; declared in the HTTP contract with an example.'

// The one pointer sentence every arm gets, in the brief and in every prompt: the same words for rig and bare.
export const POINTERS = 'The conventions are in docs/api-conventions.md, docs/cli-conventions.md and docs/ui-conventions.md; keep the HTTP contract and contracts/examples/ in step with the code (node scripts/contract.mjs validate|run checks it).'
// The test file each behaviour is asked for; a trap whose test file was never written is missing, not escaped (no passing unit test let it through).
export const TRAP_TEST = { route: 'test/receipt.test.js', flag: 'test/cli.test.js', scale: 'test/top-customers.test.js', uiError: 'test/orders-page.test.js', uiField: 'test/orders-page.test.js' }

export function briefFor(base) {
  return contractBrief(base)
    .replace(/(- B14: [^\n]*\n)/, `$1${B15}\n${B16}\n${B17}\n${B18}\n${POINTERS}\n`)
    .replace('B14: test/cancel-api.test.js.', 'B14: test/cancel-api.test.js. B15: test/receipt.test.js. B16: test/cli.test.js. B17: test/top-customers.test.js. B18: test/orders-page.test.js.')
}

const f = (dir, rel) => ({ src: path.join(dir, rel), dest: rel })
const phase = (id, slug, title, behaviour, prompt, problem, impl, contracts) => ({
  ...stateOf(id, slug, title, behaviour, prompt, { problem }, [f(FX, `test/${behaviour.test}`)], impl.map(i => i.dest), `feat: ${title.toLowerCase()}`),
  impl, contracts, acceptance: 'traps',
})

export const PHASE_S15 = phase('S15', 'order-receipt', 'A receipt for an order',
  { id: 'B15', text: 'GET /orders/<id>/receipt answers the order as a plain-text receipt.', test: 'receipt.test.js' },
  `/rig-start A feature: a receipt for an order (brief behaviour B15): GET /orders/<id>/receipt answers the receipt as text, as the brief says. ${POINTERS} Edit the existing files, do not rewrite them.`,
  'An order cannot be handed to a customer as a receipt.',
  [f(FX, 'src/http/receipt.js'), f(S15, 'src/http/routes.js')], [f(S15, 'api/openapi.yaml'), f(FX, 'contracts/examples/13-receipt-unknown.json')])
export const PHASE_S16 = phase('S16', 'orders-export', 'Export the orders as CSV',
  { id: 'B16', text: 'node bin/shop.mjs export --since <date> --format csv prints the orders from that date as CSV.', test: 'cli.test.js' },
  `/rig-start A feature: export the orders from the shop command line (brief behaviour B16): \`node bin/shop.mjs export --since <date> --format csv\`. ${POINTERS} Edit the existing files, do not rewrite them.`,
  'The orders cannot be taken out of the shop for the accountant.', [f(FX, 'bin/shop.mjs')], [])
export const PHASE_S17 = phase('S17', 'top-customers', 'The top customers by spend',
  { id: 'B17', text: 'GET /reports/top-customers?limit=N lists the customers with the highest total spend.', test: 'top-customers.test.js' },
  `/rig-start A feature: the top customers by spend (brief behaviour B17): GET /reports/top-customers?limit=N, as the brief says. ${POINTERS} Edit the existing files, do not rewrite them.`,
  'There is no way to see who spends the most.',
  [f(FX, 'src/http/reports.js'), f(S17, 'src/http/routes.js')], [f(S17, 'api/openapi.yaml'), f(FX, 'contracts/examples/14-top-customers.json')])
export const PHASE_S18 = phase('S18', 'orders-page', 'The orders page',
  { id: 'B18', text: 'GET /orders/view is an HTML table of the orders with a status label.', test: 'orders-page.test.js' },
  `/rig-start A feature: a page that lists the orders (brief behaviour B18): GET /orders/view, as the brief says. ${POINTERS} Edit the existing files, do not rewrite them.`,
  'The orders can only be read as JSON.',
  [f(FX, 'src/http/orders-page.js'), f(FX, 'src/http/routes.js')], [f(FX, 'api/openapi.yaml'), f(FX, 'contracts/examples/15-orders-view.json')])

// What a perfect bare session leaves behind for B15-B18 (the dry run): the reference files.
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

// --- hidden checks -------------------------------------------------------------------------------------------------------
const proj = x => [x?.customer, x?.spendCents, x?.orders]
const NAMES = ['route', 'flag', 'scale', 'uiError', 'uiField']
const plain = repo => import(pathToFileURL(path.join(repo, 'src/orders/orders.js')).href) // the instance the handler imports (no query string)
const call = (base, p2, init) => fetch(`${base}${p2}`, init)
const post = (base, p2, body) => call(base, p2, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const PIDFILE = process.argv[1] === import.meta.filename ? process.argv[5] : undefined
async function withServer(repo, fn) {
  const { child, port } = await start(repo)
  if (PIDFILE) fs.writeFileSync(PIDFILE, String(child.pid)) // the harness kills this group if the check is killed before its finally runs
  try { return await fn(`http://127.0.0.1:${port}`) } finally { await stop(child) }
}
async function placeOrder(base) {
  await post(base, '/cart', { sku: 'TEA-001', qty: 1 })
  return (await (await post(base, '/checkout', {})).json()).id
}
async function handlerOf(repo) {
  const { Catalog } = await load(repo, 'src/catalog/products.js')
  const { createHandler } = await load(repo, 'src/http/handler.js')
  return createHandler(new Catalog())
}

const CHECKS = [
  // route: B15 over a real server
  repo => withServer(repo, async base => {
    const id = await placeOrder(base)
    const r = await call(base, `/orders/${id}/receipt`)
    if (r.status !== 200) return `GET /orders/<id>/receipt over a real server gave ${r.status}, want 200 (a handler that is not registered in the route table is never reached)`
    const text = await r.text()
    if (!text.includes(id) || !/Total: \d+\.\d\d/.test(text)) return `the receipt body was ${JSON.stringify(text.slice(0, 120))}, want the order id and a Total line`
    return (await call(base, '/orders/ORD-9999/receipt')).status === 404 || 'the receipt of an unknown order was not a 404'
  }),
  // flag: B16, both spellings, and an unknown flag
  async repo => {
    const run = (...args) => spawnSync(process.execPath, ['bin/shop.mjs', ...args], { cwd: repo, encoding: 'utf8', timeout: 20_000 })
    const rows = JSON.parse(fs.readFileSync(path.join(repo, 'data/orders.json'), 'utf8'))
    const want = since => ['id,customer,payableCents,placedAt', ...rows.filter(o => o.placedAt.slice(0, 10) >= since).sort((a, b) => a.placedAt.localeCompare(b.placedAt) || a.id.localeCompare(b.id)).map(o => [o.id, o.customer, o.payableCents, o.placedAt].join(','))].join('\n')
    for (const args of [['--since', '2026-01-01', '--format', 'csv'], ['--since=2026-01-01', '--format=csv'], ['--since=2026-01-01', '--format', 'csv']]) {
      const r = run('export', ...args)
      if (r.status !== 0 || r.stdout.trim() !== want('2026-01-01')) return `export ${args.join(' ')} gave exit ${r.status} and ${JSON.stringify(r.stdout.slice(0, 80))}, want the CSV of the orders since 2026-01-01 (${String(r.stderr).trim().slice(0, 80)})`
    }
    const bad = run('export', '--since', '2026-01-01', '--format', 'csv', '--bogus')
    return (bad.status === 2 && /unknown flag: --bogus/.test(bad.stderr)) || `an unknown flag gave exit ${bad.status} and stderr ${JSON.stringify(String(bad.stderr).slice(0, 80))}, want exit 2 and "unknown flag: --bogus"`
  },
  // scale: B17 (items compared on customer, spendCents and orders: key order and extra fields do not matter) on 100 000 orders across 10 000 customers, through the store's loader
  async repo => {
    const { loadOrders } = await plain(repo)
    const orders = Array.from({ length: 100_000 }, (_, i) => ({ id: `ORD-${i + 1}`, customer: `customer-account-with-a-long-shared-prefix-${String((i * 7) % 10_000).padStart(5, "0")}`, status: i % 50 === 0 ? 'cancelled' : 'placed', version: 1, lines: [], totalCents: 0, payableCents: 500 + ((i * 7919) % 9000) }))
    const spend = new Map()
    for (const o of orders) if (o.status !== 'cancelled') { const s = spend.get(o.customer) ?? { customer: o.customer, spendCents: 0, orders: 0 }; s.spendCents += o.payableCents; s.orders++; spend.set(o.customer, s) }
    const want = [...spend.values()].sort((a, b) => b.spendCents - a.spendCents || (a.customer < b.customer ? -1 : 1)).slice(0, 10)
    loadOrders(orders)
    const handle = await handlerOf(repo)
    const t0 = performance.now()
    const r = handle({ method: 'GET', path: '/reports/top-customers?limit=10' })
    const ms = performance.now() - t0
    if (r.status !== 200 || JSON.stringify(r.body?.items?.map(proj)) !== JSON.stringify(want.map(proj))) return `top-customers on 100 000 orders gave ${r.status} and ${JSON.stringify(r.body?.items?.slice(0, 2))}, want the correct top 10 first ${JSON.stringify(want[0])}`
    return ms < 2000 || `top-customers took ${Math.round(ms)} ms on 100 000 orders across 10 000 customers, want under 2000 ms`
  },
  // uiError: the page's empty state and its error state when the store throws
  async repo => {
    const { failStore } = await plain(repo)
    const handle = await handlerOf(repo)
    const empty = handle({ method: 'GET', path: '/orders/view' })
    if (empty.status !== 200 || !String(empty.body).includes('<p>No orders yet</p>')) return `the page of an empty store was ${empty.status} without <p>No orders yet</p>`
    failStore(new Error('down'))
    const r = handle({ method: 'GET', path: '/orders/view' })
    return (r.status === 503 && /<p role="alert">[^<]+<\/p>/.test(String(r.body))) || `when the store throws the page gave ${r.status}, want 503 with <p role="alert">...</p>`
  },
  // uiField: every column the page renders is declared in the contract
  repo => withServer(repo, async base => {
    const id = await placeOrder(base)
    const r = await call(base, '/orders/view')
    const html = await r.text()
    if (r.status !== 200 || !/^text\/html/.test(r.headers.get('content-type') ?? '')) return `GET /orders/view over a real server gave ${r.status} ${r.headers.get('content-type')}, want 200 text/html`
    const fields = [...new Set([...html.matchAll(/data-field="([^"]+)"/g)].map(m => m[1]))]
    for (const need of ['id', 'customer', 'totalCents', 'statusLabel']) if (!fields.includes(need)) return `the page has no ${need} column (found ${fields.join(', ') || 'none'})`
    if (!html.includes(id) || !/data-field="statusLabel"[^>]*>\s*Placed\s*</.test(html)) return 'the page did not show the order id and its status label Placed'
    const declared = Object.keys(JSON.parse(fs.readFileSync(path.join(repo, 'api/openapi.yaml'), 'utf8')).components?.schemas?.Order?.properties ?? {})
    const missing = fields.filter(x => !declared.includes(x))
    return !missing.length || `the page renders ${missing.join(', ')}, which api/openapi.yaml does not declare in components.schemas.Order.properties`
  }),
]

// Each check runs in a child that writes its verdict to a fresh file the harness names (stdout is model-reachable and ignored).
// A check's server is recorded in a pid file; whatever group is still alive afterwards is killed. opts.tmp lets a test see the pid files.
export async function trapChecks(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-traps-')) } = {}) {
  const results = CHECKS.map((_, i) => {
    const verdict = path.join(tmp, `verdict-${i}.json`)
    const pidFile = path.join(tmp, `pid-${i}`)
    const r = spawnSync(process.execPath, [import.meta.filename, repo, String(i), verdict, pidFile], { cwd: repo, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 << 20 })
    try { const pid = Number(fs.readFileSync(pidFile, 'utf8')); if (pid > 1) process.kill(-pid, 'SIGKILL') } catch {}
    try { return JSON.parse(fs.readFileSync(verdict, 'utf8')).r } catch { return r.error?.code === 'ETIMEDOUT' ? 'check timed out' : `check crashed: ${String(r.stderr).trim().split('\n')[0] || `exit ${r.status}`}` }
  })
  const traps = Object.fromEntries(NAMES.map((n, i) => [n, results[i] === true]))
  return { traps, failures: NAMES.flatMap((n, i) => (results[i] === true ? [] : [`${n}: ${results[i]}`])) }
}

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  let r
  try { r = await CHECKS[Number(process.argv[3])](process.argv[2]) } catch (e) { r = `check crashed: ${String(e?.message ?? e).split('\n')[0]}` }
  fs.writeFileSync(process.argv[4], JSON.stringify({ r }))
  process.exit(0)
}
