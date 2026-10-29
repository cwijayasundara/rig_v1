// shop_app sprint 1 (2026-10-29): /rig:chart with no argument worked only when the model chose to look; `chart next` decides.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, sdlc, write } from './testkit.ts'

const INTENT = '---\nsprint: 0\nprd: [FR-1]\ndepends: []\nestimate_days: 1\nkind: internal\n---\n# Walking skeleton\n'
const next = (repo: string) => JSON.parse(sdlc(repo, ['chart', 'next', '--json']).stdout) as { sprint: number | null; prd: string | null; candidates: unknown[]; why: string }

test('chart next: one PRD with no intents is the sprint to chart, from docs/prd in any of its four shapes', () => {
  for (const rel of ['docs/prd/sprint-1/prd.md', 'docs/prd/sprint-1-cart/prd.md', 'docs/prd/sprint-1.md', 'docs/prd/sprint-1-cart.md']) {
    const repo = makeRepo()
    write(repo, rel, '# PRD\n')
    assert.deepEqual(next(repo), { sprint: 1, prd: rel, candidates: [{ sprint: 1, prd: rel }], why: 'the one PRD with no intents yet' })
  }
})

test('chart next: a charted sprint is skipped, and two new PRDs are a question, not a guess', () => {
  const repo = makeRepo()
  write(repo, '.rig/product/sprints/sprint-0/prd.md', '# PRD\n')
  write(repo, '.rig/product/sprints/sprint-0/intents/walking-skeleton.md', INTENT)
  assert.deepEqual(next(repo), { sprint: 1, prd: null, candidates: [], why: next(repo).why })
  assert.match(next(repo).why, /no PRD without intents/)
  write(repo, 'docs/prd/sprint-1.md', '# PRD\n')
  assert.equal(next(repo).sprint, 1)
  write(repo, 'docs/prd/sprint-2.md', '# PRD\n')
  const two = next(repo)
  assert.equal(two.sprint, null)
  assert.equal(two.candidates.length, 2)
})

test('chart next: with no PRD to chart it names the next sprint number and no path', () => {
  const repo = makeRepo()
  assert.deepEqual({ ...next(repo), why: '' }, { sprint: 0, prd: null, candidates: [], why: '' })
  write(repo, '.rig/product/sprints/sprint-0/intents/walking-skeleton.md', INTENT)
  const after = next(repo)
  assert.equal(after.sprint, 1)
  assert.equal(after.prd, null)
})
