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

test('prototype: a spike skill that answers one question with throwaway code and keeps only the verdict', () => {
  const skill = read('skills/prototype/SKILL.md')
  assert.match(skill, /^name: prototype$/m)
  assert.match(skill, /spike/)
  assert.match(skill, /throwaway/i)
  assert.match(skill, /one question|single question/i)
  assert.match(skill, /logic/i)
  assert.match(skill, /UI/)
  assert.match(skill, /notes\.md/)
  assert.match(skill, /verdict/i)
  assert.match(skill, /^effort: /m)
  assert.match(skill, /at least three/i)
  assert.match(skill, /PROTOTYPE - throwaway/)
  assert.match(skill, /no edits to production files/i)
  assert.match(skill, /stays uncommitted/)
  assert.match(skill, /never list it in a later change's `## Files`/)
  assert.match(skill, /never copy it into production/)
  assert.doesNotMatch(skill, /merge the prototype|ship the prototype/i)
})

test('codebase-design: model-invoked vocabulary layer pointing at rig artifacts, not Matt tracker files', () => {
  const skill = read('skills/codebase-design/SKILL.md')
  assert.match(skill, /^name: codebase-design$/m)
  assert.match(skill, /^effort: /m)
  assert.match(skill, /earn its existence/)
  assert.doesNotMatch(skill, /disable-model-invocation/)
  for (const term of ['Module', 'Interface', 'Depth', 'Seam', 'Adapter', 'Leverage', 'Locality']) {
    assert.match(skill, new RegExp(`\\*\\*${term}\\*\\*`), `defines ${term}`)
  }
  assert.match(skill, /deletion test/i)
  assert.match(skill, /interface is the test surface/i)
  assert.match(skill, /\.rig\/product\/architecture\.md/)
  assert.match(skill, /\.rig\/product\/adr\//)
  assert.doesNotMatch(skill, /GLOSSARY\.md|setup-matt-pocock-skills|issue tracker/)
})

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
