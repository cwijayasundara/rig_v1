// C6: `sdlc audit seed|reveal` (human-only, record kept outside the PR) and the review-health table.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'
import { buildReport, reportText } from './report.ts'
import { reviewHealth, healthText, seedPick, mentions } from './audit.ts'

const posix = process.platform !== 'win32'
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rig-audit-'))

// A repo on branch feat with a pushed remote and a fake gh answering pr view, the user, review comments, reviews, issue comments and label calls (logged to gh.log).
const LATE = '2999-01-01T00:00:00Z'
function setup(comments: unknown[] = [], reviews: unknown[] = [], issueComments: unknown[] = []) {
  const repo = makeRepo()
  write(repo, 'src/calc.ts', 'export const add = (a: number, b: number) => a + b\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'branch', '-M', 'main')
  const remote = tmp(); spawnSync('git', ['init', '-q', '--bare', remote])
  gitIn(repo, 'remote', 'add', 'origin', remote); gitIn(repo, 'push', '-q', 'origin', 'main')
  gitIn(repo, 'checkout', '-qb', 'feat')
  write(repo, 'src/calc.ts', 'export const add = (a: number, b: number) => a + b\nexport const big = (n: number) => n > 10 && n < 99\n')
  gitIn(repo, 'commit', '-qam', 'feat'); gitIn(repo, 'push', '-q', 'origin', 'feat')
  const bin = tmp(), log = path.join(bin, 'gh.log')
  const view = JSON.stringify({ headRefName: 'feat', baseRefName: 'main', author: { login: 'dev' } })
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in\n  *"pr view"*) echo '${view}' ;;\n  *"api user"*) echo auditor ;;\n  *pulls/7/comments*) echo '${JSON.stringify([comments])}' ;;\n  *pulls/7/reviews*) echo '${JSON.stringify([reviews])}' ;;\n  *issues/7/comments*) echo '${JSON.stringify([issueComments])}' ;;\n  *) echo '[[]]' ;;\nesac\n`, { mode: 0o755 })
  const env = { PATH: `${bin}:${process.env.PATH}`, SDLC_HUMAN: '1' }
  return { repo, remote, env, ghLog: () => fs.readFileSync(log, 'utf8') }
}
const auditFile = (repo: string) => path.join(repo, gitIn(repo, 'rev-parse', '--git-path', 'rig-audits.jsonl').trim())
const rowOf = (repo: string) => JSON.parse(fs.readFileSync(auditFile(repo), 'utf8').trim())

test('audit commands refuse without SDLC_HUMAN', { skip: !posix }, () => {
  const { repo, env } = setup()
  for (const sub of ['seed', 'reveal']) {
    const r = sdlc(repo, ['audit', sub, '7'], { env: { PATH: env.PATH } })
    assert.notEqual(r.code, 0)
    assert.match(r.stderr, /human-only/)
  }
})

test('seed sets the rig-hold label, plants an operator flip under a neutral subject, pushes one commit, and records it (with the auditor and the sha) outside the PR', { skip: !posix }, () => {
  const { repo, remote, env, ghLog } = setup()
  const r = sdlc(repo, ['audit', 'seed', '7'], { env })
  assert.equal(r.code, 0, r.stderr + r.stdout)
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s').trim(), 'fix: tidy calc.ts')
  assert.doesNotMatch(gitIn(repo, 'log', '-1', '--format=%B'), /seed|audit|defect/i)
  assert.match(ghLog(), /issues\/7\/labels[^\n]*rig-hold/)
  assert.equal(gitIn(repo, 'rev-list', '--count', 'main..feat').trim(), '2', 'one commit added')
  assert.match(fs.readFileSync(path.join(repo, 'src/calc.ts'), 'utf8'), /n > 10 \|\| n < 99|n <= 10 && |n > 10 && n >= 99/)
  assert.equal(spawnSync('git', ['rev-parse', 'feat'], { cwd: remote, encoding: 'utf8' }).stdout.trim(), gitIn(repo, 'rev-parse', 'HEAD').trim(), 'pushed')
  const row = rowOf(repo)
  assert.equal(row.pr, 7); assert.equal(row.file, 'src/calc.ts'); assert.equal(row.line, 2); assert.equal(row.by, 'Tester'); assert.match(row.id, /^s7-/)
  assert.equal(row.login, 'auditor'); assert.equal(row.sha, gitIn(repo, 'rev-parse', 'HEAD').trim())
  assert.equal(gitIn(repo, 'ls-files', '--', '.rig/audits.jsonl').trim(), '', 'the record is in no commit')
  assert.doesNotMatch(gitIn(repo, 'status', '--porcelain'), /audits/)
})

const cm = (path: string, line: number, login: string, at = LATE) => ({ path, line, body: 'this looks wrong', user: { login }, created_at: at })
test('reveal records caught from review comments within 2 lines, reverts and pushes the seed, and lifts the label', { skip: !posix }, () => {
  for (const [comments, caught] of [[[cm('src/calc.ts', 3, 'lead')], true], [[cm('src/calc.ts', 40, 'lead')], false]] as const) {
    const { repo, remote, env, ghLog } = setup([...comments])
    sdlc(repo, ['audit', 'seed', '7'], { env })
    const r = sdlc(repo, ['audit', 'reveal', '7'], { env })
    assert.equal(r.code, 0, r.stderr + r.stdout)
    assert.match(r.stdout, caught ? /caught/ : /missed/)
    assert.equal(rowOf(repo).caught, caught)
    assert.match(gitIn(repo, 'log', '-1', '--format=%s'), /^Revert "fix: tidy calc\.ts"/)
    assert.doesNotMatch(fs.readFileSync(path.join(repo, 'src/calc.ts'), 'utf8'), /\|\|/)
    assert.equal(spawnSync('git', ['rev-parse', 'feat'], { cwd: remote, encoding: 'utf8' }).stdout.trim(), gitIn(repo, 'rev-parse', 'HEAD').trim())
    assert.match(ghLog(), /DELETE[^\n]*labels\/rig-hold/, 'the hold is lifted only after the hunk is gone')
  }
})

test('reveal counts only what came after the seed, from people other than the auditor and the author, and reads issue comments too', { skip: !posix }, () => {
  const stale = cm('src/calc.ts', 2, 'lead', '2000-01-01T00:00:00Z'), own = cm('src/calc.ts', 2, 'auditor'), mine = cm('src/calc.ts', 2, 'dev')
  const { repo, env } = setup([stale, own, mine], [{ user: { login: 'dev' }, state: 'COMMENTED', body: 'src/calc.ts:2', submitted_at: LATE }])
  sdlc(repo, ['audit', 'seed', '7'], { env })
  assert.match(sdlc(repo, ['audit', 'reveal', '7'], { env }).stdout, /missed/)
  const r2 = setup([], [], [{ user: { login: 'lead' }, body: 'see src/calc.ts:2, that flips', created_at: LATE }])
  sdlc(r2.repo, ['audit', 'seed', '7'], { env: r2.env })
  assert.match(sdlc(r2.repo, ['audit', 'reveal', '7'], { env: r2.env }).stdout, /caught by lead/)
})

test('reveal is re-runnable: it skips a revert that the head already holds', { skip: !posix }, () => {
  const { repo, env, ghLog } = setup([cm('src/calc.ts', 2, 'lead')])
  sdlc(repo, ['audit', 'seed', '7'], { env })
  gitIn(repo, 'revert', '--no-edit', 'HEAD') // an interrupted reveal: reverted locally, never pushed
  const before = gitIn(repo, 'rev-list', '--count', 'HEAD').trim()
  const r = sdlc(repo, ['audit', 'reveal', '7'], { env })
  assert.equal(r.code, 0, r.stderr + r.stdout)
  assert.equal(gitIn(repo, 'rev-list', '--count', 'HEAD').trim(), before, 'no second revert')
  assert.match(ghLog(), /DELETE[^\n]*labels\/rig-hold/)
})

test('reveal pulls a moved remote first, and reverts by content when the seed is no longer an ancestor of the remote head', { skip: !posix }, () => {
  const { repo, remote, env, ghLog } = setup([cm('src/calc.ts', 2, 'lead')])
  sdlc(repo, ['audit', 'seed', '7'], { env })
  const other = tmp(); spawnSync('git', ['clone', '-q', '-b', 'feat', remote, other])
  write(other, 'src/other.ts', 'export const o = 1\n'); gitIn(other, 'add', '-A'); gitIn(other, '-c', 'user.email=t@e', '-c', 'user.name=T', 'commit', '-qm', 'someone else'); gitIn(other, 'push', '-q', 'origin', 'feat')
  const r = sdlc(repo, ['audit', 'reveal', '7'], { env })
  assert.equal(r.code, 0, r.stderr + r.stdout)
  assert.ok(fs.existsSync(path.join(repo, 'src/other.ts')), 'pulled')
  const second = setup([cm('src/calc.ts', 2, 'lead')])
  sdlc(second.repo, ['audit', 'seed', '7'], { env: second.env })
  gitIn(second.repo, 'reset', '-q', '--hard', 'HEAD~1') // history rewritten: the seed commit is gone from the branch
  write(second.repo, 'src/calc.ts', 'export const add = (a: number, b: number) => a + b\nexport const big = (n: number) => n > 10 || n < 99\n')
  gitIn(second.repo, 'commit', '-qam', 'rewritten'); gitIn(second.repo, 'push', '-qf', 'origin', 'feat')
  const r2 = sdlc(second.repo, ['audit', 'reveal', '7'], { env: second.env })
  assert.equal(r2.code, 0, r2.stderr + r2.stdout)
  assert.doesNotMatch(fs.readFileSync(path.join(second.repo, 'src/calc.ts'), 'utf8'), /\|\|/)
  assert.match(second.ghLog(), /DELETE[^\n]*labels\/rig-hold/)
  assert.ok(ghLog())
})

test('mentions: a review body naming file:line within 2 lines counts', () => {
  assert.equal(mentions('see src/calc.ts:4 please', 'src/calc.ts', 2), true)
  assert.equal(mentions('see src/calc.ts:5 please', 'src/calc.ts', 2), false)
  assert.equal(mentions('src/other.ts:2', 'src/calc.ts', 2), false)
})

test('seedPick is deterministic by PR number and prefers a survivor from --from lines', () => {
  const added = [{ file: 'a.ts', n: 1, text: 'const x = a + b' }, { file: 'a.ts', n: 2, text: '// a + b' }, { file: 'a.ts', n: 3, text: 'if (x === y) go()' }]
  assert.deepEqual(seedPick(added, 7, [])?.line, seedPick(added, 7, [])?.line)
  assert.equal(seedPick(added, 7, [{ file: 'a.ts', line: 3 }])?.line, 3)
  assert.equal(seedPick([{ file: 'a.ts', n: 1, text: 'return' }], 7, []), null)
})

const T0 = '2026-11-01T10:00:00Z'
test('review health: per approver approval rate, comments per PR, median hours to first review, seeded catch rate', () => {
  const pulls = [{ number: 1, merged_at: '2026-11-02T00:00:00Z', created_at: T0, user: { login: 'dev' } }, { number: 2, merged_at: '2026-11-03T00:00:00Z', created_at: T0, user: { login: 'dev' } }]
  const reviews: Record<number, unknown[]> = {
    1: [{ user: { login: 'lead' }, state: 'APPROVED', submitted_at: '2026-11-01T12:00:00Z' }],
    2: [{ user: { login: 'lead' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-11-01T14:00:00Z' }, { user: { login: 'lead' }, state: 'APPROVED', submitted_at: '2026-11-01T20:00:00Z' }, { user: { login: 'bot[bot]', type: 'Bot' }, state: 'APPROVED', submitted_at: T0 }],
  }
  const comments: Record<number, unknown[]> = { 1: [{ user: { login: 'lead' } }], 2: [{ user: { login: 'lead' } }, { user: { login: 'lead' } }, { user: { login: 'dev' } }] }
  const fetch = (e: string): unknown[] => {
    if (e.includes('pulls?state=closed')) return pulls
    const n = Number(/(?:pulls|issues)\/(\d+)\//.exec(e)?.[1])
    return e.includes('/reviews') ? reviews[n] ?? [] : e.includes('pulls/') && e.includes('/comments') ? comments[n] ?? [] : []
  }
  const rows = reviewHealth(fetch, null, 50, [{ pr: 1, id: 's1-a', caught: true, reviewers: ['lead'], catchers: ['lead'] }, { pr: 2, id: 's2-b', caught: false, reviewers: ['lead'], catchers: [] }])
  assert.deepEqual(rows, [{ approver: 'lead', prs: 2, approvalRate: 1, commentsPerPr: 1.5, medianHoursToFirst: 3, seeded: { caught: 1, of: 2 } }])
  const text = healthText(rows)
  assert.match(text, /approver\s+PRs\s+approval rate\s+comments\/PR\s+hours to first review\s+seeded caught/)
  assert.match(text, /lead\s+2\s+100%\s+1\.5\s+3\s+1\/2/)
})

test('the report text carries the review-health table with --github data, and says when it is unavailable', () => {
  const r = buildReport(makeRepo())
  r.reviewHealth = [{ approver: 'lead', prs: 2, approvalRate: 0.5, commentsPerPr: 1, medianHoursToFirst: 2, seeded: null }]
  assert.match(reportText(r), /review health[^\n]*\n\s+approver[^\n]*\n\s+lead\s+2\s+50%\s+1\s+2\s+-/)
  r.reviewHealth = { unavailable: 'gh is not logged in' }
  assert.match(reportText(r), /review health[\s\S]*unavailable: gh is not logged in/)
})
