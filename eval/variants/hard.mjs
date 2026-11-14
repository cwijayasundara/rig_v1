// The "hard" variant (W3b): B15-B19 on a built B1-B14 shop. Five traps that reading the brief and the repo does not reveal; running does.
// No prompt and no conventions doc points at a rule. Each rule is stated once in the brief, or lives only in the seed code or tests:
//   B15 rule:   test/integration/refund-policy.test.js (run by `npm run test:all`, not by `npm test`): a refund over 30 days after placement needs x-manager: yes.
//   B16 caller: the seed rounds prices in src/money.js and again, copied, in src/reports/csv.js; a fix in one leaves the CSV wrong on a half cent.
//   B17 race:   src/inventory/inventory.js answers asynchronously, so a read-then-write placement oversells; the check fires 20 placements for 1 unit.
//   B18 nfr:    the brief gives 30 ms with 200 000 orders of the seed's shape; the natural listOrders() reuse clones and sorts every order per request.
//   B19 flag:   the seed parseArgs keeps the last value of a repeated flag, in both the `--flag v` and the `--flag=v` spellings.
// Every arm starts from the same built shop and gets the same brief. Rig builds B15-B19 as five changes (S15-S19); a bare arm gets one prompt.
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
const FX = path.join(HERE, 'hard/fixtures')
const S15 = path.join(HERE, 'hard/stages/s15')
const S17 = path.join(HERE, 'hard/stages/s17')
export const SEED = path.join(HERE, 'hard/seed')

export const BOUND_MS = 30 // naive pages (a clone and sort of every order) take about 250 ms on orders of the seed's shape, 8x over; the reference takes about 1 ms
const B15 = '- B15: `POST /orders/<id>/refund` refunds an order: 200 with the order, now with status `refunded`; an unknown order is 404; an order that is already refunded or cancelled is 409.'
const B16 = '- B16: Prices round half up to the cent everywhere they are shown (2.675 is shown as 2.68, 1.005 as 1.01).'
const B17 = '- B17: `POST /orders/place` with `{ customer, sku, qty }` places an order and reserves `qty` units of the SKU\'s stock: 201 with the order. With less than `qty` left it is 409 and nothing is reserved.'
const B18 = `- B18: \`GET /orders?page=N\` (1-based, 20 orders a page, newest first) answers 200 \`{ items, page, total }\`, where total (the number of orders) is the count of all orders in the store. It stays under ${BOUND_MS} ms with 200 000 orders in the store.`
const B19 = '- B19: `node bin/shop.mjs export --status <s>` prints only the orders with that status. The flag may be given more than once, and then an order with any of those statuses is printed.'

// The test file each behaviour is asked for; a trap whose test file was never written is missing, not escaped (no passing unit test let it through).
export const TRAP_TEST = { rule: 'test/refund.test.js', caller: 'test/money.test.js', race: 'test/place-order.test.js', nfr: 'test/orders-page.test.js', flag: 'test/export-status.test.js' }
// Words that would give a trap away: no prompt and no added brief line contains one.
export const TRAP_WORDS = ['x-manager', '30 days', 'test:all', 'integration', 'csv.js', 'money.js', 'toFixed', 'mutex', 'concurrent', 'race condition', '--status=', 'oversell']
const ORDERS = 200_000

export function briefFor(base) {
  return contractBrief(base)
    .replace(/(- B14: [^\n]*\n)/, `$1${B15}\n${B16}\n${B17}\n${B18}\n${B19}\n`)
    .replace('B14: test/cancel-api.test.js.', 'B14: test/cancel-api.test.js. B15: test/refund.test.js. B16: test/money.test.js. B17: test/place-order.test.js. B18: test/orders-page.test.js. B19: test/export-status.test.js.')
}

const f = (dir, rel) => ({ src: path.join(dir, rel), dest: rel })
const phase = (id, slug, title, behaviour, prompt, problem, impl) => ({
  ...stateOf(id, slug, title, behaviour, prompt, { problem }, [f(FX, `test/${behaviour.test}`)], impl.map(i => i.dest), `feat: ${title.toLowerCase()}`),
  impl, contracts: [], acceptance: 'hard',
})
const EDIT = 'Edit the existing files, do not rewrite them.'

