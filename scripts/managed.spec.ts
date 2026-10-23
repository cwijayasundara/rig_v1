// Managed settings: the reader, rig's hooks under allowManagedHooksOnly, the template, the production gate, preflight and metrics.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write } from './testkit.ts'
import { managedSettings, managedFiles } from './core.ts'

const ROOT = path.join(import.meta.dirname, '..')
const tmpDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'rig-managed-'))

test('managed settings: the main file and its drop-ins merge in name order; arrays concatenate; bad files are skipped', () => {
  const dir = tmpDir()
  assert.deepEqual(managedSettings(dir), {})
  fs.writeFileSync(path.join(dir, 'managed-settings.json'), JSON.stringify({ permissions: { deny: ['Read(.env*)'] }, sandbox: { enabled: false } }))
  fs.mkdirSync(path.join(dir, 'managed-settings.d'))
  fs.writeFileSync(path.join(dir, 'managed-settings.d', '20-b.json'), JSON.stringify({ sandbox: { enabled: true } }))
  fs.writeFileSync(path.join(dir, 'managed-settings.d', '10-a.json'), JSON.stringify({ permissions: { deny: ['WebFetch'] }, allowManagedHooksOnly: true }))
  fs.writeFileSync(path.join(dir, 'managed-settings.d', '30-bad.json'), '{ not json')
  assert.deepEqual(managedSettings(dir), { permissions: { deny: ['Read(.env*)', 'WebFetch'] }, sandbox: { enabled: true }, allowManagedHooksOnly: true })
  assert.equal(managedFiles(dir).length, 3, 'the unparsable drop-in is not counted')
})

test('under allowManagedHooksOnly the plugin hooks run in a standalone repo, whose own project hooks Claude Code blocks', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['vendor', '--standalone'])
  write(repo, 'src/key.js', 'const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const edit = (env: Record<string, string>) => sdlc(repo, ['hook', 'post-edit'], { input: JSON.stringify({ tool_input: { file_path: path.join(repo, 'src/key.js') } }), env })
  const none = tmpDir()
  assert.equal(edit({ RIG_MANAGED_DIR: none }).code, 0, 'no managed settings: the project copy decides, the plugin steps aside')
  const managed = tmpDir()
  fs.writeFileSync(path.join(managed, 'managed-settings.json'), JSON.stringify({ allowManagedHooksOnly: true }))
  assert.equal(edit({ RIG_MANAGED_DIR: managed }).code, 2, 'project hooks are blocked, so the plugin copy runs')
})

