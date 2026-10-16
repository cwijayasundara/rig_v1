// Model routing: the role and the tier pick model and effort (scripts/routing.ts); full IDs are pinned to 5.5.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { makeRepo, gitIn, write } from './testkit.ts'
import { TABLE } from './routing.ts'
const out = (model: string, effort: string): string => `model=claude-${model}-5-5\neffort=${effort}`

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the settings template pins every alias to its 5.5 model and gives unrouted subagents Sonnet 5.5', () => {
  const env = (JSON.parse(read('templates/settings.json')) as { env: Record<string, string> }).env
  assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-5-5')
  assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-5-5')
  assert.equal(env.ANTHROPIC_DEFAULT_OPUS_MODEL, 'claude-opus-5-5')
  assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'claude-sonnet-5-5')
})

test('the settings template keeps subagents in the foreground, so a headless turn never ends while one runs', () => {
  const env = (JSON.parse(read('templates/settings.json')) as { env: Record<string, string> }).env
  assert.equal(env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1')
})

test('the scout runs on Haiku 5.5 by full ID, like the other agents', () => {
  assert.match(read('agents/scout.md'), /^model: claude-haiku-5-5$/m)
})

const MODELS = '**Models:** read `routes` from `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts next $0 --json` and pass that role\'s `model` and `effort` on every launch: `rig:architect` (architect), `rig:implementer` (implementer), `rig:reviewer` (`slice-review` in build, `reviewer` elsewhere). A `main` route means draft it in this thread. After a failed round, run that command again before the fix launch: the implementer route can rise.'

// Chart skills work on no change, so their routes come from `chart routes` (chartcheck.ts), not `next <slug>`.
const CHART = ['chart', 'architecture', 'decompose', 'testplan']
const CHART_MODELS = '**Models:** read `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart routes --json` and pass its `architect` route (`model` and `effort`) to the architecture and intents launch and its `testplan` route to the test plan launch, `rig:architect` in both. A `main` route means draft it in this thread.'

test('every skill that launches architect, implementer or reviewer passes its role route, and none hardcodes one', () => {
  for (const name of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const text = read(`skills/${name}/SKILL.md`)
    if (/rig:(architect|implementer|reviewer)/.test(text)) assert.ok(text.includes(CHART.includes(name) ? CHART_MODELS : MODELS), `${name} lacks the Models line`)
    assert.doesNotMatch(text, /model: (sonnet|opus|haiku)\b/, `${name} hardcodes a model`)
  }
})

test('the researcher is a read-only Haiku agent that fetches docs', async () => {
  const text = read('agents/researcher.md')
  assert.match(text, /^model: claude-haiku-5-5$/m)
  assert.match(text, /^effort: low$/m)
  const { TABLE } = await import('./routing.ts')
  assert.deepEqual(TABLE.researcher.S, { model: 'haiku', effort: 'low' })
  assert.match(text, /^tools: WebFetch, WebSearch$/m)
})

test('the scout and triage files match their pinned routes', async () => {
  const { TABLE } = await import('./routing.ts')
  const scout = read('agents/scout.md')
  assert.deepEqual(TABLE.scout.S, { model: 'haiku', effort: 'low' })
  assert.match(scout, /^model: claude-haiku-5-5$/m)
  assert.match(scout, /^effort: low$/m)
})

test('design and spec send external docs questions to one researcher', () => {
  for (const s of ['design', 'spec']) assert.match(read(`skills/${s}/SKILL.md`), /one `rig:researcher`/, s)
})

test('pr-review hands the reviewer and referee routes to the review workflow', () => {
  assert.match(read('skills/pr-review/SKILL.md'), /routes: \{reviewer: routes\.reviewer, referee: routes\.referee\}/)
})

test('tier S builds through a Haiku implementer; tier S and M review through rig:evaluator, not code-review', () => {
  const build = read('skills/build/SKILL.md')
  assert.doesNotMatch(build, /Tier S, and tier M with/, 'tier S no longer builds inline')
  assert.match(build, /Tier M with ≤ 3 slices and ≤ 8 files: do it yourself/)
  assert.doesNotMatch(read('skills/start/SKILL.md'), /Tier S builds inline with no subagents/)
  assert.doesNotMatch(read('skills/start/SKILL.md'), /\*\*Models:\*\*/, 'start passes no slug, so it carries no Models line')
  const review = read('skills/pr-review/SKILL.md')
  assert.match(review, /Tier S and M: one `rig:evaluator`/)
  assert.doesNotMatch(review, /Tier S and M: one `code-review`/)
})

// The model-by-tier step, cut from the workflow between its markers and run in a real git repo.
function pickModel(setup: (repo: string) => void): string {
  const yml = read('templates/rig-review.yml')
  const block = yml.slice(yml.indexOf('# model-by-tier:start'), yml.indexOf('# model-by-tier:end'))
  assert.ok(block, 'the workflow carries the model-by-tier markers')
  const script = block.split('\n').map(l => l.replace(/^ {10}/, '')).join('\n')
  const repo = makeRepo()
  gitIn(repo, 'update-ref', 'refs/remotes/origin/main', 'main')
  gitIn(repo, 'checkout', '-q', '-b', 'pr')
  setup(repo)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr', '--allow-empty')
  const outFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-')), 'out')
  execFileSync('bash', ['-e', '-c', script], { cwd: repo, env: { ...process.env, BASE: 'main', GITHUB_OUTPUT: outFile } })
  return fs.readFileSync(outFile, 'utf8').trim()
}
// intent.md defaults to the floor (S feature), so the ratchet decides unless a case raises the intent.
const change = (slug: string, ratchet: string, intent = '---\nslug: x\ntype: feature\ntier: S\n---\n# x\n') => (repo: string) => {
  write(repo, `.rig/changes/${slug}/ratchet.json`, ratchet)
  if (intent) write(repo, `.rig/changes/${slug}/intent.md`, intent)
}

test('CI review model: S haiku, M sonnet, L opus', () => {
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}')), out('sonnet', 'medium'))
  assert.equal(pickModel(change('a', '{"tier":"M","type":"refactor"}')), out('sonnet', 'high'))
  assert.equal(pickModel(change('a', '{"tier":"L","type":"feature"}')), out('opus', 'high'))
})

