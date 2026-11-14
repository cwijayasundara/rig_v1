import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { orderArms, runOne, sessionTrace, phasesFor, taskOf } from './run.mjs'
import { spawnSync } from 'node:child_process'
import { setupBare, setupRig, modelsSupported, dryBare, BARE_PROMPT_DELTA, BARE_PROMPT_PRICING, BARE_PROMPT_CONTRACT, BARE_PROMPT_TRAPS } from './setup.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { EVAL_ALLOW, nextRunAllowed, resultsAllowed } from './lib/cli.mjs'
import { ARMS } from './arms.mjs'
import { scoreRun } from './score.mjs'

test('nextRunAllowed refuses a run that could cross the total cap', () => {
  assert.equal(nextRunAllowed(0, 6, 300), true)
  assert.equal(nextRunAllowed(294, 6, 300), true)
  assert.equal(nextRunAllowed(294.01, 6, 300), false)
})

test('--dry refuses to write under eval/results', () => {
  assert.match(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), true) ?? '', /dry runs never write under eval\/results/)
  assert.equal(resultsAllowed(path.join(os.tmpdir(), 'x.jsonl'), true), null)
  assert.equal(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), false), null)
})

test('a dry bare run and a dry rig run are accepted 3/3 at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-bare', 'haiku-rig-final']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6 })
    assert.deepEqual([row.arm, row.accepted, row.checks, row.usd, row.error], [id, true, 3, 0, undefined], JSON.stringify(row))
  }
})

test('a run that throws is recorded with its error and its spend', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  const row = await runOne({ id: 'broken', model: 'x', rig: true, policy: 'continuous' }, 1, { dry: true, out, capRunUsd: 6, failAt: 'build' })
  assert.equal(row.accepted, false)
  assert.match(row.error, /build/)
  assert.equal(typeof row.usd, 'number')
})

test('final review: every eval arm may run npm and node, so bare arms can test their code like rig arms', () => {
  assert.ok(EVAL_ALLOW.includes('Bash(npm *)') && EVAL_ALLOW.includes('Bash(node *)'))
})

test('final review: a bare session that fails still has its work committed, so tamper can judge it', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  const row = await runOne(ARMS.find(a => a.id === 'haiku-bare'), 1, { dry: true, out, capRunUsd: 6, failAt: 'session' })
  assert.match(row.error, /session/)
  assert.ok(row.commits >= 1, JSON.stringify(row))
  assert.equal(typeof row.denials, 'number')
})

import { BARE_PROMPT } from './setup.mjs'

test('final review (denials): the bare prompt gives the same tool advice rig sessions get', () => {
  assert.match(BARE_PROMPT, /read files with Read, Grep and Glob and change them with Edit or Write/)
  assert.match(BARE_PROMPT, /run each command as its own Bash call/)
})

test('orderArms: the same seed repeats an order, and across runs no arm is always first', () => {
  assert.deepEqual(orderArms(ARMS, 7, 1).map(a => a.id), orderArms(ARMS, 7, 1).map(a => a.id))
  const firsts = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(n => orderArms(ARMS, 7, n)[0].id))
  assert.ok(firsts.size > 1, [...firsts].join())
  assert.deepEqual(orderArms(ARMS, 7, 2).map(a => a.id).sort(), ARMS.map(a => a.id).sort())
})

test('a dry rules run is accepted with full marks for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'rules' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.rules.b8, row.rules.b9, row.usd, row.error], [true, 11, 11, 6, true, 0, undefined], JSON.stringify(row))
  }
})

test('sessionTrace: one entry per session with its label, cost, turns, denied tools, agents and per-model cost', () => {
  const s = [
    { file: '/x/sessions/00-s8-start.jsonl', costUsd: 0.5, turns: 12, ms: 41_600, denials: [{ tool_name: 'Bash', tool_input: { command: 'git add -A && git commit -m x' } }], agents: ['rig:evaluator'], skills: ['rig-plan'], models: { 'claude-opus-5-5': { costUsd: 0.4 }, 'claude-haiku-5-5': { costUsd: 0.1 } } },
    { file: '/x/sessions/01-s8-build.jsonl', costUsd: 1.234567, turns: 3, denials: [], agents: [], skills: [], models: {} },
  ]
  assert.deepEqual(sessionTrace(s), [
    { label: 's8-start', usd: 0.5, turns: 12, seconds: 42, denied: ['Bash: git add -A && git commit -m x'], agents: ['rig:evaluator'], skills: ['rig-plan'], models: { opus: 0.4, haiku: 0.1 } },
    { label: 's8-build', usd: 1.2346, turns: 3, seconds: 0, denied: [], agents: [], skills: [], models: {} },
  ])
})

