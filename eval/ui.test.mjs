// The ui variant (W5, U0): B20 endpoint and B21 screen on the built hard shop, two traps found only by a browser.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { phasesFor } from './run.mjs'
import { setupBare, dryBare, BARE_PROMPT_UI } from './setup.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { browserAvailable, withPage } from './lib/browser.mjs'
import { checks, score, applyPatch, TRAP_WORDS, TRAP_TEST, ISSUES, PHASES } from './variants/ui.mjs'

const root = path.resolve(import.meta.dirname, '..')
const avail = browserAvailable()
const skip = avail === true ? false : avail
const sandbox = name => createSandbox({ name, out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ui-test-')) })

// A built hard shop with the reference (and optionally one slip) applied.
function build(slip) {
  const sb = sandbox('ui-build')
  dryBare(sb, { variant: 'ui' })
  if (slip) applyPatch(sb.dir, `${slip}.slip`)
  return sb.dir
}
const npmTest = dir => spawnSync('npm', ['test', '--silent'], { cwd: dir, encoding: 'utf8' })

test('ui phases are U20 then U21', () => {
  assert.deepEqual(phasesFor('ui').map(p => p.id), ['U20', 'U21'])
  assert.deepEqual(PHASES.map(p => p.impl.map(f => f.dest).sort()), [
    ['api/openapi.yaml', 'src/http/handler.js', 'src/orders/orders.js'],
    ['src/http/customer-page.js', 'src/http/handler.js', 'src/server.js'],
  ])
  assert.deepEqual(PHASES.map(p => p.tests.map(f => f.dest)), [['test/customer-orders.test.js'], ['test/customer-page.test.js']])
})

test('no ui prompt or issue contains a trap word', () => {
  assert.equal(ISSUES.length, 2)
  for (const [name, text] of [['the bare prompt', BARE_PROMPT_UI], ['the issues', ISSUES.join('\n')], ...PHASES.map(p => [p.id, p.prompt])]) {
    for (const w of TRAP_WORDS) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), `${name} names the trap: ${w}`)
  }
})

