// `sdlc audit seed|reveal <pr>` (three-gates C6, human-only): a seeded defect measures whether the final review really reads the diff. Run `seed` right after the PR opens, before the first
// review: it labels the PR `rig-hold` (a hold no commit can clear, read by rig-check through gh; see prcheck.ts), then pushes ONE commit `fix: tidy <file>` that flips an operator on a line the PR
// changed. `reveal` records whether a comment or review made after the seed (not by the auditor or the PR author) named that file:line (+-2), pulls, reverts the seed unless the head already
// reverts it, checks the flipped hunk is gone from the remote head, and only then lifts the label. The record {pr, id, sha, login, file, line, at, by} is in <git dir>/rig-audits.jsonl: inside .git,
// so in no commit, never on the PR branch where the reviewer could read it, and it lives on the auditor's clone, where `report --github` reads it. Review health: `healthText`, `reviewHealth`.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { ROOT, read, readJsonl, out, fail, git, whoami, optString, type Args } from './core.ts'
import { gh } from './model.ts'
import { parseReport } from './mutscore.ts'
import { isSrc, HOLD } from './prcheck.ts'

export type Audit = { pr: number; id: string; sha?: string; login?: string; file: string; line: number; at: string; by: string; caught?: boolean; reviewers?: string[]; catchers?: string[]; revealedAt?: string }
const auditPath = (): string => path.resolve(ROOT, git(['rev-parse', '--git-path', 'rig-audits.jsonl']) ?? '.git/rig-audits.jsonl')
export const readAudits = (): Audit[] => (fs.existsSync(auditPath()) ? readJsonl<Audit>(auditPath()) : [])
const writeAudits = (rows: Audit[]): void => fs.writeFileSync(auditPath(), rows.map(r => JSON.stringify(r)).join('\n') + '\n')

