// Chart-reviewer design 2026-10-18 §6: generators run on Sonnet, the evaluator on Opus, and no file holds a versioned model id,
// so a new release is a settings change (ANTHROPIC_DEFAULT_*_MODEL), not an edit of every agent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { defaultRegistry } from './registry.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const frontModel = (rel: string): string | undefined => /^model:\s*(\S+)/m.exec(read(rel))?.[1]

test('defaults: generators run on sonnet, the evaluator on opus', () => {
  assert.deepEqual(defaultRegistry().models, { build: 'sonnet', evaluate: 'opus', design: 'sonnet' })
})

test('architect frontmatter is sonnet and evaluator is opus', () => {
  assert.equal(frontModel('agents/architect.md'), 'sonnet')
  assert.equal(frontModel('agents/evaluator.md'), 'opus')
})

test('agents and skills hold model aliases, never a versioned id', () => {
  const files = ['agents', 'skills', 'templates'].flatMap(d => (fs.readdirSync(path.join(ROOT, d), { recursive: true }) as string[]).map(f => path.join(d, f)))
    .filter(f => f.endsWith('.md') && !fs.statSync(path.join(ROOT, f)).isDirectory())
  const bad = files.filter(f => /claude-(opus|sonnet|haiku)-\d/.test(read(f)))
  assert.deepEqual(bad, [])
})
