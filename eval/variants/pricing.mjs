// The "pricing" variant: B10-B12 on top of a built B1-B9 shop, the task where a bare model has many exact rules to hold at once.
// Why it exists (eval 2026-10-30/31): bare Sonnet passes B8-B9 every time and bare Haiku passes them from a built shop, so a ceiling hid any lift
// from rig. Here the brief states about forty exact details (cent allocation, rounding, check order, error text, state that outlives a call),
// the kind a one-shot session drops one of. Rig's spec, plan and AC-to-test gate are what should keep them.
// totalCents keeps its meaning (the B1-B9 acceptance pins it); the new money is payableCents. A model that "fixes" totalCents breaks B3 and B4.
// Every arm starts from the same built B1-B9 shop. Rig builds B10, B11 and B12 as three changes (S10-S12); a bare arm gets one prompt.
// Hidden acceptance is imported (not HTTP) and run in a child process: model code never runs inside the scorer.
import fs from 'node:fs'
import path from 'node:path'
import { briefFor as rulesBrief, stateOf, load, throwsWith } from './rules.mjs'

const FX = path.resolve(import.meta.dirname, 'pricing/fixtures')
const fx = rel => path.join(FX, rel)

const PRICING_RULES = ' **Pricing (B10).** `Catalog.add` also accepts the optional booleans `taxable` (default true) and `digital` (default false), returned by `get` and `list` when set; a value that is not a boolean throws `taxable must be a boolean` or `digital must be a boolean`. The discount, however it arises, is split across the order\'s lines in proportion to each line\'s amount (`qty × unitCents`), each share rounded down, and the cents left over go one each to the earliest lines; every order line carries its `discountCents` and its `taxCents`. Tax is 8.25% of a taxable line\'s amount after its discount share, rounded half up to whole cents per line; a product with `taxable: false` pays none. Shipping is 599 cents, or 0 when the order holds only digital products, or when `subtotalCents − discountCents` is 7500 or more. The order also carries `shippingCents`, `taxCents` (the sum of its lines\') and `payableCents = totalCents + shippingCents + taxCents`; `totalCents` is still `subtotalCents − discountCents`, and the HTTP contract changes only by these extra fields. **Coupons (B11).** `checkout(cart, { code, customer })`; `customer` defaults to `guest`. Besides `SAVE10` and `SAVE20`: `FIVEOFF` takes 500 cents off an order of 2000 cents or more and otherwise throws `coupon minimum not met: FIVEOFF`; `SHIPFREE` makes shipping 0 and gives no discount. A code replaces the automatic discount, as before. Each customer can use each code once: a second use throws `coupon already used: <code>`; a checkout that fails uses nothing up. After the earlier checks (empty cart, stock, line limit) the code is checked in this order: unknown, already used, minimum. **Orders (B12).** Each successful checkout gets an `id` (`ORD-0001`, `ORD-0002`, …: four digits, counting successful checkouts only, per process) and `status: \'placed\'`, and the order carries its `customer` and, when it had one, its `code`. `src/orders/orders.js` also exports `cancelOrder(id)`, which puts each line\'s quantity back in stock, makes that customer\'s use of the order\'s code available again, sets `status` to `cancelled` and returns the order; an unknown id throws `unknown order: <id>`, and cancelling twice throws `order already cancelled: <id>`. `listOrders()` returns every order, newest first, cancelled ones included.'
const B10 = '- B10: checkout adds shipping and tax to each order and splits its discount across the lines; totalCents does not change.'
const B11 = '- B11: the FIVEOFF and SHIPFREE coupons, each usable once per customer; a failed order uses none up.'
const B12 = '- B12: orders have ids and can be cancelled, which puts the stock and the coupon back; listOrders is newest first.'

export function briefFor(base) {
  return rulesBrief(base)
    .replace('reduces each line\'s product stock by its `qty`.', m => m + PRICING_RULES)
    .replace(/(- B9: [^\n]*\n)/, `$1${B10}\n${B11}\n${B12}\n`)
    .replace('B8–B9: unit tests in test/rules.test.js.', 'B8–B9: unit tests in test/rules.test.js. B10: test/pricing.test.js. B11: test/coupons.test.js. B12: test/cancel.test.js.')
}

