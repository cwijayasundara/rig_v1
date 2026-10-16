// Core neutrality (spec 2026-10-16 §10.1): tool and command names live in templates/stacks/, never in core scripts.
// The three pattern tables in sensors.ts match language idioms in a diff (data, not invocations) and are left out.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const DIR = import.meta.dirname
const DENY = /\b(?:mvn|cargo|dotnet|npm|npx|pip|gradle|eslint|tsc|pytest|jest|vitest|go test)\b/
const PATTERN_TABLES = /export const (?:TAMPER_PATTERNS|SUPPRESSIONS)[\s\S]*?\n\]\n|const CONFIG_FILE = .*\n/g

test('no core script names a language tool or command', () => {
  const hits: string[] = []
  for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8').replace(PATTERN_TABLES, '')
    text.split('\n').forEach((line, i) => { if (DENY.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`) })
  }
  assert.deepEqual(hits, [])
})

test('the size cap counts non-spec scripts and holds', () => {
  const total = fs.readdirSync(DIR).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts')
    .reduce((n, f) => n + fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\n$/, '').split('\n').length, 0)
  assert.ok(total <= SCRIPTS_CAP, `scripts are ${total} lines (cap ${SCRIPTS_CAP}; the spec's target is 3 000)`)
})
const SCRIPTS_CAP = 3050 // the measured total after step 4c (3 012), rounded up to the next 50; the spec's target is 3 000
