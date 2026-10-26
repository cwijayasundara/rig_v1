// Standalone mode: `vendor --standalone` (alias --cloud) copies the whole harness into a project, so it needs no plugin.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
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
  assert.ok(skills.some(f => f.endsWith('rig-start/SKILL.md')) && skills.length === 16, `${skills.length} skills`)
  for (const s of ['start', 'plan', 'approve', 'waive', 'autonomy', 'chart', 'testplan']) assert.ok(skills.some(f => f.endsWith(`rig-${s}/SKILL.md`)), `rig-${s} is vendored`)
  assert.ok(!fs.existsSync(path.join(repo, '.claude/skills/rig-upgrade')), 'the upgrade skill runs only from the plugin, so it is not vendored')
  assert.deepEqual(agents.map(f => path.basename(f)), ['rig-architect.md', 'rig-evaluator.md'], 'the architect and the evaluator are the agents')
  for (const f of [...skills, ...agents]) {
    const text = fs.readFileSync(f, 'utf8')
    assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT|<plugin>\/scripts|(?<![/\w])rig:(?:architect|evaluator|implementer|researcher|reviewer|scout)\b/, path.relative(repo, f))
    assert.match(text, f.includes('/agents/') ? /^name: rig-/m : /^name: rig:[a-z]/m, path.relative(repo, f))
    assert.doesNotMatch(text, /\/rig:[a-z]/, `${path.relative(repo, f)}: a vendored skill is invoked by its folder name, /rig-<name>`)
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

test('vendor --cloud rewrites the CLAUDE.md routing line to the vendored command and leaves the rest alone', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const claude = '# App\n\nsdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.\n\nSee /rig:plan notes.\n'
  write(repo, 'CLAUDE.md', claude)
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  assert.equal(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), claude.replace('start with /rig:start;', 'start with /rig-start;'))
})

test('vendor --cloud names the vendored /rig-x commands in the README rig block and its template, and leaves the rest alone', () => {
  // 2026-10-25 shop_app run: CLAUDE.md said /rig-start but the README block said /rig:start, which a standalone copy does not answer to.
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const block = '<!-- rig:begin (written by /rig:init) -->\nStart with `/rig:start "<idea>"`, then `/rig:approve <slug>`.\n<!-- rig:end -->'
  write(repo, 'README.md', `# App\n\nRun /rig:start outside the block.\n\n${block}\n`)
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8')
  assert.match(readme, /Run \/rig:start outside the block/, 'text outside the markers is untouched')
  assert.match(readme, /Start with `\/rig-start "<idea>"`, then `\/rig-approve <slug>`/)
  assert.doesNotMatch(readme.slice(readme.indexOf('<!-- rig:begin')), /\/rig:[a-z]/)
  const tpl = fs.readFileSync(path.join(repo, '.rig/templates/readme-rig.md'), 'utf8')
  assert.match(tpl, /\/rig-start/)
  assert.doesNotMatch(tpl, /\/rig:[a-z]/)
})

test('vendor --cloud names the /rig-x commands in the docs/prd README and template init wrote', () => {
  // init --stack writes docs/prd/ before init --full vendors, so its copies still say /rig:chart until vendor routes them.
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'docs/prd/README.md', 'Run `/rig:chart <n> @docs/prd/sprint-<n>/prd.md`.\n')
  write(repo, 'docs/prd/prd-template.md', 'converted by /rig:chart\n')
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  for (const f of ['docs/prd/README.md', 'docs/prd/prd-template.md']) {
    const text = fs.readFileSync(path.join(repo, f), 'utf8')
    assert.match(text, /\/rig-chart/, f)
    assert.doesNotMatch(text, /\/rig:[a-z]/, f)
  }
})

