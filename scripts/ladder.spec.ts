// The promotion ladder (harness readiness 1.2): the strongest fix that fits, evidence for every promotion, exceptions that end.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ladderFor, mineCandidates } from './learnmine.ts'
import { replayLayers } from './learnreplay.ts'
import { proposalProblems } from './learn.ts'
import { sha } from './core.ts'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

test('the ladder picks the strongest rung that fits the category, and a waiver is a lesson until a person says otherwise', () => {
  assert.deepEqual(['coupling', 'responsibility', 'abstraction'].map(k => ladderFor('finding', k).rung), ['architecture', 'architecture', 'architecture'])
  assert.equal(ladderFor('finding', 'duplication').rung, 'ratchet')
  assert.deepEqual(['tests', 'contract', 'data'].map(k => ladderFor('finding', k).rung), ['test', 'test', 'test'])
  assert.deepEqual(['correctness', 'security'].map(k => ladderFor('finding', k).rung), ['rule', 'rule'])
  assert.equal(ladderFor('finding', 'something-new').rung, 'lesson')
  assert.equal(ladderFor('waiver', 'size').rung, 'lesson')
  assert.match(ladderFor('finding', 'coupling').how, /## Layers[\s\S]*learn replay --layers/)
})

// Two shipped changes whose reviews both flag the same category, and a clean third.
function history(imports: Record<string, string>): string {
  const repo = makeRepo()
  for (const [slug, body] of Object.entries(imports)) {
    write(repo, `src/${slug}/x.js`, body)
    write(repo, `.rig/changes/${slug}/pr.md`, 'pr\n')
    write(repo, `.rig/changes/${slug}/review.md`, `## Findings\n- [severity: high] [category: coupling] src/${slug}/x.js:1: the domain reaches into infra → inject it\n`)
    gitIn(repo, 'add', '-A')
    gitIn(repo, 'commit', '-qm', `ship ${slug}`)
  }
  return repo
}
const BAD = "import { db } from '../infra/db.js'\n"
const LAYERS = '# Proposed\n\n```rig-layers\nlayer domain src/**\nlayer infra infra/**\n```\n'

test('mine attaches the strongest fix to a recurring finding', () => {
  const repo = history({ 'cart-add': BAD, 'cart-remove': BAD })
  const c = mineCandidates(repo).find(x => x.key === 'coupling')
  assert.ok(c)
  assert.equal(c?.rung, 'architecture')
  assert.match(sdlc(repo, ['learn', 'mine']).stdout, /strongest fix that fits: architecture: make the bad dependency impossible/)
})

test('replayLayers: a layer rule that catches exactly the changes that earned it passes; one that also catches another change, or is invalid, does not', () => {
  const block = '```rig-layers\nlayer domain src/*/**\nlayer infra infra/**\n```\n'
  const repo = history({ 'cart-add': BAD, 'cart-remove': BAD, 'cart-pay': 'export const ok = 1\n' })
  const all = ['cart-add', 'cart-remove', 'cart-pay']
  assert.equal(replayLayers(repo, block, ['cart-add', 'cart-remove'], all).error, undefined)
  const r = replayLayers(repo, block, ['cart-add', 'cart-remove'], all)
  assert.deepEqual([r.pass, r.firesOn], [true, ['cart-add', 'cart-remove']])
  const wider = replayLayers(repo, '```rig-layers\nlayer domain src/*/**\nlayer infra other/**\n```\n', ['cart-add', 'cart-remove'], all)
  assert.equal(wider.pass, false)
  assert.deepEqual(wider.missed.sort(), ['cart-add', 'cart-remove'])
  assert.match(replayLayers(repo, 'no block here', ['cart-add', 'cart-remove'], all).error ?? '', /no ```rig-layers block/)
  assert.equal(replayLayers(repo, block, ['cart-add'], all).pass, false, 'at least two changes must have earned it')
})

test('a proposal line is presentable only with a passing replay of exactly the file it proposes', () => {
  const files = new Map<string, string>()
  const read = (rel: string): string | null => files.get(rel) ?? null
  const rule = '{"id":"r"}'
  const line = 'PROMOTE L7: no-bare-error'
  assert.deepEqual(proposalProblems('ADD x: a lesson\nMERGE L1 L2: one\nRETIRE L3: old', read), [], 'only promotions need evidence')
  assert.match(proposalProblems(line, read)[0] ?? '', /PROMOTE L7: rule-L7\.json is not in \.rig\/learn\//)
  files.set('.rig/learn/rule-L7.json', rule)
  assert.match(proposalProblems(line, read)[0] ?? '', /no replay on record: run `learn replay \.rig\/learn\/rule-L7\.json --earned/)
  files.set('.rig/learn/replay-rule-L7.json', JSON.stringify({ file: 'rule-L7.json', sha: sha(rule), pass: false }))
  assert.match(proposalProblems(line, read)[0] ?? '', /its replay failed/)
  files.set('.rig/learn/replay-rule-L7.json', JSON.stringify({ file: 'rule-L7.json', sha: sha(rule), pass: true }))
  assert.deepEqual(proposalProblems(`- ${line}`, read), [])
  files.set('.rig/learn/rule-L7.json', '{"id":"r","pattern":"loosened"}')
  assert.match(proposalProblems(line, read)[0] ?? '', /changed since its replay; replay it again/)
  files.set('.rig/learn/layers-L8.md', LAYERS)
  assert.match(proposalProblems('LAYER L8: domain stays pure', read)[0] ?? '', /run `learn replay --layers \.rig\/learn\/layers-L8\.md/)
})

test('learn replay writes the evidence, learn proposal and learn check refuse a promotion without it, and a changed file invalidates it', () => {
  const repo = history({ 'cart-add': BAD, 'cart-remove': BAD, 'cart-pay': 'export const ok = 1\n' })
  write(repo, '.rig/learn/layers-L8.md', '```rig-layers\nlayer domain src/*/**\nlayer infra infra/**\n```\n')
  write(repo, '.rig/learn/proposal.md', 'LAYER L8: the domain does not import infra\nADD k: something\n')
  const before = sdlc(repo, ['learn', 'proposal'])
  assert.equal(before.code, 1)
  assert.match(before.stdout, /LAYER L8: no replay on record/)
  assert.equal(sdlc(repo, ['learn', 'check']).code, 1, 'learn check carries the same gate')
  const replay = sdlc(repo, ['learn', 'replay', '--layers', '.rig/learn/layers-L8.md', '--earned', 'cart-add,cart-remove'])
  assert.equal(replay.code, 0, replay.stdout)
  assert.ok(fs.existsSync(path.join(repo, '.rig/learn/replay-layers-L8.json')))
  assert.equal(sdlc(repo, ['learn', 'proposal']).code, 0)
  fs.appendFileSync(path.join(repo, '.rig/learn/layers-L8.md'), '\nedited after the replay\n')
  const after = sdlc(repo, ['learn', 'proposal'])
  assert.equal(after.code, 1)
  assert.match(after.stdout, /changed since its replay/)
})

// ---------- exceptions end ----------
const HUMAN = { SDLC_HUMAN: '1' }
function waivedRepo(): string {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'wv', '--type', 'feature'])
  hook(repo, 'prompt-submit', {})
  write(repo, 'test/a.test.js', "it.skip('adds', () => {})\n")
  return repo
}
const rows = (repo: string): { expires?: string; at: string }[] => fs.readFileSync(path.join(repo, '.rig/waivers.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
const stop = (repo: string): { blocks: unknown[]; waived: number } => JSON.parse(sdlc(repo, ['check', '--at', 'stop', '--json']).stdout)

test('a waiver records its expiry (30 days by default, --days to change it, never over 180) and says so', () => {
  const repo = waivedRepo()
  const a = sdlc(repo, ['waive', 'test-tamper', '*', 'flaky', '--slug', 'wv'], { env: HUMAN })
  assert.match(a.stdout, /expires in 30 days/)
  const b = sdlc(repo, ['waive', 'test-tamper', '*', 'short', '--slug', 'wv', '--days', '1'], { env: HUMAN })
  assert.match(b.stdout, /expires in 1 day\)/)
  const [r1, r2] = rows(repo)
  assert.ok(Math.abs(Date.parse(r1?.expires ?? '') - (Date.now() + 30 * 86_400_000)) < 60_000)
  assert.ok(Math.abs(Date.parse(r2?.expires ?? '') - (Date.now() + 86_400_000)) < 60_000)
  for (const bad of ['0', '181', '2.5', 'soon']) {
    const r = sdlc(repo, ['waive', 'test-tamper', '*', 'x', '--slug', 'wv', '--days', bad], { env: HUMAN })
    assert.equal(r.code, 1, bad)
    assert.match(r.stderr, /--days must be a whole number from 1 to 180/)
  }
  assert.match(sdlc(repo, ['sensors']).stdout, /expires in/)
})

test('an expired waiver stops covering the finding, so it comes back; one without an expiry (an old row) never lapses', () => {
  const repo = waivedRepo()
  sdlc(repo, ['waive', 'test-tamper', '*', 'flaky', '--slug', 'wv'], { env: HUMAN })
  assert.deepEqual([stop(repo).blocks.length, stop(repo).waived], [0, 1], 'live: the finding is waived')
  const lapsed = rows(repo).map(r => ({ ...r, expires: new Date(Date.now() - 1000).toISOString() }))
  fs.writeFileSync(path.join(repo, '.rig/waivers.jsonl'), lapsed.map(r => JSON.stringify(r)).join('\n') + '\n')
  assert.equal(stop(repo).blocks.length, 1, 'past its expiry the waiver covers nothing')
  assert.match(sdlc(repo, ['sensors']).stdout, /, expired/)
  fs.writeFileSync(path.join(repo, '.rig/waivers.jsonl'), lapsed.map(({ expires: _e, ...r }) => JSON.stringify(r)).join('\n') + '\n')
  assert.equal(stop(repo).blocks.length, 0, 'a row from before expiry existed is unchanged')
  assert.match(sdlc(repo, ['sensors']).stdout, /no expiry/)
})
