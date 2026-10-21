import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, write, gitIn, sdlc } from './testkit.ts'
import { buildReport, reportText } from './report.ts'

let repo: string
const at = (iso: string): void => { process.env.GIT_AUTHOR_DATE = iso; process.env.GIT_COMMITTER_DATE = iso }
const commit = (msg: string): void => { gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', msg) }
const REVIEW = '# Review\n- [category: missing-validation] input not checked\n'

// One change on a branch, merged with a merge commit: `codeLines` of source, runs as given, approved `hours` after the first commit.
function ship(slug: string, day: string, codeLines: number, runs: object[], hours: number, review = ''): string {
  gitIn(repo, 'checkout', '-qb', slug)
  at(`${day}T08:00:00Z`)
  write(repo, `.rig/changes/${slug}/spec.md`, '# Spec\n')
  commit(`spec ${slug}`)
  at(`${day}T12:00:00Z`)
  write(repo, `src/${slug}.js`, Array.from({ length: codeLines }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n')
  write(repo, `.rig/changes/${slug}/approval.json`, JSON.stringify({ by: 'p', at: new Date(Date.parse(`${day}T08:00:00Z`) + hours * 3_600_000).toISOString() }))
  write(repo, `.rig/changes/${slug}/evidence/runs.jsonl`, runs.map(r => JSON.stringify(r)).join('\n') + '\n')
  write(repo, `.rig/changes/${slug}/review.md`, review)
  write(repo, `.rig/changes/${slug}/pr.md`, '# PR\n')
  commit(`ship ${slug}`)
  gitIn(repo, 'checkout', '-q', 'main')
  at(`${day}T18:00:00Z`)
  gitIn(repo, 'merge', '--no-ff', '-qm', `merge ${slug}`, slug)
  return gitIn(repo, 'rev-parse', 'HEAD')
}
const pass = { cmd: 'npm test', exit: 0 }

beforeEach(() => {
  repo = makeRepo()
  ship('alpha', '2026-10-01', 10, [pass, { cmd: 'red', exit: 1, expectFail: true }], 2, REVIEW)
  ship('beta', '2026-10-02', 30, [{ cmd: 'npm test', exit: 1 }, pass], 4, REVIEW)
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'beta', sensor: 'size', file: 'src/beta.js', reason: 'generated', by: 'p', at: '2026-10-02T00:00:00Z' }) + '\n')
  commit('waive')
  const gamma = ship('gamma', '2026-10-03', 20, [pass], 6)
  at('2026-10-04T09:00:00Z')
  gitIn(repo, 'revert', '-m', '1', '--no-edit', gamma)
})

test('report: size, first-pass, reverts, time to approval, waivers and repeat mistakes come from git and the change records', () => {
  const r = buildReport(repo)
  assert.deepEqual([r.merged, r.shipped], [3, 2], 'gamma was reverted, so its records left the tree')
  assert.deepEqual(r.prLines, { median: 20, max: 30 })
  assert.deepEqual(r.firstPass, { measured: 2, clean: 1 }, 'beta failed before it passed; alpha only failed an expected red run')
  assert.equal(r.reverted, 1)
  assert.deepEqual(r.hoursToApproval, { median: 3, of: 2 })
  assert.equal(r.waiversPerChange, 0.5)
  assert.deepEqual(r.repeat, { classes: 1, changes: 2 })
})

test('report: --since drops earlier changes, and what git cannot know is named, not guessed', () => {
  const r = buildReport(repo, '2026-10-02')
  assert.deepEqual([r.merged, r.shipped], [2, 1])
  assert.equal(r.since, '2026-10-02')
  const text = reportText(r)
  assert.match(text, /not available here: CI first-pass rate .*review time/)
  assert.doesNotMatch(text, /PR count|prs merged/i)
})

test('sdlc report prints the text, and --json the same numbers', () => {
  const json = JSON.parse(sdlc(repo, ['report', '--json']).stdout)
  assert.equal(json.merged, 3)
  assert.match(sdlc(repo, ['report']).stdout, /rig report: 3 merged change\(s\), 2 with records[\s\S]*reverted\s+1 of 3/)
})

test('report: a repo with no shipped changes reports zeros, not errors', () => {
  const empty = makeRepo()
  assert.deepEqual([buildReport(empty).merged, buildReport(empty).prLines, buildReport(empty).hoursToApproval], [0, null, null])
})

test('report: one commit that ships two changes counts both, and a timed-out expected failure is not clean', () => {
  at('2026-10-05T09:00:00Z')
  for (const slug of ['delta', 'echo']) write(repo, `.rig/changes/${slug}/pr.md`, '# PR\n')
  write(repo, '.rig/changes/echo/evidence/runs.jsonl', JSON.stringify({ cmd: 'red', exit: 124, expectFail: true, timedOut: true }) + '\n')
  commit('squash two changes')
  const r = buildReport(repo)
  assert.equal(r.merged, 5)
  assert.deepEqual(r.firstPass, { measured: 3, clean: 1 })
})
