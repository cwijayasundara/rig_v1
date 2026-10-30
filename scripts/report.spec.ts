import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, write, gitIn, sdlc } from './testkit.ts'
import { buildReport, reportText, humanTime } from './report.ts'

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
  assert.deepEqual(r.tiers, { '0': { merged: 0, reverted: 0 }, '1': { merged: 0, reverted: 0 }, '2': { merged: 0, reverted: 0 }, unknown: { merged: 3, reverted: 1 } }, 'bodies with no Risk section count as unknown, never as tier 0')
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
  assert.match(sdlc(repo, ['report']).stdout, /rig report: 3 merged change\(s\), 2 with records[\s\S]*reverted\s+1 of 3[\s\S]*by tier \(merged\/reverted\)\s+0: 0\/0, 1: 0\/0, 2: 0\/0, unknown: 3\/1/)
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

// A fake GitHub: the endpoint (without the query string) to its rows. Three merged PRs, one open, one by a bot-reviewed author.
const pull = (number: number, merged: string | null, created: string, login = 'ann'): object => ({ number, merged_at: merged, created_at: created, user: { login, type: 'User' } })
const person = (login: string): object => ({ login, type: 'User' })
const bot = { login: 'claude[bot]', type: 'Bot' }
const fakeGithub = (table: Record<string, object[]>) => (endpoint: string): object[] => table[endpoint.replace(/^repos\/\{owner\}\/\{repo\}\//, '').replace(/\?.*$/, '')] ?? []

test('report --github: approvals count distinct humans by latest state, bots and the author never count, wait runs to the first human review', () => {
  const t = humanTime(fakeGithub({
    pulls: [pull(1, '2026-10-02T10:00:00Z', '2026-10-02T08:00:00Z'), pull(2, '2026-10-03T10:00:00Z', '2026-10-03T08:00:00Z'), pull(3, '2026-10-04T10:00:00Z', '2026-10-04T08:00:00Z'), pull(4, null, '2026-10-04T08:00:00Z')],
    'pulls/1/reviews': [{ user: person('bo'), state: 'CHANGES_REQUESTED', submitted_at: '2026-10-02T09:00:00Z', body: 'fix' }, { user: person('bo'), state: 'APPROVED', submitted_at: '2026-10-02T09:30:00Z', body: '' }, { user: bot, state: 'APPROVED', submitted_at: '2026-10-02T08:05:00Z', body: 'ok' }, { user: person('ann'), state: 'APPROVED', submitted_at: '2026-10-02T09:40:00Z' }],
    'pulls/1/comments': [{ user: person('bo') }, { user: bot }, { user: person('ann') }],
    'issues/1/comments': [{ user: person('cy') }],
    'pulls/2/reviews': [{ user: person('bo'), state: 'APPROVED', submitted_at: '2026-10-03T14:00:00Z', body: '' }, { user: person('bo'), state: 'COMMENTED', submitted_at: '2026-10-03T14:05:00Z', body: 'nit' }],
  }), null)
  assert.ok(!('unavailable' in t))
  const h = t as Exclude<typeof t, { unavailable: string }>
  assert.equal(h.prs, 3, 'the open PR is not read')
  assert.deepEqual(h.approvals, { median: 1, p95: 1 }, 'PR 1: bo approved after asking for changes (1); the bot and the author are not counted; PR 3 has none (0)')
  assert.deepEqual(h.comments, { median: 1, p95: 3 }, 'PR 1: bo inline, cy talk, bo review body "fix" (3); PR 2: the nit (1); PR 3: 0')
  assert.deepEqual(h.waitHours, { median: 3.5, p95: 6, of: 2 }, 'PR 1 waited 1h, PR 2 waited 6h, so the median is their mean; the human review is the first non-author one')
  assert.equal(h.unreviewed, 1)
})

test('report --github: --since and the limit trim the window; an unreadable GitHub is named, not guessed', () => {
  const pulls = [pull(5, '2026-10-05T10:00:00Z', '2026-10-05T08:00:00Z'), pull(6, '2026-09-01T10:00:00Z', '2026-09-01T08:00:00Z')]
  assert.equal((humanTime(fakeGithub({ pulls }), '2026-10-01') as { prs: number }).prs, 1)
  assert.equal((humanTime(fakeGithub({ pulls }), null, 1) as { prs: number }).prs, 1)
  const stale = [pull(7, '2026-10-01T10:00:00Z', '2026-10-01T08:00:00Z'), pull(8, '2026-10-09T10:00:00Z', '2026-10-09T08:00:00Z')] // listed by update: the older merge comes first
  const seen: string[] = []
  humanTime(e => { seen.push(e); return e.startsWith('repos/{owner}/{repo}/pulls?') ? stale : [] }, null, 1)
  assert.ok(seen.some(e => e.includes('/pulls/8/')) && !seen.some(e => e.includes('/pulls/7/')), 'the limit keeps the most recently merged, not the most recently updated')
  const t = humanTime(() => { throw new Error('gh: not logged in\nextra') }, null)
  assert.deepEqual(Object.keys(t), ['unavailable'])
  assert.match((t as { unavailable: string }).unavailable, /not logged in.*gh installed/)
})

test('report --github through the CLI: the default report stays git-only, --github adds the block, a missing gh says so', () => {
  assert.doesNotMatch(sdlc(repo, ['report']).stdout, /human time/)
  const r = sdlc(repo, ['report', '--github'], { env: { RIG_GH: '/nonexistent/gh' } })
  assert.equal(r.code, 0)
  assert.match(r.stdout, /human time \(GitHub\)\s+unavailable/)
  assert.match(r.stdout, /not available here: CI first-pass rate .*review time/, 'review time stays unavailable when GitHub could not be read')
})
