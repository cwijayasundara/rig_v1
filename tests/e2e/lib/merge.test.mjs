import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from './sandbox.mjs'
import { mergeToMain } from './merge.mjs'

test('after a merge origin/main points at the merged commit, as a merge on the server would leave it', () => {
  const sb = createSandbox({ name: 'm', out: fs.mkdtempSync(path.join(os.tmpdir(), 'merge-')) })
  sb.git('config', 'user.email', 'a@b.c'); sb.git('config', 'user.name', 'x')
  sb.write('a.txt', 'a'); sb.git('add', '-A'); sb.git('commit', '-qm', 'base'); sb.git('push', '-q', 'origin', 'main')
  sb.git('checkout', '-q', '-b', 'sdlc/x'); sb.write('b.txt', 'b'); sb.git('add', '-A'); sb.git('commit', '-qm', 'work')
  mergeToMain(sb, 'x')
  assert.equal(sb.git('rev-parse', 'origin/main'), sb.git('rev-parse', 'main'))
  assert.equal(sb.git('rev-parse', 'main'), sb.git('rev-parse', 'sdlc/x'))
})
