// Standalone mode: `vendor --standalone` (alias --cloud) copies the whole harness into a project, so it needs no plugin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write } from './testkit.ts'

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [toPosix(path.join(dir, e.name))]))
    : []
const toPosix = (p: string): string => p.split(path.sep).join('/')

// Runs the project's own copy, the way a cloud session's hooks and skills do.
const vendored = (repo: string, args: string[], input?: string, human = '') => {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', path.join(repo, '.rig/bin/sdlc.ts'), ...args], {
    cwd: repo, input, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, SDLC_HUMAN: human, NODE_TEST_CONTEXT: '' },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

test('vendor --cloud writes project skills, agents and hooks with no plugin references left', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.claude/settings.json', JSON.stringify({ model: 'claude-sonnet-5-5', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }))
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  const skills = walk(path.join(repo, '.claude/skills')).filter(f => f.endsWith('SKILL.md'))
  const agents = walk(path.join(repo, '.claude/agents'))
  assert.ok(skills.some(f => f.endsWith('rig-start/SKILL.md')) && skills.length === 9, `${skills.length} skills`)
  for (const s of ['start', 'plan', 'approve', 'waive']) assert.ok(skills.some(f => f.endsWith(`rig-${s}/SKILL.md`)), `rig-${s} is vendored`)
  assert.deepEqual(agents.map(f => path.basename(f)), ['rig-evaluator.md'], 'the evaluator is the one agent')
  for (const f of [...skills, ...agents]) {
    const text = fs.readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT|<plugin>\/scripts|(?<![/\w])rig:(?:architect|evaluator|implementer|researcher|reviewer|scout)\b/, path.relative(repo, f))
    assert.match(text, f.includes('/agents/') ? /^name: rig-/m : /^name: rig:[a-z]/m, path.relative(repo, f))
  }
  assert.ok(fs.existsSync(path.join(repo, '.rig/templates/rig-check.yml')), 'templates copied')
  const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.equal(settings.model, 'claude-sonnet-5-5', 'other settings kept')
  const stop = JSON.stringify(settings.hooks.Stop)
  assert.match(stop, /echo mine/, 'the project\'s own hooks are kept')
  assert.match(stop, /\$CLAUDE_PROJECT_DIR\/\.rig\/bin\/sdlc\.ts\\?" hook stop/)
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  const again = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.equal(again.hooks.Stop.length, settings.hooks.Stop.length, 're-running replaces sdlc hooks instead of duplicating them')
})

test('the vendored copy points its skills at .rig/bin and the session start names the active change', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['vendor', '--cloud'])
  vendored(repo, ['new', 'small-thing', '--type', 'chore'])
  assert.match(vendored(repo, ['status']).stdout, /next: \/rig:start small-thing/)
  const skill = fs.readFileSync(path.join(repo, '.claude/skills/rig-plan/SKILL.md'), 'utf8')
  assert.match(skill, /\.rig\/bin\/sdlc\.ts/)
  assert.doesNotMatch(skill, /CLAUDE_PLUGIN_ROOT/)
  const ctx = JSON.parse(vendored(repo, ['hook', 'session-start'], '{}').stdout).hookSpecificOutput.additionalContext as string
  assert.match(ctx, /Active change: small-thing/)
})

const humanCommand = (cmd: string): string => `SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts ${cmd}`
test('standalone ships human-only /rig:approve and /rig:waive skills the model cannot invoke', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  for (const cmd of ['approve', 'waive']) {
    const skill = fs.readFileSync(path.join(repo, `.claude/skills/rig-${cmd}/SKILL.md`), 'utf8')
    assert.match(skill, /^disable-model-invocation: true$/m)
    assert.ok(skill.includes(`allowed-tools: Bash(${humanCommand(cmd)} *)`), `${cmd}: the grant covers exactly the injected command`)
    assert.ok(skill.includes(`!\`${humanCommand(cmd)} '$ARGUMENTS' 2>&1 || true\``), `${cmd}: arguments are single-quoted, never globbed`)
  }
})

