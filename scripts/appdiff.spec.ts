// The differential runner (design 2026-11-21): the base's journey trace is the oracle; a difference blocks unless approved on the base.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise, compare, report, replacesOf, type Step } from './appdiff.ts'

const s = (name: string, observed?: unknown, ok = true): Step => ({ name, ok, ...(observed === undefined ? {} : { observed }) })

test('normalise makes traces that differ only in a time, an id and a port equal', () => {
  const a = [s('t', { at: '2026-11-21T10:00:00.000Z', id: '11111111-2222-3333-4444-555555555555', url: 'http://x:40123/a' })]
  const b = [s('t', { at: '2026-11-22T11:11:11.111Z', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', url: 'http://x:50999/a' })]
  assert.deepEqual(normalise(a), normalise(b))
  assert.notDeepEqual(normalise([s('t', { n: 1 })]), normalise([s('t', { n: 2 })]))
})

test('a rule rewrites what the app names, for the steps its glob matches', () => {
  const rules = [{ step: 'cart*', replace: 'sku-\\d+', with: '<sku>' }]
  assert.deepEqual(normalise([s('cart add', { k: 'sku-9' })], rules), [s('cart add', { k: '<sku>' })])
  assert.deepEqual(normalise([s('other', { k: 'sku-9' })], rules), [s('other', { k: 'sku-9' })])
})

test('compare: a changed observed value is a difference with a stable id; a step on one side only is absent', () => {
  const base = [s('checkout total', { c: 900 }), s('gone step', 1)], head = [s('checkout total', { c: 950 }), s('new step', 1)]
  const r = compare(base, head, head)
  assert.deepEqual(r.diffs.map(d => [d.id, d.before, d.after]), [
    ['D-checkout-total', { ok: true, observed: { c: 900 } }, { ok: true, observed: { c: 950 } }],
    ['D-gone-step', { ok: true, observed: 1 }, 'absent'],
    ['D-new-step', 'absent', { ok: true, observed: 1 }]])
  assert.equal(r.executed, 3)
})

test('compare: a step whose two head runs disagree is unstable, not a difference', () => {
  const r = compare([s('a', 1)], [s('a', 2)], [s('a', 3)])
  assert.deepEqual(r.diffs, []); assert.deepEqual(r.unstable, ['a'])
})

test('compare: a step that stops passing is a difference even with no observed value', () => {
  assert.equal(compare([s('a')], [s('a', undefined, false)], [s('a', undefined, false)]).diffs.length, 1)
})

test('report: approved ids are approved, a list entry with no difference is stale, lines are by id', () => {
  const r = compare([s('a', 1), s('b', 1)], [s('a', 2), s('b', 2)], [s('a', 2), s('b', 2)])
  const rep = report(r.diffs, [{ id: 'D-a' }, { id: 'D-zzz' }], r.executed, ['flaky'])
  assert.equal(rep.lines[0], 'differential: 2 step(s) run, 2 difference(s), 1 approved, 1 unapproved')
  assert.match(rep.lines.join('\n'), /D-a: a: .* \(approved\)/)
  assert.match(rep.lines.join('\n'), /D-b: b: .* \(UNAPPROVED\)/)
  assert.deepEqual(rep.stale, ['D-zzz']); assert.deepEqual(rep.unapproved.map(d => d.id), ['D-b'])
  assert.match(rep.lines.join('\n'), /unstable: flaky/)
})

test('replacesOf reads the intent front matter only', () => {
  assert.equal(replacesOf('---\nslug: x\nreplaces: shop\n---\n# I\n'), 'shop')
  assert.equal(replacesOf('---\nslug: x\n---\nreplaces: shop\n'), null)
  assert.equal(replacesOf('# none'), null)
})

// The real thing: the shop's driver runs on main and on the branch, and the base's trace is the oracle.
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach } from 'node:test'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures/journeys')
const DRIVER = `import { verify } from '../lib.mjs'
await verify('shop', async ({ launch, step }) => {
  const app = await launch('node src/server.js')
  await step('a shopper sees the products', async () => (await (await fetch(app.url + '/products')).json()).map(p => [p.sku, p.priceCents]))
})
`
let repo: string
beforeEach(() => {
  repo = makeRepo()
  for (const f of ['package.json', 'src', 'test']) fs.cpSync(path.join(FX, f), path.join(repo, f), { recursive: true })
  sdlc(repo, ['init']); sdlc(repo, ['app', 'init'])
  fs.cpSync(path.join(FX, 'journey'), path.join(repo, '.rig/verify/shop'), { recursive: true })
  write(repo, '.rig/verify/shop/journey.mjs', DRIVER)
  sdlc(repo, ['sync']); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base'); gitIn(repo, 'checkout', '-qb', 'work')
})
const changePrice = (): void => { write(repo, 'src/shop.js', fs.readFileSync(path.join(repo, 'src/shop.js'), 'utf8').replace('priceCents: 450', 'priceCents: 475')); gitIn(repo, 'commit', '-qam', 'raise the tea price') }

test('app diff passes when the head behaves like the base', () => {
  const r = sdlc(repo, ['app', 'diff', 'shop', '--base', 'main'])
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /differential: 1 step\(s\) run, 0 difference\(s\), 0 approved, 0 unapproved/)
})

test('app diff blocks a changed behaviour by id, and the base\'s approved list unblocks it; the head\'s own list does not', () => {
  changePrice()
  const r = sdlc(repo, ['app', 'diff', 'shop', '--base', 'main'])
  assert.equal(r.code, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /D-a-shopper-sees-the-products: .* \(UNAPPROVED\)/)
  write(repo, '.rig/verify/shop/differences.json', JSON.stringify([{ id: 'D-a-shopper-sees-the-products', reason: 'price rise', by: 'me' }])); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'approve on the head')
  assert.equal(sdlc(repo, ['app', 'diff', 'shop', '--base', 'main']).code, 1, 'a list added by the PR itself does not approve it')
  gitIn(repo, 'checkout', '-q', 'main'); write(repo, '.rig/verify/shop/differences.json', JSON.stringify([{ id: 'D-a-shopper-sees-the-products', reason: 'price rise', by: 'me' }])); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'approve on the base')
  gitIn(repo, 'checkout', '-q', 'work')
  const ok = sdlc(repo, ['app', 'diff', 'shop', '--base', 'main'])
  assert.equal(ok.code, 0, ok.stdout); assert.match(ok.stdout, /1 approved, 0 unapproved/)
})

// CI: the base's charted intent says the change replaces the app, so the diff must run there and block an unapproved difference.
const ciFindings = (replaces: boolean): { sensor: string; message: string }[] => {
  write(repo, '.rig/product/sprints/sprint-1/intents/x.md', `---\nslug: x\n${replaces ? 'replaces: shop\n' : ''}---\n# x\n`)
  sdlc(repo, ['app', 'approve', 'shop'], { env: { SDLC_HUMAN: '1' } })
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'chart and approval')
  gitIn(repo, 'checkout', '-q', 'main'); gitIn(repo, 'merge', '-q', 'work'); gitIn(repo, 'checkout', '-qb', 'pr')
  changePrice()
  return JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout).findings
}

test('CI blocks an unapproved difference when the base intent says replaces', () => {
  const f = ciFindings(true).filter(x => x.sensor === 'journeys')
  assert.ok(f.some(x => /differential shop: D-a-shopper-sees-the-products .* changed/.test(x.message)), JSON.stringify(f))
})

test('CI runs no differential when no base intent says replaces', () => {
  assert.ok(!ciFindings(false).some(x => /differential/.test(x.message)))
})