test('the vendored copy points its skills at .rig/bin and the session start names the active change', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['vendor', '--cloud'])
  vendored(repo, ['new', 'small-thing', '--type', 'chore'])
  // A vendored skill is registered under its folder name, so the vendored checker names it /rig-start (2026-10-16 pilot).
  assert.match(vendored(repo, ['status']).stdout, /next: \/rig-start small-thing/)
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
    assert.ok(skill.includes(`!\`${humanCommand(cmd)} '$ARGUMENTS'${cmd === 'approve' ? ' --ask' : ''} 2>&1 || true\``), `${cmd}: arguments are single-quoted, never globbed`)
  }
  // The vendored human skills are the plugin's own text with project paths, never a second copy that can drift.
  for (const cmd of ['approve', 'waive', 'autonomy']) {
    const plugin = fs.readFileSync(path.join(import.meta.dirname, '..', 'skills', cmd, 'SKILL.md'), 'utf8')
    const skill = fs.readFileSync(path.join(repo, `.claude/skills/rig-${cmd}/SKILL.md`), 'utf8')
    const field = (text: string, key: string) => new RegExp(`^${key}: (.*)$`, 'm').exec(text)?.[1]
    for (const key of ['description', 'argument-hint']) assert.equal(field(skill, key), field(plugin, key), `${cmd}: ${key}`)
    assert.equal(skill.split('---\n').slice(2).join('---\n'), plugin.split('---\n').slice(2).join('---\n').replaceAll('"${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts"', '.rig/bin/sdlc.ts').replaceAll('/rig:', '/rig-'), `${cmd}: body`)
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

test('standalone vendoring installs the journey dashboard as the local plugin rig and drops an old mod', () => {
  const repo = makeRepo()
  write(repo, '.rig/mod/hooks/register.ts', 'old\n')
  write(repo, '.claude/settings.json', JSON.stringify({ extraKnownMarketplaces: { mine: {} }, enabledPlugins: { 'rig-mod@rig-local': true, 'x@mine': true } }))
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.ok(!fs.existsSync(path.join(repo, '.rig/mod/hooks/register.ts')), 'the old module is removed')
  for (const f of ['hooks/dashboard.tsx', 'hooks/hooks.json', '.claude-plugin/plugin.json', 'types/index.d.ts']) assert.ok(fs.existsSync(path.join(repo, '.rig/mod', f)), f)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/mod/.claude-plugin/plugin.json'), 'utf8')).name, 'rig')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/mod/hooks/hooks.json'), 'utf8')), { modules: ['./dashboard.tsx'] })
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin/marketplace.json'), 'utf8')).plugins[0].source, './.rig/mod')
  const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.deepEqual(settings.enabledPlugins, { 'x@mine': true, 'rig@rig-local': true })
  assert.deepEqual(Object.keys(settings.extraKnownMarketplaces).sort(), ['mine', 'rig-local'])
  for (const cmd of ['approve', 'waive']) assert.doesNotMatch(fs.readFileSync(path.join(repo, `.claude/skills/rig-${cmd}/SKILL.md`), 'utf8'), /CLAUDE_PLUGIN_ROOT/)
})

