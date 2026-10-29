// runs.ts: recorded evidence is committed with the change, so it must not carry the machine's own paths.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { portable, runCommand } from './runs.ts'

test('portable swaps the repo root and the home directory for stable names', () => {
  const text = '/Users/pat/work/shop/src/a.py:3: error\n/Users/pat/.cache/x\nok /Users/pat/work/shop'
  assert.equal(portable(text, '/Users/pat/work/shop', '/Users/pat'), '<repo>/src/a.py:3: error\n~/.cache/x\nok <repo>')
  assert.equal(portable('/Users/pat/work/shop2/x', '/Users/pat/work/shop', '/Users/pat'), '~/work/shop2/x', 'a sibling directory is not the repo')
})

test('portable also covers a root with a trailing slash, a path ending a sentence, and forward slashes for a Windows root', () => {
  assert.equal(portable('/x/y/foo', '/x/y/', '/h'), '<repo>/foo')
  assert.equal(portable('wrote /x/y/out.txt. Then /x/y.', '/x/y', '/h'), 'wrote <repo>/out.txt. Then <repo>.')
  assert.equal(portable('C:/u/r/f and C:\\u\\r\\g', 'C:\\u\\r', '/h'), '<repo>/f and <repo>\\g')
  assert.equal(portable('/x/y-two/a /x/y.ts', '/x/y', '/h'), '/x/y-two/a /x/y.ts', 'a longer sibling name is not the repo')
})

// The command lands in the committed evidence and the PR body, so an inline token in it is masked like the output.
test('a recorded command is masked like its output', () => {
  const key = 'AKIA' + 'IOSFODNN7EXAMPLE'
  const row = runCommand(`echo ${key}`) // runs in sh and in cmd.exe alike
  assert.equal(row.cmd, '[masked by sdlc]')
  assert.equal(row.exit, 0)
})
