// The hard variant (W3b): B15-B19 on a built B1-B14 shop. Five traps that only running the code finds.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { runOne, phasesFor } from './run.mjs'
import { setupBare, dryBare, BARE_PROMPT_HARD } from './setup.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { ARMS } from './arms.mjs'
import { scoreRun } from './score.mjs'
import { checks, briefFor, TRAP_WORDS, TRAP_TEST, BOUND_MS, PHASE_S15, PHASE_S16, PHASE_S17, PHASE_S18, PHASE_S19 } from './variants/hard.mjs'

const root = path.resolve(import.meta.dirname, '..')
const NAMES = ['rule', 'caller', 'race', 'nfr', 'flag']
const only = bad => Object.fromEntries(NAMES.map(k => [k, k !== bad]))
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8')

// A fresh repo holding the reference solution (the base chain, the hard seed, then the reference files), with one defect applied.
function build(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-hard-'))
  for (const d of ['tests/e2e/fixtures/shop', 'tests/e2e/fixtures/remove', 'eval/variants/links/fixtures', 'eval/variants/rules/fixtures', 'eval/variants/pricing/fixtures', 'eval/variants/contract/seed', 'eval/variants/contract/fixtures', 'eval/variants/hard/seed', 'eval/variants/hard/fixtures']) fs.cpSync(path.join(root, d), dir, { recursive: true })
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.copyFileSync(path.join(root, 'tests/e2e/fixtures/tooling/scripts/contract.mjs'), path.join(dir, 'scripts/contract.mjs'))
  mutate?.(dir)
  return dir
}
const edit = (rel, from, to) => dir => { const f = path.join(dir, rel); const s = fs.readFileSync(f, 'utf8'); assert.ok(s.includes(from), `${rel} lacks ${from}`); fs.writeFileSync(f, s.replace(from, () => to)) }

test('hard: rig builds B15–B19 as five changes from a base with the integration test outside npm test and no B15–B19 code', () => {
  assert.deepEqual(phasesFor('hard').map(p => p.id), ['S15', 'S16', 'S17', 'S18', 'S19'])
  const sb = createSandbox({ name: 'hard-seed', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-seed-')) })
  setupBare(sb, { dry: true, variant: 'hard' })
  for (const f of ['test/integration/refund-policy.test.js', 'src/money.js', 'src/reports/csv.js', 'src/inventory/inventory.js', 'bin/shop.mjs', 'data/orders.json', 'src/http/handler.js']) assert.ok(fs.existsSync(path.join(sb.dir, f)), f)
  for (const t of Object.values(TRAP_TEST)) assert.ok(!fs.existsSync(path.join(sb.dir, t)), `${t} must not be in the base`)
  const pkg = JSON.parse(sb.read('package.json')).scripts
  assert.match(pkg.test, /test\/\*\.test\.js/, 'npm test runs only the top-level test files')
  assert.equal(pkg['test:all'], 'node --test', 'npm run test:all runs everything, the integration test too')
  for (const [file, absent] of [['src/http/handler.js', /refund|placeOrder|pageOrders|page/i], ['src/orders/orders.js', /refund|placeOrder|pageOrders/], ['bin/shop.mjs', /flags\.status/]]) assert.doesNotMatch(sb.read(file), absent, `${file} has no B15–B19 code`)
  assert.match(sb.read('src/money.js'), /toFixed/)
  assert.match(sb.read('src/reports/csv.js'), /Math\.round/, 'the second, copied rounding')
  assert.match(sb.read('src/inventory/inventory.js'), /await later\(\)/, 'the store yields between read and write')
  assert.match(sb.read('test/integration/refund-policy.test.js'), /45[^]*403/)
  for (const f of fs.readdirSync(path.join(sb.dir, 'docs'))) assert.doesNotMatch(sb.read(`docs/${f}`), /refund|x-manager|half[- ]up|rounds? |--status/i, `docs/${f} must not state a hard rule`)
  const t = spawnSync('npm', ['test', '--silent'], { cwd: sb.dir, encoding: 'utf8', env: sb.env })
  assert.equal(t.status, 0, `npm test is green in the base: ${t.stdout}${t.stderr}`.slice(0, 600))
  const all = spawnSync('npm', ['run', 'test:all', '--silent'], { cwd: sb.dir, encoding: 'utf8', env: sb.env })
  assert.notEqual(all.status, 0, 'test:all finds the refund rule the unit suite does not run')
  assert.match(all.stdout, /refund policy/)
})

test('hard: both arms get the same brief and the same base; the numbers are stated once; no pointers', () => {
  const shop = fs.readFileSync(path.join(root, 'tests/e2e/prd/shop-brief.md'), 'utf8')
  const brief = briefFor(shop)
  assert.equal(brief.split('200 ms').length, 2)
  assert.equal(brief.split('200 000').length, 2)
  assert.equal(brief.split('given more than once').length, 2)
  for (const name of ['bare-seed', 'rig-seed']) {
    const sb = createSandbox({ name, out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-brief-')) })
    setupBare(sb, { dry: true, variant: 'hard' })
    assert.equal(sb.read('BRIEF.md'), brief)
  }
  assert.doesNotMatch(BARE_PROMPT_HARD, /docs\/|openapi|conventions/)
  assert.match(BARE_PROMPT_HARD, /already[^.]*B1–B14[^]*B15[^]*B16[^]*B17[^]*B18[^]*B19/)
  for (const p of [PHASE_S15, PHASE_S16, PHASE_S17, PHASE_S18, PHASE_S19]) assert.doesNotMatch(p.prompt, /docs\/|conventions/, p.id)
})

test('no hard prompt names the trap', async () => {
  const { briefFor: contractBrief } = await import('./variants/contract.mjs')
  const shop = fs.readFileSync(path.join(root, 'tests/e2e/prd/shop-brief.md'), 'utf8')
  const old = new Set(contractBrief(shop).split('\n'))
  const added = briefFor(shop).split('\n').filter(l => !old.has(l)).join('\n')
  assert.match(added, /B15[^]*B16[^]*B17[^]*B18[^]*B19/)
  for (const [name, text] of [['the bare prompt', BARE_PROMPT_HARD], ['the brief lines', added], ...[PHASE_S15, PHASE_S16, PHASE_S17, PHASE_S18, PHASE_S19].map(p => [p.id, p.prompt])]) {
    for (const w of TRAP_WORDS) assert.ok(!text.includes(w), `${name} names the trap: ${w}`)
  }
})

test('a dry hard run is accepted with full marks and escaped 0 for a rig arm and a bare arm at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-rig', 'sonnet-bare']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6, variant: 'hard' })
    assert.deepEqual([row.accepted, row.checks, row.of, row.escaped, row.usd, row.error], [true, 47, 47, 0, 0, undefined], JSON.stringify(row))
    assert.deepEqual(row.traps, Object.fromEntries(NAMES.map(k => [k, true])))
  }
})

