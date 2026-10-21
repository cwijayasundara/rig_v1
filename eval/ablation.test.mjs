import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { components, loadTags, tagProblems, applyAblation, verdict, MIN_RUNS } from './ablation.mjs'
import { listText } from './ablate.mjs'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { setupRig } from './setup.mjs'
import { ARMS } from './arms.mjs'

test('every sensor, skill, agent and hook event has a weakness tag, and no tag outlives its component', () => {
  assert.deepEqual(tagProblems(loadTags(), components()), [])
  const live = components()
  for (const kind of ['sensor', 'skill', 'agent', 'hook']) assert.ok(live.some(c => c.startsWith(`${kind}:`)), kind)
})

test('tagProblems names an untagged component, an orphaned tag, an empty weakness and an unexplained exemption', () => {
  const p = tagProblems([{ id: 'sensor:x', weakness: 'models do a thing', ablatable: true }, { id: 'sensor:gone', weakness: 'models do a thing', ablatable: true }, { id: 'skill:y', weakness: 'short', ablatable: true }, { id: 'sensor:z', weakness: 'models do another thing', ablatable: false }], ['sensor:x', 'skill:y', 'sensor:z', 'agent:new'])
  assert.deepEqual(p.sort(), ['agent:new has no weakness tag in eval/ablation-tags.json', 'sensor:gone is tagged but no longer exists', 'sensor:z is not ablatable but says no why', 'skill:y has no real weakness text'].sort())
})

test('the components rig always needs, and the sensors that cannot be disabled, are not ablatable', () => {
  const by = Object.fromEntries(loadTags().map(t => [t.id, t]))
  for (const id of ['sensor:secrets', 'sensor:harness-tamper', 'skill:start', 'skill:plan', 'skill:approve', 'skill:build', 'skill:test', 'skill:pr']) assert.equal(by[id].ablatable, false, id)
  for (const id of ['sensor:size', 'skill:app', 'agent:evaluator', 'hook:Stop']) assert.equal(by[id].ablatable, true, id)
})

function rigSandbox() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ablate-test-'))
  const sb = createSandbox({ name: 'a', out })
  return setupRig(sb, ARMS.find(a => a.id === 'haiku-rig'), { dry: true }).then(() => sb)
}

test('applyAblation removes exactly the named component from an installed rig: a sensor is disabled, a skill, an agent and a hook event are gone', async () => {
  const sb = await rigSandbox()
  assert.ok(sb.exists('.claude/skills/rig-wiki/SKILL.md') && sb.exists('.claude/agents/rig-evaluator.md'))
  const hooksBefore = Object.keys(JSON.parse(sb.read('.claude/settings.json')).hooks ?? {})
  assert.ok(hooksBefore.includes('Stop'), 'the vendored settings carry the hook events')
  applyAblation(sb, 'skill:wiki')
  assert.ok(!sb.exists('.claude/skills/rig-wiki') && sb.exists('.claude/skills/rig-rule/SKILL.md'), 'only that skill')
  applyAblation(sb, 'agent:evaluator')
  assert.ok(!sb.exists('.claude/agents/rig-evaluator.md') && sb.exists('.claude/agents/rig-architect.md'))
  applyAblation(sb, 'hook:Stop')
  const after = Object.keys(JSON.parse(sb.read('.claude/settings.json')).hooks ?? {})
  assert.deepEqual(after, hooksBefore.filter(h => h !== 'Stop'))
  applyAblation(sb, 'sensor:size')
  const reg = JSON.parse(sb.read('.rig/sensors.json'))
  assert.equal(reg.sensors.find(s => s.id === 'size').enabled, false)
  assert.equal(JSON.parse(sb.sdlc(['status', '--json']).stdout).initialised, true, 'rig still runs')
  assert.equal(sb.git('status', '--porcelain'), '', 'every ablation is committed')
  assert.throws(() => applyAblation(sb, 'nonsense:x'), /unknown component kind/)
})

const pass = (over = {}) => ({ component: 'sensor:size', model: 'm', date: '2026-10-01', withRuns: 3, withAccepted: 3, withoutRuns: 3, withoutAccepted: 3, ...over })

test('verdict: keep while removing it hurts, candidate after one pass with no lift, cut-eligible after two, never on too few runs', () => {
  assert.deepEqual(verdict([], 'sensor:size'), { state: 'untested', lift: null })
  assert.equal(verdict([pass({ withoutAccepted: 1 })], 'sensor:size').state, 'keep')
  assert.equal(verdict([pass()], 'sensor:size').state, 'candidate', 'no lift once')
  assert.equal(verdict([pass(), pass({ date: '2026-11-01', model: 'm2' })], 'sensor:size').state, 'cut-eligible')
  assert.equal(verdict([pass(), pass({ date: '2026-11-01', withoutAccepted: 0 })], 'sensor:size').state, 'keep', 'it earned its place the second time: the streak resets')
  assert.equal(verdict([pass(), pass({ date: '2026-11-01', withRuns: 2, withoutRuns: 2 })], 'sensor:size').state, 'inconclusive', `a pass under ${MIN_RUNS} runs per arm proves nothing`)
  assert.equal(verdict([pass({ withAccepted: 1, withoutAccepted: 3 }), pass({ date: '2026-11-01' })], 'sensor:size').state, 'cut-eligible', 'removing it helped once and did not hurt once: no lift twice')
  assert.equal(verdict([pass()], 'skill:app').state, 'untested', 'history is per component')
})

test('ablate.mjs: --check passes on this repo, --list shows each component with its state, and a dry ablation arm runs end to end at $0', () => {
  const run = (...a) => spawnSync('node', ['--disable-warning=ExperimentalWarning', path.join(import.meta.dirname, 'ablate.mjs'), ...a], { encoding: 'utf8' })
  const check = run('--check')
  assert.equal(check.status, 0, check.stdout + check.stderr)
  assert.match(check.stdout, /ablation tags cover all \d+ components/)
  const list = run('--list').stdout
  assert.match(list, /sensor:size\s+untested\s+models grow god files/)
  assert.match(list, /sensor:secrets\s+not ablatable/)
  const dry = run('--component', 'sensor:size', '--runs', '1', '--dry')
  assert.equal(dry.status, 0, dry.stdout + dry.stderr)
  assert.match(dry.stdout, /haiku-rig-minus-sensor-size #1: accepted/)
  assert.match(dry.stdout, /nothing recorded/)
  assert.equal(run('--component', 'sensor:secrets').status, 2)
  assert.equal(run('--component', 'skill:nope').status, 2)
  assert.match(listText(loadTags(), []), /sensor:size/)
})
