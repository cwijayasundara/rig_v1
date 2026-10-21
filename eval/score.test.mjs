import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { ARMS, armsFrom } from './arms.mjs'
import { scoreRun } from './score.mjs'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')
// A scaffolded repo with the finished shop on top of the scaffold commit: what a perfect run leaves behind.
function shopRepo(name) {
  const sb = createSandbox({ name, out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-')) })
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts: { start: 'node src/server.js', test: 'node --test' } }, null, 2) + '\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\ntest('loads', () => {})\n")
  sb.commitAll('chore: scaffold')
  const base = sb.git('rev-parse', 'HEAD')
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
  sb.commitAll('feat: the shop')
  return { sb, base }
}

test('the arms of spec §9 and the arch arm, in order, and --arms picks them', () => {
  assert.deepEqual(ARMS.map(a => a.id), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-arch', 'haiku-rig-final'])
  assert.deepEqual(ARMS.filter(a => a.rig).map(a => a.policy), ['continuous', 'continuous', 'final'])
  assert.deepEqual(ARMS.filter(a => a.arch).map(a => a.id), ['haiku-rig-arch'], 'only one arm has approved layers')
  assert.deepEqual(armsFrom('all').length, 6)
  assert.deepEqual(armsFrom('opus-bare,haiku-rig').map(a => a.id), ['opus-bare', 'haiku-rig'])
  assert.throws(() => armsFrom('gpt-bare'), /unknown arm: gpt-bare/)
})

test('a finished shop scores 3/3, accepted, with no tamper', async () => {
  const { sb, base } = shopRepo('perfect')
  const s = await scoreRun(sb, base)
  assert.deepEqual([s.checks, s.of, s.accepted, s.tamper.testTamper, s.tamper.suppression], [3, 3, true, 0, 0], JSON.stringify(s))
})

test('a shop without remove fails both acceptances, and a gutted test counts as tamper', async () => {
  // The base is the finished shop, so the gutted test is a modification of a test that existed (what test-tamper judges).
  const { sb } = shopRepo('broken')
  const base = sb.git('rev-parse', 'HEAD')
  sb.git('rm', '-q', '-r', 'src', 'test')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\ntest('loads', () => {})\n")
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  sb.write('test/shop.test.js', sb.read('test/shop.test.js').replace(/assert\.[a-zA-Z]+\([^\n]*\n/g, '\n'))
  sb.commitAll('feat: half a shop')
  const s = await scoreRun(sb, base)
  assert.equal(s.accepted, false)
  assert.notEqual(s.acceptance, true)
  assert.notEqual(s.http, true)
  assert.ok(s.tamper.testTamper >= 1, JSON.stringify(s.tamper))
})

test('a test written in one commit and gutted in a later one counts as tamper, judged against the scaffold', async () => {
  const { sb, base } = shopRepo('gutted-later')
  sb.write('test/shop.test.js', sb.read('test/shop.test.js').replace(/assert\.[a-zA-Z]+\([^\n]*\n/g, '\n'))
  sb.commitAll('test: weaker')
  const s = await scoreRun(sb, base)
  assert.ok(s.tamper.testTamper >= 1, JSON.stringify(s.tamper))
})

test('final review: the brief names every module the hidden import acceptance loads, so no arm has to guess file names', () => {
  const brief = fs.readFileSync(path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md'), 'utf8')
  const acc = fs.readFileSync(path.resolve(import.meta.dirname, '../tests/e2e/acceptance/shop.mjs'), 'utf8')
  const loaded = [...acc.matchAll(/load\(repo, '([^']+)'\)/g)].map(m => m[1])
  assert.ok(loaded.length >= 4)
  for (const f of loaded) assert.ok(brief.includes(f), `brief does not name ${f}`)
})

test('final review: a test suite that never ends is scored as failed within the bound, not waited on', async () => {
  const { sb, base } = shopRepo('hang')
  sb.write('test/hang.test.js', "import { test } from 'node:test'\ntest('hangs', () => new Promise(() => setInterval(() => {}, 1000)))\n")
  sb.commitAll('test: hangs')
  const t0 = Date.now()
  const s = await scoreRun(sb, base, { timeoutMs: 4000 })
  assert.equal(s.npmTest, false)
  assert.ok(Date.now() - t0 < 60_000, `took ${Date.now() - t0} ms`)
})

test('final review: a commit the tamper check could not judge is counted as unjudged, not as clean', async () => {
  const { sb, base } = shopRepo('unjudged')
  const s = await scoreRun(sb, base, { sdlc: '/nonexistent/sdlc.ts' })
  assert.ok(s.tamper.unjudged >= 1, JSON.stringify(s.tamper))
})

import { layerViolations } from './score.mjs'

const shop = files => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-layers-'))
  for (const [f, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text) }
  return dir
}

test('layerViolations: only an import that points up the layers counts, however it is spelled', () => {
  const ok = shop({
    'src/catalog/products.js': 'export const p = 1\n',
    'src/cart/cart.js': "import { p } from '../catalog/products.js'\n",
    'src/orders/orders.js': "import { Cart } from '../cart/cart.js'\nimport { p } from '../catalog/products.js'\nimport fs from 'node:fs'\n",
    'src/http/handler.js': "import { checkout } from '../orders/orders.js'\nimport { Cart } from '../cart/cart.js'\n",
    'src/server.js': "import { createHandler } from './http/handler.js'\n",
  })
  assert.equal(layerViolations(ok), 0)
  assert.equal(layerViolations(shop({ 'src/orders/orders.js': "import { productPath } from '../http/routes.js'\n" })), 1, 'orders importing http')
  assert.equal(layerViolations(shop({ 'src/catalog/products.js': "import { Cart } from '../cart/cart.js'\n" })), 1, 'catalog importing cart')
  assert.equal(layerViolations(shop({ 'src/http/handler.js': "import { start } from '../server.js'\n" })), 0, 'server.js is outside the layers the arch arm is given')
  assert.equal(layerViolations(shop({ 'src/orders/orders.js': "import {\n  productPath,\n  other,\n} from '../http/routes.js'\n" })), 1, 'a multi-line import')
  assert.equal(layerViolations(shop({ 'src/orders/orders.js': "import '../http/setup.js'\nexport { x } from '../http'\n" })), 2, 'a side-effect import and an export-from a directory')
  assert.equal(layerViolations(shop({ 'src/orders/orders.js': "// const h = require('../http/handler.js')\n/* import { a } from '../http/x.js' */\n" })), 0, 'comments')
  assert.equal(layerViolations(shop({ 'src/cart/cart.js': "const o = require('../orders/orders.js')\nconst h = await import('../http/handler.js')\n" })), 2, 'require and dynamic import')
  assert.equal(layerViolations(shop({ 'src/cart/cart.js': "import x from 'left-pad'\n// import { y } from '../http/handler.js'\n" })), 0, 'a package, and a comment')
  assert.equal(layerViolations(shop({})), 0, 'no src at all')
})