test('hard checks: the reference passes all five; each slip fails only its own trap', async () => {
  const ref = await checks(build())
  assert.deepEqual([ref.traps, ref.failures], [only(null), []])
  const seedCsv = read(path.join(root, 'eval/variants/hard/seed'), 'src/reports/csv.js')
  const slips = {
    'no manager rule on an old refund': [edit('src/http/handler.js', "    if (Date.now() - Date.parse(order.placedAt ?? new Date()) > 30 * DAY && headers['x-manager'] !== 'yes') return problem(403, 'manager-required', 'A refund after 30 days needs a manager.')\n", ''), 'rule'],
    'the copied rounding in csv.js left alone': [dir => fs.writeFileSync(path.join(dir, 'src/reports/csv.js'), seedCsv), 'caller'],
    'a read-then-write placement without a lock': [edit('src/orders/orders.js', 'const exclusive = (key, fn) => {', 'const exclusive = (key, fn) => fn()\nconst unused = (key, fn) => {'), 'race'],
    'a page cut from a sorted copy of every order': [edit('src/http/handler.js', 'pageOrders(Number(p), 20)', '(() => { const all = listOrders().sort((a, b) => b.placedAt.localeCompare(a.placedAt)); return { items: all.slice((Number(p) - 1) * 20, Number(p) * 20), page: Number(p), total: all.length } })()'), 'nfr'],
    'a repeated flag keeps only the last value': [edit('bin/shop.mjs', "const put = (k, v) => { flags[k] = k in flags ? [].concat(flags[k], v) : v }", 'const put = (k, v) => { flags[k] = v }'), 'flag'],
  }
  for (const [name, [mutate, bad]] of Object.entries(slips)) {
    const r = await checks(build(mutate))
    assert.deepEqual(r.traps, only(bad), `${name}: ${JSON.stringify(r)}`)
  }
})

test('race check: the reference passes 20 of 20 repetitions, the naive placement fails 20 of 20', async () => {
  const good = build()
  const naive = build(edit('src/orders/orders.js', 'const exclusive = (key, fn) => {', 'const exclusive = (key, fn) => fn()\nconst unused = (key, fn) => {'))
  const run = async dir => (await Promise.all(Array.from({ length: 20 }, () => checks(dir, { only: ['race'] })))).filter(r => r.traps.race).length
  assert.equal(await run(good), 20)
  assert.equal(await run(naive), 0)
})

test(`nfr: the reference is under ${BOUND_MS} ms and the sort-everything version is at least 5x over it`, async () => {
  const ref = await checks(build(), { only: ['nfr'] })
  assert.equal(ref.traps.nfr, true, JSON.stringify(ref.failures))
  const naive = await checks(build(edit('src/http/handler.js', 'pageOrders(Number(p), 20)', '(() => { const all = listOrders().sort((a, b) => b.placedAt.localeCompare(a.placedAt)); return { items: all.slice((Number(p) - 1) * 20, Number(p) * 20), page: Number(p), total: all.length } })()')), { only: ['nfr'] })
  const ms = Number(/took (\d+) ms/.exec(naive.failures[0])?.[1])
  assert.ok(ms >= 5 * BOUND_MS, `the naive page must be at least ${5 * BOUND_MS} ms: ${naive.failures[0]}`)
})

test('escaped is counted only when npm test passes and the trap fails; a behaviour with no test file is missing', async () => {
  const sb = createSandbox({ name: 'hard-escaped', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-esc-')) })
  const base = setupBare(sb, { dry: true, variant: 'hard' })
  dryBare(sb, { variant: 'hard' })
  fs.writeFileSync(path.join(sb.dir, 'src/reports/csv.js'), read(path.join(root, 'eval/variants/hard/seed'), 'src/reports/csv.js'))
  sb.commitAll('run: the CSV keeps its own rounding')
  const slipped = await scoreRun(sb, base, { variant: 'hard' })
  assert.deepEqual([slipped.npmTest, slipped.traps.caller, slipped.escaped, slipped.missing], [true, false, 1, []])
  fs.rmSync(path.join(sb.dir, 'test/money.test.js'))
  sb.commitAll('run: no B16 test at all')
  const gone = await scoreRun(sb, base, { variant: 'hard' })
  assert.deepEqual([gone.escaped, gone.missing], [0, ['caller']])
})
