// Chart-reviewer design 2026-10-18 §6: generators run on Sonnet, the evaluator on Opus, and no file holds a versioned model id,
// so a new release is a settings change (ANTHROPIC_DEFAULT_*_MODEL), not an edit of every agent.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { defaultRegistry, parseRegistry } from './registry.ts'
import { makeRepo, sdlc, write } from './testkit.ts'
import { modelPair } from './risk.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const frontModel = (rel: string): string | undefined => /^model:\s*(\S+)/m.exec(read(rel))?.[1]

test('defaults: generators run on sonnet, the evaluator on opus', () => {
  assert.deepEqual(defaultRegistry().models, { build: 'sonnet', evaluate: 'opus', design: 'sonnet', light: { build: 'haiku', evaluate: 'sonnet' }, full: { build: 'sonnet', evaluate: 'opus' } })
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

// D1 (proposal 2026-11-14): the model pair per planning weight; scripts decide, models only report.
const m = defaultRegistry().models

test('a light change builds on haiku, evaluates on sonnet, and falls back to the full builder', () => {
  assert.deepEqual(modelPair('light', null, m), { weight: 'light', build: 'haiku', evaluate: 'sonnet', security: 'opus', fallback: 'sonnet', reasons: [] })
})

test('a full change builds on sonnet and evaluates on opus, with no fallback', () => {
  const p = modelPair('full', null, m)
  assert.equal(p.build, 'sonnet'); assert.equal(p.evaluate, 'opus'); assert.equal(p.fallback, null)
})

test('a light change whose diff reaches tier 1 or 2 evaluates on the full evaluator', () => {
  for (const t of [1, 2] as const) {
    const p = modelPair('light', t, m)
    assert.equal(p.evaluate, 'opus'); assert.equal(p.security, 'opus')
    assert.ok(p.reasons.some(r => r.includes(`tier ${t} after the diff`)))
  }
  assert.equal(modelPair('light', 0, m).evaluate, 'sonnet')
})

test('a pair keeps its default for a side left out, and a non-object pair names itself in the error', () => {
  const ok = parseRegistry(JSON.stringify({ models: { light: { build: 'sonnet' } } }))
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.registry.models.light, { build: 'sonnet', evaluate: 'sonnet' })
  const bad = parseRegistry(JSON.stringify({ models: { light: 'x' } }))
  assert.ok(bad.errors.some(e => e.includes('models.light')))
})

test('S models <slug> prints the pair, and --json parses to the Pair shape', () => {
  const repo = makeRepo()
  assert.equal(sdlc(repo, ['new', 'cart-add']).code, 0)
  write(repo, '.rig/changes/cart-add/spec.md', '# Spec\n\n## Behaviours\n- B1: x\n\n## Blast radius\n- `src/cart.ts`\n')
  const r = sdlc(repo, ['models', 'cart-add'])
  assert.equal(r.code, 0); assert.match(r.stdout, /^weight: light\nbuild: haiku\nevaluate: sonnet\nsecurity: opus\nfallback: sonnet/)
  const j = JSON.parse(sdlc(repo, ['models', 'cart-add', '--json']).stdout)
  assert.deepEqual(Object.keys(j).sort(), ['build', 'evaluate', 'fallback', 'reasons', 'security', 'weight'])
})
