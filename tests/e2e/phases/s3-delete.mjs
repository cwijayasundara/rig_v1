import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures/remove', rel)

export const PHASE = {
  id: 'S3', slug: 'cart-remove', type: 'feature', title: 'Delete an item from the cart',
  prompt: '/rig-start A feature: let a shopper delete a whole line from the cart (brief behaviours B5–B6), as Cart.remove and DELETE /cart/<sku>; edit the existing files, do not rewrite them; add DELETE /cart/{sku} and its examples to the HTTP contract in api/openapi.yaml and contracts/examples/ before approval.',
  intent: {
    problem: 'A shopper who adds the wrong item cannot take it out.',
    outcome: 'B5–B6 of the brief hold and the earlier behaviour is unchanged.',
    nonGoals: 'Removing part of a quantity, authentication changes, persistence.',
  },
  spec: '# Spec: delete a cart line\n\n## Behaviours\n- B5: the cart removes a whole line and throws for an absent SKU.\n- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.\n\n## Out of scope\n- Removing part of a quantity.\n\n## Open questions\nnone\n',
  plan: '# Plan: delete a cart line\n\n## Files\n- src/cart/cart.js\n- src/http/handler.js\n- test/remove.test.js\n\n## Tests\n- B5–B6: test/remove.test.js (unit)\n\n## Contracts\n- api/openapi.yaml (adds DELETE /cart/{sku})\n- contracts/examples/04-delete-tea.json, 05-delete-absent.json\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  contracts: ['api/openapi.yaml', 'contracts/examples/04-delete-tea.json', 'contracts/examples/05-delete-absent.json'].map(f => ({ src: fx(f), dest: f })),
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

// Contract stage (spec §6, §10.2): a weakened frozen example is refused at commit, and examples that do not match the spec
// stop the contract run before it starts.
export async function contractChecks(sb, slug) {
  const head = () => sb.git('rev-parse', 'HEAD')
  const before = head()
  const frozen = 'contracts/examples/03-checkout.json'
  const original = sb.read(frozen)
  const weakened = JSON.parse(original)
  delete weakened.response.body
  sb.write(frozen, JSON.stringify(weakened, null, 2) + '\n')
  sb.git('add', frozen)
  const w = sb.run('git', ['commit', '-q', '-m', 'operator: weaken a frozen example'])
  const wSaid = w.stdout + w.stderr
  if (head() !== before) sb.git('reset', '-q', '--soft', before)
  sb.git('reset', '-q', 'HEAD', '--', frozen)
  sb.write(frozen, original)

  const bad = 'contracts/examples/99-undeclared.json'
  fs.writeFileSync(sb.env.CONTRACT_LOG, '')
  sb.write(bad, JSON.stringify({ request: { method: 'PUT', path: '/products' }, response: { status: 200 } }, null, 2) + '\n')
  sb.git('add', bad)
  const v = sb.run('git', ['commit', '-q', '-m', 'operator: an example the spec does not declare'])
  const vSaid = v.stdout + v.stderr
  if (head() !== before) sb.git('reset', '-q', '--soft', before)
  sb.run('git', ['rm', '-q', '--cached', '--force', bad])
  sb.run('rm', ['-f', sb.file(bad)])
  const log = fs.readFileSync(sb.env.CONTRACT_LOG, 'utf8').trim().split('\n')

  return [
    { title: 'S3: a commit that weakens a frozen contract example is refused as harness-tamper', ok: w.status !== 0 && /harness-tamper/.test(wSaid) && wSaid.includes(frozen), why: `exit ${w.status}: ${wSaid.trim().split('\n').slice(0, 2).join(' | ')}` },
    { title: 'S3: an example the spec does not declare is refused by the contract validate', ok: v.status !== 0 && /examples do not match the specs/.test(vSaid), why: `exit ${v.status}: ${vSaid.trim().split('\n').slice(0, 2).join(' | ')}` },
    { title: 'S3: when validate fails, the contract run does not start', ok: log.includes('validate') && !log.includes('run'), why: `contract log: ${log.join(', ')}` },
  ]
}
