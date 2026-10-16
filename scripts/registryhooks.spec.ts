// Integration: a registry-shaped .rig/sensors.json drives Stop, the baseline, the ratchet and frozen contract files.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

let repo: string
let n = 0
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const sensor = (id: string, cadence: string, cmd: string, extra: object = {}) => ({ id, cmd, cadence, blocks: true, count: 'exit', guide: `${id} must pass.`, ...extra })
const registry = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify(v)); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const turn = (rel = 'src/x.js') => { hook(repo, 'prompt-submit', {}); write(repo, rel, `export const x = ${++n}\n`) }
const stop = (extra: object = {}) => hook(repo, 'stop', { session_id: 's1', ...extra })
const sensorsJson = () => JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))

test('Stop runs a registry turn sensor and blocks on its failure', () => {
  registry({ sensors: [sensor('unit', 'turn', 'node -e "process.exit(3)"')] })
  turn()
  const out = JSON.parse(stop().stdout)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /fast\.unit failed \(exit 3\)/)
})

test('a non-blocking registry sensor warns instead of blocking', () => {
  registry({ sensors: [sensor('dup', 'turn', 'node -e "process.exit(1)"', { blocks: false })] })
  turn()
  const r = stop()
  assert.doesNotMatch(r.stdout, /"decision":"block"/)
  assert.match(r.stdout, /fast\.dup/)
})

test('a disabled built-in does not judge the turn', () => {
  registry({ sensors: [{ id: 'test-tamper', builtin: true, enabled: false }] })
  hook(repo, 'prompt-submit', {})
  write(repo, 'test/a.test.js', "it.only('x', () => {})\n")
  assert.doesNotMatch(stop().stdout, /test-tamper/)
})

test('baseline writes failing registry sensors as ids, and a passing known-red sensor is cleared at Stop', () => {
  registry({ sensors: [sensor('lint', 'turn', 'node -e "process.exit(3)"')] })
  assert.equal(sdlc(repo, ['baseline']).code, 0)
  assert.deepEqual(sensorsJson().knownRed, ['lint'])
  assert.ok(Array.isArray(sensorsJson().sensors), 'still a registry')
  registry({ sensors: [sensor('lint', 'turn', 'node -e ""')], knownRed: ['lint'] })
  turn()
  stop()
  assert.deepEqual(sensorsJson().knownRed, [])
  assert.equal(sensorsJson().fast, undefined, 'no legacy keys written')
})

test('a registry freezes contracts.files', () => {
  registry({ sensors: [], contracts: { files: ['api/**'] } })
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  const core = path.resolve(import.meta.dirname, 'core.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { behavioralFiles } from ${JSON.stringify(core)}; console.log(JSON.stringify(behavioralFiles('x')))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.deepEqual(JSON.parse(r.stdout), ['api/openapi.yaml'], r.stderr)
})

import os from 'node:os'

const transcript = (model: string) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-t-')), 't.jsonl')
  fs.writeFileSync(f, JSON.stringify({ type: 'assistant', message: { model } }) + '\n')
  return f
}
const failing = () => registry({ sensors: [sensor('unit', 'turn', 'node -e "process.exit(3)"')] })

test('under the final policy Stop skips command sensors', () => {
  failing()
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-opus-5-5' })
  turn()
  assert.doesNotMatch(stop().stdout, /fast\.unit/)
})

test('the transcript gives the model when no hook recorded one', () => {
  failing()
  turn()
  assert.doesNotMatch(stop({ transcript_path: transcript('claude-opus-5-5') }).stdout, /fast\.unit/)
  turn()
  assert.match(stop({ transcript_path: transcript('claude-sonnet-5-5') }).stdout, /fast\.unit failed/)
})

test('a recorded switch beats the transcript', () => {
  failing()
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-sonnet-5-5' })
  turn()
  assert.match(stop({ transcript_path: transcript('claude-opus-5-5') }).stdout, /fast\.unit failed/)
})

test('a tree judged under the final policy is judged again with commands after a switch back', () => {
  failing()
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-opus-5-5' })
  turn()
  assert.doesNotMatch(stop().stdout, /fast\.unit/)
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-sonnet-5-5' })
  assert.match(stop().stdout, /fast\.unit failed/)
})

test('the final policy still blocks secrets at Stop', () => {
  registry({ sensors: [] })
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-opus-5-5' })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/k.js', 'export const k = "AKIAABCDEFGHIJKLMNOP"\n')
  const out = JSON.parse(stop().stdout)
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /secrets/)
})

test('an edit sensor runs on the edited source file and blocks with its guide and rerun command', () => {
  registry({ sensors: [sensor('lint', 'edit', 'node -e "process.exit(4)" {files}')] })
  turn()
  const r = hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'src/x.js') } })
  assert.equal(r.code, 2)
  assert.match(r.stderr, /lint: lint must pass\./)
  assert.match(r.stderr, /rerun: node -e "process\.exit\(4\)" src\/x\.js/)
})

test('edit sensors skip non-source files, advisory sensors and the final policy', () => {
  registry({ sensors: [sensor('lint', 'edit', 'node -e "process.exit(4)" {files}'), sensor('soft', 'edit', 'node -e "process.exit(5)" {files}', { blocks: false })] })
  turn('docs/notes.md')
  assert.equal(hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'docs/notes.md') } }).code, 0)
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-opus-5-5' })
  turn()
  assert.equal(hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'src/x.js') } }).code, 0)
})