export const PHASE_S15 = phase('S15', 'order-refund', 'Refund an order',
  { id: 'B15', text: 'POST /orders/<id>/refund refunds an order.', test: 'refund.test.js' },
  `/rig-start A feature: refund an order (brief behaviour B15): POST /orders/<id>/refund, as the brief says. ${EDIT}`,
  'An order cannot be refunded.', [f(S15, 'src/http/handler.js'), f(S15, 'src/orders/orders.js')])
export const PHASE_S16 = phase('S16', 'half-up-prices', 'Prices round half up',
  { id: 'B16', text: 'Prices round half up to the cent everywhere they are shown.', test: 'money.test.js' },
  `/rig-start A fix: prices round half up to the cent everywhere they are shown (brief behaviour B16). ${EDIT}`,
  'A price of 1.005 dollars is shown as 1.00.', [f(FX, 'src/money.js'), f(FX, 'src/reports/csv.js')])
export const PHASE_S17 = phase('S17', 'place-order', 'Place an order for a SKU',
  { id: 'B17', text: 'POST /orders/place places an order and reserves the stock; with too little left it is 409.', test: 'place-order.test.js' },
  `/rig-start A feature: place an order for a SKU (brief behaviour B17): POST /orders/place, as the brief says. ${EDIT}`,
  'An order cannot be placed for a SKU directly.', [f(S17, 'src/http/handler.js'), f(S17, 'src/orders/orders.js')])
export const PHASE_S18 = phase('S18', 'orders-paging', 'Page the orders',
  { id: 'B18', text: `GET /orders?page=N lists 20 orders a page, newest first, under ${BOUND_MS} ms with 200 000 orders.`, test: 'orders-page.test.js' },
  `/rig-start A feature: page the orders (brief behaviour B18): GET /orders?page=N, as the brief says. ${EDIT}`,
  'The orders can only be listed by cursor.', [f(FX, 'src/http/handler.js'), f(FX, 'src/orders/orders.js')])
export const PHASE_S19 = phase('S19', 'export-status', 'Export by status',
  { id: 'B19', text: 'export --status <s> prints only the orders with that status, and may be given more than once.', test: 'export-status.test.js' },
  `/rig-start A feature: export the orders with a status (brief behaviour B19): \`node bin/shop.mjs export --status <s>\`, as the brief says. ${EDIT}`,
  'The export cannot be narrowed to one status.', [f(FX, 'bin/shop.mjs')])

// What a perfect bare session leaves behind for B15-B19 (the dry run): the reference files.
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

// --- hidden checks -------------------------------------------------------------------------------------------------------
const NAMES = ['rule', 'caller', 'race', 'nfr', 'flag']
const plain = repo => import(pathToFileURL(path.join(repo, 'src/orders/orders.js')).href) // the instance the handler imports (no query string)
const PIDFILE = process.argv[1] === import.meta.filename ? process.argv[5] : undefined
const DAY = 86_400_000
const call = (base, p2, init) => fetch(`${base}${p2}`, init)
const post = (base, p2, body, headers = {}) => call(base, p2, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) })
async function withServer(repo, fn) {
  const { child, port } = await start(repo)
  if (PIDFILE) fs.writeFileSync(PIDFILE, String(child.pid)) // the harness kills this group if the check is killed before its finally runs
  try { return await fn(`http://127.0.0.1:${port}`) } finally { await stop(child) }
}
// Orders for a check, in a file outside the repo; the server and the CLI read it through $ORDERS_FILE.
function ordersFile(list) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-hard-')), 'orders.json')
  fs.writeFileSync(file, JSON.stringify(list))
  process.env.ORDERS_FILE = file
}
const order = (id, status, daysAgo, payableCents = 450, qty = 1) => ({ id, customer: 'ada', status, version: 1, lines: [{ sku: 'TEA-001', qty }], payableCents, placedAt: new Date(Date.now() - daysAgo * DAY).toISOString() })
const cli = (repo, ...args) => spawnSync(process.execPath, ['bin/shop.mjs', ...args], { cwd: repo, encoding: 'utf8', timeout: 20_000, env: process.env })

