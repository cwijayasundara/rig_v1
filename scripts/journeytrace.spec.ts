// Journey traces: a step records what it observed and a screenshot, so the base and the head can be compared (design 2026-11-21).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const LIB = path.resolve(import.meta.dirname, '../templates/verify/lib.mjs')

// Runs a driver body with the helper and returns the evidence it wrote.
function run(body: string): { steps: Record<string, unknown>[]; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-trace-'))
  fs.writeFileSync(path.join(dir, 'd.mjs'), `import { verify } from ${JSON.stringify(LIB)}\nawait verify('x', async ({ step, shot }) => {\n${body}\n})\n`)
  const r = spawnSync('node', [path.join(dir, 'd.mjs')], { env: { ...process.env, RIG_VERIFY_STATE: path.join(dir, 'state') }, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return { steps: JSON.parse(fs.readFileSync(path.join(dir, 'state', 'evidence.json'), 'utf8')).steps, dir }
}

test('a step that returns a value records it as observed; one that returns nothing has no observed key', () => {
  const { steps } = run(`await step('total', async () => ({ total: 900 }))\nawait step('quiet', async () => {})`)
  assert.deepEqual(steps[0]!.observed, { total: 900 })
  assert.ok(!('observed' in steps[1]!))
})

test('an observed value over 2 KB is stored as truncated text', () => {
  const { steps } = run(`await step('big', async () => ({ s: 'a'.repeat(5000) }))`)
  assert.equal(typeof steps[0]!.observed, 'string')
  assert.match(String(steps[0]!.observed), /…\(truncated\)$/)
  assert.ok(String(steps[0]!.observed).length < 2100)
})

test('shot saves the file under shots/ and names it on the latest step', () => {
  const { steps, dir } = run(`await step('cart', async () => 1)\nawait shot('cart view', Buffer.from('x'))`)
  assert.equal(steps[0]!.shot, 'shots/cart-view.png')
  assert.equal(fs.readFileSync(path.join(dir, 'state', 'shots', 'cart-view.png'), 'utf8'), 'x')
})

test('a step that returns something that cannot be serialised still passes, with no observed value', () => {
  const { steps } = run(`await step('cyc', async () => { const o = {}; o.self = o; return o })\nawait step('big', async () => 10n)`)
  assert.deepEqual(steps.map(x => x.ok), [true, true])
  assert.ok(!('observed' in steps[0]!))
})
