// Hidden browser checks for the ui variant: one per trap, each { trap, run(repo) -> { basic, trap } } (each true or the reason it failed).
// They start the repo's own server on a fresh orders file and drive one page in headless Chromium. ui.mjs runs each in a child process
// and reads the verdict from a file the harness names, so nothing the model's code prints counts.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { start, stop } from '../../../tests/e2e/fixtures/tooling/scripts/contract.mjs'
import { withPage } from '../../lib/browser.mjs'

const WAIT = 4000
const order = (id, customer, placedAt, lines, payableCents) => ({ id, customer, status: 'paid', version: 1, lines, payableCents, placedAt })
const ORDERS = [
  order('ORD-0801', 'ada', '2026-02-01T09:00:00.000Z', [{ sku: 'TEA-001', qty: 2 }, { sku: 'MUG-002', qty: 1 }], 2100),
  order('ORD-0802', 'bob', '2026-02-02T09:00:00.000Z', [{ sku: 'MUG-002', qty: 1 }], 1200),
  order('ORD-0803', 'ada', '2026-02-03T09:00:00.000Z', [{ sku: 'TEA-001', qty: 1 }], 450),
]

async function withShop(repo, fn) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ui-')), 'orders.json')
  fs.writeFileSync(file, JSON.stringify(ORDERS))
  process.env.ORDERS_FILE = file
  const { child, port } = await start(repo)
  try { return await fn(`http://127.0.0.1:${port}`) } finally { await stop(child) }
}
const rows = page => page.locator('tbody tr:has(td)')
const open = (page, base, name) => page.goto(`${base}/ui/customers/${encodeURIComponent(name)}`, { waitUntil: 'networkidle' })

export const CHECKS = [
  // error: a customer the endpoint answers 404 for shows its error text in an alert and no rows
  {
    trap: 'error',
    run: repo => withShop(repo, base => withPage(async page => {
      const known = await open(page, base, 'ada')
      const basic = !known?.ok() ? `the page for ada gave ${known?.status()}, want it served`
        : await rows(page).first().waitFor({ timeout: WAIT }).then(() => true, () => 'the page for ada shows no order row')
      const api = await (await fetch(`${base}/customers/nobody/orders`)).json().catch(() => ({}))
      if (typeof api.error !== 'string') return { basic, trap: 'the endpoint gave no error text for an unknown customer' }
      await open(page, base, 'nobody')
      const alert = page.locator('[role="alert"]').first()
      const shown = await alert.waitFor({ timeout: WAIT }).then(() => alert.innerText(), () => null)
      const n = await rows(page).count()
      return { basic, trap: shown === null ? 'the page for an unknown customer has no element with role="alert"' : !shown.includes(api.error) ? `the alert says ${JSON.stringify(shown.slice(0, 80))}, want the endpoint's ${JSON.stringify(api.error)}` : n > 0 ? `the page for an unknown customer shows ${n} order rows` : true }
    })),
  },
  // field: each line shows the product's name from the catalog, never its sku
  {
    trap: 'field',
    run: repo => withShop(repo, base => withPage(async page => {
      await open(page, base, 'ada')
      const loaded = await rows(page).first().waitFor({ timeout: WAIT }).then(() => true, () => false)
      if (!loaded) return { basic: 'the page for ada shows no order row', trap: 'no order row' }
      // Names may arrive after a second fetch: give them time before judging.
      await page.waitForFunction(() => /Green tea/.test(document.querySelector('tbody')?.innerText ?? ''), null, { timeout: WAIT }).catch(() => {})
      const text = (await rows(page).allInnerTexts()).join('\n')
      const basic = text.includes('ORD-0801') && text.includes('ORD-0803') ? true : `the page for ada shows ${JSON.stringify(text.slice(0, 80))}, want both ORD-0801 and ORD-0803`
      return { basic, trap: !text.includes('Green tea') || !text.includes('Mug') ? `the lines do not show the product names Green tea and Mug (${JSON.stringify(text.slice(0, 120))})` : /TEA-001|MUG-002/.test(text) ? 'a line shows a sku next to or instead of the product name' : true }
    })),
  },
]

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  const i = CHECKS.findIndex(c => c.trap === process.argv[3])
  let r
  try { r = await CHECKS[i].run(process.argv[2]) } catch (e) { const why = `check crashed: ${String(e?.message ?? e).split('\n')[0]}`; r = { basic: why, trap: why } }
  fs.writeFileSync(process.argv[4], JSON.stringify({ r }))
  process.exit(0)
}
