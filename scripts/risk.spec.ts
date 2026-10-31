// The risk tier (proposal 2026-10-27 B1): the max over signals the change's own files and the base config give; nothing lowers it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessRisk, reviewSignals, riskOf } from './risk.ts'
import { defaultRegistry } from './registry.ts'

const clean = { 'plan.md': '# Plan\n\n## Contracts\nnone\n', 'review.md': 'verdict: pass\n## Findings\n' }
const input = (o: Partial<Parameters<typeof assessRisk>[0]> = {}, files: Record<string, string> = clean) => ({
  files: ['src/cart.ts'], lines: 10, slugs: ['cart-add'], read: (_slug: string, name: string) => files[name] ?? '',
  access: [], risk: { enforce: false, alwaysHuman: [], maxLines: 400, window: 20, maxRevertRate: 0.1 }, contractGlobs: [], ci: false, ...o,
})
const access = (intent: string) => ({ action: 'refund an order', allowed: ['admin'], nobody: false, interfaces: ['api'], intent })
const TWO = 'two reviewers, one a code owner, recommended; enforce it in branch protection'

test('a clean, reviewed, two-way change is tier 0 with no reasons', () => {
  assert.deepEqual(assessRisk(input()), { tier: 0, reasons: [] })
})

test('an always-human path is tier 2: protected harness files, workflows, and the team globs', () => {
  assert.deepEqual(assessRisk(input({ files: ['.github/workflows/deploy.yml'] })), { tier: 2, reasons: ['always-human path: .github/workflows/deploy.yml', TWO] })
  assert.equal(assessRisk(input({ files: ['CLAUDE.md'] })).tier, 2)
  assert.equal(assessRisk(input({ files: ['src/billing/charge.ts'], risk: { enforce: false, alwaysHuman: ['src/billing/**'], maxLines: 400, window: 20, maxRevertRate: 0.1 } })).tier, 2)
})

test('in CI a path matches case-insensitively', () => {
  const risk = { enforce: false, alwaysHuman: ['src/billing/**'], maxLines: 400, window: 20, maxRevertRate: 0.1 }
  assert.equal(assessRisk(input({ files: ['SRC/Billing/x.ts'], risk, ci: true })).tier, 2)
  assert.equal(assessRisk(input({ files: ['SRC/Billing/x.ts'], risk })).tier, 0)
})

test('a change that builds an ## Access action is tier 2', () => {
  assert.deepEqual(assessRisk(input({ access: [access('cart-add')] })).reasons, ['access: cart-add builds "refund an order"', TWO])
  assert.equal(assessRisk(input({ access: [access('other')] })).tier, 0)
})

test('a one-way door is tier 1, from the plan or from a file the base config calls a contract', () => {
  assert.deepEqual(assessRisk(input({}, { ...clean, 'plan.md': '## Contracts\n- api.yaml\n' })), { tier: 1, reasons: ['one-way door'] })
  assert.deepEqual(assessRisk(input({ files: ['api/openapi.yaml'], contractGlobs: ['api/**'] })), { tier: 1, reasons: ['one-way door'] })
})

test('no change record, or no review.md, is tier 1, never 0', () => {
  assert.deepEqual(assessRisk(input({ slugs: [] })), { tier: 1, reasons: ['no change record'] })
  assert.deepEqual(assessRisk(input({}, { 'plan.md': clean['plan.md'] })), { tier: 1, reasons: ['no review.md: the change was not reviewed'] })
})

test('open, dismissed and unverifiable findings are tier 1, counted and pluralised', () => {
  const review = 'verdict: changes-needed\n## Findings\n- [severity: high] [category: tests] a.ts:1: p → f → fixed (confirmed)\n- [severity: medium] [category: data] b.ts:2: q → g → reopened: still\n- [severity: medium] [category: data] c.ts:2: q → g → fixed\n## Dismissed\n- c.ts:3 r → dismissed: spec B2\n## Unverifiable\n- x → settle by: a journey\n- y → settle by: a test\n'
  assert.deepEqual(assessRisk(input({}, { ...clean, 'review.md': review })).reasons, ['2 findings still open', '1 finding dismissed by the builder', '2 items the reviewer could not verify'])
  assert.deepEqual(reviewSignals(review), { open: 2, dismissed: 1, unverifiable: 2 })
})

