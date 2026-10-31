// The "rules" variant: the links brief (B1–B7) plus B8 (order rules with edge cases) and B9 (a reversed earlier rule).
// B8 stacks three small rules whose interaction fails silently (stock before cap, a 5000-cent threshold, half-up rounding).
// B9 reverses the sum-on-re-add rule of B2, so the builder's own earlier test must change legitimately.
// Rig arms build B8 and B9 as two further changes (S8, S9) after S7; a bare arm gets one prompt for B1–B9.
// Hidden acceptance is imported (not HTTP) and run in a child process: model code never runs inside the scorer.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { briefFor as linksBrief } from './links.mjs'

const FX = path.resolve(import.meta.dirname, 'rules/fixtures')
const S8_TEST = path.resolve(import.meta.dirname, 'rules/s8/test/rules.test.js')
const fx = rel => path.join(FX, rel)

const STOCK = ' `add` also accepts an optional `stock` (a non-negative integer; omitted means unlimited), and `get` and `list` return it as `stock` when it is set.'
const RE_ADD = ' From B9 on, adding a SKU already in the cart replaces its quantity with the new `qty` (still one line per SKU).'
const ORDER_RULES = ' `checkout` applies these rules in this order. (1) Stock: if any line\'s `qty` is more than that product\'s `stock`, the whole order fails with `insufficient stock: <sku>`, nothing is reserved, and the stock and the cart are unchanged. (2) Line limit: a line with `qty` over 10 fails with `quantity over limit: <sku>` (exactly 10 is allowed). (3) Discount: when no code is given and `subtotalCents` is 5000 or more (exactly 5000 qualifies), `discountCents` is 10% of the order\'s subtotal (not per line), rounded half up to whole cents; a given code replaces this discount, so at most one discount applies. A successful checkout reduces each line\'s product stock by its `qty`.'
const B8 = '- B8: checkout refuses an order that exceeds the stock or has a line over 10, and gives 10% off an order of 5000 cents or more; a successful checkout takes the quantities out of stock.'
const B9 = '- B9: adding a SKU that is already in the cart replaces its quantity instead of adding to it.'

export function briefFor(base) {
  return linksBrief(base)
    .replace('`list()` returns every product as `{ sku, name, priceCents }`.', m => m + STOCK)
    .replace('adding a SKU again adds to its quantity.', m => m + RE_ADD)
    .replace('an empty cart throws `cart is empty`.', m => m + ORDER_RULES)
    .replace(/(- B7: [^\n]*\n)/, `$1${B8}\n${B9}\n`)
    .replace('B7: unit tests in test/links.test.js.', 'B7: unit tests in test/links.test.js. B8–B9: unit tests in test/rules.test.js.')
}

export const stateOf = (id, slug, title, behaviour, prompt, files, tests, impl, commit) => ({
  id, slug, type: 'feature', title, prompt,
  intent: { problem: files.problem, outcome: `${behaviour.id} of the brief holds and the earlier behaviour is unchanged.`, nonGoals: 'Persistence, payment, new HTTP routes.' },
  spec: `# Spec: ${title}\n\n## Behaviours\n- ${behaviour.id}: ${behaviour.text}\n\n## Out of scope\n- New HTTP routes.\n\n## Open questions\nnone\n`,
  plan: `# Plan: ${title}\n\n## Files\n${impl.map(f => `- ${f}`).join('\n')}\n- test/${behaviour.test}\n\n## Tests\n- ${behaviour.id}: test/${behaviour.test} (unit)\n\n## Contracts\nnone (the HTTP contract is unchanged)\n\n## Verification\n- npm test\n\n## Open questions\nnone\n`,
  contracts: [],
  tests, impl: impl.map(f => ({ src: fx(f), dest: f })), commit,
})

export const PHASE_S8 = stateOf('S8', 'order-rules', 'Order rules: stock, line limit and the large-order discount',
  { id: 'B8', text: 'checkout refuses an order over the stock or with a line over 10, gives 10% off an order of 5000 cents or more, and takes sold quantities out of stock.', test: 'rules.test.js' },
  '/rig-start A feature: order rules (brief behaviour B8): the catalog takes an optional `stock`, and checkout applies the stock check, then the per-line limit of 10, then the 10% discount on an order of 5000 cents or more (see the brief for the exact messages and edge cases); edit the existing files, do not rewrite them; the HTTP contract does not change.',
  { problem: 'An order can ask for more than is in stock, any quantity, and large orders earn nothing.' },
  [{ src: S8_TEST, dest: 'test/rules.test.js' }], ['src/catalog/products.js', 'src/orders/orders.js'], 'feat(orders): stock check, line limit and large-order discount')
PHASE_S8.acceptance = 'rules'

// S9 replaces the builder's old re-add test in test/shop.test.js with the updated one: the brief changed, so the test must.
export const PHASE_S9 = stateOf('S9', 'cart-replace', 'Re-adding a SKU replaces its quantity',
  { id: 'B9', text: 'adding a SKU already in the cart replaces its quantity, still one line per SKU.', test: 'rules.test.js' },
  '/rig-start A change of an earlier rule (brief behaviour B9): adding a SKU that is already in the cart now replaces its quantity instead of adding to it, so the earlier test of the old rule in test/shop.test.js must be updated to the new rule; edit the existing files, do not rewrite them; the HTTP contract does not change.',
  { problem: 'Adding an item again adds to its quantity, but a shopper re-adding a line means to set it.' },
  [{ src: fx('test/shop.test.js'), dest: 'test/shop.test.js' }, { src: fx('test/rules.test.js'), dest: 'test/rules.test.js' }], ['src/cart/cart.js'], 'feat(cart): re-adding a SKU replaces its quantity')