const tpl = (name: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'templates', name), 'utf8'))
// A project rule as it must appear in a managed file: a leading "/" anchors at the settings file's own folder, so "./" is used.
const asManaged = (rule: string): string => rule.replace(/^(\w+)\(\/(?!\/)/, '$1(./')

test('the managed template carries every rig rule in ./ form, since allowManagedPermissionRulesOnly drops the project ones', () => {
  const project = tpl('settings.json').permissions
  const managed = tpl('managed-settings.json').permissions
  for (const kind of ['allow', 'ask', 'deny'] as const) {
    const missing = project[kind].map(asManaged).filter((r: string) => !managed[kind].includes(r))
    assert.deepEqual(missing, [], `managed ${kind} is missing project rules`)
  }
  const anchored = [...managed.allow, ...managed.ask, ...managed.deny].filter((r: string) => /^\w+\(\/(?!\/)/.test(r))
  assert.deepEqual(anchored, [], 'no managed rule may start with a single "/"')
})

test('the managed template is the p.42 worked example with rig force-enabled and the production gate wired', () => {
  const m = tpl('managed-settings.json')
  assert.equal(m.permissions.disableBypassPermissionsMode, 'disable')
  for (const r of ['Read(.env*)', 'Read(./secrets/**)', 'WebFetch', 'Bash(curl *)', 'Bash(wget *)', 'Edit(./.rig/gates.jsonl)', 'Edit(./.rig/autonomy.json)']) assert.ok(m.permissions.deny.includes(r), r)
  for (const k of ['allowManagedPermissionRulesOnly', 'allowManagedHooksOnly', 'disableSideloadFlags', 'allowManagedMcpServersOnly']) assert.equal(m[k], true, k)
  assert.deepEqual([m.sandbox.enabled, m.sandbox.failIfUnavailable, m.sandbox.allowUnsandboxedCommands], [true, true, false])
  assert.ok(m.sandbox.network.allowedDomains.includes('api.github.com'), 'gh, used by /rig:pr, needs GitHub')
  assert.ok(Array.isArray(m.strictKnownMarketplaces) && m.strictKnownMarketplaces.every((s: { source?: string }) => typeof s.source === 'string'))
  assert.equal(m.enabledPlugins['rig@rig'], true, 'force-enabled, so its hooks survive allowManagedHooksOnly')
  assert.ok(m.extraKnownMarketplaces.rig, 'the rig marketplace is registered so the forced plugin can install')
  const gate = m.hooks.PreToolUse.find((g: { matcher?: string }) => g.matcher === 'Bash')
  assert.match(gate.hooks[0].command, /^\/etc\/claude-code\/gates\/production-gate\.sh$/, 'an admin-owned path, never the repo')
  assert.equal(m.env.RIG_PRODUCTION_ENV, 'production')
  const [maj = 0, min = 0, patch = 0] = String(m.requiredMinimumVersion).split('.').map(Number)
  assert.ok(maj > 2 || (maj === 2 && (min > 1 || (min === 1 && patch >= 251))), 'rig needs 2.1.251 or later')
  assert.match(m.$comment, /tailor/i)
})

test('the project template denies the gate log and asks before edits to protected paths', () => {
  const p = tpl('settings.json').permissions
  assert.ok(p.deny.includes('Edit(/.rig/gates.jsonl)'))
  for (const r of ['Edit(/migrations/**)', 'Edit(/infra/**)']) assert.ok(p.ask.includes(r), r)
})

const GATE = path.join(ROOT, 'templates', 'production-gate.sh')
const gate = (command: string, env: Record<string, string>, extra: Record<string, unknown> = {}) =>
  spawnSync('/bin/sh', [GATE], { input: JSON.stringify({ session_id: 'sess-1', tool_name: 'Bash', tool_input: { command }, ...extra }), encoding: 'utf8', env: { PATH: process.env.PATH ?? '', ...env } })
const posix = { skip: process.platform === 'win32' ? 'POSIX sh only' : false }

test('the gate blocks a production deploy without approval, explains the route, and allows it with approval', posix, () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, '.rig'), { recursive: true })
  const blocked = gate('./scripts/deploy.sh --env production', { CLAUDE_PROJECT_DIR: repo })
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /production[\s\S]*release manager[\s\S]*RELEASE_APPROVAL/i)
  assert.equal(gate('./scripts/deploy.sh --env production', { CLAUDE_PROJECT_DIR: repo, RELEASE_APPROVAL: 'CHG-1234' }).status, 0)
  assert.equal(gate('./scripts/deploy.sh --env staging', { CLAUDE_PROJECT_DIR: repo }).status, 0)
  assert.equal(gate('cat production.md', { CLAUDE_PROJECT_DIR: repo }).status, 0, 'deploy and the environment must both appear')
  const rows = fs.readFileSync(path.join(repo, '.rig', 'gates.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.deepEqual(rows.map(r => [r.decision, r.session]), [['block', 'sess-1'], ['allow', 'sess-1']], 'only matching commands are logged')
  assert.match(rows[0].at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/)
  assert.doesNotMatch(fs.readFileSync(path.join(repo, '.rig', 'gates.jsonl'), 'utf8'), /deploy|scripts/, 'command text is never logged')
})

