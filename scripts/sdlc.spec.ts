// Tests for scripts/sdlc.ts. Run with: npm test (node --test scripts/*.spec.ts)
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'

const SCRIPT = path.resolve(import.meta.dirname, 'sdlc.ts')
let repo: string

function run(args: string[], { input, env = {} }: { input?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], { cwd: repo, input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, SDLC_HUMAN: '', ...env } })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

const hook = (name: string, payload: unknown) => run(['hook', name], { input: JSON.stringify(payload) })
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), text)
}
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' })


beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-test-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 'Tester')
  write('README.md', 'hi\n')
  git('add', '.')
  git('commit', '-qm', 'init')
})

test('new creates intent and makes the change active; status prints next command', () => {
  assert.equal(run(['new', 'add-login', '--type', 'feature', '--tier', 'M']).code, 0)
  assert.ok(fs.existsSync(path.join(repo, '.rig/changes/add-login/intent.md')))
  const status = run(['status']).stdout
  assert.match(status, /▶ add-login/)
  assert.match(status, /next: \/rig:start add-login/)
})

test('new writes .rig/.gitignore even when .rig already exists', () => {
  fs.mkdirSync(path.join(repo, '.rig'))
  run(['new', 'x-change', '--type', 'chore', '--tier', 'S'])
  assert.equal(fs.readFileSync(path.join(repo, '.rig/.gitignore'), 'utf8'), 'state/\n.baseline\n.gate\nunresolved.json\ngates.jsonl\nspend-cache.json\nspend-fetched\nbudget-seen.json\n.onboarding\nchanges/*/prototype/\n')
})

test('hooks are silent in repos that never opted in', () => {
  assert.equal(hook('session-start', {}).stdout, '')
  assert.equal(hook('post-edit', { tool_input: { file_path: path.join(repo, 'src/x.js') } }).stdout, '')
  assert.equal(hook('stop', {}).stdout, '')
})

test('post-edit blocks secrets with exit 2', () => {
  run(['new', 'add-login', '--type', 'feature', '--tier', 'S'])
  write('src/config.js', 'const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const secret = hook('post-edit', { tool_input: { file_path: path.join(repo, 'src/config.js') } })
  assert.equal(secret.code, 2)
  assert.match(secret.stderr, /AWS access key/)
})

test('session-start tells the model that sdlc routes work, not superpowers', () => {
  run(['init'])
  const ctx = JSON.parse(hook('session-start', {}).stdout).hookSpecificOutput.additionalContext
  assert.match(ctx, /use superpowers skills only when an sdlc skill names one/)
})

test('session-start injects the active change and next command', () => {
  run(['new', 'add-login', '--type', 'bugfix', '--tier', 'S'])
  const ctx = JSON.parse(hook('session-start', {}).stdout).hookSpecificOutput.additionalContext
  assert.match(ctx, /add-login/)
  assert.match(ctx, /Active change: add-login \(bugfix, spec\)\. Next: \/rig:start add-login/)
})

test('run rejects a slug with no change folder and creates nothing', () => {
  run(['init'])
  const r = run(['run', '--slug', 'nope', '--', 'node -e 0'])
  assert.notEqual(r.code, 0)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/nope')), false)
})

test('check --at ci logs no rule fires', () => {
  run(['init'])
  write('.rig/rules.json', JSON.stringify([{ id: 'no-print', pattern: 'print\\(', message: 'm', why: 'w', action: 'warn' }]))
  git('add', '-A')
  git('commit', '-qm', 'base')
  git('checkout', '-qb', 'feat')
  write('src/a.py', 'print("x")\n')
  git('add', '-A')
  git('commit', '-qm', 'add')
  run(['check', '--at', 'ci', '--base', 'main'])
  const log = path.join(repo, '.rig/usage.jsonl')
  assert.equal(fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('rule-fired'), false)
})

test('waive is human-only, records the waiver for the active change, and status reports sensors', () => {
  run(['new', 'xx', '--type', 'chore', '--tier', 'S'])
  assert.equal(run(['waive', 'size', '*', 'generated', 'file']).code, 3)
  assert.equal(run(['waive', 'size', '*', 'generated', 'file'], { env: { SDLC_HUMAN: '1' } }).code, 0)
  const w = JSON.parse(fs.readFileSync(path.join(repo, '.rig/waivers.jsonl'), 'utf8').trim())
  assert.deepEqual([w.slug, w.sensor, w.file, w.reason], ['xx', 'size', '*', 'generated file'])
  const s = JSON.parse(run(['status', '--json']).stdout).sensors
  assert.equal(s.waivers, 1)
  assert.match(run(['sensors']).stdout, /waivers \(xx\): size \* generated file/)
})

test('waive rejects an unknown sensor name', () => {
  run(['new', 'xx', '--type', 'chore', '--tier', 'S'])
  const r = run(['waive', 'nonsense', '*', 'because'], { env: { SDLC_HUMAN: '1' } })
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /test-tamper/)
})


