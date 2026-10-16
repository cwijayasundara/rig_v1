// Behavioural harness step 4a (spec 2026-10-16 §8): what the spec deletes stays deleted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

test('4a: the mod UI and its type and test scaffolding are gone', () => {
  gone('hooks/band.tsx', 'hooks/mission.tsx', 'hooks/driver.ts', 'hooks/gates.ts', 'hooks/register.ts', 'hooks/shared.ts', 'tests/register.test.ts', 'types', 'tsconfig.json', '.claude-plugin/types')
  const hooks = JSON.parse(read('hooks/hooks.json')) as { modules?: unknown; hooks: Record<string, unknown> }
  assert.equal(hooks.modules, undefined)
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['PostModelSwitch', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
  assert.doesNotMatch(read('package.json'), /typecheck:mod|claude plugin test/)
  assert.equal((JSON.parse(read('.claude-plugin/plugin.json')) as { types?: string }).types, undefined)
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
  for (const [cmd, hint] of [['approve', '<slug>'], ['waive', '<sensor> <file|*> <reason>']] as const) {
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

test('4a: chart, watch, metrics, scorecard, points and timing are gone', () => {
  gone(...['chart', 'chartcheck', 'watch', 'metrics', 'scorecard', 'points', 'timing'].map(m => `scripts/${m}.ts`), 'skills/chart', 'skills/decompose', 'skills/metrics', 'templates/prd-format.md', 'templates/rig-watch.yml', 'templates/rig-triage.yml', 'templates/rig-rehearse.yml')
  for (const c of ['chart', 'watch', 'metrics', 'scorecard', 'points']) assert.ok(!commands().includes(c), c)
})

test('4a: status and status --json no longer carry points or story', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  assert.doesNotMatch(sdlc(repo, ['status']).stdout, /\dpt\b/)
  const json = JSON.parse(sdlc(repo, ['status', '--json']).stdout) as Record<string, unknown> & { changes: Record<string, unknown>[] }
  assert.ok(!('story' in json))
  assert.ok(json.changes.every(c => !('points' in c)))
})

test('4a: the review workflow, the rig-spec CI template and four non-lifecycle skills are gone', () => {
  gone('workflows', 'templates/rig-review.yml', 'templates/rig-spec.yml', ...['architecture', 'codebase-design', 'prototype', 'testplan'].map(s => `skills/${s}`))
  const ci = fs.readdirSync(path.join(ROOT, 'templates')).filter(f => /^rig-.*\.yml$/.test(f))
  assert.deepEqual(ci, ['rig-check.yml'])
  const kept = fs.readdirSync(path.join(ROOT, 'skills')).sort()
  assert.deepEqual(kept, ['approve', 'build', 'init', 'plan', 'pr', 'rule', 'start', 'test', 'waive'])
})

test('4a: the scripted e2e suite is out of npm test until step 5 rewrites it; the e2e unit tests stay', () => {
  const t = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts.test ?? ''
  assert.doesNotMatch(t, /test:e2e:fast/)
  assert.match(t, /test:e2e:unit/)
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /test:e2e:fast/)
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
  const named = [...read('scripts/lifecycle.ts').matchAll(/\/rig:([a-z-]+)/g)].map(m => m[1]!)
  assert.ok(named.length >= 4)
  for (const s of named) assert.ok(fs.existsSync(path.join(ROOT, 'skills', s, 'SKILL.md')), `/rig:${s} has no skill`)
})

test('4b: seven workflow skills plus the two human gates, and one agent', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')).sort(), ['approve', 'build', 'init', 'plan', 'pr', 'rule', 'start', 'test', 'waive'])
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'agents')), ['evaluator.md'])
  gone('templates/design-format.md')
  for (const s of ['start', 'plan', 'build', 'test', 'pr']) assert.doesNotMatch(read(`skills/${s}/SKILL.md`), /tier|ratchet|slice|next --json|rig:(scout|implementer|reviewer|architect)/i, s)
})
