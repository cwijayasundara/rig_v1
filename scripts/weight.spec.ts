// The planning weight (proposal 2026-10-27 P3): light unless a tier-2 signal shows in the blast radius, an ## Access rule or the person's ask.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, sdlc, write, registry } from './testkit.ts'

const spec = (...paths: string[]): string => `# Spec\n\n## Behaviours\n- B1: x\n\n## Blast radius\n${paths.map(p => `- \`${p}\``).join('\n')}\n`
function change(radius: string[], o: { alwaysHuman?: string[]; arch?: string; full?: boolean } = {}): string {
  const repo = makeRepo()
  write(repo, '.rig/sensors.json', registry({ extra: { risk: { alwaysHuman: o.alwaysHuman ?? [] } } }))
  if (o.arch) write(repo, '.rig/product/architecture.md', o.arch)
  assert.equal(sdlc(repo, ['new', 'cart-add', ...(o.full ? ['--full'] : [])]).code, 0)
  write(repo, '.rig/changes/cart-add/spec.md', spec(...radius))
  return repo
}
const weight = (repo: string, ...a: string[]) => sdlc(repo, ['weight', ...a])

test('an ordinary src/ blast radius is light', () => {
  const r = weight(change(['src/cart.ts', 'src/cart/']))
  assert.equal(r.code, 0)
  assert.match(r.stdout, /^weight: light\n- /)
})

test('a workflow, an alwaysHuman glob match and a directory holding such a glob are full', () => {
  assert.match(weight(change(['.github/workflows/ci.yml'])).stdout, /^weight: full\n- .*\.github\/workflows\/ci\.yml/)
  assert.match(weight(change(['src/billing/charge.ts'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['src/billing/'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['src/'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['src/cart/'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: light/)
})

test('an ## Access rule that names the slug makes it full', () => {
  const arch = '# Arch\n\n## Access\n| Action | Allowed | Interfaces | Intent |\n|---|---|---|---|\n| refund an order | admin | api | cart-add |\n'
  const r = weight(change(['src/cart.ts'], { arch }))
  assert.match(r.stdout, /^weight: full\n- access: cart-add builds "refund an order"/)
})

test('new --full stores weight: full and the person\'s ask is the reason', () => {
  const repo = change(['src/cart.ts'], { full: true })
  assert.match(weight(repo).stdout, /^weight: full\n- the person asked for full/)
})

test('--json prints { weight, reasons }; no slug and no active change fails with usage', () => {
  const j = JSON.parse(weight(change(['src/cart.ts']), '--json').stdout)
  assert.deepEqual(Object.keys(j), ['weight', 'reasons'])
  assert.equal(j.weight, 'light')
  const bare = weight(makeRepo())
  assert.notEqual(bare.code, 0)
  assert.match(bare.stderr, /usage: weight/)
})

test('glob entries, prefix-less globs, rooted entries, the whole repo and case all reach full (review fixes)', () => {
  assert.match(weight(change(['.github/**'])).stdout, /^weight: full/)
  assert.match(weight(change(['.claude/**'])).stdout, /^weight: full/)
  assert.match(weight(change(['src/**'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['src/'], { alwaysHuman: ['**/migrations/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['src/billing/'], { alwaysHuman: ['src/bill*/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['/src/billing/'], { alwaysHuman: ['src/billing/**'] })).stdout, /^weight: full/)
  assert.match(weight(change(['.'])).stdout, /^weight: full/)
  assert.match(weight(change(['./'])).stdout, /^weight: full/)
  assert.match(weight(change(['claude.md'])).stdout, /^weight: full/)
  assert.match(weight(change(['src/cart/', 'src/cart.ts'], { alwaysHuman: ['src/bill*/**'] })).stdout, /^weight: light/)
})