test('a quoted argument string is split: /rig:approve and /rig:waive work from a standalone skill', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['vendor', '--standalone'])
  vendored(repo, ['new', 'demo', '--type', 'feature'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  assert.equal(vendored(repo, ['approve', 'demo plan'], undefined, '1').code, 0, 'the old stage word is ignored')
  assert.ok(fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
  assert.equal(vendored(repo, ['waive', 'size * too big for one PR'], undefined, '1').code, 0)
  assert.match(fs.readFileSync(path.join(repo, '.rig/waivers.jsonl'), 'utf8'), /"file":"\*","reason":"too big for one PR"/)
  assert.equal(vendored(repo, ['approve', 'demo']).code, 3, 'still human-only')
})

test('the plugin hooks step aside only in a standalone repo, so no hook runs twice', () => {
  const edit = (repo: string) => sdlc(repo, ['hook', 'post-edit'], { input: JSON.stringify({ tool_input: { file_path: path.join(repo, 'src/key.js') } }) })
  const plant = (repo: string) => write(repo, 'src/key.js', 'const key = "AKIAABCDEFGHIJKLMNOP"\n')
  const ci = makeRepo()
  sdlc(ci, ['init'])
  sdlc(ci, ['vendor'])
  plant(ci)
  assert.equal(edit(ci).code, 2, 'plain vendor (the CI checker) leaves the plugin hooks on')
  const standalone = makeRepo()
  sdlc(standalone, ['init'])
  sdlc(standalone, ['vendor', '--standalone'])
  plant(standalone)
  const r = edit(standalone)
  assert.equal(r.code, 0)
  assert.equal(r.stderr, '', 'the plugin copy is silent; the project copy decides')
  const settings = path.join(standalone, '.claude/settings.json')
  const full = JSON.parse(fs.readFileSync(settings, 'utf8'))
  fs.writeFileSync(settings, JSON.stringify({ $comment: 'see .rig/bin/sdlc.ts', hooks: { Stop: full.hooks.Stop } }))
  assert.equal(edit(standalone).code, 2, 'a mention or another hook does not silence post-edit')
  fs.writeFileSync(settings, '{ not json')
  assert.equal(edit(standalone).code, 2, 'unreadable settings keep the plugin hooks')
})

test('the settings template is portable: no personal plugins, absolute paths or no-op Write(path) rules', () => {
  const dir = path.join(import.meta.dirname, '..', 'templates')
  for (const f of (fs.readdirSync(dir, { recursive: true }) as string[]).filter(f => fs.statSync(path.join(dir, f)).isFile())) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8')
    assert.doesNotMatch(text, /Write\([^)]*[./*][^)]*\)/, `${f}: path-scoped write rules must be Edit(...)`)
    assert.doesNotMatch(text, /"\/(Users|home)\/|ABSOLUTE\/PATH/, `${f}: no machine-specific paths`)
  }
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'))
  assert.equal(settings.enabledPlugins?.['rig@rig'], undefined, 'standalone repos do not make teammates install the plugin')
})

test('standalone vendoring ships the v0.4 skills and REVIEW.md template', () => {
  const repo = makeRepo()
  sdlc(repo, ['vendor', '--standalone'])
  for (const s of ['rig-test', 'rig-pr', 'rig-build'])
    assert.ok(fs.existsSync(path.join(repo, `.claude/skills/${s}/SKILL.md`)), s)
  assert.ok(!fs.existsSync(path.join(repo, '.claude/skills/rig-verify/SKILL.md')), 'old names are gone')
  assert.ok(fs.existsSync(path.join(repo, '.rig/templates/REVIEW.md')))
})

test('standalone vendoring installs no mod; re-vendoring drops an old mod copy and its local marketplace', () => {
  const repo = makeRepo()
  write(repo, '.rig/mod/hooks/register.ts', 'old\n')
  write(repo, '.claude-plugin/marketplace.json', JSON.stringify({ name: 'rig-local', plugins: [{ name: 'rig', source: './.rig/mod' }] }))
  write(repo, '.claude/settings.json', JSON.stringify({ extraKnownMarketplaces: { 'rig-local': {}, mine: {} }, enabledPlugins: { 'rig@rig-local': true, 'rig-mod@rig-local': true, 'x@mine': true } }))
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/mod')))
  assert.ok(!fs.existsSync(path.join(repo, '.claude-plugin/marketplace.json')))
  const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.deepEqual(settings.enabledPlugins, { 'x@mine': true })
  assert.deepEqual(Object.keys(settings.extraKnownMarketplaces), ['mine'])
  for (const cmd of ['approve', 'waive']) assert.doesNotMatch(fs.readFileSync(path.join(repo, `.claude/skills/rig-${cmd}/SKILL.md`), 'utf8'), /CLAUDE_PLUGIN_ROOT/)
})

test('init --full vendors, wires git hooks and merges the settings template without overriding the project', () => {
  const repo = makeRepo()
  write(repo, '.claude/settings.json', JSON.stringify({ model: 'my-model', permissions: { allow: ['Bash(ls)'] } }))
  const r = sdlc(repo, ['init', '--full'])
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.ok(fs.existsSync(path.join(repo, '.rig/bin/sdlc.ts')))
  assert.ok(fs.existsSync(path.join(repo, '.rig/bin/verify.ts')), 'verify.ts is vendored')
  const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')) as { model: string; env: Record<string, string>; permissions: { allow: string[] }; hooks: object }
  assert.equal(settings.model, 'my-model', 'a value the project set is kept')
  assert.equal(settings.env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL, 'true')
  assert.equal(settings.env.ENABLE_STOP_REVIEW, '0', 'init turns off the security-guidance per-turn review (proposal 2026-10-08 §3.3.1)')
  const RECORDER = 'node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts'
  assert.deepEqual(settings.permissions.allow.slice(0, 3), ['Bash(ls)', 'Edit(.rig/**)', `Bash(${RECORDER} *)`])
  assert.ok(settings.permissions.allow.includes('Skill(rig:test *)'), 'the skill-chaining rules come with the template')
  // Subagents get no skill allowed-tools: each sdlc.ts call their prompts spell out must be the form the allow rule matches.
  for (const agent of ['rig-evaluator.md']) {
    const calls = fs.readFileSync(path.join(repo, '.claude/agents', agent), 'utf8').match(/node [^`"]*sdlc\.ts/g) ?? []
    assert.ok(calls.length && calls.every(c => c === RECORDER), `${agent}: ${calls.join(', ')}`)
  }
  assert.ok(settings.hooks, 'the harness hooks are still there')
  assert.equal(spawnSync('git', ['config', '--local', 'core.hooksPath'], { cwd: repo, encoding: 'utf8' }).stdout.trim(), '.rig/githooks')
  assert.equal(fs.existsSync(path.join(repo, '.github/workflows')), false, 'workflows only with --workflows')
})

test('init --full --workflows writes the CI files and never overwrites an existing one', () => {
  const repo = makeRepo()
  write(repo, 'REVIEW.md', 'mine\n')
  sdlc(repo, ['init', '--full', '--workflows'])
  assert.ok(fs.existsSync(path.join(repo, '.github/workflows/rig-check.yml')))
  assert.ok(!fs.existsSync(path.join(repo, '.github/workflows/rig-review.yml')), 'the review workflow is gone (step 4a)')
  assert.equal(fs.readFileSync(path.join(repo, 'REVIEW.md'), 'utf8'), 'mine\n')
})

test('the settings template protects evidence with deny rules and the harness config with ask rules', () => {
  const settings = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', 'settings.json'), 'utf8')) as { permissions: { allow: string[]; ask: string[]; deny: string[] } }
  const deny = new Set(settings.permissions.deny)
  for (const f of ['waivers.jsonl', '.gate', '.baseline', 'unresolved.json']) assert.ok(deny.has(`Edit(/.rig/${f})`), f)
  for (const f of ['approval.json', 'verify.json', 'evidence/runs.jsonl']) assert.ok(deny.has(`Edit(/.rig/changes/*/${f})`), f)
  assert.ok(deny.has('Read(.env)') && deny.has('Edit(.env)'), 'the .env rules stay')
  assert.deepEqual(settings.permissions.ask, [
    'Edit(/.rig/sensors.json)', 'Edit(/.rig/rules.json)', 'Edit(/.rig/evals/*.json)', 'Edit(/.claude/settings.json)',
    'Edit(/.rig/bin/**)', 'Edit(/.rig/githooks/**)', 'Edit(/.rig/mod/**)', 'Edit(/.rig/guides/**)',
    'Edit(/.github/workflows/rig-*.yml)', 'Edit(/CODEOWNERS)', 'Edit(/.github/CODEOWNERS)', 'Edit(/migrations/**)', 'Edit(/infra/**)',
    'Bash(node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts evals*)',
  ])
  assert.ok(settings.permissions.ask.includes('Edit(/.rig/bin/**)'), 'a model edit to the vendored checker (.rig/bin/sensors.ts) asks the person')
  assert.ok(!settings.permissions.ask.some(r => /CLAUDE\.md/.test(r)), 'unattended init writes CLAUDE.md, so it never asks')
  assert.ok(settings.permissions.allow.includes('Edit(.rig/**)'), 'plans and intents stay editable')
})

test('init --full merges the evidence rules into an existing settings file without dropping its own', () => {
  const repo = makeRepo()
  write(repo, '.claude/settings.json', JSON.stringify({ permissions: { deny: ['Bash(rm -rf *)'] } }))
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  const merged = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.ok(merged.permissions.deny.includes('Bash(rm -rf *)'))
  assert.ok(merged.permissions.deny.includes('Edit(/.rig/changes/*/approval.json)'))
})

test('re-vendoring over an older standalone install drops the retired sdlc hooks, the lane hooks included, and keeps the project\'s own', () => {
  const repo = makeRepo()
  const cmd = (name: string) => `node --disable-warning=ExperimentalWarning "$CLAUDE_PROJECT_DIR/.rig/bin/sdlc.ts" hook ${name}`
  const group = (name: string, matcher?: string) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: cmd(name), timeout: 10 }] })
  write(repo, '.claude/settings.json', JSON.stringify({
    hooks: {
      PreToolUse: [group('pre-bash', 'Bash'), group('pre-edit', 'Write|Edit|MultiEdit|NotebookEdit'), { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }],
      SubagentStart: [group('subagent-start')],
      SubagentStop: [group('subagent-stop')],
      Stop: [group('stop')],
    },
  }))
  assert.equal(sdlc(repo, ['init']).code, 0)
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  const file = path.join(repo, '.claude/settings.json')
  const once = fs.readFileSync(file, 'utf8')
  const hooks = JSON.parse(once).hooks as Record<string, { matcher?: string; hooks: { command: string }[] }[]>
  const commands = Object.values(hooks).flat().flatMap(g => g.hooks.map(h => h.command))
  for (const gone of ['pre-bash', 'pre-edit']) assert.ok(!commands.some(c => c.endsWith(`hook ${gone}`)), gone)
  assert.deepEqual(hooks.PreToolUse?.filter(g => g.matcher === 'Bash'), [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }], 'the project\'s own hook is kept untouched')
  assert.equal(hooks.PreToolUse?.filter(g => g.matcher === 'Agent' && g.hooks.some(h => h.command.endsWith('hook agent-launch'))).length, 1, 'the agent-launch hook is registered once')
  for (const event of ['SubagentStart', 'SubagentStop', 'PostToolUseFailure']) assert.equal(hooks[event], undefined, `${event} is no longer registered`)
  for (const [event, name] of [['UserPromptSubmit', 'prompt-submit'], ['Stop', 'stop'], ['SessionStart', 'session-start'], ['PostToolUse', 'post-edit']]) {
    assert.equal(hooks[event as string]?.filter(g => g.hooks.some(h => h.command.endsWith(`hook ${name}`))).length, 1, `${event} registered once`)
  }
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), once, 're-vendoring again changes nothing')
})

test('vendor --standalone over an old install adds the template permissions, keeps the project\'s own, and is idempotent; plain vendor leaves settings alone', () => {
  const repo = makeRepo()
  const old = { permissions: { deny: ['Bash(rm -rf *)'], allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.rig/bin/sdlc.ts" hook pre-bash' }] }, { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] } }
  write(repo, '.claude/settings.json', JSON.stringify(old))
  const file = path.join(repo, '.claude/settings.json')
  assert.equal(sdlc(repo, ['vendor']).code, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), old, 'plain vendor does not touch settings')
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  const once = fs.readFileSync(file, 'utf8')
  const perms = JSON.parse(once).permissions as { deny: string[]; allow: string[]; ask: string[] }
  assert.ok(perms.deny.includes('Bash(rm -rf *)') && perms.allow.includes('Bash(npm test)'), 'own rules kept')
  assert.ok(perms.deny.includes('Edit(/.rig/changes/*/approval.json)') && perms.deny.includes('Edit(/.rig/waivers.jsonl)'), 'evidence denies added')
  assert.ok(perms.ask.includes('Edit(/.rig/sensors.json)') && perms.ask.includes('Edit(/CODEOWNERS)'), 'ask rules added')
  assert.ok(JSON.stringify(JSON.parse(once).hooks).includes('echo mine') && !once.includes('pre-bash'))
  assert.ok(!once.includes('$comment'))
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), once, 'a second run is byte-identical')
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  const full = fs.readFileSync(file, 'utf8')
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), full, 'init --full is idempotent too')
  assert.deepEqual(JSON.parse(full).permissions, JSON.parse(once).permissions)
})

test('every module a script imports is vendored', () => {
  const scripts = path.join(import.meta.dirname)
  const vendoredNames = new Set((fs.readFileSync(path.join(scripts, 'vendor.ts'), 'utf8').match(/export const VENDORED = \[([^\]]*)\]/)?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, '')))
  const NOT_VENDORED: string[] = [] // none: the checker copy must be self-contained
  const missing: string[] = []
  for (const f of fs.readdirSync(scripts).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')) {
    for (const m of fs.readFileSync(path.join(scripts, f), 'utf8').matchAll(/from '\.\/([\w-]+)\.ts'/g)) {
      if (!vendoredNames.has(m[1] as string) && !NOT_VENDORED.includes(m[1] as string)) missing.push(`${f} imports ${m[1]}`)
    }
  }
  assert.deepEqual(missing, [])
  assert.ok(vendoredNames.has('stamp') && vendoredNames.size > 20)
})
