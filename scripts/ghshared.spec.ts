// One gh path for the revert-label search (check.ts for CI, learn.ts for `learn reverts`) and one copy each of the user and shell-quote helpers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { revertLabelledPrs, isHuman, shQuote } from './model.ts'
import { parseJsonl } from './core.ts'

const posix = process.platform !== 'win32'

test('revertLabelledPrs asks gh for merged revert-labelled PRs of the given repo, or of the checkout, and returns their numbers', { skip: !posix }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  const log = path.join(dir, 'calls')
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${log}'\necho '[{"items":[{"number":7},{"number":9}]},{"items":[{"number":12}]}]'\n`, { mode: 0o755 })
  const old = process.env.RIG_GH
  process.env.RIG_GH = path.join(dir, 'gh')
  try {
    assert.deepEqual(revertLabelledPrs('acme/shop'), [7, 9, 12])
    assert.deepEqual(revertLabelledPrs(undefined, dir), [7, 9, 12])
  } finally { if (old === undefined) delete process.env.RIG_GH; else process.env.RIG_GH = old }
  const [named, placeholder] = fs.readFileSync(log, 'utf8').trim().split('\n')
  assert.match(named!, /^api --paginate --slurp search\/issues\?q=repo:acme\/shop\+is:pr\+is:merged\+label:revert/)
  assert.match(placeholder!, /repo:\{owner\}\/\{repo\}\+is:pr/)
})

test('revertLabelledPrs throws when gh fails, so each caller decides what a failure means', { skip: !posix }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  fs.writeFileSync(path.join(dir, 'gh'), '#!/bin/sh\necho "gh: not logged in" >&2\nexit 1\n', { mode: 0o755 })
  const old = process.env.RIG_GH
  process.env.RIG_GH = path.join(dir, 'gh')
  try { assert.throws(() => revertLabelledPrs('acme/shop')) } finally { if (old === undefined) delete process.env.RIG_GH; else process.env.RIG_GH = old }
})

test('isHuman accepts a person and rejects a Bot account, a [bot] login and a missing user', () => {
  assert.equal(isHuman({ login: 'ada', type: 'User' }), true)
  assert.equal(isHuman({ login: 'dependabot[bot]' }), false)
  assert.equal(isHuman({ login: 'ci', type: 'Bot' }), false)
  assert.equal(isHuman(null), false)
  assert.equal(isHuman({}), false)
})

test('shQuote makes one shell word of any text, embedded quotes included', { skip: !posix }, () => {
  for (const s of ["plain", "it's", "a b; echo pwned", "$HOME `id`"]) {
    const r = spawnSync('sh', ['-c', `printf %s ${shQuote(s)}`], { encoding: 'utf8' })
    assert.equal(r.stdout, s)
  }
})

test('parseJsonl keeps each valid row in order and skips a blank, torn or non-JSON row', () => {
  assert.deepEqual(parseJsonl<{ n: number }>('{"n":1}\n\nnot json\n{"n":2}\n{"n":'), [{ n: 1 }, { n: 2 }])
})
