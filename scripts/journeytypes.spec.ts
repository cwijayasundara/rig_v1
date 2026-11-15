// The dashboard mod never imports the scripts: it reads `status --journey --json` through types/index.d.ts and keeps its own copy of
// RAIL_DETAIL. Those two copies are checked here against journey.ts so they cannot drift (a field dropped from one, a step added to one).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { RAIL_DETAIL } from './journey.ts'

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// The names at depth one of `export type <name> = { ... }`.
function topKeys(text: string, name: string): string[] {
  const start = text.indexOf(`export type ${name} = {`)
  assert.ok(start >= 0, `${name} not found`)
  const keys: string[] = []
  let depth = 0, word = ''
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    const c = text[i]!
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) break }
    else if (depth === 1 && /[\w?]/.test(c)) word += c
    else { if (depth === 1 && c === ':' && word) keys.push(word.replace('?', '')); word = '' }
  }
  return keys.sort()
}

test('types/index.d.ts Journey has every field journey.ts does, plus the sensors status adds', () => {
  assert.deepEqual(topKeys(read('types/index.d.ts'), 'Journey'), [...topKeys(read('scripts/journey.ts'), 'Journey'), 'sensors'].sort())
  assert.deepEqual(topKeys(read('types/index.d.ts'), 'JourneyStep'), topKeys(read('scripts/journey.ts'), 'JourneyStep'))
})

test('the dashboard draws detail for the same steps as journey.ts RAIL_DETAIL', () => {
  const m = /const RAIL_DETAIL = new Set\(\[([^\]]*)\]\)/.exec(read('hooks/dashboard.tsx'))
  assert.ok(m, 'RAIL_DETAIL not found in hooks/dashboard.tsx')
  assert.deepEqual([...m[1]!.matchAll(/'([^']+)'/g)].map(x => x[1]).sort(), [...RAIL_DETAIL].sort())
})
