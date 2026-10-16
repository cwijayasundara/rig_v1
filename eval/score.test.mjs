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

test('the five arms of spec §9, in order, and --arms picks them', () => {
  assert.deepEqual(ARMS.map(a => a.id), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-final'])
  assert.deepEqual(ARMS.filter(a => a.rig).map(a => a.policy), ['continuous', 'final'])
  assert.deepEqual(armsFrom('all').length, 5)
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
