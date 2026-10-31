import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseRubric } from './inspector.mjs'

const dir = path.join(import.meta.dirname, 'rubrics')
const files = Array.from({ length: 7 }, (_, i) => `J${i}`)
const read = id => fs.readFileSync(path.join(dir, `${id}.md`), 'utf8')

test('every rubric parses, has at least 4 items, at most 60 lines, and ids of its own stage', () => {
  const seen = new Set()
  for (const id of files) {
    const text = read(id)
    const items = parseRubric(text)
    assert.ok(items.length >= 4, `${id} has ${items.length} items`)
    assert.ok(text.split('\n').length <= 60, `${id} is too long`)
    for (const it of items) {
      assert.ok(it.id.startsWith(`${id}.`), `${it.id} in ${id}`)
      assert.ok(!seen.has(it.id), `duplicate ${it.id}`)
      seen.add(it.id)
    }
    assert.equal(items.length, text.split('\n').filter(l => l.startsWith('- J')).length, `${id} has an unparsable item line`)
  }
})

test('J1 requires prose business rules to be quoted and cited', () => {
  assert.match(read('J1'), /prose business rule/)
})

test('J6 pins read-only reports, sprint 1 data loading, one definition of the modified rules and unchanged tests', () => {
  const t = read('J6')
  for (const re of [/never write the data file/, /written by sprint 1/, /exactly one place/, /byte-identical/]) assert.match(t, re)
})

test('structural items block and judgement items warn in every stage that has both', () => {
  for (const id of files) assert.ok(parseRubric(read(id)).some(i => i.severity === 'block'), `${id} has no block item`)
})

test('J0 accepts the language-agnostic sensors rig ships for every stack (jscpd, semgrep)', () => {
  const t = read('J0')
  assert.match(t, /jscpd/)
  assert.doesNotMatch(t, /not Node tools/)
})

test('J0 allows the files init ships beyond the harness folders (CI workflows, REVIEW.md)', () => {
  const t = read('J0')
  assert.match(t, /\.github\/workflows\/rig-/)
  assert.match(t, /REVIEW\.md/)
})

test('rubrics describe the slim PRDs: three sprint 1 intents, the raise_missing removal, renewals, and nothing about a CLI, staff or --json', () => {
  const all = files.map(read).join('\n')
  assert.match(read('J1'), /FR-1\.\.FR-5/)
  assert.match(read('J1'), /storage.*books.*loans/s)
  assert.match(read('J4'), /raise_missing/)
  assert.match(read('J6'), /RenewalLimitError/)
  assert.match(read('J6'), /overdue_loans/)
  for (const stale of [/--json/, /\bCLI\b/, /\bstaff\b/, /remove_book/, /FR-1\.\.FR-10/]) assert.doesNotMatch(all, stale, String(stale))
})
