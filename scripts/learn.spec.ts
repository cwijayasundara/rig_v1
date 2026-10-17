// `sdlc.ts learn <mine|replay|check|status>` (learning loop design 2026-10-17), through the real CLI in a throwaway git repo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, write, sdlc, gitIn } from './testkit.ts'
import { formatLesson, type Lesson } from './learnfile.ts'

const finding = (category: string): string => `- [severity: high] [category: ${category}] src/a.ts:1: bare string → contract shape (confidence 90)\n`
const LESSON: Lesson = { id: 'L1', text: 'Return the contract error shape', key: 'contract', seen: ['cart-add', 'cart-remove'], first: '2026-10-01', lastFired: '2026-10-01', status: 'active' }

function shipped(repo: string, slug: string, body: string, category = 'contract'): void {
  write(repo, 'src/' + slug + '.ts', body)
  write(repo, `.rig/changes/${slug}/review.md`, finding(category))
  write(repo, `.rig/changes/${slug}/pr.md`, 'pr\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', `ship ${slug}`)
}
function repoWithTwo(): string {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  shipped(repo, 'cart-add', "res.send('oops')\n")
  shipped(repo, 'cart-remove', "res.send('oops')\n")
  return repo
}

test('learn mine writes candidates.json under .rig/learn and prints the candidate', () => {
  const repo = repoWithTwo()
  const r = sdlc(repo, ['learn', 'mine'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /contract.*cart-add, cart-remove/)
  const file = JSON.parse(fs.readFileSync(path.join(repo, '.rig/learn/candidates.json'), 'utf8'))
  assert.equal(file.candidates[0].key, 'contract')
  assert.equal(gitIn(repo, 'check-ignore', '.rig/learn/candidates.json'), '.rig/learn/candidates.json')
})

test('learn mine on a repo with no changes and no lessons file passes', () => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['learn', 'mine']).code, 0)
  assert.equal(sdlc(repo, ['learn', 'check']).code, 0)
})

test('learn check fails a lesson citing one change and passes a valid one', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/lessons.md', formatLesson({ ...LESSON, seen: ['cart-add'] }) + '\n')
  const bad = sdlc(repo, ['learn', 'check'])
  assert.equal(bad.code, 1)
  assert.match(bad.stdout, /L1.*at least 2/)
  write(repo, '.rig/lessons.md', formatLesson(LESSON) + '\n')
  assert.equal(sdlc(repo, ['learn', 'check']).code, 0)
})

test('learn check keeps active lessons in lessons.md and the rest in the archive', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/lessons.md', formatLesson({ ...LESSON, status: 'retired' }) + '\n')
  assert.match(sdlc(repo, ['learn', 'check']).stdout, /L1.*lessons-archive/)
  write(repo, '.rig/lessons.md', '')
  write(repo, '.rig/lessons-archive.md', formatLesson({ ...LESSON, status: 'retired' }) + '\n')
  assert.equal(sdlc(repo, ['learn', 'check']).code, 0)
})

const RULE = { id: 'no-bare-error', pattern: "res\\.send\\('", message: 'use the contract error shape', why: 'cart-add, cart-remove', action: 'warn' }

test('learn replay passes a rule that fires only on the earning changes and fails one that also matches another change', () => {
  const repo = repoWithTwo()
  shipped(repo, 'cart-pay', "res.status(400).json({})\n", 'tests')
  write(repo, '.rig/learn/rule.json', JSON.stringify(RULE))
  const ok = sdlc(repo, ['learn', 'replay', '.rig/learn/rule.json', '--earned', 'cart-add,cart-remove'])
  assert.equal(ok.code, 0, ok.stdout + ok.stderr)
  write(repo, '.rig/learn/rule.json', JSON.stringify({ ...RULE, pattern: 'res\\.' }))
  const bad = sdlc(repo, ['learn', 'replay', '.rig/learn/rule.json', '--earned', 'cart-add,cart-remove'])
  assert.equal(bad.code, 1)
  assert.match(bad.stdout, /also fires on: cart-pay/)
})

test('learn replay reports an unreadable rule file instead of throwing', () => {
  const repo = repoWithTwo()
  const r = sdlc(repo, ['learn', 'replay', '.rig/learn/nope.json', '--earned', 'cart-add,cart-remove'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /rule file/)
})

test('learn status prints the active, eligible and flagged counts', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/lessons.md', formatLesson(LESSON) + '\n')
  assert.match(sdlc(repo, ['learn', 'status']).stdout, /active 1, eligible 1, flagged 0/)
})

test('editing .rig/lessons.md is a harness change that CI will not take from a PR', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'rig')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/lessons.md', formatLesson(LESSON) + '\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'lesson')
  const ci = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.match(ci.stdout + ci.stderr, /harness-tamper.*lessons\.md/s)
})

test('learn replay fails when the earning changes cannot be replayed', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/learn/rule.json', JSON.stringify(RULE))
  const r = sdlc(repo, ['learn', 'replay', '.rig/learn/rule.json', '--earned', 'ghost-a,ghost-b'])
  assert.equal(r.code, 1)
  assert.match(r.stdout, /replay: fail/)
})

test('learn check accepts a CRLF lessons file', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/lessons.md', formatLesson(LESSON).replace(/\n?$/, '\r\n'))
  const r = sdlc(repo, ['learn', 'check'])
  assert.equal(r.code, 0, r.stdout + r.stderr)
})

test('learn replay rejects a rule whose paths is not a list', () => {
  const repo = repoWithTwo()
  write(repo, '.rig/learn/rule.json', JSON.stringify({ ...RULE, paths: 'src' }))
  const r = sdlc(repo, ['learn', 'replay', '.rig/learn/rule.json', '--earned', 'cart-add,cart-remove'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /paths/)
})
