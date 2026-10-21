// `sdlc queue` (harness readiness, many instances, notes 2026-10-21): one view across every git worktree of this repo. Each instance of the model
// works in its own worktree, so a person's two stops (approve a plan, merge a PR) are a queue; this lists what waits on a person with the
// command to run, what is still the model's, and which in-flight plans touch the same file (a conflict at merge, found before the work is done).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { read, out, git, type Args } from './core.ts'

export type QueueRow = { worktree: string; branch: string; slug: string; status: string; next: string; person: boolean; files: string[] }
export type Overlap = { file: string; changes: string[] }

const WAITS_ON_PERSON = ['approve', 'review']

export function worktrees(): { dir: string; branch: string }[] {
  const text = git(['worktree', 'list', '--porcelain']) ?? ''
  return text.split('\n\n').filter(Boolean).map(block => {
    const dir = /^worktree (.+)$/m.exec(block)?.[1] ?? ''
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? (/^detached/m.test(block) ? '(detached)' : '')
    return { dir, branch }
  }).filter(w => w.dir && fs.existsSync(path.join(w.dir, '.rig')))
}

// The files a plan says it will touch (its ## Files section), as pr.ts reads them.
export function planFiles(plan: string): string[] {
  const section = plan.split(/^## Files[ \t]*$/m)[1]?.split(/^## /m)[0] ?? ''
  return section.split('\n').map(l => /^\s*[-*]\s+`?([^`\s]+)`?/.exec(l)?.[1]).filter((e): e is string => Boolean(e))
}

// Two plans overlap on a file when one names it, or names a directory holding it.
export function overlaps(rows: { slug: string; worktree: string; files: string[] }[]): Overlap[] {
  const found = new Map<string, Set<string>>()
  const holds = (a: string, b: string): boolean => a === b || (a.endsWith('/') && b.startsWith(a)) || (b.endsWith('/') && a.startsWith(b))
  for (const x of rows) for (const y of rows) {
    if (x === y || x.slug >= y.slug || x.worktree === y.worktree) continue
    for (const f of x.files) for (const g of y.files) if (holds(f, g)) {
      const key = f.length >= g.length ? f : g
      found.set(key, (found.get(key) ?? new Set()).add(`${x.slug} (${path.basename(x.worktree)})`).add(`${y.slug} (${path.basename(y.worktree)})`))
    }
  }
  return [...found].map(([file, changes]) => ({ file, changes: [...changes].sort() })).sort((a, b) => a.file.localeCompare(b.file))
}

export function buildQueue(): { rows: QueueRow[]; overlaps: Overlap[] } {
  const rows: QueueRow[] = []
  for (const w of worktrees()) {
    const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', process.argv[1] ?? '', 'status', '--json'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: w.dir } })
    let changes: { slug: string; status: string; next: string }[] = []
    try { changes = (JSON.parse(r.stdout) as { changes?: typeof changes }).changes ?? [] } catch { /* a worktree rig cannot read: skipped */ }
    for (const c of changes.filter(x => x.status !== 'shipped')) {
      rows.push({ worktree: w.dir, branch: w.branch, slug: c.slug, status: c.status, next: c.next, person: WAITS_ON_PERSON.includes(c.status), files: planFiles(read(path.join(w.dir, '.rig/changes', c.slug, 'plan.md'))) })
    }
  }
  return { rows, overlaps: overlaps(rows) }
}

const command = (r: QueueRow): string => r.status === 'approve'
  ? `cd ${r.worktree} && SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts approve ${r.slug}`
  : `review the PR for ${r.slug} (branch sdlc/${r.slug}), then merge it`

export function queueText(q: ReturnType<typeof buildQueue>): string {
  const wait = q.rows.filter(r => r.person), run = q.rows.filter(r => !r.person)
  const line = (r: QueueRow): string => `  ${r.slug.padEnd(24)} ${r.status.padEnd(8)} ${path.basename(r.worktree)}`
  return [
    wait.length ? `Waiting for you (${wait.length}):` : 'Waiting for you: nothing',
    ...wait.flatMap(r => [line(r), `    ${command(r)}`]),
    run.length ? `With the model (${run.length}):` : 'With the model: nothing',
    ...run.map(r => `${line(r)} next: ${r.next}`),
    ...(q.overlaps.length ? [`Plans that touch the same file (${q.overlaps.length}): land one first, or split the work:`, ...q.overlaps.map(o => `  ${o.file}: ${o.changes.join(' and ')}`)] : []),
  ].join('\n')
}

export function cmdQueue(args: Args): void {
  const q = buildQueue()
  out(args.opt.json ? JSON.stringify(q) : queueText(q))
}
