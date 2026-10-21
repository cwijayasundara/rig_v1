// The "links" variant of the eval task: the shop brief plus B7, a change that tempts the wrong dependency.
// B7 asks the orders module for a product path "built by the same function the handler's route uses", and the handler lives in
// src/http. The clean answer puts that function in the catalog (or orders); the tempting one imports it from http into orders.
// Every arm gets the same brief and hidden acceptance; a layer-violation count in the score tells them apart.
// Read the arms with care: the rig arms build B7 as a third change on an existing handler, a bare arm builds everything in one session
// and tends to write the lower layers first. So haiku-rig against haiku-rig-arch is the clean comparison (the only difference is the
// approved layers block); bare is context, not a control. A run that errored or never built B7 reports no violation count at all.
import fs from 'node:fs'
import path from 'node:path'
import { start, stop, request } from '../../tests/e2e/fixtures/tooling/scripts/contract.mjs'

const FX = path.resolve(import.meta.dirname, 'links/fixtures')
const fx = rel => path.join(FX, rel)

const IFACE = "- `GET /products/<sku>` → 200 with that product `{ sku, name, priceCents }`, 404 when the SKU is unknown. Each line of the order `checkout` returns also carries `href`, the path of that product's own page (`/products/<sku>`), built by the same function the handler's `GET /products/<sku>` route uses."
const BEHAVIOUR = '- B7: GET /products/<sku> serves one product (404 when unknown); every order line from checkout carries the href of its product page.'

export function briefFor(base) {
  return base
    .replace('- The HTTP contract is', `${IFACE}\n- The HTTP contract is`)
    .replace(/(- B6: [^\n]*\n)/, `$1${BEHAVIOUR}\n`)
    .replace('B5–B6: unit tests in test/remove.test.js.', 'B5–B6: unit tests in test/remove.test.js. B7: unit tests in test/links.test.js.')
}

// The rig arms' third change, S7: the same text a person would give /rig-start; the dry run plays it from the fixtures.
export const PHASE = {
  id: 'S7', slug: 'product-links', type: 'feature', title: 'Product pages and order-line links',
  prompt: '/rig-start A feature: product pages and links (brief behaviour B7): GET /products/<sku> serves one product (404 when unknown), and every order line from checkout carries `href`, the path of its product page, built by the same function the route uses; edit the existing files, do not rewrite them; add the new route and its examples to the HTTP contract in api/openapi.yaml and contracts/examples/ before approval.',
  intent: { problem: 'A shopper cannot open a product on its own, and an order does not link back to what was bought.', outcome: 'B7 of the brief holds and the earlier behaviour is unchanged.', nonGoals: 'Product search, images, persistence.' },
  spec: '# Spec: product pages and links\n\n## Behaviours\n- B7: GET /products/<sku> serves one product (404 when unknown); every order line from checkout carries the href of its product page.\n\n## Out of scope\n- Search.\n\n## Open questions\nnone\n',
  plan: '# Plan: product pages and links\n\n## Files\n- src/catalog/products.js\n- src/orders/orders.js\n- src/http/handler.js\n- test/links.test.js\n\n## Tests\n- B7: test/links.test.js (unit)\n\n## Contracts\n- api/openapi.yaml (adds GET /products/{sku})\n- contracts/examples/06-get-product.json, 07-unknown-product.json\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  contracts: ['api/openapi.yaml', 'contracts/examples/06-get-product.json', 'contracts/examples/07-unknown-product.json'].map(f => ({ src: fx(f), dest: f })),
  tests: [{ src: fx('test/links.test.js'), dest: 'test/links.test.js' }],
  impl: ['src/catalog/products.js', 'src/orders/orders.js', 'src/http/handler.js'].map(f => ({ src: fx(f), dest: f })),
  commit: 'feat(catalog): product pages and order-line links',
  acceptance: 'links',
}

// What a perfect bare session leaves behind for B7 (the dry run).
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

// Hidden acceptance for B7, over HTTP like the others: nothing under src/ is imported.
export async function linksHttp(repo) {
  const { child, port } = await start(repo)
  try {
    const one = await request(port, 'GET', '/products/TEA-001')
    if (one.status !== 200 || one.body?.sku !== 'TEA-001') return `GET /products/TEA-001: ${one.status} ${JSON.stringify(one.body)}`
    if ((await request(port, 'GET', '/products/NOPE-999')).status !== 404) return 'unknown product not 404'
    await request(port, 'POST', '/cart', { sku: 'TEA-001', qty: 2 })
    const paid = await request(port, 'POST', '/checkout', {})
    const href = paid.body?.lines?.[0]?.href
    return href === '/products/TEA-001' || `order line href ${JSON.stringify(href)}, want /products/TEA-001`
  } finally {
    await stop(child)
  }
}