const FLIPS: [string, string][] = [[' && ', ' || '], [' || ', ' && '], [' === ', ' !== '], [' !== ', ' === '], [' == ', ' != '], [' != ', ' == '], [' <= ', ' > '], [' >= ', ' < '], [' < ', ' >= '], [' > ', ' <= '], [' + ', ' - '], [' - ', ' + ']]
type Added = { file: string; n: number; text: string }
// One candidate per changed source line that holds an operator; the PR number picks among them (deterministic). `hot` (mutants from --from) narrows the choice when it matches any.
export function seedPick(added: Added[], pr: number, hot: { file: string; line: number }[]): { file: string; line: number; text: string } | null {
  const all = added.filter(a => !/^\s*(\/\/|#|\*|\/\*)/.test(a.text)).flatMap(a => { const f = FLIPS.find(([from]) => a.text.includes(from)); return f ? [{ file: a.file, line: a.n, text: a.text.replace(f[0], f[1]) }] : [] })
  const near = all.filter(c => hot.some(h => h.line === c.line && (c.file === h.file || c.file.endsWith(`/${h.file}`) || h.file.endsWith(`/${c.file}`))))
  const pool = near.length ? near : all
  return pool[pr % (pool.length || 1)] ?? null
}
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A text that names file:line (or file#L<n>, file line <n>) within 2 lines of the seed.
export const mentions = (text: string, file: string, line: number): boolean => [...text.matchAll(new RegExp(`${esc(file)}(?::|#L|\\s+line\\s+|\\s+L)(\\d+)`, 'g'))].some(m => Math.abs(Number(m[1]) - line) <= 2)

function addedLines(base: string): Added[] {
  const out: Added[] = []
  let file = '', n = 0
  for (const l of (git(['diff', '-U0', '--no-color', base, 'HEAD']) ?? '').split('\n')) {
    if (l.startsWith('+++ ')) file = l.startsWith('+++ b/') ? l.slice(6) : ''
    else if (/^@@/.test(l)) n = Number(/\+(\d+)/.exec(l)?.[1] ?? 0)
    else if (l.startsWith('+') && file) { out.push({ file, n, text: l.slice(1) }); n++ }
  }
  return out.filter(a => isSrc(a.file))
}

type PrInfo = { headRefName: string; baseRefName: string; author?: { login?: string } }
function onBranch(pr: number): PrInfo {
  const info = JSON.parse(gh(['pr', 'view', String(pr), '--json', 'headRefName,baseRefName,author'], ROOT)) as PrInfo
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== info.headRefName) fail(`check out the PR's branch first (${info.headRefName}); the seed commit is made on it`)
  if (git(['status', '--porcelain'])) fail('the working tree has changes: commit or stash them first')
  return info
}

const holdRoute = (pr: number): string => `repos/{owner}/{repo}/issues/${pr}/labels`
// True while the seed's hunk can still be reverse-applied to the working tree (the flipped line is there).
function seeded(sha: string): boolean {
  const d = git(['diff', '-U0', '--no-color', `${sha}^`, sha])
  if (!d) fail(`the seed commit ${sha.slice(0, 7)} is not in this clone: reveal from the clone that seeded`)
  try { execFileSync('git', ['apply', '-R', '--check', '--unidiff-zero'], { cwd: ROOT, input: d + '\n', stdio: ['pipe', 'ignore', 'ignore'] }); return true } catch { return false }
}

function seed(pr: number, args: Args): void {
  const info = onBranch(pr)
  if (readAudits().some(a => a.pr === pr && a.caught === undefined)) fail(`PR ${pr} already has a seeded defect; run: audit reveal ${pr}`)
  const base = git(['merge-base', 'HEAD', `origin/${info.baseRefName}`]) ?? git(['merge-base', 'HEAD', info.baseRefName])
  if (!base) fail(`no merge-base with ${info.baseRefName} (fetch it first)`)
  const from = optString(args, 'from')
  const hot = from ? (() => { const ms = parseReport(optString(args, 'tool') ?? 'stryker', read(path.resolve(ROOT, from))); return (ms.some(m => !m.killed) ? ms.filter(m => !m.killed) : ms).map(m => ({ file: m.file, line: m.line })) })() : []
  const pick = seedPick(addedLines(base), pr, hot)
  if (!pick) fail('no changed source line holds an operator to flip: seed by hand')
  let login = ''
  try { login = gh(['api', 'user', '--jq', '.login'], ROOT).trim(); gh(['api', '-X', 'POST', holdRoute(pr), '-f', `labels[]=${HOLD}`], ROOT) } catch { fail(`could not label PR ${pr} ${HOLD} (gh needs pull-request write access): nothing was changed`) }
  const file = path.join(ROOT, pick.file), lines = read(file).split('\n')
  lines[pick.line - 1] = pick.text
  fs.writeFileSync(file, lines.join('\n'))
  const id = `s${pr}-${createHash('sha1').update(`${pick.file}:${pick.line}`).digest('hex').slice(0, 6)}`
  const unhold = (why: string): never => { try { gh(['api', '-X', 'DELETE', `${holdRoute(pr)}/${HOLD}`], ROOT) } catch { /* the label stays: lift it by hand */ } return fail(why) }
  if (git(['add', pick.file]) === null || git(['commit', '-q', '-m', `fix: tidy ${path.basename(pick.file)}`]) === null) unhold('could not commit the seed (a git hook refused it?): the working tree still holds the flip')
  if (git(['push', '-q', 'origin', `HEAD:${info.headRefName}`]) === null) unhold(`the seed is committed locally but the push failed: git reset --hard HEAD~1 to drop it, or push ${info.headRefName} and add the ${HOLD} label again`)
  writeAudits([...readAudits(), { pr, id, sha: git(['rev-parse', 'HEAD']) ?? '', login, file: pick.file, line: pick.line, at: new Date().toISOString(), by: whoami() ?? 'unknown' }])
  out(`seeded ${id} on PR ${pr}: PR labelled ${HOLD}, one commit pushed; the record is in ${path.relative(ROOT, auditPath())} (not in any commit). rig-check holds the merge until: audit reveal ${pr}`)
}

type Rev = { user?: { login?: string; type?: string } | null; state?: string; body?: string | null; path?: string; line?: number | null; original_line?: number | null; created_at?: string; submitted_at?: string }
function reveal(pr: number): void {
  const rows = readAudits(), row = rows.find(a => a.pr === pr && a.caught === undefined)
  if (!row) fail(`no unrevealed seeded defect recorded for PR ${pr} (run audit seed ${pr} on the clone that seeded it)`)
  if (!row.sha) fail('this record predates seed holds: lift any hold by hand and revert the seed commit')
  const info = onBranch(pr), head = info.headRefName
  if (git(['fetch', '-q', 'origin', head]) === null || git(['pull', '-q', '--ff-only', 'origin', head]) === null) fail(`could not bring ${head} up to date (git pull --ff-only failed): resolve it, then run audit reveal ${pr} again`)
  const all = (route: string): Rev[] => (JSON.parse(gh(['api', '--paginate', '--slurp', route], ROOT)) as Rev[][]).flat()
  // only what came after the seed, from people other than the auditor and the PR author
  const skip = new Set([row.login, info.author?.login].map(x => (x ?? '').toLowerCase()))
  const fresh = (rs: Rev[]): Rev[] => rs.filter(r => Date.parse(r.created_at ?? r.submitted_at ?? '') > Date.parse(row.at) && !skip.has((r.user?.login ?? '').toLowerCase()))
  const comments = fresh(all(`repos/{owner}/{repo}/pulls/${pr}/comments?per_page=100`)), reviews = fresh(all(`repos/{owner}/{repo}/pulls/${pr}/reviews?per_page=100`)), talk = fresh(all(`repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`))
  const says = (r: Rev): boolean => mentions(r.body ?? '', row.file, row.line)
  const names = (rs: Rev[]): string[] => [...new Set(rs.map(r => r.user?.login ?? '').filter(Boolean))]
  const catchers = names([...comments.filter(r => (r.path === row.file && Math.abs((r.line ?? r.original_line ?? 1e9) - row.line) <= 2) || says(r)), ...reviews.filter(says), ...talk.filter(says)])
  if (seeded(row.sha) && git(['revert', '--no-edit', row.sha]) === null) fail('git revert failed; resolve it, then run audit reveal again')
  if (git(['push', '-q', 'origin', `HEAD:${head}`]) === null) fail(`reverted locally but the push failed: push ${head}, then run audit reveal ${pr} again`)
  git(['fetch', '-q', 'origin', head])
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `origin/${head}`]) || seeded(row.sha)) fail(`the flipped line is still on the remote head of ${head}: the ${HOLD} label stays; fix it, push, then run audit reveal ${pr} again`)
  try { gh(['api', '-X', 'DELETE', `${holdRoute(pr)}/${HOLD}`], ROOT) } catch { fail(`the seed is gone but the ${HOLD} label could not be removed: remove it by hand`) }
  const caught = catchers.length > 0
  writeAudits(rows.map(a => (a === row ? { ...row, caught, catchers, reviewers: names([...comments, ...reviews, ...talk]), revealedAt: new Date().toISOString() } : a)))
  out(`audit ${row.id}: ${caught ? `caught by ${catchers.join(', ')}` : 'missed'} (${row.file}:${row.line}); seed reverted, hold lifted`)
}

