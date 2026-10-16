// Guards the three skills adapted from Matt Pocock's engineering collection (MIT):
// prototype and codebase-design as new rig skills, diagnosing-bugs folded into diagnose.
// Each test names the behaviour that would regress if the skill text drifted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string): string => {
  const file = path.resolve(import.meta.dirname, '..', rel)
  assert.ok(fs.existsSync(file), `${rel} must exist`)
  return fs.readFileSync(file, 'utf8')
}

test('diagnose: no hypothesizing before a tight red feedback loop, with tightening, flakes and redaction', () => {
  const skill = read('skills/diagnose/SKILL.md')
  assert.match(skill, /feedback loop/i)
  assert.match(skill, /one command/i)
  assert.match(skill, /already run|have run/i)
  assert.ok(skill.toLowerCase().indexOf('feedback loop') < skill.toLowerCase().indexOf('hypotheses'), 'the loop comes before hypotheses')
  assert.match(skill, /tighten/i)
  assert.match(skill, /deterministic/i)
  assert.match(skill, /reproduction rate|reproduce.*rate/i)
  assert.match(skill, /REDACTED|redact/i)
  for (const way of [/bisect/i, /differential/i, /replay/i, /fuzz|property/i]) assert.match(skill, way)
  assert.match(skill, /cannot build a loop|no loop/i)
  assert.match(skill, /raised reproduction rate|reproduction rate.*debuggable/)
  assert.doesNotMatch(skill, /fails for the reported reason, deterministically\. A failing/)
  assert.match(skill, /\/rig:approve \$0 plan/)
  assert.match(skill, /Record \(tier S and M\)/)
  assert.match(skill, /\.rig\/evals\/incident-<yyyymmdd>-<class>\.json/)
  assert.match(skill, /sdlc\.ts verify \$0/)
})

test('leak guard: .rig/.gitignore keeps prototype code out of any commit', () => {
  assert.match(read('scripts/core.ts'), /'changes\/\*\/prototype\/'/)
})

test('wiring: start routes code-needing spikes to prototype; design and reviewer cite codebase-design', () => {
  assert.match(read('skills/start/SKILL.md'), /skill prototype/)
  assert.match(read('skills/start/SKILL.md'), /needs a runnable answer/)
  assert.match(read('skills/design/SKILL.md'), /codebase-design/)
  assert.match(read('agents/reviewer.md'), /codebase-design/)
})
