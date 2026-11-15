// `npm run test:changed` must pick the unit test beside a changed eval/ or tests/e2e/ file, not only scripts/*.spec.ts: editing
// eval/score.mjs used to run typecheck, size and neutrality and nothing that exercises it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.join(import.meta.dirname, '..')

function plan(edit: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-changed-'))
  const git = (...a: string[]): string => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, encoding: 'utf8' })
  const put = (rel: string, text: string): void => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) }
  put('tests/changed.mjs', fs.readFileSync(path.join(ROOT, 'tests/changed.mjs'), 'utf8'))
  for (const f of ['eval/score.mjs', 'eval/score.test.mjs', 'eval/run.mjs', 'tests/e2e/lib/sandbox.mjs', 'tests/e2e/lib/sandbox.test.mjs', 'eval/lib/cli.mjs']) put(f, '// base\n')
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'base')
  for (const f of edit) fs.appendFileSync(path.join(dir, f), '// edit\n')
  try { return execFileSync('node', ['tests/changed.mjs', '--dry'], { cwd: dir, encoding: 'utf8' }) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test('a changed eval file picks eval/<name>.test.mjs, and a changed e2e lib file its sibling', () => {
  assert.match(plan(['eval/score.mjs']), /node --test eval\/score\.test\.mjs$/m)
  assert.match(plan(['tests/e2e/lib/sandbox.mjs']), /node --test tests\/e2e\/lib\/sandbox\.test\.mjs$/m)
})

test('a changed unit test runs itself; a file with no sibling test adds no node --test step', () => {
  assert.match(plan(['eval/score.test.mjs']), /node --test eval\/score\.test\.mjs$/m)
  assert.doesNotMatch(plan(['eval/lib/cli.mjs']), /node --test (eval|tests)/)
  assert.doesNotMatch(plan(['eval/run.mjs']), /run\.test\.mjs/)
})
