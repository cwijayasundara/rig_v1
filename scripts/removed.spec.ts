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
  for (const [cmd, hint] of [['approve', '<slug> <design|spec|plan|impact|budget|full-route|tier S|M|L [type]>'], ['waive', '<sensor> <file|*> <reason>']] as const) {
    const text = read(`skills/${cmd}/SKILL.md`)
    assert.match(text, /^disable-model-invocation: true$/m)
    assert.ok(text.includes(`argument-hint: ${hint}\n`), `${cmd} argument-hint`)
    assert.ok(text.includes(`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "\${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" ${cmd} '$ARGUMENTS'`), `${cmd} command`)
  }
})

test('4a: a typed /rig:approve records one row even when the skill runs the same approve', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo design' })
  sdlc(repo, ['approve', 'demo design'], { env: { SDLC_HUMAN: '1' } }) // what the skill's !`...` line runs: one quoted argument
  const rows = fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n')
  assert.equal(rows.length, 1)
})

test('4a: chart, watch, metrics, scorecard, points and timing are gone', () => {
  gone(...['chart', 'chartcheck', 'watch', 'metrics', 'scorecard', 'points', 'timing'].map(m => `scripts/${m}.ts`), 'skills/chart', 'skills/decompose', 'skills/metrics', 'templates/prd-format.md', 'templates/rig-watch.yml', 'templates/rig-triage.yml', 'templates/rig-rehearse.yml')
  for (const c of ['chart', 'watch', 'metrics', 'scorecard', 'points']) assert.ok(!commands().includes(c), c)
  assert.ok(commands().includes('inbox'), 'the intent inbox stays')
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

test('4a: new --source still refuses an intent whose dependency has not shipped, with no chart involved', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/intent/one.md', '---\nstatus: accepted\n---\n# One\n')
  write(repo, '.rig/intent/two.md', '---\nstatus: accepted\ndepends: one\n---\n# Two\n')
  const r = sdlc(repo, ['new', 'two', '--type', 'feature', '--tier', 'M', '--source', '.rig/intent/two.md'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr + r.stdout, /blocked by: one/)
})
