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

// The sandbox reads the environment when it is imported, so the outer session's variables are set in a child before the import.
test('the sandbox drops the runner\'s own Claude Code session env, so an inner claude never sees the outer session', () => {
  const code = "const { createSandbox } = await import(process.argv[1]); const sb = createSandbox({ name: 't', out: process.argv[2] }); console.log(JSON.stringify(Object.keys(sb.env).filter(k => k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_'))))"
  const r = process.getBuiltinModule('node:child_process').spawnSync('node', ['--input-type=module', '-e', code, path.join(import.meta.dirname, 'sandbox.mjs'), fs.mkdtempSync(path.join(os.tmpdir(), 'rig-sb-'))],
    { encoding: 'utf8', env: { ...process.env, CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'outer', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_CODE_OAUTH_TOKEN: 'kept' } })
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), ['CLAUDE_CODE_OAUTH_TOKEN'], r.stderr)
})
