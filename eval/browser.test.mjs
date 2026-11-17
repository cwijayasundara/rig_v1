import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { browserAvailable, withPage } from './lib/browser.mjs'

test('browserAvailable returns the reason when the cache is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-browser-'))
  const prev = process.env.RIG_EVAL_BROWSER_CACHE
  process.env.RIG_EVAL_BROWSER_CACHE = dir
  try {
    const r = browserAvailable()
    assert.equal(typeof r, 'string')
    assert.match(r, /setup-browser/)
  } finally {
    if (prev === undefined) delete process.env.RIG_EVAL_BROWSER_CACHE
    else process.env.RIG_EVAL_BROWSER_CACHE = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const avail = browserAvailable()
test('withPage opens a data: page and reads its title', { skip: avail === true ? false : avail }, async () => {
  const title = await withPage(async page => {
    await page.goto('data:text/html,<title>hello</title><p>x</p>')
    return page.title()
  })
  assert.equal(title, 'hello')
})
