import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { assertChange } from '../assert/change.mjs'
import { assertPrePushPasses, assertPreCommitRefusesSecret } from '../assert/hooks.mjs'
import { assertShop } from '../acceptance/shop.mjs'
import { runRoute } from '../lib/operator.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures/shop', rel)

export const PHASE = {
  id: 'S2', slug: 'walking-skeleton-change', type: 'feature', tier: 'M', title: 'Walking skeleton: the whole shop',
  source: '.rig/intent/walking-skeleton.md',
  prompt: '/rig-start A feature, tier M (one change of about six files; the person has decided the tier). Build the shop described in .rig/product/prd/sprint-0.md (the charted, approved walking-skeleton intent): a Catalog, a Cart, checkout with the SAVE10 and SAVE20 discount codes, and a transport-agnostic HTTP-style handler, exactly as the PRD FRs state. Include tests. Money is integer cents; no dependencies. Keep the implementation compact — the harness size sensor caps one change at 500 changed lines, so write only the four PRD modules and their tests, with no extra helper files.',
  intent: {
    problem: 'There is no shop code at all.',
    outcome: 'Catalog, cart, checkout and handler behave per the sprint-0 PRD; node --test passes.',
    nonGoals: 'Deleting cart lines, payment, persistence, a real HTTP server.',
    risks: 'First public API, so names are the contract.',
  },
  design: [
    '# Shop walking skeleton', '', '## Contracts',
    '- `Catalog` from src/catalog/products.js: add/get/list, invalid SKU and non-positive price throw.',
    '- `Cart` from src/cart/cart.js: add/lines/subtotalCents, priced from the catalog.',
    '- `checkout(cart, { code })` from src/orders/orders.js: SAVE10/SAVE20, unknown code and empty cart throw.',
    '- `createHandler(catalog)` from src/http/handler.js: GET /products, POST /cart, POST /checkout; 400 on error, 404 unknown path.',
    '', '## Files', '- src/catalog/products.js', '- src/cart/cart.js', '- src/orders/orders.js', '- src/http/handler.js', '- test/shop.test.js', '',
    '## Slices', '1. The whole shop: catalog, cart, checkout, handler (test/shop.test.js)', '',
    '## Verification', '- npm test', '',
  ].join('\n'),
  tests: [{ src: fx('test/shop.test.js'), dest: 'test/shop.test.js' }],
  impl: [
    { src: fx('src/catalog/products.js'), dest: 'src/catalog/products.js' },
    { src: fx('src/cart/cart.js'), dest: 'src/cart/cart.js' },
    { src: fx('src/orders/orders.js'), dest: 'src/orders/orders.js' },
    { src: fx('src/http/handler.js'), dest: 'src/http/handler.js' },
  ],
  commit: 'feat(shop): catalog, cart, checkout and handler',
  acceptance: 'shop',
}

// Runs one change through the route and asserts it. `driver` is scripted or live.
export async function runChange(sb, phase, driver, { operator = 'operator', first = false } = {}) {
  const slug = await driver.begin()
  const route = await runRoute({ sb, slug, driver, repeats: driver.sessions ? 2 : 1, maxSteps: driver.sessions ? 14 : 10 })
  // A live session can end with its last evidence (review.md, STATE.md) uncommitted; the person commits it.
  if (driver.sessions) sb.commitAll('chore: session leftovers')
  const c = new Checks(`${phase.id} ${phase.title}`)
  await assertChange(c, sb, slug, { operator, label: slug, strictSlices: !driver.sessions })
  await c.check(`${phase.id}: the operator resolved ${route.resolvedConcerns} policy concern(s) the design gate listed`, () => true)
  await c.check(`${phase.id}: approved at least one gate`, () => route.approved.length > 0 || 'no human gate was approved')
  if (first) {
    await assertPrePushPasses(c, sb, slug)
    await assertPreCommitRefusesSecret(c, sb)
  }
  await assertShop(c, sb.dir, phase.acceptance)
  return { slug, route, checks: c }
}
