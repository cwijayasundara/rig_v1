import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { CASES } from './review/cases.mjs'
import { buildPrompt, scoreReview, summarize, renderMarkdown, ARMS } from './review.mjs'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')
function ctxFor(c) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-review-test-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
  fs.cpSync(path.join(FX, 'shop'), dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), dir, { recursive: true })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'e@x'); git('config', 'user.name', 'e'); git('add', '-A'); git('commit', '-qm', 'b')
  for (const [f, ap] of Object.entries(c.edits ?? {})) fs.writeFileSync(path.join(dir, f), ap(fs.readFileSync(path.join(dir, f), 'utf8')))
  for (const [f, t] of Object.entries(c.newFiles ?? {})) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t) }
  git('add', '-N', '.')
  return { dir, diff: git('diff', 'main'), changed: git('diff', '--name-only', 'main').split('\n').filter(Boolean) }
}

test('every case applies to the shop base and changes the files it says it changes; one case is the clean control', () => {
  assert.equal(CASES.filter(c => c.control).length, 1)
  for (const c of CASES) {
    const ctx = ctxFor(c)
    assert.ok(ctx.diff.length > 0, c.id)
    for (const d of c.defects) assert.ok(ctx.changed.includes(d.file), `${c.id} changes ${d.file}`)
    fs.rmSync(ctx.dir, { recursive: true, force: true })
  }
})

test('the two arms see the same change and differ only in who the reviewer is and the builder\'s notes', () => {
  const c = CASES[0]
  const ctx = ctxFor(c)
  const clean = buildPrompt(c, 'clean', ctx), same = buildPrompt(c, 'same', ctx)
  assert.match(clean, /never seen how this change was built/)
  assert.doesNotMatch(clean, /build notes/)
  assert.match(same, /You are the engineer who built this change/)
  assert.doesNotMatch(same, /never seen how this change was built/)
  assert.ok(same.includes(c.notes))
  const strip = t => t.replace(/^You are [^\n]*\n/, '').replace(/\n\n## Your build notes[\s\S]*$/, '')
  assert.equal(strip(clean), strip(same), 'diff, intent, spec, plan, files and tests are identical')
  assert.ok(clean.includes('```diff') && clean.includes('### test/remove.test.js (existing)'))
  fs.rmSync(ctx.dir, { recursive: true, force: true })
})

test('scoreReview counts a defect only when a finding names its file and matches its pattern, and counts the rest as extra', () => {
  const d = [{ id: 'x', file: 'src/cart/cart.js', re: /throw|absent/i }]
  const text = 'verdict: changes-needed\n## Findings\n- [severity: high] [category: correctness] src/cart/cart.js:14: remove no longer throws for an absent SKU. → fix\n- [severity: medium] [category: tests] test/a.js:1: something else. → fix\n## Deferred\n- [severity: medium] not a finding here\n'
  assert.deepEqual(scoreReview(text, d), { findings: 2, caught: ['x'], extra: 1 })
  assert.deepEqual(scoreReview('- [severity: high] [category: x] src/orders/orders.js:1: absent. → f', d).caught, [], 'right words, wrong file')
  assert.deepEqual(scoreReview('verdict: pass\n## Findings\n', []), { findings: 0, caught: [], extra: 0 })
  assert.equal(scoreReview('- [severity: low] ignored', []).findings, 0, 'only critical, high and medium are findings')
})

test('summarize reports recall and false findings per arm, and the table names both arms', () => {
  const rows = [
    { case: 'a', arm: 'clean', control: false, defects: 1, caught: ['x'], findings: 1, extra: 0, usd: 0.1 },
    { case: 'a', arm: 'same', control: false, defects: 1, caught: [], findings: 0, extra: 0, usd: 0.1 },
    { case: 'c', arm: 'clean', control: true, defects: 0, caught: [], findings: 0, extra: 0, usd: 0.1 },
    { case: 'c', arm: 'same', control: true, defects: 0, caught: [], findings: 2, extra: 2, usd: 0.1 },
    { case: 'a', arm: 'same', control: false, defects: 1, caught: [], findings: 0, extra: 0, failed: true },
  ]
  const s = summarize(rows)
  assert.deepEqual([s.clean.recall, s.same.recall, s.clean.falseFindingsOnClean, s.same.falseFindingsOnClean], [1, 0, 0, 2])
  assert.equal(s.same.runs, 2, 'a failed run is left out, not counted as a miss')
  const md = renderMarkdown(rows, { date: '2026-10-21', files: ['x.jsonl'] })
  assert.match(md, /\| clean context \| 2 \| 100% /)
  assert.match(md, /\| same context \(with builder notes\) \| 2 \| 0% /)
  assert.deepEqual(ARMS, ['clean', 'same'])
})

test('the unrequested-behaviour case adds clear() beside has(), and an unmapped finding naming it catches it', () => {
  const c = CASES.find(x => x.id === 'unrequested-clear')
  assert.ok(c && !c.control)
  const ctx = ctxFor(c)
  assert.match(ctx.diff, /^\+\s*clear\(\)/m)
  fs.rmSync(ctx.dir, { recursive: true, force: true })
  const hit = 'verdict: changes-needed\n## Findings\n- [severity: medium] [category: unmapped] src/catalog/products.js:9: clear() empties the catalog; no intent, spec or design line describes it. Fails when: any caller clears. → remove it\n'
  assert.deepEqual(scoreReview(hit, c.defects).caught, ['unmapped-clear'])
  const wrong = 'verdict: changes-needed\n## Findings\n- [severity: high] [category: correctness] src/catalog/products.js:5: has() returns false for a SKU not in the catalog; clearly out of scope. Fails when: x. → fix\n'
  assert.deepEqual(scoreReview(wrong, c.defects).caught, [], 'only an unmapped finding about clear() is the catch')
  assert.deepEqual(scoreReview('verdict: pass\n## Findings\n## Unverifiable\n- src/catalog/products.js clear() → settle by: a test\n', c.defects).caught, [])
})