test('the vendored journey prints /rig-<name>, the command a standalone copy answers to, never the plugin spelling /rig:<name>', () => {
  // cbe4be4 (2026-10-18) printed /rig:<name> here; every standalone transcript since resolves /rig-<name> and never /rig:<name>.
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', JSON.stringify({ stack: 'x', paths: { tests: ['**/*.test.ts'] }, sensors: [] }))
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  sdlc(repo, ['new', 'add-x', '--type', 'feature'])
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '.rig/bin/sdlc.ts', 'status', '--journey'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.match(r.stdout, /\/rig-init/)
  assert.match(r.stdout, /next: \/rig-start add-x/)
  assert.doesNotMatch(r.stdout, /\/rig:[a-z]/)
})

test('every script names a skill through skillRef, never a hard-coded /rig:<name> (2026-10-25 shop_app: readiness told a standalone repo to run /rig:chart)', () => {
  const dir = import.meta.dirname
  const hits: string[] = []
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && f !== 'testkit.ts' && f !== 'vendor.ts')) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const code = line.trimStart().startsWith('//') ? '' : line.replace(/\s\/\/\s.*$/, '')
      if (/\/rig:[a-z]/.test(code) && !code.includes('export const skillRef') && !line.includes('// plugin-only:')) hits.push(`${f}:${i + 1}: ${code.trim().slice(0, 100)}`)
    })
  }
  assert.deepEqual(hits, [])
})

test('a standalone copy prints /rig-<name> in readiness, refusals and the dashboard, and rewrites the CLAUDE.md guides block', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', JSON.stringify({ stack: 'x', paths: { tests: ['**/*.test.ts'] }, sensors: [] }))
  assert.equal(sdlc(repo, ['sync']).code, 0)
  assert.match(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), /the \/rig:pr reviewer/, 'the plugin copy writes the plugin spelling')
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  const claude = fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8')
  assert.match(claude, /the \/rig-pr reviewer/)
  assert.doesNotMatch(claude, /\/rig:[a-z]/)
  assert.match(vendored(repo, ['sync']).stdout, /guides block is up to date/, 'the re-hashed block is what the vendored sync writes')
  const ready = vendored(repo, ['readiness'])
  assert.match(ready.stdout, /\/rig-chart/)
  assert.doesNotMatch(ready.stdout + ready.stderr, /\/rig:[a-z]/)
  const refused = vendored(repo, ['approve', 'x'])
  assert.equal(refused.code, 3)
  assert.match(refused.stderr + refused.stdout, /the person runs \/rig-approve <slug>/)
  const dash = fs.readFileSync(path.join(repo, '.rig/mod/hooks/dashboard.tsx'), 'utf8')
  assert.match(dash, /\/rig-init/)
  assert.doesNotMatch(dash, /\/rig:[a-z]/)
})

test('vendoring leaves a hand-edited guides block alone, so sync still reports the edit', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'CLAUDE.md', '# App\n\n<!-- rig:guides start hash=0000000000000000 -->\n- See /rig:pr. [sensor:x]\n<!-- rig:guides end -->\n')
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.match(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), /hash=0000000000000000 -->\n- See \/rig:pr\./)
})