test('CI review model fails closed to Opus: greenfield, no change folder, two folders, unreadable ratchet', () => {
  assert.equal(pickModel(change('a', '{"tier":"S","type":"greenfield"}')), out('opus', 'high'))
  assert.equal(pickModel(repo => write(repo, 'src/x.js', 'x\n')), out('opus', 'high'))
  assert.equal(pickModel(repo => { change('a', '{"tier":"S"}')(repo); change('b', '{"tier":"S"}')(repo) }), out('opus', 'high'))
  assert.equal(pickModel(change('a', 'not json')), out('opus', 'high'))
})

test('CI review model takes the stricter of intent.md and ratchet.json, as effective() does', () => {
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '---\ntype: feature\ntier: L\n---\n')), out('opus', 'high'))
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '---\ntype: greenfield\ntier: S\n---\n')), out('opus', 'high'))
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '---\ntype: feature\ntier: S\n---\n')), out('sonnet', 'medium'))
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '---\ntype: feature\ntier: "M"\n---\n')), out('sonnet', 'high'))
})

test('CI review model fails closed on the intent: missing intent.md, no tier line, or a tier only in the body', () => {
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '')), out('opus', 'high'))
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '---\ntype: feature\n---\n')), out('opus', 'high'))
  assert.equal(pickModel(change('a', '{"tier":"S","type":"feature"}', '# no frontmatter\ntier: S\n')), out('opus', 'high'))
})

test('the CI review passes the picked model to Claude', () => {
  assert.match(read('templates/rig-review.yml'), /--model \$\{\{ steps\.model\.outputs\.model \}\}/)
})

test('the CI review picker matches the routing table for the reviewer', () => {
  const block = read('templates/rig-review.yml')
  for (const tier of ['S', 'M', 'L'] as const) {
    const r = TABLE.reviewer[tier] as { model: string; effort: string }
    const line = tier === 'L' ? `model=claude-${r.model}-5-5; effort=${r.effort}` : `${tier}) model=claude-${r.model}-5-5; effort=${r.effort} ;;`
    assert.ok(block.includes(line), `rig-review.yml lacks "${line}"`)
  }
  assert.match(block, /--effort \$\{\{ steps\.model\.outputs\.effort \}\}/)
})

test('build sends tier L findings to a fresh implementer when its route changed', () => {
  assert.match(read('skills/build/SKILL.md'), /differs[^\n]*launch a fresh `rig:implementer`[^\n]*otherwise[^\n]*same implementer/)
})

test('the evaluator is a read-only Opus 5.5 agent that pr-review uses for tier S and M', () => {
  const text = read('agents/evaluator.md')
  const front = text.split('---')[1] ?? ''
  assert.match(front, /^name: evaluator$/m)
  assert.match(front, /^model: claude-opus-5-5$/m)
  assert.doesNotMatch(front, /\b(Edit|Write|MultiEdit|NotebookEdit)\b/)
  assert.match(text, /verdict: pass \| changes-needed/)
  assert.match(read('skills/pr-review/SKILL.md'), /Tier S and M: one `rig:evaluator` on the branch diff/)
})