PHASE_S9.acceptance = 'rules'

// What a perfect bare session leaves behind for B8 and B9 (the dry run), on top of the links overlay.
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

// Hidden acceptance for B8 and B9: module imports in a fresh process. Each check returns true or a message the brief explains.
let loads = 0 // two checks in one millisecond must not share a module instance (and its state)
export const load = (repo, rel) => import(`${pathToFileURL(path.join(repo, rel)).href}?t=${Date.now()}-${loads++}`)
export const throwsWith = (fn, re) => { try { fn() } catch (e) { return re.test(e.message) } return false }

async function modules(repo) {
  const { Catalog } = await load(repo, 'src/catalog/products.js')
  const { Cart } = await load(repo, 'src/cart/cart.js')
  const { checkout } = await load(repo, 'src/orders/orders.js')
  const one = (...products) => {
    const catalog = new Catalog()
    for (const p of products) catalog.add(p)
    return { catalog, cart: new Cart(catalog) }
  }
  return { one, checkout }
}

const B8_CHECKS = [
  async repo => {
    const { one, checkout } = await modules(repo)
    const { catalog, cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 450, stock: 2 }, { sku: 'MUG-002', name: 'Mug', priceCents: 1200, stock: 5 })
    if (catalog.get('TEA-001')?.stock !== 2) return 'get did not return the stock the product was added with'
    cart.add('MUG-002', 1); cart.add('TEA-001', 3)
    if (!throwsWith(() => checkout(cart), /insufficient stock: TEA-001/)) return 'an order for more than the stock did not fail with insufficient stock: <sku>'
    if (catalog.get('TEA-001').stock !== 2 || catalog.get('MUG-002').stock !== 5 || cart.lines().length !== 2 || cart.lines().find(l => l.sku === 'TEA-001')?.qty !== 3) return 'a failed order changed the stock or the cart'
    return true
  },
  async repo => {
    const { one, checkout } = await modules(repo)
    const { cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 100 })
    cart.add('TEA-001', 10)
    let ok = false
    try { ok = checkout(cart).subtotalCents === 1000 } catch {}
    if (!ok) return 'a line of exactly 10 was rejected'
    cart.add('TEA-001', 11)
    return throwsWith(() => checkout(cart), /quantity over limit: TEA-001/) || 'a line of 11 did not fail with quantity over limit: <sku>'
  },
  async repo => {
    const { one, checkout } = await modules(repo)
    const { cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 100, stock: 5 })
    cart.add('TEA-001', 11)
    return throwsWith(() => checkout(cart), /insufficient stock/) || 'a line over both the stock and the limit did not fail with the stock check first'
  },
  async repo => {
    const { one, checkout } = await modules(repo)
    const at = cents => { const { cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: cents }); cart.add('TEA-001', 1); return checkout(cart).discountCents }
    if (at(5000) !== 500) return 'an order of exactly 5000 cents did not get a 500 cent discount'
    return at(4999) === 0 || 'an order under 5000 cents got a discount'
  },
  async repo => {
    const { one, checkout } = await modules(repo)
    const { cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 5005 })
    cart.add('TEA-001', 1)
    const o = checkout(cart)
    return (o.discountCents === 501 && o.totalCents === 4504) || `a 5005 cent order got discountCents ${o.discountCents}, not rounded half up`
  },
  async repo => {
    const { one, checkout } = await modules(repo)
    const { catalog, cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 3000, stock: 4 }, { sku: 'MUG-002', name: 'Mug', priceCents: 3000, stock: 4 })
    cart.add('TEA-001', 1); cart.add('MUG-002', 1)
    const o = checkout(cart)
    if (o.discountCents !== 600) return 'two lines totalling 6000 cents, each under 5000, did not get a 600 cent discount on the order'
    return (catalog.get('TEA-001').stock === 3 && catalog.get('MUG-002').stock === 3) || 'a successful checkout did not reduce the stock'
  },
]

async function b9Check(repo) {
  const { one } = await modules(repo)
  const { cart } = one({ sku: 'TEA-001', name: 'Tea', priceCents: 450 })
  cart.add('TEA-001', 2); cart.add('TEA-001', 1)
  return (cart.lines().length === 1 && cart.lines()[0].qty === 1 && cart.subtotalCents() === 450) || 'adding a SKU already in the cart did not replace its quantity'
}

async function rulesChecks(repo) {
  const run = async f => { try { return await f(repo) } catch (e) { return `check crashed: ${String(e?.message ?? e).split('\n')[0]}` } }
  const b8 = []
  for (const f of B8_CHECKS) b8.push(await run(f))
  const b9 = await run(b9Check)
  return { b8: b8.filter(r => r === true).length, b9: b9 === true, failures: [...b8, b9].filter(r => r !== true) }
}

if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(await rulesChecks(process.argv[2])))