test('vendoring leaves a team\'s own .claude-plugin/marketplace.json alone', () => {
  const repo = makeRepo()
  write(repo, '.claude-plugin/marketplace.json', JSON.stringify({ name: 'team', plugins: [] }))
  assert.equal(sdlc(repo, ['vendor', '--standalone']).code, 0)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin/marketplace.json'), 'utf8')).name, 'team')
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
  // Subagents get no skill allowed-tools: any sdlc.ts call their prompts spell out must be the form the allow rule matches (the chart evaluator makes none).
  for (const agent of ['rig-evaluator.md']) {
    const calls = fs.readFileSync(path.join(repo, '.claude/agents', agent), 'utf8').match(/node [^`"]*sdlc\.ts/g) ?? []
    assert.ok(calls.every(c => c === RECORDER), `${agent}: ${calls.join(', ')}`)
  }
  assert.ok(settings.hooks, 'the harness hooks are still there')
  assert.equal(spawnSync('git', ['config', '--local', 'core.hooksPath'], { cwd: repo, encoding: 'utf8' }).stdout.trim(), '.rig/githooks')
  assert.equal(fs.existsSync(path.join(repo, '.github/workflows')), false, 'workflows only with --workflows')
})

test('init --full turns superpowers on, even where an older template left it off: rig skills invoke it', () => {
  const repo = makeRepo()
  write(repo, '.claude/settings.json', JSON.stringify({ enabledPlugins: { 'superpowers@claude-plugins-official': false, 'x@mine': false } }))
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  const settings = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8'))
  assert.equal(settings.enabledPlugins['superpowers@claude-plugins-official'], true)
  assert.equal(settings.enabledPlugins['x@mine'], false, 'other plugin choices are kept')
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
    'Edit(/.rig/sensors.json)', 'Edit(/.rig/rules.json)', 'Edit(/.rig/layers.approved.json)', 'Edit(/.rig/ratchets.json)', 'Edit(/.rig/gen/**)', 'Edit(/.rig/lessons.md)', 'Edit(/.rig/lessons-archive.md)', 'Edit(/.claude/settings.json)',
    'Edit(/.rig/bin/**)', 'Edit(/.rig/githooks/**)', 'Edit(/.rig/mod/**)', 'Edit(/.rig/guides/**)',
    'Edit(/.github/workflows/rig-*.yml)', 'Edit(/CODEOWNERS)', 'Edit(/.github/CODEOWNERS)', 'Edit(/migrations/**)', 'Edit(/infra/**)',
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

test('vendor --standalone writes a manifest of the harness files', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  const m = JSON.parse(fs.readFileSync(path.join(repo, '.rig/bin/MANIFEST.json'), 'utf8')) as { version: string; files: Record<string, string> }
  assert.equal(m.version, fs.readFileSync(path.join(repo, '.rig/bin/VERSION'), 'utf8').trim())
  const sha = (f: string): string => crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, f), 'utf8')).digest('hex').slice(0, 16)
  assert.equal(m.files['.rig/bin/sdlc.ts'], sha('.rig/bin/sdlc.ts'))
  for (const f of ['.claude/skills/rig-start/SKILL.md', '.rig/mod/hooks/dashboard.tsx', '.rig/githooks/pre-commit']) assert.equal(m.files[f], sha(f), f)
  for (const f of ['.claude/settings.json', 'CLAUDE.md', 'README.md', '.claude-plugin/marketplace.json', '.rig/bin/MANIFEST.json']) assert.ok(!(f in m.files), `${f} is not hashed`)
  assert.equal(fs.statSync(path.join(repo, '.rig/githooks/pre-commit')).mode & 0o777, 0o755)
})

test('plain vendor (not standalone) manifest lists only .rig/bin and .rig/githooks files', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  assert.equal(sdlc(repo, ['vendor']).code, 0)
  const m = JSON.parse(fs.readFileSync(path.join(repo, '.rig/bin/MANIFEST.json'), 'utf8')) as { files: Record<string, string> }
  const keys = Object.keys(m.files)
  assert.ok(!keys.some(k => k.includes('rig-upgrade')), 'no rig-upgrade key in the manifest')
  assert.ok(keys.length > 10 && keys.every(k => k.startsWith('.rig/bin/') || k.startsWith('.rig/githooks/')), keys.join(','))
})

test('init on an install older than the plugin points at the upgrade skill and re-initialises nothing', () => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  write(repo, '.rig/bin/VERSION', '0.0.1\n')
  fs.rmSync(path.join(repo, '.rig/autonomy.json'), { force: true })
  const r = sdlc(repo, ['init', '--full'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /older than this plugin[^\n]*\/rig:upgrade from the newer plugin/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/bin/VERSION'), 'utf8'), '0.0.1\n', 'nothing was vendored')
  assert.ok(!fs.existsSync(path.join(repo, '.rig/autonomy.json')), 'nothing was re-initialised')
})

test('init on a current install is unchanged', () => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['init', '--full']).code, 0)
  const r = sdlc(repo, ['init'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /initialised/)
  assert.doesNotMatch(r.stdout, /upgrade/)
})

test('a plain vendor after vendor --cloud keeps the standalone manifest entries, and a second --cloud is byte-identical', () => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  const file = path.join(repo, '.rig/bin/MANIFEST.json')
  const first = fs.readFileSync(file, 'utf8')
  const keys = Object.keys(JSON.parse(first).files)
  assert.ok(keys.some(k => k.startsWith('.claude/skills/rig-')) && keys.some(k => k.startsWith('.claude/agents/rig-')))
  assert.equal(sdlc(repo, ['vendor']).code, 0)
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).files).length, keys.length)
  assert.equal(sdlc(repo, ['vendor', '--cloud']).code, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), first)
})