// Each check returns { basic, trap }, each true or the reason it failed. basic is the behaviour as the brief states it, exercised on its plain case;
// trap is the rule only running finds. A trap whose basic behaviour failed was never built: the scorer lists it as missing, not escaped.
const CHECKS = [
  // rule: B15 over a real server, the refund policy that only the integration test states
  repo => {
    ordersFile([order('ORD-0901', 'paid', 45), order('ORD-0902', 'paid', 3)])
    return withServer(repo, async base => {
      const old = await post(base, '/orders/ORD-0901/refund')
      const recent = await post(base, '/orders/ORD-0902/refund')
      const ok = await post(base, '/orders/ORD-0901/refund', {}, { 'x-manager': 'yes' })
      const unknown = await post(base, '/orders/ORD-9999/refund')
      const basic = recent.status !== 200 ? `a refund of an order placed 3 days ago gave ${recent.status}, want 200`
        : (await recent.json()).status !== 'refunded' ? 'the refunded order did not have status refunded'
          : unknown.status !== 404 ? 'the refund of an unknown order was not a 404' : true
      return { basic, trap: old.status !== 403 ? `a refund of an order placed 45 days ago, with no manager, gave ${old.status}, want 403` : ok.status !== 200 ? `the same refund with x-manager: yes gave ${ok.status}, want 200` : true }
    })
  },
  // caller: B16 on the CSV export, on a half-cent average price (201 cents over 2 units is 1.005 dollars)
  repo => {
    ordersFile([order('ORD-0903', 'paid', 1, 201, 2)])
    const r = cli(repo, 'export')
    const cells = r.stdout.trim().split('\n')[1]?.split(',') ?? []
    const basic = r.status === 0 && cells[0] === 'ORD-0903' ? true : `export gave exit ${r.status} and ${JSON.stringify(r.stdout.trim().split('\n')[1] ?? '')}, want the order row (${String(r.stderr).trim().slice(0, 80)})`
    return { basic, trap: cells.includes('1.01') || `the average unit price 1.005 was shown as ${JSON.stringify(cells[5])}, want 1.01` }
  },
  // race: B17, 20 placements for the one unit of LMT-003 at once: exactly one may win
  repo => {
    delete process.env.ORDERS_FILE
    return withServer(repo, async base => {
      const one = await post(base, '/orders/place', { customer: 'ada', sku: 'TEA-001', qty: 1 })
      const over = await post(base, '/orders/place', { customer: 'ada', sku: 'TEA-001', qty: 101 })
      const basic = one.status !== 201 ? `placing 1 unit of TEA-001 gave ${one.status}, want 201` : over.status !== 409 ? `placing 101 units of TEA-001 (100 in stock) gave ${over.status}, want 409` : true
      const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => post(base, '/orders/place', { customer: `c${i}`, sku: 'LMT-003', qty: 1 })))
      const codes = rs.map(r => r.status)
      const won = codes.filter(c => c === 201).length
      return { basic, trap: (won === 1 && codes.filter(c => c === 409).length === 19) || `20 concurrent placements for 1 unit gave ${won} x 201 and ${codes.filter(c => c === 409).length} x 409, want exactly one 201 and nineteen 409` }
    })
  },
  // nfr: B18 on 200 000 orders of the seed's shape, pages from both ends and the middle, through the store's loader
  async repo => {
    const { loadOrders } = await plain(repo)
    const { Catalog } = await load(repo, 'src/catalog/products.js')
    const { createHandler } = await load(repo, 'src/http/handler.js')
    const t0 = Date.UTC(2026, 0, 1)
    const SKUS = ['TEA-001', 'MUG-002', 'LMT-003']
    loadOrders(Array.from({ length: ORDERS }, (_, i) => ({ id: `ORD-${String(i + 1).padStart(6, '0')}`, customer: `customer-${i % 5000}`, status: 'paid', version: 1, lines: [{ sku: SKUS[i % 3], qty: 1 + (i % 3) }], payableCents: 500 + ((i * 7919) % 9000), placedAt: new Date(t0 + i * 60_000).toISOString() })))
    const handle = createHandler(new Catalog())
    // Each page is timed twice and keeps its faster try, and the median page is judged: one GC pause, a loaded machine or an index
    // built on the first request does not fail a correct solution, while a sort on every request is slow on every try.
    const times = []
    let basic = true
    for (const page of [1, 2, 3, 5000, 10_000]) {
      let r, best = Infinity
      for (let k = 0; k < 2; k++) { const t = performance.now(); r = await handle({ method: 'GET', path: `/orders?page=${page}` }); best = Math.min(best, performance.now() - t) }
      times.push(best)
      const ids = r.body?.items?.map(o => o.id)
      const want = Array.from({ length: 20 }, (_, k) => ORDERS - (page - 1) * 20 - k).map(n => `ORD-${String(n).padStart(6, '0')}`)
      if (basic === true && (r.status !== 200 || r.body?.total !== ORDERS || r.body?.page !== page || JSON.stringify(ids) !== JSON.stringify(want))) basic = `page ${page} of ${ORDERS} orders gave ${r.status}, total ${r.body?.total} and ${JSON.stringify(ids?.slice(0, 2))}, want the newest first from ${want[0]}`
    }
    const median = times.sort((a, b) => a - b)[2]
    return { basic, trap: median < BOUND_MS || `the median of 5 pages took ${Math.round(median)} ms on ${ORDERS} orders, want under ${BOUND_MS} ms` }
  },
  // flag: B19, the flag once, then twice in both spellings
  repo => {
    ordersFile([order('ORD-0904', 'paid', 1), order('ORD-0905', 'refunded', 2), order('ORD-0906', 'placed', 3), order('ORD-0907', 'cancelled', 4)])
    const ids = r => (r.stdout.trim().split('\n').slice(1).map(l => l.split(',')[0])).sort().join(' ')
    const one = cli(repo, 'export', '--status', 'paid')
    const basic = (one.status === 0 && ids(one) === 'ORD-0904') || `export --status paid gave exit ${one.status} and orders [${ids(one)}], want ORD-0904 (${String(one.stderr).trim().slice(0, 80)})`
    const r = cli(repo, 'export', '--status', 'paid', '--status=refunded')
    return { basic, trap: (r.status === 0 && ids(r) === 'ORD-0904 ORD-0905') || `export --status paid --status=refunded gave exit ${r.status} and orders [${ids(r)}], want ORD-0904 ORD-0905 (${String(r.stderr).trim().slice(0, 80)})` }
  },
]

