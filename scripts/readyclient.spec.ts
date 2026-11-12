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
const IDS = ['protection', 'codeowner-review', 'ci-secret', 'codeowners-rig', 'codeowners-claude', 'codeowners-workflows', 'codeowners-owner', 'managed', 'sandbox', 'managed-rules', 'every-tier', 'size-cap']
const input = (over: Partial<ClientInput> = {}): ClientInput => ({
  owners: tpl('CODEOWNERS').replaceAll('@your-org/platform', '@acme/platform'),
  ownersPath: 'CODEOWNERS',
  managedPath: '/etc/claude-code/managed-settings.json',
  managed: tpl('managed-settings.json'),
  protection: { branch: 'main', read: true, error: '', contexts: ['rig-check', 'ai-review'], codeOwners: true },
  secret: true,
  everyTier: true,
  hardCap: true,
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
  assert.deepEqual(failing(input({ protection: { branch: 'main', read: true, error: '', contexts: ['rig-check', 'ai-review'], codeOwners: false } })), ['codeowner-review'])
  assert.deepEqual(failing(input({ protection: { branch: 'main', read: true, error: '', contexts: ['rig-check'], codeOwners: true } })), ['protection'])
})

test('covers: directory prefix, exact file, star, the rig-*.yml glob, comments ignored', () => {
  assert.equal(covers('/.rig/ @a', '.rig/bin/'), true)
  assert.equal(covers('/.rig/sensors.json @a', '.rig/sensors.json'), true)
  assert.equal(covers('/.rig/sensors.json @a', '.rig/bin/'), false)
  assert.equal(covers('# /.claude/ @a', '.claude/'), false)
  assert.equal(covers('* @a', '.claude/'), true)
  assert.equal(covers('/.github/workflows/rig-*.yml @a', '.github/workflows/rig-check.yml'), true)
  assert.equal(covers('/.github/workflows/rig-*.yml @a', '.github/workflows/ci.yml'), false)
  assert.equal(covers('/.rig @a', '.rig/bin/sdlc.ts'), true, 'a directory without its trailing slash')
  assert.equal(covers('/.rig/** @a', '.rig/bin/sdlc.ts'), true)
  assert.equal(covers('sensors.json @a', '.rig/sensors.json'), true, 'an unanchored name matches at any depth')
})

test('covers: a rule with no owner owns nothing, and the last matching rule wins', () => {
  assert.equal(covers('/.rig/', '.rig/bin/sdlc.ts'), false)
  assert.equal(covers('* @acme/p\n/.claude/', '.claude/settings.json'), false)
  assert.equal(covers('/.claude/\n* @acme/p', '.claude/settings.json'), true)
  assert.deepEqual(failing(input({ owners: '/.rig/\n/.claude/\n/.github/workflows/\n/CLAUDE.md\n/CODEOWNERS' })), ['codeowners-rig', 'codeowners-claude', 'codeowners-workflows', 'codeowners-owner'])
})

test('CODEOWNERS must own itself and CLAUDE.md', () => {
  const owners = input().owners
  assert.deepEqual(failing(input({ owners: owners.split('\n').filter(l => !l.startsWith('/CODEOWNERS')).join('\n') })), ['codeowners-rig'])
  assert.deepEqual(failing(input({ owners: owners.split('\n').filter(l => !l.startsWith('/CLAUDE.md')).join('\n') })), ['codeowners-rig'])
  assert.deepEqual(failing(input({ owners: owners.split('\n').filter(l => !l.startsWith('/.github/CODEOWNERS')).join('\n'), ownersPath: '.github/CODEOWNERS' })), ['codeowners-rig'])
})

test('an unreadable protection fails protection and codeowner-review and names gh\'s error', () => {
  const i = input({ protection: { branch: 'main', read: false, error: 'gh: not logged in', contexts: [], codeOwners: false } })
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
  // SECURITY.md lets the platform drop rig's sdlc.ts allow rule; with managed-only rules that choice is the platform's.
  assert.deepEqual(failing(input({ managed: managedWith(m => { m.permissions.allow = m.permissions.allow.filter((r: string) => !r.includes('.rig/bin/sdlc.ts')) }) })), [])
})

