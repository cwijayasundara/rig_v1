// The scope check (harness readiness 1.3): a charted intent says which paths its change may touch; a diff outside them is a finding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeFindings } from './scope.ts'
import { defaultRegistry } from './registry.ts'
import { type FileDiff } from './model.ts'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

const fd = (file: string): FileDiff => ({ file, status: 'M', added: [{ n: 1, text: 'x' }], removed: [] })
const paths = defaultRegistry().paths
const scopes: Record<string, { scope: string[]; touches: string[] }> = { 'cart-add': { scope: ['src/cart/**'], touches: ['src/http/handler.js'] }, 'pay-now': { scope: ['src/pay/**'], touches: [] } }
const run = (files: string[], slugs: string[], point: 'edit' | 'stop' | 'ship' | 'ci' = 'ship') => scopeFindings(files.map(fd), slugs, paths, point, s => scopes[s] ?? null)

test('a file inside the scope, a deliberate touch, the change folder, a test and the harness files are all fine', () => {
  assert.deepEqual(run(['src/cart/cart.js', 'src/http/handler.js', '.rig/changes/cart-add/spec.md', 'test/cart.test.js', '.rig/waivers.jsonl', 'src/cart/deep/er/x.js'], ['cart-add']), [])
})

test('a file outside the scope is a finding that names the file and the way out, warning while the model works and blocking at ship and CI', () => {
  const out = run(['src/orders/orders.js'], ['cart-add'])
  assert.equal(out.length, 1)
  assert.deepEqual([out[0]?.sensor, out[0]?.file, out[0]?.severity], ['scope', 'src/orders/orders.js', 'block'])
  assert.match(out[0]?.message ?? '', /src\/orders\/orders\.js is outside the scope of cart-add \(scope: src\/cart\/\*\*\)/)
  assert.match(out[0]?.fix ?? '', /touches:/)
  assert.deepEqual(['edit', 'stop', 'ship', 'ci'].map(p => run(['src/orders/o.js'], ['cart-add'], p as 'edit')[0]?.severity), ['warn', 'warn', 'block', 'block'])
})

test('a change with no scoped intent is not checked, and several changes in one diff share the union of their scopes', () => {
  assert.deepEqual(run(['anything/at/all.js'], ['unscoped-change']), [])
  assert.deepEqual(run(['anything.js'], []), [])
  assert.deepEqual(run(['src/cart/a.js', 'src/pay/b.js'], ['cart-add', 'pay-now']), [])
  assert.deepEqual(run(['src/pay/b.js'], ['cart-add']).map(f => f.file), ['src/pay/b.js'], 'cart-add alone does not cover pay')
})

// ---------- end to end ----------
const INTENT = (scope: string, touches = '[]') => `---\nsprint: 1\nprd: [FR-1]\ndepends: []\nestimate_days: 1\nkind: internal\nowner:\nstatus: draft\nscope: ${scope}\ntouches: ${touches}\n---\n# Add to cart\n`

function scoped(scope: string, touches?: string): string {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/product/intents/cart-add.md', INTENT(scope, touches))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'chart')
  sdlc(repo, ['new', 'cart-add', '--type', 'feature'])
  gitIn(repo, 'checkout', '-qb', 'work')
  hook(repo, 'prompt-submit', {})
  return repo
}
const ship = (repo: string) => sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--json'])
const findings = (r: { stdout: string }): { sensor: string; severity: string; file?: string }[] => JSON.parse(r.stdout).findings.filter((f: { sensor: string }) => f.sensor === 'scope')

test('scope: a change that strays outside its charted intent warns at Stop and blocks at ship', () => {
  const repo = scoped('[src/cart/**]')
  write(repo, 'src/cart/cart.js', 'export const a = 1\n')
  write(repo, 'src/orders/orders.js', 'export const b = 2\n')
  const stop = JSON.parse(sdlc(repo, ['check', '--at', 'stop', '--json']).stdout).findings.filter((f: { sensor: string }) => f.sensor === 'scope')
  assert.deepEqual(stop.map((f: { file: string; severity: string }) => [f.file, f.severity]), [['src/orders/orders.js', 'warn']])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'work')
  const r = ship(repo)
  assert.equal(r.code, 1)
  assert.deepEqual(findings(r).map(f => [f.file, f.severity]), [['src/orders/orders.js', 'block']])
})

test('scope: a touches line, or a waiver from a person, clears the finding; a repo or intent with no scope is not checked', () => {
  const touched = scoped('[src/cart/**]', '[src/orders/orders.js]')
  write(touched, 'src/orders/orders.js', 'export const b = 2\n')
  gitIn(touched, 'add', '-A')
  gitIn(touched, 'commit', '-qm', 'work')
  assert.deepEqual(findings(ship(touched)), [], 'a deliberate cross-slice touch')
  const waived = scoped('[src/cart/**]')
  write(waived, 'src/orders/orders.js', 'export const b = 2\n')
  gitIn(waived, 'add', '-A')
  gitIn(waived, 'commit', '-qm', 'work')
  assert.equal(findings(ship(waived)).length, 1)
  sdlc(waived, ['waive', 'scope', 'src/orders/orders.js', 'a one-line fix in the neighbour', '--slug', 'cart-add'], { env: { SDLC_HUMAN: '1' } })
  assert.deepEqual(findings(ship(waived)), [], 'waived by a person')
  const none = scoped('[]')
  write(none, 'src/orders/orders.js', 'export const b = 2\n')
  gitIn(none, 'add', '-A')
  gitIn(none, 'commit', '-qm', 'work')
  assert.deepEqual(findings(ship(none)), [], 'no scope, no check')
})