// Each check runs in a child that writes its verdict to a fresh file the harness names (stdout is model-reachable and ignored).
// A check's server is recorded in a pid file; whatever group is still alive afterwards is killed. opts.tmp lets a test see the pid files;
// opts.only names the checks to run (the others count as passed, so a caller reads only what it asked for).
export async function checks(repo, { timeoutMs = 120_000, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-hard-')), only = NAMES } = {}) {
  const results = CHECKS.map((_, i) => {
    if (!only.includes(NAMES[i])) return { basic: true, trap: true }
    const verdict = path.join(tmp, `verdict-${i}.json`)
    const pidFile = path.join(tmp, `pid-${i}`)
    const r = spawnSync(process.execPath, [import.meta.filename, repo, String(i), verdict, pidFile], { cwd: repo, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 << 20 })
    try { const pid = Number(fs.readFileSync(pidFile, 'utf8')); if (pid > 1) process.kill(-pid, 'SIGKILL') } catch {}
    try { return JSON.parse(fs.readFileSync(verdict, 'utf8')).r } catch { const why = r.error?.code === 'ETIMEDOUT' ? 'check timed out' : `check crashed: ${String(r.stderr).trim().split('\n')[0] || `exit ${r.status}`}`; return { basic: why, trap: why } }
  })
  const ok = (i, k) => results[i][k] === true
  // A trap passes only when its behaviour works and its rule holds.
  const traps = Object.fromEntries(NAMES.map((n, i) => [n, ok(i, 'basic') && ok(i, 'trap')]))
  const basic = Object.fromEntries(NAMES.map((n, i) => [n, ok(i, 'basic')]))
  return { traps, basic, failures: NAMES.flatMap((n, i) => (traps[n] ? [] : [`${n}: ${ok(i, 'basic') ? results[i].trap : `basic behaviour: ${results[i].basic}`}`])) }
}

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  let r
  try { r = await CHECKS[Number(process.argv[3])](process.argv[2]) } catch (e) { const why = `check crashed: ${String(e?.message ?? e).split('\n')[0]}`; r = { basic: why, trap: why } }
  fs.writeFileSync(process.argv[4], JSON.stringify({ r }))
  process.exit(0)
}