test('the gate also pauses a force-push and dropping data, and leaves ordinary work alone', posix, () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, '.rig'), { recursive: true })
  const env = { CLAUDE_PROJECT_DIR: repo }
  for (const cmd of ['git push --force origin main', 'git push -f', 'git push origin main --force-with-lease', 'git -C sub push -f origin x', 'git push -uf origin x', 'psql -c "DROP TABLE users"', 'mysql -e "drop database shop"', 'echo "TRUNCATE TABLE t" | psql', 'git push origin +main', 'git push origin +refs/heads/main:main', 'git push --mirror backup', 'git push --delete origin old', 'git push -fu origin x']) {
    const r = gate(cmd, env)
    assert.equal(r.status, 2, cmd)
    assert.match(r.stderr, /release manager[\s\S]*RELEASE_APPROVAL/i, cmd)
  }
  assert.match(gate('git push --force origin main', env).stderr, /force-pushing, which rewrites history/)
  assert.match(gate('psql -c "DROP TABLE users"', env).stderr, /dropping data, which cannot be undone/)
  // The hook input is JSON: a real newline, tab or quote in the command arrives as \n, \t or \", and must not hide the act.
  for (const real of ['psql -c "DROP\nTABLE x"', 'git push\n--force origin x', 'git push origin x "y" --force', 'psql -c "TRUNCATE\ttable x"']) assert.equal(gate(real, env).status, 2, JSON.stringify(real))
  for (const cmd of ['git push origin sdlc/add-cart', 'git push -u origin feature', 'git push --follow-tags', 'git commit -m "docs: about force pushes"', 'git status', 'psql -c "SELECT 1"', 'npm test', 'grep -r "drop table" migrations/', 'cat migrations/001_drop_table_old.sql', 'git push -o ci.skip origin x', 'git push --set-upstream origin x', 'git push --no-verify origin x']) assert.equal(gate(cmd, env).status, 0, cmd)
  assert.equal(gate('git push --force origin main', { ...env, RELEASE_APPROVAL: 'CHG-9' }).status, 0, 'an approval lets it through')
  const rows = fs.readFileSync(path.join(repo, '.rig', 'gates.jsonl'), 'utf8')
  assert.doesNotMatch(rows, /force|DROP|psql/i, 'command text is never logged')
})

test('the gate never fails open: no jq, no env name, no .rig, a symlinked log, a hostile session id', posix, () => {
  const repo = makeRepo()
  assert.equal(gate('deploy production', { CLAUDE_PROJECT_DIR: repo, PATH: '/usr/bin:/bin' }).status, 2, 'needs no jq or node')
  assert.equal(gate('deploy production', { CLAUDE_PROJECT_DIR: repo, RIG_PRODUCTION_ENV: '' }).status, 2, 'empty env name means production')
  assert.equal(gate('DEPLOY to PROD-EU', { CLAUDE_PROJECT_DIR: repo, RIG_PRODUCTION_ENV: 'prod-eu' }).status, 2, 'case-insensitive, env name from the variable')
  assert.ok(!fs.existsSync(path.join(repo, '.rig')), 'no .rig: still gated, nothing created')
  fs.mkdirSync(path.join(repo, '.rig'))
  const target = path.join(repo, 'elsewhere.txt')
  fs.symlinkSync(target, path.join(repo, '.rig', 'gates.jsonl'))
  assert.equal(gate('deploy production', { CLAUDE_PROJECT_DIR: repo }).status, 2, 'a symlinked log never changes the decision')
  assert.ok(!fs.existsSync(target), 'and is never followed')
  fs.unlinkSync(path.join(repo, '.rig', 'gates.jsonl'))
  gate('deploy production', { CLAUDE_PROJECT_DIR: repo }, { session_id: 'x","decision":"allow' })
  const row = JSON.parse(fs.readFileSync(path.join(repo, '.rig', 'gates.jsonl'), 'utf8').trim())
  assert.deepEqual([row.decision, row.session], ['block', ''], 'a session id outside the UUID charset is dropped')
  assert.equal(gate('deploy \\"production\\"', { CLAUDE_PROJECT_DIR: repo }).status, 2, 'escaped quotes in the command still match')
})