test('F5: a failing command that prints a key is recorded without the key', () => {
  run(['new', 'leak', '--type', 'chore', '--tier', 'S'])
  run(['run', '--slug', 'leak', '--', `node -e "console.log('AKIA'+'IOSFODNN7EXAMPLE'); process.exit(1)"`])
  const runs = fs.readFileSync(path.join(repo, '.rig/changes/leak/evidence/runs.jsonl'), 'utf8')
  assert.doesNotMatch(runs, /AKIA[0-9A-Z]{16}/)
  assert.match(runs, /masked by sdlc/)
})

test('status --json carries the active change and each change\'s status and next step', () => {
  run(['new', 'aa', '--type', 'chore', '--tier', 'S'])
  const s = JSON.parse(run(['status', '--json']).stdout)
  assert.equal(s.active, 'aa')
  assert.deepEqual(s.changes, [{ slug: 'aa', type: 'chore', status: 'spec', next: '/rig:start aa' }])
  assert.equal(s.story, undefined)
})

test('every slug-taking command refuses a path-like slug and writes nothing outside .rig/changes', () => {
  run(['init'])
  fs.mkdirSync(path.join(repo, '.rig/x'), { recursive: true })
  fs.mkdirSync(path.join(repo, '.rig/changes/real-one'), { recursive: true })
  write('.rig/changes/real-one/intent.md', '---\ntype: feature\ntier: M\n---\n# real\n')
  const human = { SDLC_HUMAN: '1' }
  const cases: Array<[string[], Record<string, string>?]> = [
    [['check', '--at', 'stop', '--slug', '../../x']],
    [['check', '--at', 'plan', '--slug', '../x']],
    [['run', '--slug', '../x', '--', 'node -e 0']],
    [['verify-report', '../x']],
    [['activate', '..']],
    [['next', '../x']],
    [['approve', '../x', 'budget'], human],
    [['waive', 'rules', '*', 'why', '--slug', '../x'], human],
    [['new', '../x', '--type', 'feature', '--tier', 'M']],
    [['scope-drift', '../x']],
  ]
  for (const [args, env] of cases) {
    const r = run(args, { env })
    assert.notEqual(r.code, 0, `${args.join(' ')} must be refused`)
    assert.match(r.stderr, /invalid change name|no change named|usage/, args.join(' '))
  }
  assert.deepEqual(fs.readdirSync(path.join(repo, '.rig/x')), [], 'nothing written into the sibling directory')
  assert.ok(!fs.existsSync(path.join(repo, '.rig/waivers.jsonl')) || fs.readFileSync(path.join(repo, '.rig/waivers.jsonl'), 'utf8') === '')
})

test('init runs git init when the directory is not inside a repository, and leaves an existing repo alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-norepo-'))
  const init = (cwd: string) => spawnSync('node', ['--disable-warning=ExperimentalWarning', SCRIPT, 'init'], { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } }).stdout
  assert.match(init(dir), /ran git init/)
  assert.ok(fs.existsSync(path.join(dir, '.git')))
  assert.doesNotMatch(init(repo), /ran git init/)
})

test('init --stack writes the detected stack pack when there is no sensors.json, and names the choices when several match', () => {
  write('package.json', '{ "type": "module" }\n')
  const r = run(['init', '--stack'])
  assert.match(r.stdout, /wrote \.rig\/sensors\.json from the node pack \(\d+ sensors\)/, r.stderr)
  const cfg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')) as { stack: string; sensors: { id: string }[] }
  assert.equal(cfg.stack, 'node')
  assert.ok(cfg.sensors.some(s => s.id === 'unit'))
  fs.rmSync(path.join(repo, '.rig/sensors.json'))
  write('angular.json', '{}\n')
  assert.match(run(['init', '--stack']).stdout, /several stacks match \(angular, node\)/)
  assert.match(run(['init', '--stack', 'angular']).stdout, /from the angular pack/)
  fs.rmSync(path.join(repo, '.rig/sensors.json'))
  assert.match(run(['init', '--stack', 'cobol']).stdout, /no stack pack for cobol \(known: .*node/)
})

test('init --stack refuses once sensors.json is committed or a change exists', () => {
  write('package.json', '{ "type": "module" }\n')
  run(['init'])
  fs.writeFileSync(path.join(repo, '.rig/sensors.json'), '{}')
  git('add', '.'); git('commit', '-qm', 'sensors')
  assert.match(run(['init', '--stack']).stdout, /is committed/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'), '{}')
  git('rm', '-q', '--cached', '.rig/sensors.json'); git('commit', '-qm', 'untrack')
  run(['new', 'tiny', '--type', 'chore', '--tier', 'S'])
  const r = run(['init', '--stack'])
  assert.match(r.stdout, /a change already exists/, `${r.code} ${r.stderr}`)
})