test('sessionTrace: two model ids of one family add up under one name', () => {
  const [row] = sessionTrace([{ file: '/x/00-a.jsonl', costUsd: 1, turns: 1, denials: [], agents: [], skills: [], models: { 'claude-sonnet-5-5': { costUsd: 0.25 }, 'claude-sonnet-4-5': { costUsd: 0.5 } } }])
  assert.deepEqual(row.models, { sonnet: 0.75 })
})

// The delta variant (eval 2026-10-31): the rules task from a finished B1-B7 shop, so a rig arm pays for B8 and B9 only, not for S2, S3 and S7 as well.
test('delta: rig arms build only B8 and B9, and the task is scored as rules', () => {
  assert.deepEqual(phasesFor('delta').map(p => p.id), ['S8', 'S9'])
  assert.deepEqual(phasesFor('rules').map(p => p.id), ['S2', 'S3', 'S7', 'S8', 'S9'])
  assert.equal(taskOf('delta'), 'rules')
  assert.equal(taskOf('links'), 'links')
})

test('delta: every arm starts with B1-B7 built and committed, and none of B8-B9', () => {
  const sb = createSandbox({ name: 'delta-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'delta' })
  for (const f of ['src/cart/cart.js', 'src/http/handler.js', 'test/links.test.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  assert.ok(!fs.existsSync(path.join(sb.dir, 'test/rules.test.js')))
  assert.equal(sb.git('status', '--porcelain').trim(), '', 'the seed is committed in the base')
  assert.match(BARE_PROMPT_DELTA, /already[^.]*B1–B7[^]*B8[^]*B9/)
})

test('a dry delta run is accepted with full marks for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'delta' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.rules.b8, row.rules.b9, row.usd, row.error], [true, 11, 11, 6, true, 0, undefined], JSON.stringify(row))
  }
})

// The pricing variant (eval 2026-10-31): B10-B12 on a built B1-B9 shop, a task with many exact rules.
test('pricing: rig builds B10-B12 as three changes, and every arm starts from the built B1-B9 shop', () => {
  assert.deepEqual(phasesFor('pricing').map(p => p.id), ['S10', 'S11', 'S12'])
  const sb = createSandbox({ name: 'pricing-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'pricing' })
  for (const f of ['src/orders/orders.js', 'test/rules.test.js', 'test/links.test.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  assert.ok(!fs.existsSync(path.join(sb.dir, 'test/pricing.test.js')) && !/cancelOrder/.test(fs.readFileSync(path.join(sb.dir, 'src/orders/orders.js'), 'utf8')))
  assert.match(BARE_PROMPT_PRICING, /already[^.]*B1–B9[^]*B10[^]*B11[^]*B12/)
})

test('a dry pricing run is accepted with full marks (25 of 25) for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'pricing' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.pricing?.b10, row.pricing?.b11, row.pricing?.b12, row.usd, row.error], [true, 25, 25, 5, 5, 4, 0, undefined], JSON.stringify(row))
  }
})

test('pricing checks: the reference passes all 14, and each plausible slip is caught by the check that names it', async () => {
  const { pricingChecks } = await import('./variants/pricing.mjs')
  const build = mutate => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-pricing-'))
    const sb = { dir }
    for (const d of ['tests/e2e/fixtures/shop', 'tests/e2e/fixtures/remove', 'eval/variants/links/fixtures', 'eval/variants/rules/fixtures', 'eval/variants/pricing/fixtures']) fs.cpSync(path.resolve(import.meta.dirname, '..', d), dir, { recursive: true })
    const f = path.join(dir, 'src/orders/orders.js')
    if (mutate) fs.writeFileSync(f, mutate(fs.readFileSync(f, 'utf8')))
    return sb.dir
  }
  const ref = await pricingChecks(build())
  assert.deepEqual([ref.b10, ref.b11, ref.b12, ref.failures], [5, 5, 4, []])
  const slips = {
    'shipping threshold on the subtotal, not after the discount': [s => s.replace('subtotal - discount >= FREE_SHIPPING_CENTS', 'subtotal >= FREE_SHIPPING_CENTS'), 'b10'],
    'totalCents includes shipping and tax': [s => s.replace('const totalCents = subtotal - discount', 'const totalCents = subtotal - discount + shippingCents + taxCents'), 'b10'],
    'tax rounded per order, not per line': [s => s.replace('halfUp((amounts[i] - shares[i]) * TAX_BASIS_POINTS, 10000)', 'Math.floor(((amounts[i] - shares[i]) * TAX_BASIS_POINTS) / 10000)'), 'b10'],
    'a failed checkout still uses the coupon up': [s => s.replace("  if (code && used.has(`${customer}|${code}`)) throw", "  if (code) used.add(`${customer}|${code}`)\n  if (code && used.has(`${customer}|${code}`)) throw"), 'b11'],
    'cancel does not free the coupon': [s => s.replace("  if (entry.order.code) used.delete(`${entry.order.customer}|${entry.order.code}`)\n", ''), 'b12'],
  }
  for (const [name, [mutate, group]] of Object.entries(slips)) {
    const r = await pricingChecks(build(mutate))
    assert.ok(r[group] < ref[group], `${name}: ${group} still ${r[group]}`)
  }
})

// The contract variant (eval 2026-10-31): B13-B14, the orders over HTTP, with the wire rules in a repo document, not in the prompt.
test('contract: rig builds B13 and B14 as two changes, from a base that has B1-B12 and the conventions document but no orders routes', () => {
  assert.deepEqual(phasesFor('contract').map(p => p.id), ['S13', 'S14'])
  const sb = createSandbox({ name: 'contract-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'contract' })
  for (const f of ['docs/api-conventions.md', 'src/orders/orders.js', 'test/pricing.test.js', 'scripts/contract.mjs']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  const handler = fs.readFileSync(path.join(sb.dir, 'src/http/handler.js'), 'utf8')
  assert.ok(!/['"`]\/orders/.test(handler) && !fs.existsSync(path.join(sb.dir, 'test/orders-api.test.js')))
  assert.match(BARE_PROMPT_CONTRACT, /already[^.]*B1–B12[^]*B13[^]*B14/)
  assert.match(fs.readFileSync(path.join(sb.dir, 'BRIEF.md'), 'utf8'), /docs\/api-conventions\.md/)
})

test('a dry contract run is accepted with full marks (42 of 42) for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'haiku-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'contract' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.contract?.b13, row.contract?.b14, row.contract?.files, row.usd, row.error], [true, 42, 42, 8, 7, 2, 0, undefined], JSON.stringify(row))
  }
})

test('contract checks: the reference passes all 17, and each plausible slip is caught by the group that names it', async () => {
  const { contractChecks } = await import('./variants/contract.mjs')
  const build = mutate => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-contract-'))
    for (const d of ['tests/e2e/fixtures/shop', 'tests/e2e/fixtures/remove', 'eval/variants/links/fixtures', 'eval/variants/rules/fixtures', 'eval/variants/pricing/fixtures', 'eval/variants/contract/seed', 'eval/variants/contract/fixtures']) fs.cpSync(path.resolve(import.meta.dirname, '..', d), dir, { recursive: true })
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
    fs.copyFileSync(path.resolve(import.meta.dirname, '../tests/e2e/fixtures/tooling/scripts/contract.mjs'), path.join(dir, 'scripts/contract.mjs'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop-app', type: 'module', scripts: { test: 'node --test', start: 'node src/server.js' } }))
    mutate?.(dir)
    return dir
  }
  const edit = (rel, from, to) => dir => { const f = path.join(dir, rel); const s = fs.readFileSync(f, 'utf8'); assert.ok(s.includes(from), `${rel} lacks ${from}`); fs.writeFileSync(f, s.replace(from, to)) }
  const ref = contractChecks(build())
  assert.deepEqual([ref.b13, ref.b14, ref.files, ref.failures], [8, 7, 2, []])
  const slips = {
    'an unquoted etag': [edit('src/http/handler.js', '`"${o.id}-v${o.version}"`', '`${o.id}-v${o.version}`'), 'b13'],
    'a cursor that is the plain id': [edit('src/http/handler.js', "Buffer.from(items.at(-1).id).toString('base64url')", 'items.at(-1).id'), 'b13'],
    'a server that drops the handler\'s headers': [edit('src/server.js', "'content-type': 'application/json', ...r.headers", "'content-type': 'application/json'"), 'b13'],
    'no 428 for a missing if-match': [edit('src/http/handler.js', "    if (headers['if-match'] === undefined) return problem(428, 'precondition-required', 'Send if-match with the current etag.')\n", ''), 'b14'],
    'a replay without its header': [edit('src/http/handler.js', ", 'idempotent-replay': 'true'", ''), 'b14'],
    'a cancel example missing from the contract': [dir => fs.rmSync(path.join(dir, 'contracts/examples/12-cancel-needs-if-match.json')), 'files'],
  }
  for (const [name, [mutate, group]] of Object.entries(slips)) {
    const r = contractChecks(build(mutate))
    assert.ok(r[group] < ref[group], `${name}: ${group} still ${r[group]}`)
  }
})

test('the low-effort arms are the haiku arms with effort low, bare and rig', () => {
  const low = ARMS.filter(a => a.effort === 'low')
  assert.deepEqual(low.map(a => [a.id, a.rig, a.model]), [['haiku-low-bare', false, 'claude-haiku-5-5'], ['haiku-low-rig', true, 'claude-haiku-5-5']])
})

// The traps variant (W0): B15-B18 on a built B1-B14 shop. Each trap is a defect that unit tests pass and the running app fails.
const TRAP_WORDS = ['routes.js', '--flag=value', '100000', 'role="alert"', 'openapi']

test('traps: rig builds B15–B18 as four changes from a base with the seed documents and no B15–B18 code', () => {
  assert.deepEqual(phasesFor('traps').map(p => p.id), ['S15', 'S16', 'S17', 'S18'])
  const sb = createSandbox({ name: 'traps-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'traps' })
  for (const f of ['docs/api-conventions.md', 'docs/cli-conventions.md', 'docs/ui-conventions.md', 'src/http/routes.js', 'bin/shop.mjs', 'data/orders.json', 'test/cancel-api.test.js', 'src/http/handler.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  for (const f of ['src/http/receipt.js', 'src/http/reports.js', 'src/http/orders-page.js', 'test/receipt.test.js', 'test/cli.test.js', 'test/top-customers.test.js', 'test/orders-page.test.js']) assert.ok(!fs.existsSync(path.join(sb.dir, f)), `${f} must not be in the base`)
  assert.match(fs.readFileSync(path.join(sb.dir, 'src/http/routes.js'), 'utf8'), /export const routes = \[\]/)
  assert.doesNotMatch(fs.readFileSync(path.join(sb.dir, 'bin/shop.mjs'), 'utf8').match(/function parseArgs[\s\S]*?\n}\n/)[0], /indexOf\('='\)|unknown flag/, 'the seed parseArgs takes only --flag value')
  assert.doesNotMatch(fs.readFileSync(path.join(sb.dir, 'api/openapi.yaml'), 'utf8'), /statusLabel/)
  assert.match(fs.readFileSync(path.join(sb.dir, 'docs/ui-conventions.md'), 'utf8'), /role="alert"[^]*openapi\.yaml/)
  assert.match(BARE_PROMPT_TRAPS, /already[^.]*B1–B14[^]*B15[^]*B16[^]*B17[^]*B18/)
  assert.match(fs.readFileSync(path.join(sb.dir, 'BRIEF.md'), 'utf8'), /B18: GET \/orders\/view/)
})

test('no traps prompt names the trap', async () => {
  const { PHASE_S15, PHASE_S16, PHASE_S17, PHASE_S18, briefFor } = await import('./variants/traps.mjs')
  const { briefFor: contractBrief } = await import('./variants/contract.mjs')
  const shop = fs.readFileSync(path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md'), 'utf8')
  const old = new Set(contractBrief(shop).split('\n'))
  const added = briefFor(shop).split('\n').filter(l => !old.has(l)).join('\n')
  assert.match(added, /B15[^]*B16[^]*B17[^]*B18/)
  for (const [name, text] of [['the bare prompt', BARE_PROMPT_TRAPS], ['the brief lines', added], ...[PHASE_S15, PHASE_S16, PHASE_S17, PHASE_S18].map(p => [p.id, p.prompt])]) {
    for (const w of TRAP_WORDS) assert.ok(!text.includes(w), `${name} names the trap: ${w}`)
  }
})

test('a dry traps run is accepted with full marks and escaped 0 for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'sonnet-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'traps' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.escaped, row.usd, row.error], [true, 47, 47, 0, 0, undefined], JSON.stringify(row))
    assert.deepEqual(row.traps, { route: true, flag: true, scale: true, uiError: true, uiField: true })
  }
})

test('trap checks: the reference passes all five; each slip fails only its own trap', async () => {
  const { trapChecks } = await import('./variants/traps.mjs')
  const root = path.resolve(import.meta.dirname, '..')
  const build = mutate => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-traps-'))
    for (const d of ['tests/e2e/fixtures/shop', 'tests/e2e/fixtures/remove', 'eval/variants/links/fixtures', 'eval/variants/rules/fixtures', 'eval/variants/pricing/fixtures', 'eval/variants/contract/seed', 'eval/variants/contract/fixtures', 'eval/variants/traps/seed', 'eval/variants/traps/fixtures']) fs.cpSync(path.join(root, d), dir, { recursive: true })
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
    fs.copyFileSync(path.join(root, 'tests/e2e/fixtures/tooling/scripts/contract.mjs'), path.join(dir, 'scripts/contract.mjs'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop-app', type: 'module', scripts: { test: 'node --test', start: 'node src/server.js' } }))
    mutate?.(dir)
    return dir
  }
  const edit = (rel, from, to) => dir => { const f = path.join(dir, rel); const s = fs.readFileSync(f, 'utf8'); assert.ok(s.includes(from), `${rel} lacks ${from}`); fs.writeFileSync(f, s.replace(from, to)) }
  const ALL = ['route', 'flag', 'scale', 'uiError', 'uiField']
  const ref = await trapChecks(build())
  assert.deepEqual([ref.traps, ref.failures], [Object.fromEntries(ALL.map(k => [k, true])), []])
  const seedParse = fs.readFileSync(path.join(root, 'eval/variants/traps/seed/bin/shop.mjs'), 'utf8').match(/function parseArgs[\s\S]*?\n}\n/)[0]
  const NAIVE = `import { listOrders } from '../orders/orders.js'
export function topCustomers({ url, json }) {
  const orders = listOrders()
  const customers = []
  for (const o of orders) if (!customers.includes(o.customer)) customers.push(o.customer)
  const rows = customers.map(c => ({ customer: c, spendCents: orders.filter(o => o.customer === c && o.status !== 'cancelled').reduce((n, o) => n + o.payableCents, 0), orders: orders.filter(o => o.customer === c && o.status !== 'cancelled').length }))
  const raw = url.searchParams.get('limit')
  return json(200, { items: rows.sort((a, b) => b.spendCents - a.spendCents || (a.customer < b.customer ? -1 : 1)).slice(0, raw === null ? 10 : Number(raw)) })
}
`
  const slips = {
    'the route left out of routes.js': [edit('src/http/routes.js', "  { method: 'GET', path: /^\\/orders\\/([^/]+)\\/receipt$/, handle: receipt },\n", ''), 'route'],
    'parseArgs left unchanged': [dir => { const f = path.join(dir, 'bin/shop.mjs'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/function parseArgs[\s\S]*?\n}\n/, seedParse)) }, 'flag'],
    'a nested-loop top-customers': [dir => fs.writeFileSync(path.join(dir, 'src/http/reports.js'), NAIVE), 'scale'],
    'no error branch on the page': [edit('src/http/orders-page.js', "try { orders = listOrders() } catch { return page(503, '<p role=\"alert\">Orders are unavailable right now. Please try again shortly.</p>') }", 'orders = listOrders()'), 'uiError'],
    'the status label rendered without the contract change': [dir => { const f = path.join(dir, 'api/openapi.yaml'); const s = JSON.parse(fs.readFileSync(f, 'utf8')); delete s.components.schemas.Order.properties.statusLabel; fs.writeFileSync(f, JSON.stringify(s, null, 2)) }, 'uiField'],
  }
  for (const [name, [mutate, only]] of Object.entries(slips)) {
    const r = await trapChecks(build(mutate))
    assert.deepEqual(r.traps, Object.fromEntries(ALL.map(k => [k, k !== only])), `${name}: ${JSON.stringify(r)}`)
    if (only === 'scale') assert.ok(Number(/took (\d+) ms/.exec(r.failures[0])?.[1]) > 10_000, `the naive top-customers must be clearly slow: ${r.failures[0]}`)
  }
})

test('escaped is null when npm test fails, and counts the failed traps when it passes', async () => {
  const sb = createSandbox({ name: 'traps-escaped', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-esc-')) })
  const base = setupBare(sb, { dry: true, variant: 'traps' })
  dryBare(sb, { variant: 'traps' })
  fs.writeFileSync(path.join(sb.dir, 'src/http/routes.js'), 'export const routes = []\n')
  sb.commitAll('run: nothing is registered')
  const red = await scoreRun(sb, base, { variant: 'traps' })
  assert.deepEqual([red.npmTest, red.traps.route, red.escaped], [false, false, null], 'the reference tests go red without the registrations, so npm test fails here')
  for (const t of ['receipt', 'orders-page', 'top-customers']) fs.writeFileSync(path.join(sb.dir, `test/${t}.test.js`), `import { test } from 'node:test'\ntest('${t}: unit only', () => {})\n`)
  sb.commitAll('run: the unit tests no longer go through the table')
  const escaped = await scoreRun(sb, base, { variant: 'traps' })
  assert.deepEqual([escaped.npmTest, escaped.traps.route, escaped.escaped], [true, false, 4], 'unit tests pass, and the four traps that need a registration or a page escaped')
})

// W3: the arms that compare two rig refs and two model pairs.
test('RIG_EVAL_PLUGIN points PLUGIN elsewhere and the row records its sha', async () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-plugin-'))
  const probe = env => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', "const s = await import('./tests/e2e/lib/sandbox.mjs'); const u = await import('./eval/setup.mjs'); console.log(JSON.stringify([s.PLUGIN, u.pluginSha()]))"], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, ...env } })
  const [dir, sha] = JSON.parse(probe({ RIG_EVAL_PLUGIN: other }).stdout)
  assert.deepEqual([dir, sha], [fs.realpathSync(other) === other ? other : path.resolve(other), null], 'a directory that is not a git checkout has no sha')
  const [def, defSha] = JSON.parse(probe({ RIG_EVAL_PLUGIN: '' }).stdout)
  assert.equal(def, path.resolve(import.meta.dirname, '..'))
  assert.equal(defSha, spawnSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: def, encoding: 'utf8' }).stdout.trim())
  const row = await runOne(ARMS.find(a => a.id === 'sonnet-bare'), 1, { dry: true, out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-')), capRunUsd: 6 })
  assert.equal(row.plugin, defSha)
})

test("an arm's models.light reaches the sandbox registry", async () => {
  const sb = createSandbox({ name: 'models-light', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-models-')) })
  await setupRig(sb, ARMS.find(a => a.id === 'sonnet-rig-light-sonnet'), { dry: true })
  assert.deepEqual(JSON.parse(sb.read('.rig/sensors.json')).models.light, { build: 'sonnet', evaluate: 'opus' })
  const plain = createSandbox({ name: 'models-none', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-models-')) })
  await setupRig(plain, ARMS.find(a => a.id === 'sonnet-rig'), { dry: true })
  assert.equal(JSON.parse(plain.read('.rig/sensors.json')).models, undefined, 'an arm without models leaves the registry default')
  assert.deepEqual(ARMS.filter(a => a.id.startsWith('sonnet-rig')).map(a => [a.id, a.model, a.rig, a.policy]), [['sonnet-rig', 'claude-sonnet-5-5', true, 'continuous'], ['sonnet-rig-light-haiku', 'claude-sonnet-5-5', true, 'continuous'], ['sonnet-rig-light-sonnet', 'claude-sonnet-5-5', true, 'continuous']])
})

test("a plugin without 'models' in registry.ts gets no models key and modelsIgnored", async () => {
  const old = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-old-plugin-'))
  fs.mkdirSync(path.join(old, 'scripts'))
  fs.writeFileSync(path.join(old, 'scripts/registry.ts'), "const TOP_KEYS = ['stack', 'gates']\n")
  assert.deepEqual([modelsSupported(old), modelsSupported()], [false, true])
  const sb = createSandbox({ name: 'models-old', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-models-')) })
  await setupRig(sb, ARMS.find(a => a.id === 'sonnet-rig-light-haiku'), { dry: true, plugin: old })
  assert.equal(JSON.parse(sb.read('.rig/sensors.json')).models, undefined)
  const out = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'eval/run.mjs', '--dry', '--runs', '1', '--arms', 'sonnet-rig-light-haiku', '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-old-'))], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, RIG_EVAL_PLUGIN: old } })
  assert.match(out.stdout, /sonnet-rig-light-haiku #1/)
  const results = out.stdout.match(/^(\S+results\.jsonl)$/m)?.[1]
  assert.equal(JSON.parse(fs.readFileSync(results, 'utf8').trim().split('\n')[0]).modelsIgnored, true)
})
