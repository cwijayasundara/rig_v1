import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from './sandbox.mjs'

test('the sandbox TMPDIR is inside the repo and never shows in git status', () => {
  const sb = createSandbox({ name: 't', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-sb-')) })
  assert.ok(sb.env.TMPDIR.startsWith(sb.dir + path.sep), sb.env.TMPDIR)
  fs.writeFileSync(path.join(sb.env.TMPDIR, 'scratch.txt'), 'x')
  assert.equal(sb.git('status', '--porcelain'), '')
})
