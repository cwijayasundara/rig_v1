import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { scoreApp, summarize, renderMarkdown, BREAKS, PROMPT } from './app.mjs'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures/journeys')
function sandbox(driver) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-app-test-'))
  const sb = createSandbox({ name: 'a', out })
  for (const f of ['package.json', 'src', 'test']) fs.cpSync(path.join(FX, f), path.join(sb.dir, f), { recursive: true })
  sb.commitAll('chore: scaffold')
  assert.equal(sb.sdlc(['init']).status, 0)
  sb.sdlc(['app', 'init'])
  if (driver) {
    fs.cpSync(path.join(FX, 'journey'), path.join(sb.dir, '.rig/verify/shop'), { recursive: true })
    if (driver !== 'good') fs.writeFileSync(path.join(sb.dir, '.rig/verify/shop/journey.mjs'), driver)
  }
  return sb
}

test('a driver that asserts the journeys passes the good app, is approved, and fails on both seeded breaks; the first break leaves every unit test green', () => {
  const r = scoreApp(sandbox('good'))
  assert.deepEqual([r.wrote, r.runsGreen, r.approved], [true, true, true])
  assert.deepEqual(r.caught, { 'body-ignored': true, 'total-off-by-one': true })
  assert.deepEqual(r.unitGreenOnBreak, { 'body-ignored': true, 'total-off-by-one': false }, 'only the running app shows the first break')
})

test('a driver that launches the app and checks nothing is approved but catches neither break: the scorer tells them apart', () => {
  const vacuous = "import { verify } from '../lib.mjs'\nawait verify('shop', async ({ launch, step }) => { await launch('node src/server.js'); await step('it starts', async () => {}) })\n"
  const r = scoreApp(sandbox(vacuous))
  assert.deepEqual([r.runsGreen, r.approved], [true, true])
  assert.deepEqual(r.caught, { 'body-ignored': false, 'total-off-by-one': false })
})

test('a session that wrote nothing scores as not written, and the seeded breaks are restored afterwards', () => {
  const sb = sandbox(null)
  assert.deepEqual(scoreApp(sb), { wrote: false, runsGreen: false, approved: false, caught: {}, unitGreenOnBreak: {} })
  const good = sandbox('good')
  scoreApp(good)
  for (const b of Object.values(BREAKS)) assert.ok(good.read(b.file).includes(b.from) && !good.read(b.file).includes(b.to), `${b.file} restored`)
})

test('the prompt gives the person\'s three journeys and the run contract, and the table reads the rows', () => {
  assert.match(PROMPT, /^\/rig-app journeys-shop\./)
  assert.match(PROMPT, /GET \/products[\s\S]*POST \/cart[\s\S]*900 cents/)
  const rows = [{ wrote: true, runsGreen: true, approved: true, caught: { 'body-ignored': true, 'total-off-by-one': false }, usd: 0.5 }, { failed: true }]
  const s = summarize(rows)
  assert.deepEqual([s.runs, s.caughtBodyIgnored, s.caughtTotal], [1, 1, 0])
  assert.match(renderMarkdown(rows, { date: 'd', files: ['x'] }), /\| 1 \| 1\/1 \| 1\/1 \| 1\/1 \| 1\/1 \| 0\/1 \| \$0\.50 \|/)
})
