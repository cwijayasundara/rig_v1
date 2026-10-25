// `sdlc report`: how the harness is doing, from git and the change records alone (harness readiness 0.3). Deterministic and free:
// no network, no model, no money. It never reports a PR count as a result, only as the denominator. What git cannot tell it
// (CI outcomes, review time, findings fixed without a person) is listed as unavailable instead of being guessed.
import path from 'node:path'
import { ROOT, out, readJson, readJsonl, gitIn, type Args } from './core.ts'
import { mineCandidates, shippedChanges } from './learnmine.ts'
import type { RunRow } from './runs.ts'

export type Report = {
  merged: number; shipped: number; since: string | null // merged: every change whose pr.md a merge added; shipped: those whose records are still in the tree (a revert removes them)
  prLines: { median: number; max: number } | null // lines changed outside .rig/ by the commit on the first-parent line that added each change's pr.md (a rebase merge counts only that commit)
  firstPass: { measured: number; clean: number } // changes whose recorded runs (runs.jsonl) all passed, expected failures aside
  reverted: number // merged changes a later commit says it reverts
  hoursToApproval: { median: number; of: number } | null // first commit on the change to its person approval; of: the changes with both dates (a squash can hide the first commit)
  waiversPerChange: number
  waiverRows: { unowned: number; oldestDays: number | null } // Infinity: a row with no readable date; every waiver on record: rows with no owner, and the age of the oldest
  repeat: { classes: number; changes: number } // finding and waiver classes seen in 2+ changes, and the changes carrying one
  unavailable: string[]
}

const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] ?? 0) + ((s.length % 2 === 0 ? (s[s.length / 2] ?? 0) - (s[s.length / 2 - 1] ?? 0) : 0) / 2) : 0 }
const lines = (root: string, sha: string): number | null => {
  const stat = gitIn(root, ['diff', '--numstat', `${sha}^1`, sha, '--', '.', ':!.rig'])
  return stat === null ? null : stat.split('\n').filter(Boolean).reduce((n, l) => n + l.split('\t').slice(0, 2).reduce((a, b) => a + (Number(b) || 0), 0), 0)
}

export function buildReport(root: string, since: string | null = null): Report {
  // One commit may add several pr.md files (a squash that ships two changes); a change re-added after a revert counts once.
  const seen = new Set<string>()
  const merges = (gitIn(root, ['log', '--first-parent', '--diff-filter=A', '--name-only', '--format=%x00%H %cs', '--', ':(glob).rig/changes/*/pr.md']) ?? '').split('\0').filter(Boolean)
    .flatMap(b => { const [head = '', ...files] = b.split('\n').filter(Boolean); const [sha = '', date = ''] = head.split(' '); return files.map(f => ({ sha, date, slug: f.split('/')[2] ?? '' })) })
    .filter(m => m.sha && m.slug && (!since || m.date >= since) && !seen.has(m.slug) && seen.add(m.slug))
  const log = gitIn(root, ['log', '--format=%B']) ?? ''
  const size = merges.map(m => lines(root, m.sha)).filter((n): n is number => n !== null)
  const reverted = merges.filter(m => log.includes(`This reverts commit ${m.sha}`)).length
  const shipped = shippedChanges(root).filter(c => !since || seen.has(c.slug))
  const hours: number[] = []
  let measured = 0, clean = 0
  for (const { slug } of shipped) {
    const dir = path.join(root, '.rig', 'changes', slug)
    const runs = readJsonl<RunRow>(path.join(dir, 'evidence', 'runs.jsonl'))
    if (runs.length) { measured++; if (runs.every(r => (r.exit === 0 || r.expectFail) && !r.timedOut)) clean++ }
    const first = gitIn(root, ['log', '--reverse', '--format=%cI', '--', `.rig/changes/${slug}`])?.split('\n')[0]
    const approved = readJson<{ at?: string } | null>(path.join(dir, 'approval.json'), null)?.at ?? '' // no approval record: ''
    if (first && approved && Date.parse(approved) >= Date.parse(first)) hours.push((Date.parse(approved) - Date.parse(first)) / 3_600_000)
  }
  const slugs = new Set(shipped.map(c => c.slug))
  const all = readJsonl<{ slug: string; by?: string; at?: string }>(path.join(root, '.rig', 'waivers.jsonl'))
  const waivers = all.filter(w => slugs.has(w.slug)).length
  const ages = all.map(w => { const n = Math.floor((Date.now() - Date.parse(w.at ?? '')) / 86_400_000); return Number.isFinite(n) ? n : Infinity })
  const classes = mineCandidates(root).map(c => ({ ...c, changes: c.changes.filter(s => slugs.has(s)) })).filter(c => c.changes.length >= 2)
  return {
    merged: merges.length, shipped: shipped.length, since,
    prLines: size.length ? { median: median(size), max: Math.max(...size) } : null,
    firstPass: { measured, clean }, reverted,
    hoursToApproval: hours.length ? { median: Math.round(median(hours) * 10) / 10, of: hours.length } : null,
    waiversPerChange: shipped.length ? Math.round((waivers / shipped.length) * 100) / 100 : 0,
    waiverRows: { unowned: all.filter(w => !w.by || w.by === 'unknown').length, oldestDays: ages.length ? Math.max(...ages) : null },
    repeat: { classes: classes.length, changes: new Set(classes.flatMap(c => c.changes)).size },
    unavailable: ['CI first-pass rate (the CI provider holds it)', 'review time and findings fixed without a person (not recorded anywhere in the repo)'],
  }
}

export function reportText(r: Report): string {
  const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : 'n/a')
  return [
    `rig report${r.since ? ` since ${r.since}` : ''}: ${r.merged} merged change(s), ${r.shipped} with records in the tree`,
    `  lines changed per merge    ${r.prLines ? `median ${r.prLines.median}, max ${r.prLines.max}` : 'n/a'}`,
    `  first-pass runs            ${pct(r.firstPass.clean, r.firstPass.measured)} (${r.firstPass.clean} of ${r.firstPass.measured} changes with recorded runs)`,
    `  reverted                   ${r.reverted} of ${r.merged}`,
    `  hours, first commit to approval  ${r.hoursToApproval ? `median ${r.hoursToApproval.median} (${r.hoursToApproval.of} change(s))` : 'n/a'}`,
    `  waivers per change         ${r.waiversPerChange} (${r.waiverRows.unowned} with no owner; oldest ${r.waiverRows.oldestDays === null ? 'n/a' : (Number.isFinite(r.waiverRows.oldestDays) ? `${r.waiverRows.oldestDays} day(s)` : 'age unknown')})`,
    `  repeat mistakes            ${r.repeat.classes} class(es) across ${r.repeat.changes} of ${r.shipped} change(s)`,
    `not available here: ${r.unavailable.join('; ')}`,
  ].join('\n')
}

export function cmdReport(args: Args): void {
  const since = typeof args.opt.since === 'string' ? args.opt.since : null
  const r = buildReport(ROOT, since)
  out(args.opt.json ? JSON.stringify(r) : reportText(r))
}
