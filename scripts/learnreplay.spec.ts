// The replay gate for a proposed rule (learning loop design 2026-10-17): it must fire on every change that earned it and on no other shipped change.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, write, gitIn } from './testkit.ts'
import { changeDiff, replayRule } from './learnreplay.ts'
import type { Rule } from './model.ts'

const BAD = "export function h() {\n  res.send('oops')\n}\n"
const GOOD = "export function h() {\n  res.status(400).json({ code: 'bad', message: 'no' })\n}\n"

function ship(repo: string, slug: string, file: string, body: string): void {
  write(repo, file, body)
  write(repo, `.rig/changes/${slug}/pr.md`, 'pr\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', `ship ${slug}`)
}
function history(): string {
  const repo = makeRepo()
  ship(repo, 'cart-add', 'src/a.ts', BAD)
  ship(repo, 'cart-remove', 'src/b.ts', BAD)
  ship(repo, 'cart-pay', 'src/c.ts', GOOD)
  write(repo, '.rig/changes/unmerged/intent.md', 'x')
  return repo
}
const ALL = ['cart-add', 'cart-remove', 'cart-pay', 'unmerged']
const rule = (over: Partial<Rule> = {}): Rule => ({ id: 'no-bare-error', pattern: "res\\.send\\('", message: 'use the contract error shape', why: 'cart-add, cart-remove', action: 'warn', ...over })

test('changeDiff returns the added lines of the shipped change and null for an unshipped one', () => {
  const repo = history()
  assert.deepEqual(changeDiff(repo, 'cart-add')?.find(d => d.file === 'src/a.ts')?.added.map(l => l.text), ['export function h() {', "  res.send('oops')", '}'])
  assert.equal(changeDiff(repo, 'unmerged'), null)
})

test('a rule that fires on exactly the changes that earned it passes', () => {
  const got = replayRule(history(), rule(), ['cart-add', 'cart-remove'], ALL)
  assert.deepEqual({ firesOn: got.firesOn, missed: got.missed, extra: got.extra, skipped: got.skipped, error: got.error }, { firesOn: ['cart-add', 'cart-remove'], missed: [], extra: [], skipped: ['unmerged'], error: undefined })
})

test('extra lists another change the rule also matches', () => {
  assert.deepEqual(replayRule(history(), rule({ pattern: 'export function' }), ['cart-add', 'cart-remove'], ALL).extra, ['cart-pay'])
})

test('missed lists an earning change the rule does not match', () => {
  assert.deepEqual(replayRule(history(), rule(), ['cart-add', 'cart-pay'], ALL).missed, ['cart-pay'])
})

test('an earning change that cannot be recovered is skipped, not missed', () => {
  const got = replayRule(history(), rule(), ['cart-add', 'unmerged'], ALL)
  assert.deepEqual([got.missed, got.skipped], [[], ['unmerged']])
})

test('an invalid, too long or nested-quantifier pattern returns an error and replays nothing', () => {
  for (const pattern of ['(unclosed', 'a'.repeat(301), '(a+)+$']) {
    const got = replayRule(history(), rule({ pattern }), ['cart-add', 'cart-remove'], ALL)
    assert.ok(got.error, `pattern ${pattern.slice(0, 12)}`)
    assert.deepEqual(got.firesOn, [])
  }
})

test('a skipped earning change fails the gate, so a rule is never passed on changes it was not tested against', () => {
  assert.equal(replayRule(history(), rule(), ['cart-add', 'unmerged'], ALL).pass, false)
  assert.equal(replayRule(history(), rule(), ['cart-add', 'cart-remove'], ALL).pass, true)
  assert.equal(replayRule(history(), rule(), ['cart-add', 'cart-add'], ALL).pass, false, 'two distinct changes are required')
})

test('a pattern that backtracks without end is stopped by a time limit and reported', () => {
  const repo = makeRepo()
  ship(repo, 'cart-add', 'src/a.ts', `${'a'.repeat(30)}!\n`)
  ship(repo, 'cart-remove', 'src/b.ts', `${'a'.repeat(30)}!\n`)
  const started = Date.now()
  const got = replayRule(repo, rule({ pattern: '^((a+))+$' }), ['cart-add', 'cart-remove'], ['cart-add', 'cart-remove'])
  assert.match(got.error ?? '', /timed out/)
  assert.equal(got.pass, false)
  assert.ok(Date.now() - started < 8000)
})

test('a rule that throws is reported as an error, not as a timeout', () => {
  const repo = history()
  const r = replayRule(repo, rule({ paths: 5 as unknown as string[] }), ['cart-add', 'cart-remove'], ALL)
  assert.ok(r.error && !/timed out/.test(r.error), r.error)
  assert.equal(r.pass, false)
})