test('model-role warns about the main thread and about an evaluator on the wrong model', () => {
  registry({ sensors: [] })
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-haiku-5-5' })
  turn()
  assert.match(stop().stdout, /model-role[\s\S]*claude-haiku-5-5/)
  hook(repo, 'model-switch', { session_id: 's1', to_model: 'claude-sonnet-5-5' })
  hook(repo, 'agent-launch', { session_id: 's1', tool_use_id: 't1', tool_input: { subagent_type: 'rig:evaluator', model: 'sonnet' } })
  hook(repo, 'agent-done', { session_id: 's1', tool_use_id: 't1', tool_response: { resolvedModel: 'claude-sonnet-5-5' } })
  turn()
  assert.match(stop().stdout, /rig:evaluator ran on claude-sonnet-5-5/)
})

test('SessionStart records the model and states the policy', () => {
  registry({ sensors: [] })
  const ctx = JSON.parse(hook(repo, 'session-start', { session_id: 's1', source: 'startup', model: 'claude-opus-5-5' }).stdout).hookSpecificOutput.additionalContext
  assert.match(ctx, /rig policy: final checks for claude-opus-5-5 \(build on sonnet, evaluate on opus\)/)
  const state = JSON.parse(fs.readFileSync(path.join(repo, '.rig/state/model.json'), 'utf8'))
  assert.equal(state.sessions.s1.model, 'claude-opus-5-5')
})

test('hooks.json registers the model and agent hooks, and gives PostToolUse room for edit sensors', () => {
  const h = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../hooks/hooks.json'), 'utf8')).hooks
  const cmds = (ev: string, matcher?: string) => (h[ev] ?? []).filter((g: { matcher?: string }) => matcher === undefined || g.matcher === matcher).flatMap((g: { hooks: { command: string; timeout: number }[] }) => g.hooks)
  assert.match(cmds('PostModelSwitch')[0]?.command ?? '', /hook model-switch$/)
  assert.match(cmds('PreToolUse', 'Agent')[0]?.command ?? '', /hook agent-launch$/)
  assert.match(cmds('PostToolUse', 'Agent')[0]?.command ?? '', /hook agent-done$/)
  assert.equal(cmds('PostToolUse', 'Write|Edit|MultiEdit')[0]?.timeout, 75)
})

import { runDeclared } from './check.ts'
import { registryConfig, parseRegistry } from './registry.ts'

test('an advisory sensor never blocks, even when it times out or the budget runs out', () => {
  const r = parseRegistry(JSON.stringify({ sensors: [sensor('slow', 'turn', 'node -e "setTimeout(() => {}, 5000)"', { blocks: false }), sensor('later', 'turn', 'node -e ""', { blocks: false })] })).registry
  const findings = runDeclared('fast', registryConfig(r).config, null, 300)
  assert.ok(findings.length >= 1)
  assert.ok(findings.every(f => f.severity === 'warn'), JSON.stringify(findings))
})

test('a passing advisory sensor leaves a hand-formatted registry byte-for-byte alone', () => {
  const text = '{\n    "sensors": [ { "id": "dup", "cmd": "node -e \\"\\"", "cadence": "turn", "blocks": false, "count": "exit", "guide": "g" } ]\n}\n'
  write(repo, '.rig/sensors.json', text); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  turn()
  stop()
  assert.equal(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'), text)
})

test('contract commands with no files freeze .rig/contracts, as the check config does', () => {
  registry({ sensors: [], contracts: { validate: 'v' } })
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\n')
  const core = path.resolve(import.meta.dirname, 'core.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { behavioralFiles } from ${JSON.stringify(core)}; console.log(JSON.stringify(behavioralFiles('x')))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.deepEqual(JSON.parse(r.stdout), ['.rig/contracts/api.yaml'], r.stderr)
})

test('edit sensors share one budget, so slow ones cannot outrun the hook', () => {
  registry({ sensors: [sensor('a', 'edit', 'node -e "setTimeout(() => {}, 4000)" {files}'), sensor('b', 'edit', 'node -e "setTimeout(() => {}, 4000)" {files}')] })
  turn()
  const started = Date.now()
  const r = sdlc(repo, ['hook', 'post-edit'], { input: JSON.stringify({ session_id: 's1', tool_input: { file_path: path.join(repo, 'src/x.js') } }), env: { RIG_EDIT_BUDGET_MS: '800' } })
  assert.ok(Date.now() - started < 3500, `took ${Date.now() - started} ms`)
  assert.equal(r.code, 2)
  assert.match(r.stderr, /b: not run, the edit sensors' 1 s budget ran out/)
})

test('a model switch with no session id is still read back', () => {
  failing()
  hook(repo, 'model-switch', { to_model: 'claude-opus-5-5' })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/x.js', `export const x = ${++n}\n`)
  assert.doesNotMatch(hook(repo, 'stop', {}).stdout, /fast\.unit/)
})

test('a Write/Edit that weakens a committed registry is labelled harness tamper at Stop', () => {
  registry({ sensors: [sensor('unit', 'turn', 'node -e ""')] })
  hook(repo, 'prompt-submit', {})
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [sensor('unit', 'turn', 'node -e ""', { blocks: false })] }))
  hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, '.rig/sensors.json') } })
  write(repo, 'src/x.js', `export const x = ${++n}\n`)
  assert.match(stop().stdout, /harness-tamper[\s\S]*sensor unit no longer blocks/)
})
