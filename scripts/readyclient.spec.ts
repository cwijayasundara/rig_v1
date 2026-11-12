// `readiness --client` (readiness doc R4): the platform controls that make rig's gates binding, all of which must pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { clientCriteria, covers, type ClientInput } from './readyclient.ts'
import { makeRepo, sdlc, write } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const tpl = (f: string): string => fs.readFileSync(path.join(ROOT, 'templates', f), 'utf8')
const IDS = ['protection', 'codeowner-review', 'ci-secret', 'codeowners-rig', 'codeowners-claude', 'codeowners-workflows', 'codeowners-owner', 'managed', 'sandbox', 'managed-rules']
const input = (over: Partial<ClientInput> = {}): ClientInput => ({
  owners: tpl('CODEOWNERS').replaceAll('@your-org/platform', '@acme/platform'),
  managedPath: '/etc/claude-code/managed-settings.json',
  managed: tpl('managed-settings.json'),
  protection: { read: true, error: '', contexts: ['rig-check', 'ai-review'], codeOwners: true },
  secret: true,
  ...over,
})
const failing = (i: ClientInput): string[] => clientCriteria(i).filter(c => !c.ok).map(c => c.id)
const fixOf = (i: ClientInput, id: string): string => clientCriteria(i).find(c => c.id === id)?.fix ?? ''
const managedWith = (f: (m: Record<string, any>) => void): string => { const m = JSON.parse(tpl('managed-settings.json')); f(m); return JSON.stringify(m) }

test('a repo with every control passes every client criterion', () => {
  const list = clientCriteria(input())
  assert.deepEqual(list.map(c => c.id), IDS)
  assert.deepEqual(failing(input()), [])
})

test('the template CODEOWNERS unchanged fails only codeowners-owner', () => {
  assert.deepEqual(failing(input({ owners: tpl('CODEOWNERS') })), ['codeowners-owner'])
  assert.deepEqual(failing(input({ owners: '' })), ['codeowners-rig', 'codeowners-claude', 'codeowners-workflows', 'codeowners-owner'])
})

test('CODEOWNERS without code-owner review fails codeowner-review', () => {
  assert.deepEqual(failing(input({ protection: { read: true, error: '', contexts: ['rig-check', 'ai-review'], codeOwners: false } })), ['codeowner-review'])
  assert.deepEqual(failing(input({ protection: { read: true, error: '', contexts: ['rig-check'], codeOwners: true } })), ['protection'])
})

test('covers: directory prefix, exact file, star, the rig-*.yml glob, comments ignored', () => {
  assert.equal(covers('/.rig/ @a', '.rig/bin/'), true)
  assert.equal(covers('/.rig/sensors.json @a', '.rig/sensors.json'), true)
  assert.equal(covers('/.rig/sensors.json @a', '.rig/bin/'), false)
  assert.equal(covers('# /.claude/ @a', '.claude/'), false)
  assert.equal(covers('* @a', '.claude/'), true)
  assert.equal(covers('/.github/workflows/rig-*.yml @a', '.github/workflows/rig-check.yml'), true)
  assert.equal(covers('/.github/workflows/rig-*.yml @a', '.github/workflows/ci.yml'), false)
})

test('an unreadable protection fails protection and codeowner-review and names gh\'s error', () => {
  const i = input({ protection: { read: false, error: 'gh: not logged in', contexts: [], codeOwners: false } })
  assert.deepEqual(failing(i), ['protection', 'codeowner-review'])
  assert.match(fixOf(i, 'protection'), /not logged in/)
  assert.match(fixOf(i, 'codeowner-review'), /not logged in/)
})

test('managed settings absent, not JSON, or sandboxed loosely fail and name the path', () => {
  const p = '/etc/claude-code/managed-settings.json'
  for (const managed of [null, '{']) {
    const i = input({ managed })
    assert.deepEqual(failing(i), ['managed', 'sandbox', 'managed-rules'])
    for (const id of ['managed', 'sandbox', 'managed-rules']) assert.ok(fixOf(i, id).includes(p), `${id}: ${fixOf(i, id)}`)
  }
  const loose = input({ managed: managedWith(m => { m.sandbox.allowUnsandboxedCommands = true }) })
  assert.deepEqual(failing(loose), ['sandbox'])
  assert.ok(fixOf(loose, 'sandbox').includes(p))
  assert.deepEqual(failing(input({ managed: managedWith(m => { delete m.sandbox }) })), ['sandbox'])
})

