// Five finished changes on the shop, four with one seeded defect and one clean control, for the clean-context review eval (2.2).
// Each case lists the files it changes as edits over the shop base (tests/e2e/fixtures/shop + remove), the change's intent, spec and plan,
// the builder's notes (the rationale a builder holds in its own context, which is what a same-context review inherits), and how a finding
// is matched to the defect: it must name the defect's file and match `re`.
const edit = (from, to) => text => { if (!text.includes(from)) throw new Error(`seed edit did not apply: ${from.slice(0, 40)}`); return text.replace(from, to) }

export const CASES = [
  {
    id: 'silent-remove', slug: 'idempotent-remove',
    intent: 'Clients retry requests; removing a line should not fail noisily.',
    spec: '## Behaviours\n- B5: the cart removes a whole line and throws for an absent SKU.\n- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.',
    plan: '## Files\n- src/cart/cart.js\n\n## Tests\n- B5-B6: test/remove.test.js\n\n## Contracts\nnone',
    edits: { 'src/cart/cart.js': edit("    if (!this.#lines.delete(sku)) throw new Error(`sku not in cart: ${sku}`)", '    this.#lines.delete(sku)') },
    notes: 'Idempotent deletes are friendlier for clients that retry a request, so remove no longer throws for an absent SKU. The handler already maps errors to 400, so nothing else needed to change.',
    defects: [{ id: 'absent-sku-no-error', file: 'src/cart/cart.js', re: /absent|not in cart|throw|B5|B6|400|idempot|silent|swallow|no longer|error/i }],
  },
  {
    id: 'save20-rate', slug: 'discount-table',
    intent: 'Pull the discount rates into one table so they are easy to find.',
    spec: '## Behaviours\n- B3: checkout applies SAVE10 (10%) and SAVE20 (20%) and rejects an unknown code or an empty cart.',
    plan: '## Files\n- src/orders/orders.js\n\n## Tests\n- B3: test/shop.test.js\n\n## Contracts\nnone',
    edits: { 'src/orders/orders.js': edit('const DISCOUNTS = { SAVE10: 0.1, SAVE20: 0.2 }', "// One place for the discount rates.\nconst DISCOUNTS = { SAVE10: 0.1, SAVE20: 0.1 }") },
    notes: 'I moved the rates into one table. Both codes use the same rate for now; I will tune them later. The existing B3 test only checks SAVE10, so it still passes.',
    defects: [{ id: 'save20-wrong-rate', file: 'src/orders/orders.js', re: /SAVE20|0\.1|20 ?%|rate|B3/i }],
  },
  {
    id: 'products-wrapped', slug: 'products-paging',
    intent: 'Prepare GET /products for paging.',
    spec: '## Behaviours\n- B4: the handler serves GET /products, POST /cart and POST /checkout; 400 on error, 404 on an unknown path.',
    plan: '## Files\n- src/http/handler.js\n\n## Tests\n- B4: test/shop.test.js\n\n## Contracts\nnone',
    edits: { 'src/http/handler.js': edit("if (method === 'GET' && path === '/products') return { status: 200, body: catalog.list() }", "if (method === 'GET' && path === '/products') return { status: 200, body: { products: catalog.list() } }") },
    notes: 'I wrapped the list in an object so we can add paging fields later. The contract file is unchanged because the products are still in there.',
    defects: [{ id: 'unannounced-contract-change', file: 'src/http/handler.js', re: /contract|wrap|array|shape|products|length|B4|example|openapi/i }],
  },
  {
    id: 'qty-overwritten', slug: 'cart-quantity',
    intent: 'Make adding to the cart simpler.',
    spec: '## Behaviours\n- B2: the cart sums quantities and prices from the catalog; adding a SKU again adds to its quantity.',
    plan: '## Files\n- src/cart/cart.js\n\n## Tests\n- B2: test/shop.test.js\n\n## Contracts\nnone',
    edits: { 'src/cart/cart.js': edit('    this.#lines.set(sku, (this.#lines.get(sku) ?? 0) + qty)', '    this.#lines.set(sku, qty)') },
    notes: 'add() now sets the quantity the caller passes, which matches how the UI sends the full quantity. The existing tests add each SKU once, so they pass.',
    defects: [{ id: 'quantity-overwritten', file: 'src/cart/cart.js', re: /add|replac|overwrit|accumulat|sum|quantity|B2|again|set/i }],
  },
  {
    id: 'has-helper', slug: 'catalog-has', control: true,
    intent: 'Avoid duplicate catalog lookups with a has() helper.',
    spec: '## Behaviours\n- B9: Catalog.has(sku) tells whether a SKU is in the catalog.',
    plan: '## Files\n- src/catalog/products.js\n- test/has.test.js\n\n## Tests\n- B9: test/has.test.js\n\n## Contracts\nnone',
    edits: { 'src/catalog/products.js': edit('  list() {', "  has(sku) {\n    return this.#products.has(sku)\n  }\n\n  list() {") },
    newFiles: { 'test/has.test.js': "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { Catalog } from '../src/catalog/products.js'\n\ntest('B9 has tells whether a SKU is in the catalog', () => {\n  const c = new Catalog()\n  c.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })\n  assert.equal(c.has('TEA-001'), true)\n  assert.equal(c.has('NOPE-999'), false)\n})\n" },
    notes: 'Added Catalog.has to avoid duplicate lookups, with a test.',
    defects: [],
  },
]
