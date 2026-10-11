// The sprint chart (.rig/product/): one PRD per sprint, the living architecture, ADRs and the test plan, approved once per
// sprint by a person with /rig:approve chart-<N>. The digest covers every file of the sprint, so any edit makes it stale.
// Imports nothing from inbox.ts (inbox.ts imports this).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, APPROVALS, exists, read, sha, frontmatter, readJsonl, toPosix, type Approval } from './core.ts'

export const PRODUCT = path.join(SDLC, 'product')
const INTENTS = path.join(SDLC, 'intent')
export const CHART_RE = /^chart-(\d{1,4})$/
export type ChartFile = { path: string; sha: string }
export type ChartApproval = Approval & { files?: ChartFile[] }
export type ChartState = 'approved' | 'stale' | 'missing'

// Frontmatter lists are flow style on one line (`depends: [a, b]`); frontmatter() returns that as a string.
// A trailing `.md` is dropped, so `depends: [a.md]` and `depends: [a]` name the same intent.
export const listField = (v: string | undefined): string[] =>
  (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '').replace(/\.md$/, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
export const sprintOf = (v: string | undefined): number | null => (/^\d{1,4}$/.test(v ?? '') ? Number(v) : null)
export const prdPath = (n: number): string => path.join(PRODUCT, 'prd', `sprint-${n}.md`)

// Dotfiles (.DS_Store, editor swap files) and backups (name~) are machine-local: hashing them would make a chart stale
// on every clone but the approver's.
const local = (name: string): boolean => name.startsWith('.') || name.endsWith('~')
function walk(dir: string): string[] {
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !local(e.name)).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}
const rel = (abs: string[]): string[] => [...new Set(abs.filter(f => exists(f)).map(f => toPosix(path.relative(ROOT, f))))].sort()

// A sprint's own files: its PRD and its intents. Shared files: the living architecture, ADRs and test plan, which every
// later sprint edits.
export function ownFiles(n: number): string[] {
  const intents = exists(INTENTS) ? fs.readdirSync(INTENTS).filter(f => f.endsWith('.md') && !local(f)).map(f => path.join(INTENTS, f)) : []
  return rel([prdPath(n), ...intents.filter(f => sprintOf(frontmatter(read(f)).data.sprint) === n)])
}
export const sharedFiles = (): string[] =>
  rel([path.join(PRODUCT, 'architecture.md'), ...walk(path.join(PRODUCT, 'adr')).filter(f => f.endsWith('.md')), ...walk(path.join(PRODUCT, 'testplan'))])
export const chartFiles = (n: number): string[] => [...new Set([...ownFiles(n), ...sharedFiles()])].sort()
const manifest = (paths: string[]): ChartFile[] => paths.map(p => ({ path: p, sha: sha(read(path.join(ROOT, p))) }))
export const chartManifest = (n: number): ChartFile[] => manifest(chartFiles(n))
export const chartDigest = (n: number): string => sha(chartManifest(n).map(f => `${f.path}\n${f.sha}\n`).join(''))

export const chartRows = (n: number): ChartApproval[] => readJsonl<ChartApproval>(APPROVALS).filter(a => a.slug === `chart-${n}` && a.stage === 'chart')
const approvedSprints = (): number[] =>
  [...new Set(readJsonl<ChartApproval>(APPROVALS).flatMap(a => (a.stage === 'chart' && CHART_RE.test(a.slug) ? [Number(CHART_RE.exec(a.slug)?.[1])] : [])))]
// The paths of `current` that differ from what `row` recorded, plus recorded paths now gone.
function drift(row: ChartApproval, current: ChartFile[], keep: (p: string) => boolean): string[] {
  const before = new Map((row.files ?? []).filter(f => keep(f.path)).map(f => [f.path, f.sha]))
  const changed = current.filter(f => before.get(f.path) !== f.sha).map(f => f.path)
  return [...changed, ...[...before.keys()].filter(p => !current.some(f => f.path === p))].sort()
}
// Own files must match this sprint's approval. Shared files must match it too, or match the approval of a later sprint
// whose own files still match its approval: charting sprint N+1 edits the architecture and test plan, and once a
// person approves chart-(N+1) the unstarted intents of sprint N stay startable.
function chartState(n: number): { state: ChartState; changed: string[] } {
  const row = chartRows(n).at(-1)
  if (!row) return { state: 'missing', changed: chartFiles(n) }
  // A row without its file list predates the split: compare the whole digest.
  if (!row.files) return row.digest === chartDigest(n) ? { state: 'approved', changed: [] } : { state: 'stale', changed: chartFiles(n) }
  const shared = new Set(sharedFiles())
  const isShared = (p: string): boolean => shared.has(p) || !p.startsWith('.rig/intent/') && !p.startsWith('.rig/product/prd/')
  const own = drift(row, manifest(ownFiles(n)), p => !isShared(p))
  const sharedNow = manifest(sharedFiles())
  const sharedBy = (m: number): boolean => {
    const r = chartRows(m).at(-1)
    return Boolean(r?.files) && drift(r as ChartApproval, sharedNow, isShared).length === 0 && (m === n || drift(r as ChartApproval, manifest(ownFiles(m)), p => !isShared(p)).length === 0)
  }
  const sharedOk = sharedBy(n) || approvedSprints().some(m => m > n && sharedBy(m))
  const changed = [...own, ...(sharedOk ? [] : drift(row, sharedNow, isShared))].sort()
  return { state: changed.length ? 'stale' : 'approved', changed }
}
export const chartApproval = (n: number): ChartState => chartState(n).state
// Paths added, edited or removed since the approval that covers them (every file when there is none), so a re-review reads only those.
export const changedSinceApproval = (n: number): string[] => chartState(n).changed

// Requirement ids the PRD defines: a heading `### FR-3: ...` or a table row `| NFR-2 | ...`. Ids mentioned in prose are references.
export function prdIds(text: string): string[] {
  const ids = new Set<string>()
  for (const l of text.split('\n')) {
    const m = /^#{2,4}\s+(N?FR-\d+)\b/.exec(l) ?? /^\|\s*(N?FR-\d+)\s*\|/.exec(l)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort()
}

export type TestCase = { id: string; reqs: string[]; intent: string; level: string; data: string }
// cases.md rows: | ID | Requirement | Intent | Level | Data | Expected |
export function testCases(text: string): TestCase[] {
  return text.split('\n').map(l => l.split('|').map(c => c.trim())).filter(c => /^TC-\d+$/.test(c[1] ?? '')).map(c => ({
    id: c[1] ?? '', reqs: (c[2] ?? '').match(/\bN?FR-\d+\b/g) ?? [], intent: (c[3] ?? '').replace(/\.md$/, ''), level: c[4] ?? '', data: c[5] || '-',
  }))
}
