import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { orderArms, runOne, sessionTrace, phasesFor, taskOf } from './run.mjs'
import { setupBare, BARE_PROMPT_DELTA, BARE_PROMPT_PRICING, BARE_PROMPT_CONTRACT } from './setup.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { EVAL_ALLOW, nextRunAllowed, resultsAllowed } from './lib/cli.mjs'
import { ARMS } from './arms.mjs'

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
