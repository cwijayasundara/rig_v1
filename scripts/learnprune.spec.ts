// Rule pruning: a rule or checklist item that fired on none of the last N shipped changes is a retire candidate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, write, gitIn, sdlc } from './testkit.ts'
import { pruneReport } from './learnprune.ts'

function ship(repo: string, slug: string, file: string, body: string): void {
  write(repo, file, body)
  write(repo, `.rig/changes/${slug}/pr.md`, 'pr\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', `ship ${slug}`)
}
const RULES = JSON.stringify([
  { id: 'no-bare-error', pattern: "res\\.send\\('", message: 'm', why: 'cart-add', action: 'warn' },
  { id: 'old-pattern', pattern: 'neverWritten', message: 'm', why: 'a 2024 incident', action: 'warn' },
  { id: 'migration-reversible', check: 'confirm the migration is reversible', paths: ['migrations/**'], why: 'incident 7' },
  { id: 'state-format', check: 'old data still loads', paths: ['src/state/**'], why: 'incident 9' },
])
function history(): string {
  const repo = makeRepo()
  write(repo, '.rig/rules.json', RULES)
  ship(repo, 'aa', 'src/a.ts', "res.send('oops')\n")
  ship(repo, 'bb', 'migrations/001.sql', 'alter table t add c int\n')
  ship(repo, 'cc', 'src/c.ts', 'export const c = 1\n')
  return repo
}

test('rules and checklist items that never fired in the window are dormant; those that did report where', () => {
  const r = pruneReport(history(), 3)
  assert.deepEqual(r.dormant.sort(), ['old-pattern', 'state-format'])
  assert.match(r.lines.join('\n'), /no-bare-error \(rule\): fired on 1 of 3, last aa/)
  assert.match(r.lines.join('\n'), /migration-reversible \(check\): fired on 1 of 3, last bb/)
  assert.match(r.lines.join('\n'), /retire candidates: old-pattern, state-format/)
})

test('too few shipped changes is too early to call anything dormant', () => {
  const r = pruneReport(history(), 20)
  assert.deepEqual(r.dormant, [])
  assert.match(r.lines[0] ?? '', /only 3 shipped change\(s\), fewer than the window of 20/)
})

test('only the newest N changes count: a rule that fired long ago is dormant now', () => {
  const r = pruneReport(history(), 2) // bb and cc: no-bare-error fired only on a
  assert.ok(r.dormant.includes('no-bare-error'))
})

test('learn prune runs from the command line, and rejects a bad window', () => {
  const repo = history()
  const ok = sdlc(repo, ['learn', 'prune', '--window', '3'])
  assert.equal(ok.code, 0, ok.stderr)
  assert.match(ok.stdout, /retire candidates/)
  assert.notEqual(sdlc(repo, ['learn', 'prune', '--window', '0']).code, 0)
})