test('ui bare dry run lands the hard base plus the reference', () => {
  const sb = sandbox('ui-dry')
  setupBare(sb, { dry: true, variant: 'ui' })
  assert.ok(fs.existsSync(path.join(sb.dir, 'test/refund.test.js')), 'B15-B19 are built in the base')
  assert.ok(!fs.existsSync(path.join(sb.dir, 'test/customer-page.test.js')), 'the base has no B20/B21')
  dryBare(sb, { variant: 'ui' })
  for (const f of ['src/http/handler.js', 'test/customer-page.test.js', 'test/customer-orders.test.js', 'src/http/customer-page.js', 'test/refund.test.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  const t = npmTest(sb.dir)
  assert.equal(t.status, 0, `npm test is green with the reference: ${t.stdout}${t.stderr}`.slice(0, 600))
})

test('each slip passes npm test (the unit tests cannot see it)', () => {
  for (const slip of ['error', 'field']) {
    const t = npmTest(build(slip))
    assert.equal(t.status, 0, `${slip}: ${t.stdout}${t.stderr}`.slice(0, 600))
  }
})

test('ui score marks a trap missing, not escaped, when its basic behaviour failed or its test is absent', async () => {
  const sb = sandbox('ui-score')
  setupBare(sb, { dry: true, variant: 'ui' }) // the base: no customer-page test
  const runBounded = async () => ({ status: 0 })
  const fake = async () => ({ traps: { error: false, field: false }, basic: { error: false, field: false }, failures: ['error: x', 'field: y'] })
  const r = await score(sb, { timeoutMs: 1000, runBounded, tamper: () => 0, checksFn: fake })
  assert.deepEqual([r.escaped, r.missing, r.accepted], [0, ['error', 'field'], false])
  // With the test written and the basic behaviour working, a failing trap has escaped.
  fs.writeFileSync(path.join(sb.dir, TRAP_TEST.error), '')
  const works = async () => ({ traps: { error: false, field: true }, basic: { error: true, field: true }, failures: ['error: x'] })
  const e = await score(sb, { timeoutMs: 1000, runBounded, tamper: () => 0, checksFn: works })
  assert.deepEqual([e.escaped, e.missing], [1, []])
  // A failing npm test leaves escaped null.
  const f = await score(sb, { timeoutMs: 1000, runBounded: async () => ({ status: 1 }), tamper: () => 0, checksFn: works })
  assert.equal(f.escaped, null)
})

test('the variant flag accepts ui', () => {
  assert.match(fs.readFileSync(path.join(root, 'eval/run.mjs'), 'utf8'), /'knex', 'ui'\]\.includes\(variant\)/)
})

test('without a browser every trap reports a crash, not an escape', async () => {
  const dir = build()
  const prev = process.env.RIG_EVAL_BROWSER_CACHE
  process.env.RIG_EVAL_BROWSER_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-no-browser-'))
  try {
    const r = await checks(dir)
    assert.deepEqual([r.traps, r.basic], [{ error: false, field: false }, { error: false, field: false }])
    assert.match(r.failures[0], /browser unavailable/)
  } finally {
    if (prev === undefined) delete process.env.RIG_EVAL_BROWSER_CACHE
    else process.env.RIG_EVAL_BROWSER_CACHE = prev
  }
})

test('ui checks: the reference passes both traps and both basics', { skip }, async () => {
  const r = await checks(build())
  assert.deepEqual([r.traps, r.basic, r.failures], [{ error: true, field: true }, { error: true, field: true }, []])
})

test('ui checks: each slip fails only its own trap and keeps the basic behaviour', { skip }, async () => {
  for (const [slip, bad] of [['error', 'error'], ['field', 'field']]) {
    const r = await checks(build(slip))
    assert.deepEqual(r.traps, { error: bad !== 'error', field: bad !== 'field' }, `${slip}: ${JSON.stringify(r)}`)
    assert.deepEqual(r.basic, { error: true, field: true }, `${slip} still does the basic behaviour: ${JSON.stringify(r)}`)
  }
})

test('the reference page decodes a name with a space and escapes markup, in the table and in the alert', { skip }, async () => {
  const dir = build()
  const { start, stop } = await import('../tests/e2e/fixtures/tooling/scripts/contract.mjs')
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ui-')), 'orders.json')
  const o = (id, customer) => ({ id, customer, status: 'paid', version: 1, lines: [{ sku: 'TEA-001', qty: 1 }, { sku: 'MUG-002', qty: 2 }], payableCents: 450, placedAt: '2026-02-01T09:00:00.000Z' })
  fs.writeFileSync(file, JSON.stringify([o('ORD-0901', 'Ada Lovelace'), o('ORD-0902', 'a<b>&c')]))
  process.env.ORDERS_FILE = file
  const { child, port } = await start(dir)
  try {
    await withPage(async page => {
      await page.goto(`http://127.0.0.1:${port}/ui/customers/Ada%20Lovelace`)
      assert.match(await page.locator('h1').innerText(), /Ada Lovelace/)
      const row = await page.locator('tbody tr').first().innerText()
      assert.ok(row.includes('Green tea') && row.includes('Mug'), 'both lines show, in order')
      assert.ok(row.indexOf('Green tea') < row.indexOf('Mug'))
      await page.goto(`http://127.0.0.1:${port}/ui/customers/${encodeURIComponent('a<b>&c')}`)
      assert.ok((await page.locator('tbody tr').first().innerText()).includes('paid'))
      assert.equal(await page.locator('b').count(), 0, 'the name is text, not markup')
      await page.goto(`http://127.0.0.1:${port}/ui/customers/${encodeURIComponent('x<i>&y')}`)
      const alert = await page.locator('[role="alert"]').innerText()
      assert.ok(alert.includes('x<i>&y'), alert)
      assert.equal(await page.locator('i').count(), 0)
    })
  } finally { await stop(child) }
})