const IMPL = ['src/catalog/products.js', 'src/orders/orders.js']
// The dry rig driver expects each change's new test to fail first, so each change gets the orders module as it stood after that change.
const STAGE = { S10: 'stages/s10', S11: 'stages/s11', S12: '' }
const from = (id, f) => (f.endsWith('orders.js') && STAGE[id] ? fx(`../${STAGE[id]}/${f}`) : fx(f))
// stateOf resolves its implementation files against the rules fixtures; B10-B12 build on those, so the files come from here.
const phase = (id, slug, title, behaviour, prompt, problem, test) => ({
  ...stateOf(id, slug, title, behaviour, prompt, { problem }, [{ src: fx(`test/${test}`), dest: `test/${test}` }], IMPL, `feat(orders): ${title.toLowerCase()}`),
  impl: IMPL.map(f => ({ src: from(id, f), dest: f })),
})
const TAIL = 'see the brief for the exact rules, messages and edge cases; edit the existing files, do not rewrite them; `totalCents` keeps its meaning.'

export const PHASE_S10 = phase('S10', 'tax-shipping', 'Tax, shipping and the split discount',
  { id: 'B10', text: 'checkout splits the discount across lines, adds per-line tax and shipping, and reports payableCents; totalCents does not change.', test: 'pricing.test.js' },
  `/rig-start A feature: tax and shipping (brief behaviour B10): products may be non-taxable or digital, the discount is split across the lines, and an order carries shippingCents, taxCents and payableCents; ${TAIL}`,
  'An order has no tax or shipping, and a discount is only an order-level number.', 'pricing.test.js')
export const PHASE_S11 = phase('S11', 'coupons', 'FIVEOFF and SHIPFREE coupons, once per customer',
  { id: 'B11', text: 'FIVEOFF and SHIPFREE work, each once per customer; a failed order uses none up.', test: 'coupons.test.js' },
  `/rig-start A feature: coupons (brief behaviour B11): FIVEOFF and SHIPFREE, a customer on checkout, each code once per customer; ${TAIL}`,
  'The only codes are percentages and any can be used again and again.', 'coupons.test.js')
export const PHASE_S12 = phase('S12', 'order-cancel', 'Order ids, cancel and the order list',
  { id: 'B12', text: 'orders get ids, cancelOrder puts stock and the coupon back, and listOrders is newest first.', test: 'cancel.test.js' },
  `/rig-start A feature: cancelling orders (brief behaviour B12): orders get ids and a status, cancelOrder puts the stock and the coupon use back, listOrders lists newest first; ${TAIL}`,
  'A placed order cannot be undone, and nothing lists the orders.', 'cancel.test.js')
for (const ph of [PHASE_S10, PHASE_S11, PHASE_S12]) ph.acceptance = 'pricing'

// What a perfect bare session leaves behind for B10-B12 (the dry run).
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