test('a diff over risk.maxLines is tier 1', () => {
  assert.deepEqual(assessRisk(input({ lines: 401 })), { tier: 1, reasons: ['diff of 401 lines is over risk.maxLines (400)'] })
  assert.equal(assessRisk(input({ lines: 400 })).tier, 0)
})

test('the max signal wins and every reason is kept', () => {
  const r = assessRisk(input({ files: ['.github/workflows/x.yml'], lines: 999 }))
  assert.equal(r.tier, 2)
  assert.deepEqual(r.reasons, ['always-human path: .github/workflows/x.yml', 'diff of 999 lines is over risk.maxLines (400)', TWO])
})

test('a rename is judged by its old path too: moving a workflow or contract out of its glob still counts', () => {
  const moved = [{ file: 'ci/deploy.yml.bak', from: '.github/workflows/deploy.yml', status: 'R' as const, added: [], removed: [] }]
  assert.deepEqual(riskOf(moved, ['x'], defaultRegistry(), [], true).reasons.slice(0, 1), ['always-human path: .github/workflows/deploy.yml'])
  const reg = defaultRegistry(); reg.contracts.files = ['api/**']
  assert.ok(riskOf([{ ...moved[0]!, file: 'old/openapi.yaml', from: 'api/openapi.yaml' }], ['x'], reg, [], true).reasons.includes('one-way door'))
})

// shop_app cart-storage 2026-10-27: 1222 lines tripped maxLines (400) mostly because runs.jsonl and the wiki pages rode in the same commit.
test('records the harness generates (evidence, wiki pages) do not count towards the diff size', () => {
  const rows = (file: string, n: number) => ({ file, status: 'A' as const, added: Array.from({ length: n }, (_, i) => ({ n: i + 1, text: 'x' })), removed: [] })
  const generated = [rows('.rig/changes/cart/evidence/runs.jsonl', 300), rows('.rig/wiki/cart.md', 300), rows('.rig/wiki/state.json', 100)]
  assert.doesNotMatch(riskOf(generated as never, ['cart'], defaultRegistry(), [], false).reasons.join(), /diff of/)
  const code = [...generated, rows('src/cart.py', 450)]
  assert.match(riskOf(code as never, ['cart'], defaultRegistry(), [], false).reasons.join(), /diff of 450 lines/)
})

// Opus-gating (eval 2026-10-30: four unconditional Opus launches were ~80% of a rig run's spend): before the review exists, the tier must
// come from the change itself, since "no review.md" would make every change tier 1.
test('preReview: the tier ignores review-derived signals, so a small clean change is tier 0 before any review exists', () => {
  const noReview = { 'plan.md': clean['plan.md'] }
  assert.equal(assessRisk(input({}, noReview)).tier, 1)
  assert.deepEqual(assessRisk(input({ preReview: true }, noReview)), { tier: 0, reasons: [] })
})

test('preReview keeps the change signals: a one-way door is tier 1, a big diff is tier 1, an access action is tier 2', () => {
  const noReview = { 'plan.md': clean['plan.md'] }
  assert.deepEqual(assessRisk(input({ preReview: true, lines: 401 }, noReview)).reasons, ['diff of 401 lines is over risk.maxLines (400)'])
  assert.equal(assessRisk(input({ preReview: true }, { 'plan.md': '## Contracts\n- api.yaml\n' })).tier, 1)
  assert.equal(assessRisk(input({ preReview: true, access: [access('cart-add')] }, noReview)).tier, 2)
})