test('a managed file without allowManagedPermissionRulesOnly fails managed-rules', () => {
  assert.deepEqual(failing(input({ managed: managedWith(m => { delete m.allowManagedPermissionRulesOnly }) })), ['managed-rules'])
  assert.deepEqual(failing(input({ managed: managedWith(m => { m.permissions.allow = m.permissions.allow.filter((r: string) => !r.includes('.rig/bin/sdlc.ts')) }) })), ['managed-rules'])
})

test('no secret fails ci-secret', () => {
  assert.deepEqual(failing(input({ secret: false })), ['ci-secret'])
})

// A fake gh answering from files (no shell quoting of JSON): classic protection (null: 404), rulesets, the secret list. Calls are logged.
function fakeGh(classic: object | null, rulesets: object[] = []): { bin: string; calls: () => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  const log = path.join(dir, 'calls')
  if (classic) fs.writeFileSync(path.join(dir, 'classic.json'), JSON.stringify(classic))
  fs.writeFileSync(path.join(dir, 'rules.json'), JSON.stringify(rulesets))
  const classicAnswer = classic ? `cat '${dir}/classic.json'` : `echo 'gh: Branch not protected (HTTP 404)' >&2; exit 1`
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n  "secret list"*) printf 'CLAUDE_CODE_OAUTH_TOKEN\\tUpdated 2026-11-12\\n' ;;\n  *rules/branches/*) cat '${dir}/rules.json' ;;\n  */protection) ${classicAnswer} ;;\nesac\n`, { mode: 0o755 })
  return { bin: path.join(dir, 'gh'), calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') }
}
const CLASSIC = { required_status_checks: { contexts: ['rig-check', 'ai-review'] }, required_pull_request_reviews: { require_code_owner_reviews: true } }
const clientRepo = (): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'CODEOWNERS', tpl('CODEOWNERS').replaceAll('@your-org/platform', '@acme/platform'))
  write(repo, 'managed-settings.json', tpl('managed-settings.json'))
  return repo
}
const client = (repo: string, gh: string, ...extra: string[]) => sdlc(repo, ['readiness', '--client', '--managed', path.join(repo, 'managed-settings.json'), ...extra], { env: { RIG_GH: gh } })
const posix = process.platform !== 'win32'

test('readiness --client passes with classic protection, owners, managed settings and the secret', { skip: !posix }, () => {
  const r = client(clientRepo(), fakeGh(CLASSIC).bin)
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /client readiness: 10\/10/)
})

test('rulesets alone count', { skip: !posix }, () => {
  const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'rig-check' }, { context: 'ai-review' }] } }, { type: 'pull_request', parameters: { require_code_owner_review: true } }]
  const r = client(clientRepo(), fakeGh(null, rules).bin)
  assert.equal(r.code, 0, r.stdout + r.stderr)
})

test('a failing control exits 1 and lists the fix', { skip: !posix }, () => {
  const repo = clientRepo()
  const gh = fakeGh(CLASSIC).bin
  const missing = path.join(repo, 'missing-file')
  const r = sdlc(repo, ['readiness', '--client', '--managed', missing], { env: { RIG_GH: gh } })
  assert.equal(r.code, 1)
  assert.match(r.stdout, /managed: .*missing-file/)
  const j = sdlc(repo, ['readiness', '--client', '--managed', missing, '--json'], { env: { RIG_GH: gh } })
  const parsed = JSON.parse(j.stdout) as { ok: boolean; criteria: { id: string; ok: boolean }[] }
  assert.equal(parsed.ok, false)
  assert.deepEqual(parsed.criteria.filter(c => !c.ok).map(c => c.id), ['managed', 'sandbox', 'managed-rules'])
})

test('gh missing fails the protection criteria without throwing', () => {
  const r = client(clientRepo(), '/nonexistent/gh', '--json')
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.stderr, /\n\s+at /)
  const row = (JSON.parse(r.stdout) as { criteria: { id: string; ok: boolean; fix: string }[] }).criteria.find(c => c.id === 'protection')
  assert.equal(row?.ok, false)
  assert.match(row?.fix ?? '', /gh/)
})

test('plain readiness makes no gh call', { skip: !posix }, () => {
  const gh = fakeGh(CLASSIC)
  const r = sdlc(clientRepo(), ['readiness', '--json'], { env: { RIG_GH: gh.bin } })
  assert.equal(r.code, 0)
  assert.equal(gh.calls(), '')
})