export function cmdAudit(args: Args): void {
  const [sub, n] = args.pos
  if (sub !== 'seed' && sub !== 'reveal') fail('usage: audit seed <pr-number> [--from <mutation report> --tool <tool>] | audit reveal <pr-number>')
  if (process.env.SDLC_HUMAN !== '1') fail('audits are human-only: the person who audits runs `SDLC_HUMAN=1 sdlc.ts audit ' + sub + ' <pr>` (a reviewer must not know what is seeded)', 3)
  const pr = Number(n)
  if (!Number.isInteger(pr) || pr < 1) fail(`usage: audit ${sub} <pr-number>`)
  if (sub === 'seed') seed(pr, args)
  else reveal(pr)
}

// ---------- review health (report --github) ----------
export type Health = { approver: string; prs: number; approvalRate: number; commentsPerPr: number; medianHoursToFirst: number | null; seeded: { caught: number; of: number } | null }
type P = { number: number; merged_at: string | null; created_at: string; user: { login?: string } | null }
type R = { user: { login?: string; type?: string } | null; state: string; submitted_at?: string }
const human = (u: { login?: string; type?: string } | null): u is { login: string; type?: string } => Boolean(u?.login) && u?.type !== 'Bot' && !u?.login?.endsWith('[bot]')
const med = (xs: number[]): number | null => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : null }
const r1 = (x: number): number => Math.round(x * 10) / 10

