// Behavioural harness step 4a (spec 2026-10-16 §8): what the spec deletes stays deleted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { makeRepo, sdlc, write, hook } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const gone = (...rels: string[]): void => { for (const r of rels) assert.ok(!fs.existsSync(path.join(ROOT, r)), `${r} should be deleted`) }
// The usage line lists every command: a removed one is not in it.
const commands = (): string[] => /usage: sdlc\.ts <([^>]+)>/.exec(sdlc(makeRepo(), []).stderr)?.[1]?.split('|') ?? []

test('4a: the rig-brain plugin is gone', () => {
  gone('brain', 'scripts/brainsource.ts')
  assert.deepEqual((JSON.parse(read('.claude-plugin/marketplace.json')) as { plugins: { name: string }[] }).plugins.map(p => p.name), ['rig'])
  assert.doesNotMatch(read('package.json'), /test:brain/)
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /--prefix brain/)
  assert.doesNotMatch(read('skills/init/SKILL.md') + read('templates/readme-rig.md'), /rig-brain|brain-source|\{\{BRAIN\}\}/)
  assert.ok(!commands().includes('brain-source'))
  assert.ok(commands().includes('check'), 'the usage line still parses')
})

// The 2026-10-16 mod (band, mission control, driver, gates, spend) stays gone. GOAL Scope 7 (2026-10-18) allows one read-only
// journey dashboard in its place: hooks/dashboard.tsx, with its state contract in types/.
test('4a: the old mod UI is gone; only the journey dashboard module is registered', () => {
  gone('hooks/band.tsx', 'hooks/mission.tsx', 'hooks/driver.ts', 'hooks/gates.ts', 'hooks/register.ts', 'hooks/shared.ts', 'tests/register.test.ts')
  // Claude Code regenerates a root tsconfig.json next to .claude-plugin/types/ for mod type-checking, so it may exist on disk; it must never be tracked.
  assert.equal(execFileSync('git', ['ls-files', '--', 'tsconfig.json'], { cwd: ROOT, encoding: 'utf8' }).trim(), '', 'tsconfig.json should not be tracked')
  const hooks = JSON.parse(read('hooks/hooks.json')) as { modules?: unknown; hooks: Record<string, unknown> }
  assert.deepEqual(hooks.modules, ['./dashboard.tsx'])
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['PostModelSwitch', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
  assert.doesNotMatch(read('package.json'), /typecheck:mod|claude plugin test/)
  assert.equal((JSON.parse(read('.claude-plugin/plugin.json')) as { types?: string }).types, './types/index.d.ts')
})

test('4a: a retired hook name from an old vendored settings file exits quietly', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  for (const name of ['subagent-start', 'subagent-stop', 'skill-failed']) {
    const r = hook(repo, name, { session_id: 's1' })
    assert.equal(r.code, 0, `${name}: ${r.stderr}`)
    assert.equal(r.stdout, '')
  }
})

test('4a: the plugin ships human-only approve and waive skills that run sdlc with SDLC_HUMAN=1', () => {
  for (const [cmd, hint] of [['approve', '<slug | chart-N>'], ['waive', '<sensor-or-command-id> <file|*> <reason> [--days N] | chart-<N> <finding number> <reason>']] as const) {
    const text = read(`skills/${cmd}/SKILL.md`)
    assert.match(text, /^disable-model-invocation: true$/m)
    assert.ok(text.includes(`argument-hint: ${hint}\n`), `${cmd} argument-hint`)
    assert.ok(text.includes(`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "\${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" ${cmd} '$ARGUMENTS'`), `${cmd} command`)
  }
})

test('4a: a typed /rig:approve records one row even when the skill runs the same approve', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature'])
  write(repo, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- B1 x\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/demo/plan.md', '# Plan\n\n## Open questions\nnone\n')
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo' })
  const first = fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8')
  const again = sdlc(repo, ['approve', 'demo'], { env: { SDLC_HUMAN: '1' } }) // what the skill's !`...` line runs: one quoted argument
  assert.match(again.stdout, /already approved/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8'), first)
})

test('4a: watch, metrics, scorecard, points and timing are gone (the chart returned in the outer loop, 2026-10-17)', () => {
  gone(...['watch', 'metrics', 'scorecard', 'points', 'timing'].map(m => `scripts/${m}.ts`), 'skills/decompose', 'skills/metrics', 'templates/rig-watch.yml', 'templates/rig-triage.yml', 'templates/rig-rehearse.yml')
  for (const c of ['watch', 'metrics', 'scorecard', 'points']) assert.ok(!commands().includes(c), c)
})

test('4a: status and status --json no longer carry points or story', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature'])
  assert.doesNotMatch(sdlc(repo, ['status']).stdout, /\dpt\b/)
  const json = JSON.parse(sdlc(repo, ['status', '--json']).stdout) as Record<string, unknown> & { changes: Record<string, unknown>[] }
  assert.ok(!('story' in json))
  assert.ok(json.changes.every(c => !('points' in c)))
})

