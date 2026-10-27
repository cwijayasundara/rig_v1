// runs.ts: recorded evidence is committed with the change, so it must not carry the machine's own paths.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { portable } from './runs.ts'

test('portable swaps the repo root and the home directory for stable names', () => {
  const text = '/Users/pat/work/shop/src/a.py:3: error\n/Users/pat/.cache/x\nok /Users/pat/work/shop'
  assert.equal(portable(text, '/Users/pat/work/shop', '/Users/pat'), '<repo>/src/a.py:3: error\n~/.cache/x\nok <repo>')
  assert.equal(portable('/Users/pat/work/shop2/x', '/Users/pat/work/shop', '/Users/pat'), '~/work/shop2/x', 'a sibling directory is not the repo')
})
