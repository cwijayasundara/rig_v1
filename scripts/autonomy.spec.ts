// The autonomy rung: a person-set file, evidence-driven proposals, and the guards around it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, write, gitIn, sdlc } from './testkit.ts'
import { readAutonomy, proposeRung } from './autonomy.ts'

const human = { env: { SDLC_HUMAN: '1' } }
const file = (repo: string): string => path.join(repo, '.rig', 'autonomy.json')
const ship = (repo: string, slug: string, over: { pass?: boolean; review?: string } = {}): void => {
  write(repo, `.rig/changes/${slug}/verify.json`, JSON.stringify({ pass: over.pass ?? true }))
  write(repo, `.rig/changes/${slug}/review.md`, over.review ?? 'verdict: ok\n## Findings\n')
  write(repo, `.rig/changes/${slug}/pr.md`, 'pr')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', `ship ${slug}`)
}
const atRung = (repo: string, rung: number): void => write(repo, '.rig/autonomy.json', JSON.stringify({ rung, since: 'x', deferred: [], history: [] }))

test('no file reads as rung 0; init writes rung 1 once and never overwrites', () => {
  const repo = makeRepo()
  assert.equal(readAutonomy(repo).rung, 0)
  assert.equal(sdlc(repo, ['init']).code, 0)
  assert.equal(JSON.parse(fs.readFileSync(file(repo), 'utf8')).rung, 1)
  assert.equal(sdlc(repo, ['autonomy', 'set', '2', '--why', 'x'], human).code, 0)
  sdlc(repo, ['init'])
  assert.equal(readAutonomy(repo).rung, 2)
})

test('set refuses without SDLC_HUMAN=1 and records a history row with it', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  const no = sdlc(repo, ['autonomy', 'set', '2', '--why', 'x'])
  assert.equal(no.code, 3)
  assert.match(no.stderr, /human-only/)
  assert.equal(readAutonomy(repo).rung, 1)
  assert.equal(sdlc(repo, ['autonomy', 'set', '2', '--why', 'x'], human).code, 0)
  const a = readAutonomy(repo)
  assert.equal(a.rung, 2)
  assert.deepEqual({ from: a.history[0]?.from, to: a.history[0]?.to, why: a.history[0]?.why, by: a.history[0]?.by }, { from: 1, to: 2, why: 'x', by: 'Tester' })
})

test('a malformed rung clamps to 0 and autonomy says so', () => {
  const repo = makeRepo()
  write(repo, '.rig/autonomy.json', '{"rung":7}')
  assert.equal(readAutonomy(repo).rung, 0)
  assert.match(sdlc(repo, ['autonomy']).stdout, /malformed/)
  write(repo, '.rig/autonomy.json', 'not json')
  assert.match(sdlc(repo, ['autonomy']).stdout, /malformed/)
})

test('proposeRung: up after 3 clean ships, not after 2', () => {
  const repo = makeRepo()
  atRung(repo, 1)
  ship(repo, 'a-one'); ship(repo, 'b-two')
  assert.equal(proposeRung(repo), null)
  ship(repo, 'c-three')
  const p = proposeRung(repo)
  assert.equal(p?.to, 2)
  assert.match(p?.why ?? '', /3 clean ships/)
  atRung(repo, 2)
  assert.equal(proposeRung(repo), null)
})

test('proposeRung: a failing verify or a security/contract/design finding blocks the move up', () => {
  const repo = makeRepo()
  atRung(repo, 1)
  ship(repo, 'a-one'); ship(repo, 'b-two')
  ship(repo, 'c-three', { review: '## Findings\n- [severity: high] [category: design] a.ts:1: x (confidence 90)\n' })
  assert.equal(proposeRung(repo), null)
  ship(repo, 'd-four', { pass: false })
  assert.equal(proposeRung(repo), null)
})

test('proposeRung: an open unmapped finding blocks the move up, like a design finding', () => {
  const repo = makeRepo()
  atRung(repo, 1)
  ship(repo, 'a-one'); ship(repo, 'b-two')
  ship(repo, 'c-three', { review: '## Findings\n- [severity: medium] [category: unmapped] a.ts:1: clear() no doc describes → fix: design doc §Design, add "clear" (a chart edit)\n' })
  assert.equal(proposeRung(repo), null)
})

test('proposeRung: down on a waiver for the newest ship, and down wins over up', () => {
  const repo = makeRepo()
  atRung(repo, 1)
  ship(repo, 'a-one'); ship(repo, 'b-two'); ship(repo, 'c-three')
  write(repo, '.rig/waivers.jsonl', `${JSON.stringify({ slug: 'c-three', sensor: 'size', file: '*', reason: 'big', by: 'p', at: '2026-10-17T00:00:00Z' })}\n`)
  const p = proposeRung(repo)
  assert.equal(p?.to, 0)
  assert.match(p?.why ?? '', /waived block/)
  atRung(repo, 0)
  assert.equal(proposeRung(repo), null)
})

test('proposeRung: down on a finding repeated across two ships', () => {
  const repo = makeRepo()
  atRung(repo, 2)
  const r = '## Findings\n- [severity: low] [category: tests] a.ts:1: thin (confidence 80)\n'
  ship(repo, 'a-one', { review: r }); ship(repo, 'b-two', { review: r })
  const p = proposeRung(repo)
  assert.equal(p?.to, 1)
  assert.match(p?.why ?? '', /repeated finding: tests/)
})

test('proposeRung: a tagged finding in a review with no Findings heading still blocks a move up', () => {
  const repo = makeRepo()
  atRung(repo, 1)
  ship(repo, 'a-one'); ship(repo, 'b-two')
  ship(repo, 'c-three', { review: '- [severity: high] [category: security] a.ts:1: x (confidence 90)\n' })
  assert.equal(proposeRung(repo), null)
})

test('rung 3 is set only by a person, reads back, and is never proposed', () => {
  const repo = makeRepo()
  atRung(repo, 2)
  ship(repo, 'a-one'); ship(repo, 'b-two'); ship(repo, 'c-three')
  assert.equal(proposeRung(repo), null, 'the evidence loop stops at rung 2: rung 3 is a person\'s call')
  assert.notEqual(sdlc(repo, ['autonomy', 'set', '3', '--why', 'x']).code, 0)
  const guarded = sdlc(repo, ['autonomy', 'set', '3', '--why', 'x'], human)
  assert.notEqual(guarded.code, 0, 'rung 3 needs risk.enforce and a trusted author first')
  assert.match(guarded.stderr, /risk\.enforce[\s\S]*humanApproval\.trusted/)
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], risk: { enforce: true }, humanApproval: { trusted: [] } }))
  assert.match(sdlc(repo, ['autonomy', 'set', '3', '--why', 'x'], human).stderr, /humanApproval\.trusted/)
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], risk: { enforce: true }, humanApproval: { trusted: ['dev'] } }))
  assert.equal(sdlc(repo, ['autonomy', 'set', '3', '--why', 'tier 0 is boring here'], human).code, 0)
  assert.equal(readAutonomy(repo).rung, 3)
  assert.match(sdlc(repo, ['autonomy']).stdout, /rung 3[\s\S]*tier-0 PR by a trusted author/)
  assert.notEqual(sdlc(repo, ['autonomy', 'set', '4', '--why', 'x'], human).code, 0)
})
