// parseArgs is the one argv parser: a bare `--` hands everything after it to the command (run, intent-record, intent-adjudicate), and a
// flag given twice keeps every value (tests-freeze --drop a --drop b). No command reads process.argv for its own arguments.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from './core.ts'

test('a bare -- ends the options: what follows is rest, flags before it still parse, and no -- leaves rest undefined', () => {
  assert.deepEqual(parseArgs(['--slug', 's', '--expect-fail', '--', 'npm test', '--not-a-flag']), { pos: [], opt: { slug: 's', 'expect-fail': true }, all: { slug: ['s'] }, rest: ['npm test', '--not-a-flag'] })
  assert.deepEqual(parseArgs(['store', 'E1', '--', 'node', 'x.mjs']).pos, ['store', 'E1'])
  assert.equal(parseArgs(['store', '--why', 'because']).rest, undefined)
  assert.deepEqual(parseArgs(['a', '--']).rest, [])
})

test('a flag given more than once keeps every value in all, and opt keeps the last', () => {
  const a = parseArgs(['store', '--why', 'r', '--drop', 'a.test.ts', '--drop', 'b.test.ts'])
  assert.deepEqual(a.all?.drop, ['a.test.ts', 'b.test.ts'])
  assert.equal(a.opt.drop, 'b.test.ts')
  assert.deepEqual(a.pos, ['store'])
})

test('no script parses process.argv for its own arguments', () => {
  const dir = import.meta.dirname
  const bad = fs.readdirSync(dir).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')
    .filter(n => /process\.argv\.(?:slice\(3\)|\[3\])|process\.argv\.flatMap/.test(fs.readFileSync(path.join(dir, n), 'utf8')))
  assert.deepEqual(bad, [])
})