test('no secret fails ci-secret', () => {
  assert.deepEqual(failing(input({ secret: false })), ['ci-secret'])
})

// A fake gh answering from files (no shell quoting of JSON). classic: the protection object, or an error line (exit 1). Calls are logged.
type Fake = { classic?: object | string; rules?: object[]; repo?: object; repoSecrets?: string; orgSecrets?: object | string }
function fakeGh(f: Fake = {}): { bin: string; calls: () => string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  const log = path.join(dir, 'calls')
  const answer = (name: string, v: object | string | undefined, fallback: string): string => {
    if (v === undefined) return fallback
    if (typeof v === 'string') return `echo '${v}' >&2; exit 1`
    fs.writeFileSync(path.join(dir, name), JSON.stringify(v))
    return `cat '${dir}/${name}'`
  }
  fs.writeFileSync(path.join(dir, 'secrets'), f.repoSecrets ?? 'CLAUDE_CODE_OAUTH_TOKEN\tUpdated 2026-11-12\n')
  const cases = [
    `"secret list"*) cat '${dir}/secrets' ;;`,
    `*organization-secrets*) ${answer('org.json', f.orgSecrets, `echo '{"total_count":0,"secrets":[]}'`)} ;;`,
    `*rules/branches/*) ${answer('rules.json', f.rules ?? [], '')} ;;`,
    `*/protection) ${answer('classic.json', f.classic ?? 'gh: Branch not protected (HTTP 404)', '')} ;;`,
    `*"default_branch"*) ${answer('repo.json', f.repo, `echo 'gh: no default branch' >&2; exit 1`)} ;;`,
  ]
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n${cases.map(c => `  ${c}`).join('\n')}\nesac\n`, { mode: 0o755 })
  return { bin: path.join(dir, 'gh'), calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') }
}
const CLASSIC = { required_status_checks: { contexts: ['rig-check', 'ai-review'] }, required_pull_request_reviews: { require_code_owner_reviews: true } }
const clientRepo = (): string => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'CODEOWNERS', tpl('CODEOWNERS').replaceAll('@your-org/platform', '@acme/platform'))
  write(repo, 'managed-settings.json', tpl('managed-settings.json'))
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], risk: { enforce: true, hardCap: true }, humanApproval: { everyTier: true } }))
  return repo
}
const client = (repo: string, gh: string, ...extra: string[]) => sdlc(repo, ['readiness', '--client', '--managed', path.join(repo, 'managed-settings.json'), ...extra], { env: { RIG_GH: gh } })
const posix = process.platform !== 'win32'

test('readiness --client passes with classic protection, owners, managed settings and the secret', { skip: !posix }, () => {
  const r = client(clientRepo(), fakeGh({ classic: CLASSIC }).bin)
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /client readiness: 12\/12/)
})

test('rulesets alone count', { skip: !posix }, () => {
  const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'rig-check' }, { context: 'ai-review' }] } }, { type: 'pull_request', parameters: { require_code_owner_review: true } }]
  const r = client(clientRepo(), fakeGh({ rules }).bin)
  assert.equal(r.code, 0, r.stdout + r.stderr)
})

test('a failing control exits 1 and lists the fix', { skip: !posix }, () => {
  const repo = clientRepo()
  const gh = fakeGh({ classic: CLASSIC }).bin
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
  const gh = fakeGh({ classic: CLASSIC })
  const r = sdlc(clientRepo(), ['readiness', '--json'], { env: { RIG_GH: gh.bin } })
  assert.equal(r.code, 0)
  assert.equal(gh.calls(), '')
})

const crit = (r: { stdout: string }, id: string) => (JSON.parse(r.stdout) as { criteria: { id: string; ok: boolean; what: string; fix: string }[] }).criteria.find(c => c.id === id)

test('a classic error that is not "not protected" is reported as unreadable, not as unprotected', { skip: !posix }, () => {
  const r = client(clientRepo(), fakeGh({ classic: 'gh: Resource not accessible by integration (HTTP 403)' }).bin, '--json')
  assert.match(crit(r, 'protection')?.fix ?? '', /HTTP 403/)
})

test('mixed classic and rulesets: the checks are unioned, and the classic checks array counts', { skip: !posix }, () => {
  const classic = { required_status_checks: { checks: [{ context: 'rig-check' }] }, required_pull_request_reviews: { require_code_owner_reviews: false } }
  const rules = [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ai-review' }] } }, { type: 'pull_request', parameters: { require_code_owner_review: true } }]
  const r = client(clientRepo(), fakeGh({ classic, rules }).bin)
  assert.equal(r.code, 0, r.stdout)
})

test('the default branch comes from GitHub and is named', { skip: !posix }, () => {
  const gh = fakeGh({ classic: CLASSIC, repo: { default_branch: 'develop' } })
  const r = client(clientRepo(), gh.bin, '--json')
  assert.match(gh.calls(), /branches\/develop\/protection/)
  assert.match(crit(r, 'protection')?.what ?? '', /develop/)
})

test('an organisation secret visible to the repo counts; a gh error is shown', { skip: !posix }, () => {
  const ok = client(clientRepo(), fakeGh({ classic: CLASSIC, repoSecrets: '', orgSecrets: { total_count: 1, secrets: [{ name: 'ANTHROPIC_API_KEY' }] } }).bin)
  assert.equal(ok.code, 0, ok.stdout)
  const none = client(clientRepo(), fakeGh({ classic: CLASSIC, repoSecrets: '', orgSecrets: 'gh: HTTP 403' }).bin, '--json')
  assert.match(crit(none, 'ci-secret')?.fix ?? '', /environment secret/)
})

test('GitHub reads the first CODEOWNERS: .github/ before the root, docs/ last', { skip: !posix }, () => {
  const stale = clientRepo()
  write(stale, '.github/CODEOWNERS', '* @acme/p\n')
  assert.equal(crit(client(stale, fakeGh({ classic: CLASSIC }).bin, '--json'), 'codeowners-claude')?.ok, true)
  assert.equal(crit(client(stale, fakeGh({ classic: CLASSIC }).bin, '--json'), 'codeowners-rig')?.ok, true, '* also owns .github/CODEOWNERS')
  write(stale, '.github/CODEOWNERS', '/README.md @acme/p\n')
  assert.equal(crit(client(stale, fakeGh({ classic: CLASSIC }).bin, '--json'), 'codeowners-claude')?.ok, false, 'the root file is ignored once .github/ has one')
  const docs = clientRepo()
  fs.mkdirSync(path.join(docs, 'docs'))
  fs.renameSync(path.join(docs, 'CODEOWNERS'), path.join(docs, 'docs/CODEOWNERS'))
  const d = client(docs, fakeGh({ classic: CLASSIC }).bin, '--json')
  assert.equal(crit(d, 'codeowners-claude')?.ok, true)
})

test('every-tier and size-cap read the base registry and name the exact keys to set', () => {
  assert.deepEqual(failing(input({ everyTier: false })), ['every-tier'])
  assert.deepEqual(failing(input({ hardCap: false })), ['size-cap'])
  assert.match(fixOf(input({ everyTier: false }), 'every-tier'), /risk\.enforce[\s\S]*humanApproval\.everyTier/)
  assert.match(fixOf(input({ hardCap: false }), 'size-cap'), /risk\.hardCap/)
})

test('readiness --client reads every-tier and size-cap from the repo registry', { skip: !posix }, () => {
  const repo = clientRepo()
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], risk: { enforce: true }, humanApproval: { everyTier: true } }))
  const r = client(repo, fakeGh({ classic: CLASSIC }).bin, '--json')
  assert.equal(crit(r, 'every-tier')?.ok, true)
  assert.equal(crit(r, 'size-cap')?.ok, false)
})