test('SECURITY.md documents the managed rollout, the gate install path and its limits', () => {
  const sec = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8')
  assert.match(sec, /templates\/managed-settings\.json/)
  assert.match(sec, /production-gate\.sh[^\n]*root-owned/)
  assert.match(sec, /`\.\/path`[^\n]*settings file's (own )?folder/)
  assert.match(sec, /force-enable[^\n]*rig@/)
  assert.match(sec, /text match/i)
  assert.match(sec, /RELEASE_APPROVAL[^\n]*placeholder/)
  assert.match(sec, /sdlc\.ts run --[^\n]*managed deny/, 'the sdlc.ts allow rule widens past the managed denies')
  assert.match(sec, /github\.com[^\n]*egress/, 'the GitHub domains are an egress route')
})

// Final-review fixes.
test('the RIG_MANAGED_HOOKS_ONLY marker keeps the plugin hooks on when managed settings come from the server (not visible locally)', () => {
  assert.equal(tpl('managed-settings.json').env.RIG_MANAGED_HOOKS_ONLY, '1')
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['vendor', '--standalone'])
  write(repo, 'src/key.js', 'const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const r = sdlc(repo, ['hook', 'post-edit'], { input: JSON.stringify({ tool_input: { file_path: path.join(repo, 'src/key.js') } }), env: { RIG_MANAGED_DIR: tmpDir(), RIG_MANAGED_HOOKS_ONLY: '1' } })
  assert.equal(r.code, 2)
})

test('an unreadable managed-settings.d never crashes the hooks', () => {
  const dir = tmpDir()
  fs.writeFileSync(path.join(dir, 'managed-settings.d'), 'not a folder')
  assert.deepEqual(managedSettings(dir), {})
})

test('the gate reads every command key, needs only sh/sed/grep/date/cat, hides log errors and routes approval to the same session', posix, () => {
  const repo = makeRepo()
  const raw = (input: string, env: Record<string, string> = {}) => spawnSync('/bin/sh', [GATE], { input, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', CLAUDE_PROJECT_DIR: repo, ...env } })
  assert.equal(raw('{"tool_input":{"command":"./deploy.sh production"},"command":"ls"}').status, 2, 'a later command key cannot hide the real one')
  const bin = tmpDir()
  for (const t of ['sed', 'grep', 'date', 'cat']) fs.symlinkSync(spawnSync('/bin/sh', ['-c', `command -v ${t}`], { encoding: 'utf8' }).stdout.trim(), path.join(bin, t))
  assert.equal(gate('deploy production', { CLAUDE_PROJECT_DIR: repo, PATH: bin }).status, 2, 'no jq, no node on PATH')
  fs.mkdirSync(path.join(repo, '.rig'))
  fs.writeFileSync(path.join(repo, '.rig', 'gates.jsonl'), '')
  fs.chmodSync(path.join(repo, '.rig', 'gates.jsonl'), 0o444)
  const r = gate('deploy production', { CLAUDE_PROJECT_DIR: repo })
  assert.equal(r.status, 2, 'an unwritable log never changes the decision')
  assert.doesNotMatch(r.stderr, /denied|gates\.jsonl/i, 'and its error never reaches Claude')
  assert.match(r.stderr, /claude --resume/, 'approval resumes the same session, so the wait can be measured')
})

test('SECURITY.md: settings env can switch the gate off; the sandbox, not the deny list, bounds the network', () => {
  const sec = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8')
  assert.match(sec, /RELEASE_APPROVAL[^\n]*\.claude\/settings\.json[^\n]*env/)
  assert.match(sec, /sandbox[^\n]*not the deny list/i)
  assert.match(sec, /RIG_MANAGED_HOOKS_ONLY/)
})
