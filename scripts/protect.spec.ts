// `init --protect`: rig-check and ai-review become required checks on the trunk, added to existing branch protection and never replacing it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

// A fake gh: `checks` is what the protection lookup answers (null: 404, no protection); every call is logged.
function fakeGh(checks: string[] | null, secrets = 'CLAUDE_CODE_OAUTH_TOKEN\tUpdated 2026-10-27\n'): { bin: string; calls: () => string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  const log = path.join(dir, 'calls')
  const answer = checks === null ? `echo 'gh: Not Found (HTTP 404)' >&2; exit 1` : `echo '${JSON.stringify({ contexts: checks })}'`
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n  "secret list"*) printf '${secrets}' ;;\n  *"-X POST"*) echo '[]' ;;\n  *required_status_checks*) ${answer} ;;\nesac\n`, { mode: 0o755 })
  return { bin: path.join(dir, 'gh'), calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) }
}
const posix = process.platform !== 'win32'
const run = (repo: string, gh: string, ...extra: string[]) => sdlc(repo, ['init', '--protect', ...extra], { env: { RIG_GH: gh } })

test('with branch protection on the trunk, both checks are added in one call', { skip: !posix }, () => {
  const repo = makeRepo(), gh = fakeGh(['build'])
  const r = run(repo, gh.bin)
  assert.match(r.stdout, /required checks on main: rig-check, ai-review \(added\)/)
  assert.equal(gh.calls().filter(c => c.includes('-X POST')).length, 1)
  assert.match(gh.calls().find(c => c.includes('-X POST')) ?? '', /branches\/main\/protection\/required_status_checks\/contexts.*contexts\[\]=rig-check.*contexts\[\]=ai-review/)
})

test('checks already required are left alone', { skip: !posix }, () => {
  const repo = makeRepo(), gh = fakeGh(['rig-check', 'ai-review'])
  assert.match(run(repo, gh.bin).stdout, /required checks on main: rig-check, ai-review \(already required\)/)
  assert.equal(gh.calls().filter(c => c.includes('-X POST')).length, 0)
})

test('no branch protection: nothing is written, the command to create it is printed', { skip: !posix }, () => {
  const repo = makeRepo(), gh = fakeGh(null)
  const r = run(repo, gh.bin)
  assert.match(r.stdout, /main has no branch protection[\s\S]*gh api -X PUT repos\/\{owner\}\/\{repo\}\/branches\/main\/protection/)
  assert.equal(gh.calls().filter(c => c.includes('-X')).length, 0)
})

test('--dry never writes, and a missing Claude secret is named with the command to set it', { skip: !posix }, () => {
  const repo = makeRepo(), gh = fakeGh(['build'], 'OTHER\tx\n')
  const r = run(repo, gh.bin, '--dry')
  assert.equal(gh.calls().filter(c => c.includes('-X')).length, 0)
  assert.match(r.stdout, /would add required checks on main: rig-check, ai-review/)
  assert.match(r.stdout, /gh secret set CLAUDE_CODE_OAUTH_TOKEN/)
})

test('without gh the commands are printed and nothing fails', { skip: !posix }, () => {
  const repo = makeRepo()
  const r = run(repo, '/nonexistent/gh')
  assert.equal(r.code, 0)
  assert.match(r.stdout, /gh api -X POST repos\/\{owner\}\/\{repo\}\/branches\/main\/protection\/required_status_checks\/contexts/)
})

test('init --enforce turns risk.enforce on and keeps every other key of sensors.json', () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, '.rig'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.rig/sensors.json'), JSON.stringify({ stack: 'node', sensors: [], risk: { maxLines: 200 } }))
  assert.equal(sdlc(repo, ['init', '--enforce']).code, 0)
  const j = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')) as { stack: string; risk: { enforce: boolean; maxLines: number } }
  assert.deepEqual([j.stack, j.risk.enforce, j.risk.maxLines], ['node', true, 200])
})
