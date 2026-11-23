// chart finding / chart answer / whoami: the bookkeeping the chart writes into its own files.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'
import { parseReview, traceReport, parseIntent } from './chartcheck.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); gitIn(repo, 'config', 'user.name', 'Pat Person') })
const SP = '.rig/product/sprints/sprint-1'
const rd = (rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')
const REVIEW = 'verdict: changes-needed\n\n## Findings\n\n- high: a is vague\n- critical: b is wrong → fixed\n- medium: c → reopened: still wrong\n- low: d\n\n## Notes\n\n- not a finding\n'
const mark = (...a: string[]) => sdlc(repo, ['chart', 'finding', '1', ...a])

test('chart finding marks each numbered finding, keeps its text and sets the verdict from what is still open', () => {
  write(repo, `${SP}/chart-review.md`, REVIEW)
  const before = parseReview(REVIEW)
  const r = mark('1,3-4', 'confirmed')
  assert.equal(r.code, 0, r.stderr)
  const text = rd(`${SP}/chart-review.md`)
  assert.match(text, /^- high: a is vague → fixed \(confirmed\)$/m)
  assert.match(text, /^- medium: c → fixed \(confirmed\)$/m, 'the old reopened suffix is replaced')
  assert.match(text, /^- low: d → fixed \(confirmed\)$/m)
  assert.match(text, /^- not a finding$/m)
  assert.deepEqual(parseReview(text).map(f => f.sha), before.map(f => f.sha), 'finding text unchanged')
  assert.match(text, /^verdict: changes-needed\n/, 'finding 2 is still only claimed, and the sprint is not tier S')
  assert.match(r.stdout, /finding 1: fixed \(confirmed\)[\s\S]*verdict: changes-needed/)
  const r2 = mark('2', 'confirmed')
  assert.match(rd(`${SP}/chart-review.md`), /^verdict: pass\n/)
  assert.match(r2.stdout, /finding 2: fixed \(confirmed\)\nverdict: pass/)
  mark('1-4', 'fixed'); assert.match(rd(`${SP}/chart-review.md`), /^- low: d → fixed$/m)
  const re = mark('4', 'reopened', 'it still fails on empty input')
  assert.match(rd(`${SP}/chart-review.md`), /^- low: d → reopened: it still fails on empty input$/m)
  assert.match(re.stdout, /verdict: changes-needed/)
})

test('chart finding fails and changes nothing on an unknown number, a missing reason or a missing file', () => {
  assert.notEqual(mark('1', 'fixed').code, 0, 'no chart-review.md')
  write(repo, `${SP}/chart-review.md`, REVIEW)
  for (const a of [['5', 'fixed'], ['1,9', 'fixed'], ['0', 'fixed'], ['1', 'reopened'], ['x', 'fixed'], ['1', 'done']]) {
    assert.notEqual(mark(...a).code, 0, a.join(' '))
    assert.equal(rd(`${SP}/chart-review.md`), REVIEW)
  }
})

const INTENT = '---\nsprint: 1\n---\n# add\n\n## Open questions\n\n- Q1: which currency?\n- Q2: rounding?\n  more on Q2\n'
const answer = (...a: string[]) => sdlc(repo, ['chart', 'answer', '1', ...a])

test('chart answer moves the Qn bullet to ## Resolved, writes none when the list empties, and chart check accepts it', () => {
  write(repo, `${SP}/intents/add.md`, INTENT)
  const r = answer('add', 'Q1', 'USD only')
  assert.equal(r.code, 0, r.stderr)
  let t = rd(`${SP}/intents/add.md`)
  assert.doesNotMatch(t, /^- Q1: which currency/m)
  assert.match(t, /## Open questions\n\n- Q2: rounding\?/)
  assert.match(t, /\n## Resolved\n\n- Q1: USD only \(confirmed at chart by Pat Person\)\n$/)
  assert.equal(answer('add', 'Q2', 'half up', '--proposed').code, 0)
  t = rd(`${SP}/intents/add.md`)
  assert.match(t, /## Open questions\n\nnone\n/)
  assert.doesNotMatch(t, /more on Q2/)
  assert.match(t, /- Q1: USD only \(confirmed at chart by Pat Person\)\n- Q2: half up \(proposed at chart\)\n$/)
  assert.deepEqual(parseIntent('add', t).openQuestions, [], '## Resolved after "## Open questions: none" is no open question')
  const f = traceReport({ prd: '---\nsprint: 1\n---\n### FR-1: x\n\n## Open questions\nnone\n', intents: [parseIntent('add', t)], cases: null, exists: () => true })
  assert.deepEqual(f.filter(x => x.rule === 'open-question'), [])
})

test('chart answer answers architecture.md, and fails changing nothing without the bullet or an identity', () => {
  write(repo, '.rig/product/architecture.md', '# Arch\n\n## Open questions\n\n- Q3: store?\n\n## Resolved\n\n- Q1: old (confirmed at chart by Sam)\n\n## Notes\n\nx\n')
  assert.equal(answer('architecture', 'Q3', 'sqlite').code, 0)
  assert.equal(rd('.rig/product/architecture.md'), '# Arch\n\n## Open questions\n\nnone\n\n## Resolved\n\n- Q1: old (confirmed at chart by Sam)\n- Q3: sqlite (confirmed at chart by Pat Person)\n\n## Notes\n\nx\n')
  write(repo, `${SP}/intents/add.md`, INTENT)
  assert.notEqual(answer('add', 'Q9', 'x').code, 0)
  assert.notEqual(answer('nope', 'Q1', 'x').code, 0)
  assert.equal(rd(`${SP}/intents/add.md`), INTENT)
  const nobody = { env: { USER: 'root', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }
  gitIn(repo, 'config', '--unset', 'user.name')
  const r = sdlc(repo, ['chart', 'answer', '1', 'add', 'Q1', 'x'], nobody)
  assert.notEqual(r.code, 0); assert.equal(rd(`${SP}/intents/add.md`), INTENT)
  assert.equal(sdlc(repo, ['chart', 'answer', '1', 'add', 'Q1', 'x', '--proposed'], nobody).code, 0, 'a proposed answer needs no name')
})

test('whoami prints the identity, or exits 1 with a hint when there is none', () => {
  const r = sdlc(repo, ['whoami'])
  assert.equal(r.stdout.trim(), 'Pat Person')
  gitIn(repo, 'config', '--unset', 'user.name')
  const none = sdlc(repo, ['whoami'], { env: { USER: 'root', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
  assert.equal(none.code, 1); assert.match(none.stderr, /git config user\.name/)
})
