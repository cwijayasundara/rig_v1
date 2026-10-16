import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { assertShop } from '../acceptance/shop.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures/remove', rel)

export const PHASE = {
  id: 'S3', slug: 'cart-remove', type: 'feature', tier: 'M', title: 'Delete an item from the cart',
  prompt: '/rig-start A feature, tier M (the person has decided the tier). Enable deleting items from the shopping cart. The same authenticated user is removing their own item, so no other validation is needed: Cart.remove(sku) deletes the whole line and throws an Error for a SKU not in the cart, and the handler answers DELETE /cart/<sku> with 200 and the remaining lines (400 when the SKU is not in the cart). Everything that worked before must behave the same. Include tests.',
  intent: {
    problem: 'A shopper who adds the wrong item cannot take it out; the sprint-0 PRD left deletion out on purpose.',
    outcome: 'Cart.remove and DELETE /cart/<sku> delete a whole line; absent SKUs throw / 400; earlier behaviour unchanged.',
    nonGoals: 'Removing part of a quantity, authentication changes, persistence.',
    risks: 'The handler path parsing must not break the existing routes.',
  },
  design: [
    '# Delete a cart line', '', '## Contracts',
    '- `Cart.remove(sku)`: deletes the whole line; throws `Error` for a SKU not in the cart.',
    '- Handler: `DELETE /cart/<sku>` returns 200 with the remaining lines, 400 when the SKU is not in the cart.',
    '', '## Files', '- src/cart/cart.js', '- src/http/handler.js', '- test/remove.test.js', '',
    '## Slices', '1. Cart.remove and the DELETE route (test/remove.test.js)', '',
    '## Verification', '- npm test', '',
  ].join('\n'),
  archUpdate: '\n## Update (cart-remove change)\n- `cart` also deletes a whole line (`Cart.remove`), and `http` exposes it as `DELETE /cart/<sku>`.\n',
  tests: [{ src: fx('test/remove.test.js'), dest: 'test/remove.test.js' }],
  impl: [
    { src: fx('src/cart/cart.js'), dest: 'src/cart/cart.js' },
    { src: fx('src/http/handler.js'), dest: 'src/http/handler.js' },
  ],
  commit: 'feat(cart): delete a line from the cart',
  acceptance: 'remove',
}

// Extra assertions for this change, on top of runChange's: the architecture moved with the design, the two
// existing files were edited rather than rewritten, and editing the design after approval re-opens its gate.
export async function assertDelete(c, sb, slug) {
  await c.check('S3: the shared architecture records the new contract', () =>
    sb.read('.rig/product/architecture.md').includes('Cart.remove') || 'architecture.md does not mention Cart.remove')
  for (const f of ['src/cart/cart.js', 'src/http/handler.js']) {
    await c.check(`S3: ${f} was edited, not rewritten`, () => {
      const del = Number(sb.git('diff', '--numstat', 'main...HEAD', '--', f).split('\t')[1])
      const total = sb.git('show', `main:${f}`).split('\n').length
      return del / total < 0.8 || `${del} of ${total} lines deleted`
    })
  }
  await assertShop(c, sb.dir, 'remove')
}

// Negative twin: a design edited after its approval must put the design gate back to a human.
export function staleTwin(sb, slug) {
  const f = `.rig/changes/${slug}/design.md`
  const keep = sb.read(f)
  const bad = []
  try {
    const before = JSON.parse(sb.sdlc(['next', slug, '--json']).stdout).verdict
    sb.write(f, `${keep}\n- edited after approval\n`)
    const n = JSON.parse(sb.sdlc(['next', slug, '--json']).stdout)
    const gate = JSON.parse(sb.sdlc(['status', '--json']).stdout).changes.find(x => x.slug === slug)?.next?.gate
    if (before === 'human') bad.push('stale approval: the change was already waiting on a human before the edit')
    if (n.verdict !== 'human' || gate !== 'design') bad.push(`stale approval: next said ${n.verdict} (gate ${gate}), expected human at design`)
  } finally {
    sb.write(f, keep)
  }
  return bad
}