async function modules(repo) {
  const { Catalog } = await load(repo, 'src/catalog/products.js')
  const { Cart } = await load(repo, 'src/cart/cart.js')
  const orders = await load(repo, 'src/orders/orders.js')
  // A fresh catalog and cart per call; the orders module is loaded fresh per check, so its ids and used coupons start clean.
  const one = (products, lines) => {
    const catalog = new Catalog()
    for (const p of products) catalog.add(p)
    const cart = new Cart(catalog)
    for (const [sku, qty] of lines) cart.add(sku, qty)
    return { catalog, cart }
  }
  return { ...orders, one }
}
const p = (sku, priceCents, extra = {}) => ({ sku, name: sku, priceCents, ...extra })
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const CHECKS = {
  b10: [
    async repo => {
      const m = await modules(repo)
      const { cart } = m.one([p('AAA-001', 3333), p('BBB-002', 3333), p('CCC-003', 3334)], [['AAA-001', 1], ['BBB-002', 1], ['CCC-003', 1]])
      const o = m.checkout(cart, { code: 'SAVE10', customer: 'x' })
      const d = o.lines.map(l => l.discountCents), t = o.lines.map(l => l.taxCents)
      if (!sameList(d, [334, 333, 333])) return `a 1000 cent discount over lines of 3333, 3333 and 3334 was split ${JSON.stringify(d)}, want [334,333,333] (leftover cents to the earliest lines)`
      if (!sameList(t, [247, 248, 248]) || o.taxCents !== 743) return `per-line tax after the discount was ${JSON.stringify(t)} (total ${o.taxCents}), want [247,248,248] (half up per line) and 743`
      return true
    },
    async repo => {
      const m = await modules(repo)
      const { cart } = m.one([p('AAA-001', 1000, { taxable: false }), p('BBB-002', 1000)], [['AAA-001', 1], ['BBB-002', 1]])
      const o = m.checkout(cart)
      if (o.taxCents !== 83) return `a taxable line of 1000 beside a non-taxable one gave taxCents ${o.taxCents}, want 83`
      return throwsWith(() => m.one([p('AAA-001', 100, { digital: 'yes' })], []), /digital must be a boolean/) || 'a non-boolean digital did not throw digital must be a boolean'
    },
    async repo => {
      const m = await modules(repo)
      const ship = cents => m.checkout(m.one([p('AAA-001', cents)], [['AAA-001', 1]]).cart).shippingCents
      if (ship(8333) !== 0) return 'an order of 8333 (7500 after its 833 discount) did not ship free'
      if (ship(8332) !== 599) return 'an order of 8332 (7499 after its discount) did not pay 599 shipping: the threshold is after the discount'
      return ship(2000) === 599 || 'a small order did not pay 599 shipping'
    },
    async repo => {
      const m = await modules(repo)
      const { cart } = m.one([p('AAA-001', 900, { digital: true }), p('BBB-002', 900)], [['AAA-001', 1]])
      if (m.checkout(cart).shippingCents !== 0) return 'an order of digital products only paid shipping'
      cart.add('BBB-002', 1)
      return m.checkout(cart).shippingCents === 599 || 'a digital and a physical product together did not pay 599 shipping'
    },
    async repo => {
      const m = await modules(repo)
      const o = m.checkout(m.one([p('AAA-001', 2000)], [['AAA-001', 1]]).cart)
      if (o.totalCents !== 2000) return `totalCents became ${o.totalCents}: it must stay subtotal minus discount (2000)`
      return o.payableCents === 2764 || `payableCents was ${o.payableCents}, want 2000 + 599 shipping + 165 tax = 2764`
    },
  ],
  b11: [
    async repo => {
      const m = await modules(repo)
      const at = cents => m.checkout(m.one([p('AAA-001', cents)], [['AAA-001', 1]]).cart, { code: 'FIVEOFF', customer: `u${cents}` })
      if (!throwsWith(() => at(1999), /coupon minimum not met: FIVEOFF/)) return 'FIVEOFF on 1999 cents did not throw coupon minimum not met: FIVEOFF'
      return at(2000).discountCents === 500 || 'FIVEOFF on exactly 2000 cents did not take 500 off'
    },
    async repo => {
      const m = await modules(repo)
      const o = m.checkout(m.one([p('AAA-001', 6000)], [['AAA-001', 1]]).cart, { code: 'SHIPFREE', customer: 'x' })
      return (o.discountCents === 0 && o.shippingCents === 0) || `SHIPFREE on 6000 gave discountCents ${o.discountCents} and shippingCents ${o.shippingCents}, want 0 and 0 (a code replaces the automatic discount)`
    },
    async repo => {
      const m = await modules(repo)
      const cart = () => m.one([p('AAA-001', 3000)], [['AAA-001', 1]]).cart
      m.checkout(cart(), { code: 'FIVEOFF', customer: 'ann' })
      if (!throwsWith(() => m.checkout(cart(), { code: 'FIVEOFF', customer: 'ann' }), /coupon already used: FIVEOFF/)) return 'a second FIVEOFF for the same customer did not throw coupon already used: FIVEOFF'
      return m.checkout(cart(), { code: 'FIVEOFF', customer: 'bob' }).discountCents === 500 || 'FIVEOFF for a different customer was refused'
    },
    async repo => {
      const m = await modules(repo)
      if (!throwsWith(() => m.checkout(m.one([p('AAA-001', 1000)], [['AAA-001', 1]]).cart, { code: 'FIVEOFF', customer: 'cy' }), /minimum/)) return 'FIVEOFF under the minimum did not fail'
      return m.checkout(m.one([p('AAA-001', 2500)], [['AAA-001', 1]]).cart, { code: 'FIVEOFF', customer: 'cy' }).discountCents === 500 || 'a failed order used the coupon up'
    },
    async repo => {
      const m = await modules(repo)
      if (!throwsWith(() => m.checkout(m.one([p('AAA-001', 1000, { stock: 2 })], [['AAA-001', 3]]).cart, { code: 'NOPE', customer: 'dee' }), /insufficient stock: AAA-001/)) return 'an order over the stock with an unknown code did not fail with the stock check first'
      return throwsWith(() => m.checkout(m.one([p('AAA-001', 1000)], [['AAA-001', 1]]).cart, { code: 'NOPE', customer: 'dee' }), /unknown discount code: NOPE/) || 'an unknown code did not throw unknown discount code: <code>'
    },
  ],
  b12: [
    async repo => {
      const m = await modules(repo)
      const cart = m.one([p('AAA-001', 2500)], [['AAA-001', 2]]).cart
      const a = m.checkout(cart)
      throwsWith(() => m.checkout(m.one([], []).cart), /empty/)
      const b = m.checkout(cart)
      if (!/^ORD-\d{4}$/.test(a.id) || a.status !== 'placed') return `the first order was ${a.id} ${a.status}, want ORD-0001 placed`
      return Number(b.id.slice(4)) - Number(a.id.slice(4)) === 1 || `ids ${a.id} then ${b.id}: a failed checkout used an id up, or ids are not sequential`
    },
    async repo => {
      const m = await modules(repo)
      const { catalog, cart } = m.one([p('AAA-001', 2500, { stock: 5 })], [['AAA-001', 2]])
      const o = m.checkout(cart)
      const back = m.cancelOrder(o.id)
      return (back.status === 'cancelled' && catalog.get('AAA-001').stock === 5) || `after cancel the status was ${back.status} and the stock ${catalog.get('AAA-001').stock}, want cancelled and 5`
    },
    async repo => {
      const m = await modules(repo)
      const { cart } = m.one([p('AAA-001', 2500)], [['AAA-001', 2]])
      const o = m.checkout(cart, { code: 'FIVEOFF', customer: 'zed' })
      m.cancelOrder(o.id)
      return m.checkout(cart, { code: 'FIVEOFF', customer: 'zed' }).discountCents === 500 || 'cancelling an order did not free its coupon for that customer'
    },
    async repo => {
      const m = await modules(repo)
      const { cart } = m.one([p('AAA-001', 2500)], [['AAA-001', 1]])
      const first = m.checkout(cart), second = m.checkout(cart)
      m.cancelOrder(first.id)
      if (!throwsWith(() => m.cancelOrder(first.id), new RegExp(`order already cancelled: ${first.id}`))) return 'cancelling twice did not throw order already cancelled: <id>'
      if (!throwsWith(() => m.cancelOrder('ORD-9999'), /unknown order: ORD-9999/)) return 'an unknown id did not throw unknown order: <id>'
      const ids = m.listOrders().map(o => o.id)
      return (ids.indexOf(second.id) !== -1 && ids.indexOf(second.id) < ids.indexOf(first.id) && m.listOrders().find(o => o.id === first.id)?.status === 'cancelled') || 'listOrders was not newest first with the cancelled order kept'
    },
  ],
}

export async function pricingChecks(repo) {
  const out = { failures: [] }
  for (const [group, checks] of Object.entries(CHECKS)) {
    let ok = 0
    for (const f of checks) {
      let r
      try { r = await f(repo) } catch (e) { r = `check crashed: ${String(e?.message ?? e).split('\n')[0]}` }
      if (r === true) ok++
      else out.failures.push(`${group}: ${r}`)
    }
    out[group] = ok
  }
  return out
}

if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(await pricingChecks(process.argv[2])))
