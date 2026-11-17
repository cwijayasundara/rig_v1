// The diff-triggered reliability checklist: rules with a `check`, run by the code reviewer only when the diff triggers them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRules } from './model.ts'
import { rulesSensor } from './sensors.ts'
import { triggeredChecks, formatChecklist } from './checklist.ts'
import { fd } from './sensors.spec.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const RULES = JSON.stringify([
  { id: 'old-transcripts', check: 'load a transcript saved before this change and confirm it still opens', paths: ['src/session/**'], pattern: 'type|field', why: 'PR 412: --resume broke old transcripts' },
  { id: 'any-migration', check: 'confirm the migration is reversible', paths: ['migrations/**'], why: 'incident 7' },
  { id: 'no-todo', pattern: 'TODO', message: 'no TODO', why: 'w', action: 'block' },
])

test('a check rule parses without a pattern or action, and needs a sentence and a why', () => {
  const r = parseRules(RULES)
  assert.deepEqual(r.errors, [])
  assert.equal(r.rules.length, 3)
  assert.match(parseRules(JSON.stringify([{ id: 'x', check: '  ', why: 'w' }])).errors.join(), /check must be a sentence/)
  assert.match(parseRules(JSON.stringify([{ id: 'x', check: 'c' }])).errors.join(), /needs a why/)
  assert.match(parseRules(JSON.stringify([{ id: 'x', message: 'm', why: 'w', action: 'block' }])).errors.join(), /needs a pattern/, 'a plain rule still does')
})

test('only the checks this diff triggers are listed: by path, and by pattern when the rule has one', () => {
  const { rules } = parseRules(RULES)
  const hit = triggeredChecks([fd('src/session/store.ts', ['type Entry = { id: string }']), fd('src/other.ts', ['type X'])], rules)
  assert.deepEqual(hit.map(i => [i.id, i.files]), [['old-transcripts', ['src/session/store.ts']]])
  assert.deepEqual(triggeredChecks([fd('src/session/store.ts', ['const a = 1'])], rules), [], 'path matches but no added or removed line does')
  assert.deepEqual(triggeredChecks([fd('migrations/001.sql', ['alter table'])], rules).map(i => i.id), ['any-migration'], 'no pattern: any change under the path triggers it')
  assert.deepEqual(triggeredChecks([fd('src/session/store.ts', [], ['type Old'])], rules).map(i => i.id), ['old-transcripts'], 'a removed line counts')
  assert.match(formatChecklist(hit), /1\. \[old-transcripts\] load a transcript[\s\S]*PR 412/)
  assert.equal(formatChecklist([]), 'no reliability checks triggered by this diff')
})

test('a check never becomes a finding: the rules sensor skips it', () => {
  const { rules } = parseRules(RULES)
  assert.deepEqual(rulesSensor([fd('migrations/001.sql', ['TODO alter table'])], rules).map(f => f.labels), [['no-todo']])
})

test('checklist lists the triggered checks of a branch, and says so when none', () => {
  const repo = makeRepo()
  write(repo, '.rig/rules.json', RULES)
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'rules')
  assert.match(sdlc(repo, ['checklist']).stdout, /no reliability checks/)
  write(repo, 'migrations/001.sql', 'alter table t add c int\n')
  const r = sdlc(repo, ['checklist', '--json'])
  assert.deepEqual(JSON.parse(r.stdout).map((i: { id: string }) => i.id), ['any-migration'])
})