// Per approver over the last `limit` merged PRs (risk.window): approval rate (PRs they reviewed that they ended approving), review comments per PR reviewed,
// median hours from the PR opening to their first review, and the seeded-defect catch rate from the audit records.
export function reviewHealth(fetch: (endpoint: string) => unknown[], since: string | null, limit: number, audits: Pick<Audit, 'pr' | 'id' | 'caught' | 'reviewers' | 'catchers'>[]): Health[] {
  const pulls = (fetch('repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100') as P[]).filter(p => p.merged_at && (!since || p.merged_at.slice(0, 10) >= since)).sort((a, b) => Date.parse(b.merged_at!) - Date.parse(a.merged_at!)).slice(0, limit)
  const by = new Map<string, { prs: number; approved: number; comments: number; waits: number[]; seeded: number; caught: number }>()
  for (const p of pulls) {
    const reviews = (fetch(`repos/{owner}/{repo}/pulls/${p.number}/reviews?per_page=100`) as R[]).filter(r => human(r.user) && r.user.login !== p.user?.login)
    const comments = (fetch(`repos/{owner}/{repo}/pulls/${p.number}/comments?per_page=100`) as R[]).filter(c => human(c.user) && c.user.login !== p.user?.login)
    for (const login of new Set(reviews.map(r => r.user!.login!))) {
      const mine = reviews.filter(r => r.user!.login === login), s = by.get(login) ?? { prs: 0, approved: 0, comments: 0, waits: [], seeded: 0, caught: 0 }
      s.prs++; s.comments += comments.filter(c => c.user!.login === login).length
      if (mine.filter(r => r.state !== 'COMMENTED').at(-1)?.state === 'APPROVED') s.approved++
      const first = Math.min(...mine.map(r => Date.parse(r.submitted_at ?? '')).filter(Number.isFinite))
      if (Number.isFinite(first) && first >= Date.parse(p.created_at)) s.waits.push((first - Date.parse(p.created_at)) / 3_600_000)
      for (const a of audits.filter(x => x.pr === p.number && x.caught !== undefined && x.reviewers?.includes(login))) { s.seeded++; if (a.catchers?.includes(login)) s.caught++ }
      by.set(login, s)
    }
  }
  return [...by].map(([approver, s]) => ({ approver, prs: s.prs, approvalRate: s.approved / s.prs, commentsPerPr: r1(s.comments / s.prs), medianHoursToFirst: med(s.waits) === null ? null : r1(med(s.waits)!), seeded: s.seeded ? { caught: s.caught, of: s.seeded } : null }))
    .sort((a, b) => b.prs - a.prs || (a.approver < b.approver ? -1 : 1))
}

export function healthText(rows: Health[]): string {
  const cells = [['approver', 'PRs', 'approval rate', 'comments/PR', 'hours to first review', 'seeded caught'], ...rows.map(r => [r.approver, String(r.prs), `${Math.round(r.approvalRate * 100)}%`, String(r.commentsPerPr), r.medianHoursToFirst === null ? 'n/a' : String(r.medianHoursToFirst), r.seeded ? `${r.seeded.caught}/${r.seeded.of}` : '-'])]
  const w = (i: number): number => Math.max(...cells.map(c => c[i]!.length))
  return cells.map(c => '    ' + c.map((x, i) => x.padEnd(w(i))).join('  ').trimEnd()).join('\n')
}
