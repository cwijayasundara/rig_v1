// `readiness --client` (readiness doc R4): the platform controls that make rig's gates binding, all of which must pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { clientCriteria, covers, type ClientInput } from './readyclient.ts'

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
