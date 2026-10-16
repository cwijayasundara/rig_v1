// Hidden acceptance for the shop lane. Lives outside the sandbox repo, so the model never sees it.
// `shop` re-checks every sprint-0 PRD promise; `remove` adds the delete-item change and re-checks `shop` first.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const load = (repo, rel) => import(`${pathToFileURL(path.join(repo, rel)).href}?t=${Date.now()}`)

async function shopOf(repo) {
  const { Catalog } = await load(repo, 'src/catalog/products.js')
  const { Cart } = await load(repo, 'src/cart/cart.js')
  const { checkout } = await load(repo, 'src/orders/orders.js')
  const { createHandler } = await load(repo, 'src/http/handler.js')
  const catalog = new Catalog()
  catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
  catalog.add({ sku: 'MUG-002', name: 'Mug', priceCents: 1200 })
  return { catalog, Cart, checkout, createHandler }
}

const PROMISES = {
  async shop(repo) {
    const { catalog, Cart, checkout, createHandler } = await shopOf(repo)
    const bad = (fn, re) => { try { fn() } catch (e) { return re.test(e.message) } return false }
    if (!bad(() => catalog.add({ sku: 'tea', name: 'x', priceCents: 1 }), /invalid sku/)) return 'catalog accepted a bad SKU'
    if (!bad(() => catalog.add({ sku: 'TEA-001', name: 'x', priceCents: 0 }), /./)) return 'catalog accepted a non-positive price'
    const cart = new Cart(catalog)
    cart.add('TEA-001', 2); cart.add('MUG-002'); cart.add('TEA-001')
    if (cart.subtotalCents() !== 2550) return `subtotal ${cart.subtotalCents()}, want 2550 (FR-2)`
    if (!bad(() => cart.add('NOPE-999'), /unknown sku/)) return 'cart accepted an unknown SKU'
    if (!bad(() => cart.add('TEA-001', 0), /./)) return 'cart accepted qty 0'
    if (checkout(cart, { code: 'SAVE10' }).totalCents !== 2295) return 'SAVE10 on 2550 did not total 2295 (FR-3)'
    if (!bad(() => checkout(cart, { code: 'FREE' }), /unknown discount/)) return 'unknown discount code accepted'
    if (!bad(() => checkout(new Cart(catalog)), /empty/)) return 'empty checkout accepted'
    const h = createHandler(catalog)
    if (h({ method: 'GET', path: '/products' }).status !== 200) return 'GET /products not 200 (FR-4)'
    if (h({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty: 2 } }).status !== 201) return 'POST /cart not 201'
    if (h({ method: 'POST', path: '/checkout', body: {} }).body.totalCents !== 900) return 'handler checkout total wrong'
    if (h({ method: 'POST', path: '/cart', body: { sku: 'NOPE-999' } }).status !== 400) return 'unknown SKU not 400'
    if (h({ method: 'GET', path: '/nope' }).status !== 404) return 'unknown path not 404'
    const pkg = JSON.parse((await import('node:fs')).readFileSync(path.join(repo, 'package.json'), 'utf8'))
    if (Object.keys(pkg.dependencies ?? {}).length) return 'runtime dependencies declared (NFR-2)'
    return true
  },
  async remove(repo) {
    const first = await PROMISES.shop(repo)
    if (first !== true) return `regression before remove: ${first}`
    const { catalog, Cart, createHandler } = await shopOf(repo)
    const cart = new Cart(catalog)
    cart.add('TEA-001', 2); cart.add('MUG-002')
    if (typeof cart.remove !== 'function') return 'Cart.remove is not implemented'
    cart.remove('TEA-001')
    if (cart.lines().length !== 1 || cart.subtotalCents() !== 1200) return `after remove: ${JSON.stringify(cart.lines())}, subtotal ${cart.subtotalCents()}`
    let threw = false
    try { cart.remove('TEA-001') } catch { threw = true }
    if (!threw) return 'removing an absent SKU did not throw'
    const h = createHandler(catalog)
    h({ method: 'POST', path: '/cart', body: { sku: 'MUG-002', qty: 1 } })
    const del = h({ method: 'DELETE', path: '/cart/MUG-002' })
    if (del.status !== 200) return `DELETE /cart/MUG-002 gave ${del.status}, want 200`
    if (h({ method: 'DELETE', path: '/cart/MUG-002' }).status !== 400) return 'DELETE of an absent SKU did not give 400'
    return true
  },
}

// Run in a fresh child process per call: Node's module cache would otherwise serve the pre-change
// modules to a later phase importing the same paths after the code under test changed on disk.
export async function assertShop(c, repo, phase) {
  if (!PROMISES[phase]) throw new Error(`unknown shop phase: ${phase}`)
  await c.check(`hidden acceptance: ${phase}`, () => {
    const { spawnSync } = process.getBuiltinModule('node:child_process')
    const r = spawnSync('node', [import.meta.filename, repo, phase], { encoding: 'utf8' })
    if (r.status !== 0) return `oracle child exited ${r.status}: ${(r.stderr || '').trim().split('\n')[0]}`
    const out = JSON.parse(r.stdout.trim().split('\n').at(-1))
    return out === true ? true : out
  })
}

if (process.argv[1] === import.meta.filename) {
  const [repo, phase] = process.argv.slice(2)
  console.log(JSON.stringify(await PROMISES[phase](repo)))
}