test('4a: the review workflow, the rig-spec CI template and three non-lifecycle skills are gone', () => {
  gone('workflows', 'templates/rig-review.yml', 'templates/rig-spec.yml', ...['architecture', 'codebase-design', 'prototype'].map(s => `skills/${s}`))
  const ci = fs.readdirSync(path.join(ROOT, 'templates')).filter(f => /^rig-.*\.yml$/.test(f))
  assert.deepEqual(ci, ['rig-check.yml'])
  const kept = fs.readdirSync(path.join(ROOT, 'skills')).sort()
  assert.deepEqual(kept, ['app', 'approve', 'arch', 'autonomy', 'build', 'chart', 'init', 'learn', 'plan', 'pr', 'rule', 'start', 'test', 'testplan', 'waive', 'wiki'])
})

test('5a: the scripted e2e suite runs in npm test and in CI again', () => {
  const t = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts.test ?? ''
  assert.match(t, /test:e2e:unit/)
  assert.match(t, /test:e2e:fast/)
  assert.match(read('.github/workflows/ci.yml'), /npm run test:e2e:fast/)
})

// Every slash command and sdlc subcommand the shipped text names must exist (a deleted skill or command left behind breaks the flow).
test('4a: every /rig:<skill> and sdlc.ts <command> named in skills, agents, guides and templates exists', () => {
  const skills = new Set(fs.readdirSync(path.join(ROOT, 'skills')))
  const cmds = new Set(commands())
  const files = ['skills', 'agents', 'guides', 'templates'].flatMap(d => (fs.readdirSync(path.join(ROOT, d), { recursive: true }) as string[]).map(f => path.join(d, f)))
    .filter(f => f.endsWith('.md') && fs.statSync(path.join(ROOT, f)).isFile())
  const bad: string[] = []
  for (const f of files) {
    const text = read(f)
    for (const m of text.matchAll(/(?<![\w-])\/rig[:-]([a-z][a-z-]*)/g)) if (m[1] !== 'x' && !skills.has(m[1]!)) bad.push(`${f}: /rig:${m[1]}`)
    for (const m of text.matchAll(/(?:scripts|bin)\/sdlc\.ts"? ([a-z][a-z-]+)/g)) if (!cmds.has(m[1]!)) bad.push(`${f}: sdlc.ts ${m[1]}`)
  }
  assert.deepEqual(bad, [])
})

test('every next step the lifecycle names is a skill that exists', () => {
  // The lifecycle names its skills through skillRef (as `k('build')`), which picks /rig:x or /rig-x for plugin or vendored copy.
  const named = [...read('scripts/lifecycle.ts').matchAll(/\bk\('([a-z-]+)'\)/g)].map(m => m[1]!)
  assert.ok(named.length >= 4)
  for (const s of named) assert.ok(fs.existsSync(path.join(ROOT, 'skills', s, 'SKILL.md')), `/rig:${s} has no skill`)
})

test('4b: seven workflow skills, the chart and testplan skills and the three human gates, and two agents', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')).sort(), ['app', 'approve', 'arch', 'autonomy', 'build', 'chart', 'init', 'learn', 'plan', 'pr', 'rule', 'start', 'test', 'testplan', 'waive', 'wiki'])
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'agents')), ['architect.md', 'evaluator.md'])
  gone('templates/design-format.md')
  for (const s of ['start', 'plan', 'build', 'test', 'pr']) assert.doesNotMatch(read(`skills/${s}/SKILL.md`), /tier|ratchet|slice|next --json|rig:(scout|implementer|reviewer|architect)/i, s)
})

test('4b: the old lifecycle modules are gone and the harness templates guard approval.json', () => {
  gone(...['graph', 'ratchet', 'slices', 'slicecheck', 'checkpoint', 'stale', 'spend', 'routing', 'flow', 'levels', 'quality', 'shards', 'evals', 'context', 'inbox', 'toolchain', 'preflight'].map(m => `scripts/${m}.ts`))
  const core = read('scripts/core.ts')
  for (const name of ['approvalDigest', 'planApproved', 'createChange', 'APPROVAL_ARTIFACTS', 'intentTemplate', 'scopeDrift', 'planProblems']) assert.doesNotMatch(core, new RegExp(`export (?:function|const|type) ${name}\\b`), name)
  const settings = read('templates/settings.json')
  assert.match(settings, /approval\.json/)
  assert.doesNotMatch(settings, /approvals\.jsonl|usage\.jsonl|PREFLIGHT/)
})

