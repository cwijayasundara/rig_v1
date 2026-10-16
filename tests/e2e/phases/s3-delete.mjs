import path from 'node:path'
import { Checks } from '../lib/checks.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures/remove', rel)

export const PHASE = {
  id: 'S3', slug: 'cart-remove', type: 'feature', title: 'Delete an item from the cart',
  prompt: '/rig-start A feature: let a shopper delete a whole line from the cart (brief behaviours B5–B6), as Cart.remove and DELETE /cart/<sku>; edit the existing files, do not rewrite them.',
  intent: {
    problem: 'A shopper who adds the wrong item cannot take it out.',
    outcome: 'B5–B6 of the brief hold and the earlier behaviour is unchanged.',
    nonGoals: 'Removing part of a quantity, authentication changes, persistence.',
  },
  spec: '# Spec: delete a cart line\n\n## Behaviours\n- B5: the cart removes a whole line and throws for an absent SKU.\n- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.\n\n## Out of scope\n- Removing part of a quantity.\n\n## Open questions\nnone\n',
  plan: '# Plan: delete a cart line\n\n## Files\n- src/cart/cart.js\n- src/http/handler.js\n- test/remove.test.js\n\n## Tests\n- B5–B6: test/remove.test.js (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  tests: [{ src: fx('test/remove.test.js'), dest: 'test/remove.test.js' }],
  impl: [
    { src: fx('src/cart/cart.js'), dest: 'src/cart/cart.js' },
    { src: fx('src/http/handler.js'), dest: 'src/http/handler.js' },
  ],
  commit: 'feat(cart): delete a line from the cart',
  acceptance: 'remove',
}

// Extra assertions for this change: the two existing files were edited rather than rewritten.
export async function assertDelete(c, sb, slug) {
  for (const f of ['src/cart/cart.js', 'src/http/handler.js']) {
    await c.check(`S3: ${f} was edited, not rewritten`, () => {
      const del = Number(sb.git('diff', '--numstat', 'main...HEAD', '--', f).split('\t')[1])
      const total = sb.git('show', `main:${f}`).split('\n').length
      return del / total < 0.8 || `${del} of ${total} lines deleted`
    })
  }
}

// Decision 5: a spec edited after the person approved it reopens the gate; restoring it closes the gate again.
export async function staleCheck(sb, slug) {
  const file = `.rig/changes/${slug}/spec.md`
  const statusOf = () => (JSON.parse(sb.sdlc(['status', '--json']).stdout || '{}').changes ?? []).find(c => c.slug === slug)?.status
  const original = sb.read(file)
  sb.write(file, original + '\n- B7: an unapproved extra behaviour\n')
  const stale = statusOf()
  sb.write(file, original)
  const back = statusOf()
  return [
    { title: 'S3: editing spec.md after approval makes the approval stale (status approve)', ok: stale === 'approve', why: `status ${stale}` },
    { title: 'S3: restoring spec.md makes the approval current again (status build)', ok: back === 'build', why: `status ${back}` },
  ]
}
