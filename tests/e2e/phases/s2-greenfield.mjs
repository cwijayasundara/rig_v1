import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { assertChange } from '../assert/change.mjs'
import { assertPrePushPasses, assertPreCommitRefusesSecret } from '../assert/hooks.mjs'
import { assertShop } from '../acceptance/shop.mjs'
import { assertShopHttp } from '../acceptance/shop-http.mjs'
import { runChange } from '../lib/flow.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures/shop', rel)

export const PHASE = {
  id: 'S2', slug: 'walking-skeleton', type: 'feature', title: 'Walking skeleton: the whole shop',
  prompt: '/rig-start A feature: build the shop described in .rig/product/brief.md (behaviours B1–B4): a Catalog, a Cart, a checkout with SAVE10/SAVE20 and a request handler served over HTTP by npm start (src/server.js), in src/catalog, src/cart, src/orders and src/http, tested in test/shop.test.js with test names that start with their B-number.',
  intent: { problem: 'There is no shop code at all.', outcome: 'B1–B4 of the brief hold and node --test passes.', nonGoals: 'Deleting cart lines, payment, persistence.' },
  spec: '# Spec: walking skeleton\n\n## Behaviours\n- B1: the catalog rejects an invalid SKU and a non-positive price.\n- B2: the cart sums quantities and prices from the catalog.\n- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.\n- B4: the handler serves GET /products, POST /cart and POST /checkout, over HTTP through `npm start`; 400 on error, 404 on an unknown path.\n\n## Out of scope\n- Deleting cart lines.\n\n## Open questions\nnone\n',
  plan: '# Plan: walking skeleton\n\n## Files\n- src/catalog/products.js\n- src/cart/cart.js\n- src/orders/orders.js\n- src/http/handler.js\n- src/server.js\n- test/shop.test.js\n\n## Tests\n- B1–B4: test/shop.test.js (unit)\n\n## Contracts\n- api/openapi.yaml (adds /products, /cart, /checkout)\n- contracts/examples/01-products.json, 02-add-tea.json, 03-checkout.json\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  contracts: ['api/openapi.yaml', 'contracts/examples/01-products.json', 'contracts/examples/02-add-tea.json', 'contracts/examples/03-checkout.json'].map(f => ({ src: fx(f), dest: f })),
  tests: [{ src: fx('test/shop.test.js'), dest: 'test/shop.test.js' }],
  impl: [
    { src: fx('src/catalog/products.js'), dest: 'src/catalog/products.js' },
    { src: fx('src/cart/cart.js'), dest: 'src/cart/cart.js' },
    { src: fx('src/orders/orders.js'), dest: 'src/orders/orders.js' },
    { src: fx('src/http/handler.js'), dest: 'src/http/handler.js' },
    { src: fx('src/server.js'), dest: 'src/server.js' },
  ],
  commit: 'feat(shop): catalog, cart, checkout and handler',
  acceptance: 'shop',
}

// Runs one change start to PR and asserts its evidence. `driver` is scripted or live.
export async function runShopChange(sb, phase, driver, { first = false, afterApprove } = {}) {
  const { slug, notes } = await runChange(sb, phase, driver, { afterApprove })
  const c = new Checks(`${phase.id} ${phase.title}`)
  for (const n of notes) await c.check(n.title, () => n.ok || n.why)
  await assertChange(c, sb, slug, phase)
  if (first) {
    await assertPrePushPasses(c, sb, slug)
    await assertPreCommitRefusesSecret(c, sb)
  }
  await assertShop(c, sb.dir, phase.acceptance)
  await assertShopHttp(c, sb.dir, phase.acceptance)
  return { slug, checks: c }
}