test('4c: the old-config adapter is gone', () => {
  gone('scripts/configparse.ts', 'scripts/scopes.ts', 'templates/stacks.json')
  for (const name of ['SensorConfig', 'parseConfig', 'BehavioralConfig']) assert.doesNotMatch(read('scripts/model.ts'), new RegExp(`export (?:function|const|type) ${name}\\b`), name)
  for (const name of ['fromLegacy', 'registryConfig']) assert.doesNotMatch(read('scripts/registry.ts'), new RegExp(`export function ${name}\\b`), name)
})

test('5b: the e2e stages and the stack runner are wired, and no shipped e2e text still says charted, PRD or oracle', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts['test:e2e:stacks'], /tests\/e2e\/stacks\.mjs/)
  assert.match(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), /npm run test:e2e:stacks/)
  for (const f of ['tests/e2e/phases/s0-install.mjs', 'tests/e2e/acceptance/shop.mjs', 'tests/e2e/run.mjs']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\bcharted\b|\bPRD\b|\boracle\b/i, f)
  }
  assert.match(fs.readFileSync('tests/e2e/run.mjs', 'utf8'), /'S5 policy': \d+/)
})

test('per-sensor ids: no shipped text or e2e helper still speaks of a commands sensor', () => {
  assert.ok(!fs.existsSync('tests/e2e/lib/findings.mjs'), 'sensorOf is gone: findings carry their id')
  for (const f of ['README.md', 'skills/waive/SKILL.md', 'tests/e2e/phases/s5-policy.mjs', 'tests/e2e/lib/stacks.mjs']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /sensorOf|plus commands and config findings/, f)
  }
})

test('6: the eval runner is wired: dry in CI, live by hand, results committed under eval/results', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts.eval, /eval\/run\.mjs/)
  assert.match(pkg.scripts['eval:dry'], /--dry/)
  assert.match(pkg.scripts['test:e2e:unit'], /eval\/\*\.test\.mjs/)
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8')
  assert.match(ci, /npm run eval:dry/)
  const evalRuns = [...ci.matchAll(/npm run (eval\S*)/g)].map(m => m[1] as string)
  assert.ok(evalRuns.length > 0 && evalRuns.every(r => r.endsWith(':dry')), `live evals never run in CI (spec §9); CI runs ${evalRuns.join(', ')}`)
  assert.ok(fs.existsSync('eval/results/.gitkeep'))
})

// Docs audit guards: the user-facing docs name only what exists.
const skillDirs = (): string[] => fs.readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)

test('docs: no intent inbox and no graph command in the README or its template', () => {
  for (const f of ['README.md', 'templates/readme-rig.md', 'skills/start/SKILL.md']) assert.doesNotMatch(read(f), /\.rig\/intent\//, f)
  for (const f of ['README.md', 'templates/readme-rig.md']) assert.doesNotMatch(read(f), /\bgraph\b *[·|,`]|[·|,`] *graph\b/, `${f} lists a graph command`)
})

test('docs: every /rig:<x> in the README, DESIGN and GOAL names a skill', () => {
  const skills = new Set(skillDirs())
  for (const f of ['README.md', 'DESIGN.md', 'docs/GOAL.md', 'templates/readme-rig.md']) {
    for (const m of read(f).matchAll(/\/rig:([a-z][a-z-]*)/g)) assert.ok(skills.has(m[1] ?? ''),`${f}: /rig:${m[1]} is not a skill`)
  }
})

test('docs: the README skill count equals the skill directories', () => {
  const counts = [...read('README.md').matchAll(/(?:SKILLS \(|`skills\/` \()(\d+)\)/g)].map(m => Number(m[1]))
  assert.ok(counts.length >= 2, 'the README states the skill count')
  for (const n of counts) assert.equal(n, skillDirs().length)
})

test('docs: README and DESIGN do not cite scripts/context.ts', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'scripts/context.ts')))
  for (const f of ['README.md', 'DESIGN.md']) assert.doesNotMatch(read(f), /scripts\/context\.ts/, f)
})

test('docs: the architect is Sonnet in the README, as in its frontmatter', () => {
  assert.match(read('agents/architect.md'), /^model: sonnet$/m)
  assert.doesNotMatch(read('README.md'), /architect[^\n]{0,20}\(?Opus|`architect` agent \(Opus\)|architect\.md` \| Opus/)
})

test('docs: README lists every sdlc.ts command in its script line', () => {
  const line = read('README.md').split('\n').find(l => l.startsWith('**The script underneath**')) ?? ''
  for (const c of commands()) assert.ok(line.includes(`\`${c}`), `README script line lacks ${c}`)
})
