// The scope check (harness readiness 1.3): a charted intent says which paths its change may touch; a diff outside them is a finding.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeFindings, intentScope } from './scope.ts'
import { fmList } from './core.ts'
import { defaultRegistry } from './registry.ts'
import { type FileDiff } from './model.ts'
import fs from 'node:fs'
import path from 'node:path'
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

test('the intent frontmatter reads in every form a person might write it, and drops comments', () => {
  const doc = (body: string): string => `---\nsprint: 1\n${body}\n---\n# t\n`
  assert.deepEqual(fmList(doc('scope: [src/cart/**, test/**]'), 'scope'), ['src/cart/**', 'test/**'])
  assert.deepEqual(fmList(doc('scope: src/cart/**'), 'scope'), ['src/cart/**'])
  assert.deepEqual(fmList(doc('scope: ["./src/cart/", \'src/pay\']'), 'scope'), ['src/cart', 'src/pay'], 'quotes, ./ and a trailing slash')
  assert.deepEqual(fmList(doc('scope: [src/cart/**] # the cart only'), 'scope'), ['src/cart/**'], 'a trailing comment')
  assert.deepEqual(fmList(doc('scope:\n  - src/cart/**\n  - src/pay\ntouches: []'), 'scope'), ['src/cart/**', 'src/pay'], 'a multi-line list')
  assert.deepEqual(fmList(doc('touches: []'), 'scope'), [])
  assert.equal(intentScope('x', () => doc('scope: []')), null, 'an empty scope is no scope')
})

test('a bare directory covers what is under it, and root config, lockfiles, CI files and a pack\'s docs are not product code', () => {
  const s = (files: string[]) => scopeFindings(files.map(fd), ['bare'], paths, 'ship', () => ({ scope: ['src/cart'], touches: [] })).map(f => f.file)
  assert.deepEqual(s(['src/cart/a.js', 'src/cart/deep/b.js', 'src/cart']), [])
  assert.deepEqual(s(['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'tsconfig.json', '.github/workflows/ci.yml', 'README.md', 'docs/guide.md']), [])
  assert.deepEqual(s(['index.js', 'src/cartography/x.js']), ['index.js', 'src/cartography/x.js'], 'root code and a sibling that shares a name prefix are still outside')
})

test('a rename is judged at both ends', () => {
  const rename = (from: string, file: string): FileDiff => ({ file, from, status: 'R', added: [], removed: [] })
  const out = (d: FileDiff) => scopeFindings([d], ['cart-add'], paths, 'ship', s => scopes[s] ?? null).map(f => f.file)
  assert.deepEqual(out(rename('src/cart/a.js', 'src/cart/b.js')), [])
  assert.deepEqual(out(rename('src/orders/a.js', 'src/cart/a.js')), ['src/orders/a.js'], 'moved in from outside the scope')
  assert.deepEqual(out(rename('src/cart/a.js', 'src/orders/a.js')), ['src/orders/a.js'], 'moved out of it')
})

// ---------- end to end ----------
const INTENT = (scope: string, touches = '[]') => `---\nsprint: 1\nprd: [FR-1]\ndepends: []\nestimate_days: 1\nkind: internal\nowner:\nstatus: draft\nscope: ${scope}\ntouches: ${touches}\n---\n# Add to cart\n`

function scoped(scope: string, touches?: string): string {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/product/sprints/sprint-0/intents/cart-add.md', INTENT(scope, touches))
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

test('scope: at ship the scope is read from the base branch, so a PR cannot widen or delete its own', () => {
  const repo = scoped('[src/cart/**]')
  write(repo, 'src/orders/orders.js', 'export const b = 2\n')
  write(repo, '.rig/product/sprints/sprint-0/intents/cart-add.md', INTENT('[src/cart/**, src/orders/**]'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'work, and widen the scope in the same PR')
  assert.deepEqual(findings(ship(repo)).map(f => f.file), ['src/orders/orders.js'], 'the widened scope in the PR is ignored')
  fs.rmSync(path.join(repo, '.rig/product/sprints/sprint-0/intents/cart-add.md'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'delete the intent')
  assert.deepEqual(findings(ship(repo)).map(f => f.file), ['src/orders/orders.js'], 'deleting the intent does not switch the check off')
})

test('scope: `sdlc sensors` says whether the active change is checked', () => {
  assert.match(sdlc(scoped('[src/cart/**]'), ['sensors']).stdout, /scope: cart-add is checked against src\/cart\/\*\*/)
  assert.match(sdlc(scoped('[]'), ['sensors']).stdout, /scope: not checked \(the active change has no scope: in its product intent\)/)
})
