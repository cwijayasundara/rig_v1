import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transcriptFacts, findingCount } from './livecheck.mjs'

const ev = (type, content, extra = {}) => JSON.stringify({ type, message: { content }, ...extra })
const SKILLS = ['chart', 'start', 'approve']

test('transcriptFacts counts questions, main-thread launches and hyphen command names, with direct tools', () => {
  const f = transcriptFacts([
    ev('assistant', [{ type: 'tool_use', name: 'Skill', input: { skill: 'rig:chart' } }]),
    ev('assistant', [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }]),
    ev('assistant', [{ type: 'tool_use', name: 'Agent', input: {} }]),
    ev('assistant', [{ type: 'tool_use', name: 'Agent', input: {} }], { parent_tool_use_id: 'toolu_1' }),
    ev('assistant', [{ type: 'text', text: 'Next: /rig-approve chart-0, then /rig:start x. See .github/workflows/rig-check.yml and /tmp/rig-app-1.' }]),
    ev('user', [{ type: 'tool_result', content: [{ type: 'text', text: '  ✗ committed: x\nchart-0 goal: NOT MET (1 of 15 lines fail)' }] }]),
    ev('user', [{ type: 'tool_result', content: 'chart-0 goal: MET' }]),
    'not json',
  ].join('\n'), SKILLS)
  assert.deepEqual(f, { questions: 1, launches: 1, hyphen: ['/rig-approve'], skills: ['rig:chart'], goal: ['chart-0 goal: NOT MET', 'chart-0 goal: MET'] })
})

test('transcriptFacts reads the same facts out of Code Mode scripts', () => {
  const f = transcriptFacts(ev('assistant', [{ type: 'tool_use', name: 'REPL', input: { code: 'await tools.AskUserQuestion({questions: []}); const a = tools.Agent({prompt: "x"}); await tools.Agent({prompt: "y"})' } }]), SKILLS)
  assert.equal(f.questions, 1)
  assert.equal(f.launches, 2)
})

test('findingCount counts the items under ## Findings only', () => {
  assert.equal(findingCount('verdict: pass\n## Findings\n1. [severity: high] a → fixed (confirmed)\n- b\n## Deferred\n- none\n'), 2)
  assert.equal(findingCount('verdict: pass\n## Findings\n\n## Deferred\n- c\n'), 0)
  assert.equal(findingCount(''), 0)
})
