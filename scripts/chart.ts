// The sprint chart on disk (outer-loop spec 2026-10-17 §5, §7): which files make up sprint N, their digest, a person's
// approval of them, and whether an intent can be started. A sprint's own files are its PRD, its intents and the contract
// files those name; the architecture, ADRs and test plan are shared and every sprint edits them.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, exists, read, sha, now, toPosix } from './core.ts'
import { openQuestions } from './model.ts'
import { changeDir, isShipped } from './lifecycle.ts'
import { parseIntent, parseCases, traceReport, type Intent, type ChartFinding } from './chartcheck.ts'

export const PRODUCT = path.join(SDLC, 'product')
const INTENTS = path.join(PRODUCT, 'intents')
const APPROVALS = path.join(PRODUCT, 'approvals')
const ARCH = toPosix(path.relative(ROOT, path.join(PRODUCT, 'architecture.md')))
const SHARED_DIRS = ['adr', 'testplan'].map(d => `${toPosix(path.relative(ROOT, path.join(PRODUCT, d)))}/`)
export const CHART_RE = /^chart-(\d{1,4})$/
export type ChartFile = { path: string; sha: string }
export type ChartState = 'approved' | 'stale' | 'missing'
type Row = { by: string; at: string; digest: string; files: ChartFile[] }

export const prdPath = (n: number): string => path.join(PRODUCT, 'prd', `sprint-${n}.md`)
const approvalPath = (n: number): string => path.join(APPROVALS, `chart-${n}.json`)
const isShared = (p: string): boolean => p === ARCH || SHARED_DIRS.some(d => p.startsWith(d))

// Dotfiles (.DS_Store, editor swap files) and backups (name~) are machine-local: hashing them would make a chart stale on every clone but the approver's.
const local = (name: string): boolean => name.startsWith('.') || name.endsWith('~')
function walk(dir: string): string[] {
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !local(e.name)).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}
const rel = (abs: string[]): string[] => [...new Set(abs.filter(f => exists(f)).map(f => toPosix(path.relative(ROOT, f))))].sort()

const allIntents = (): Intent[] => (exists(INTENTS) ? fs.readdirSync(INTENTS).filter(f => f.endsWith('.md') && !local(f)).sort().map(f => parseIntent(f.slice(0, -3), read(path.join(INTENTS, f)))) : [])
export const intentsOf = (n: number): Intent[] => allIntents().filter(i => i.sprint === n)
const intentFile = (slug: string): string => path.join(INTENTS, `${slug}.md`)

export function ownFiles(n: number): string[] {
  const own = intentsOf(n)
  return rel([prdPath(n), ...own.map(i => intentFile(i.slug)), ...own.flatMap(i => [...i.contractFiles, ...i.exampleFiles]).map(f => path.join(ROOT, f))])
}
export const sharedFiles = (): string[] => rel([path.join(PRODUCT, 'architecture.md'), ...walk(path.join(PRODUCT, 'adr')).filter(f => f.endsWith('.md')), ...walk(path.join(PRODUCT, 'testplan'))])
export const chartFiles = (n: number): string[] => [...new Set([...ownFiles(n), ...sharedFiles()])].sort()
const manifest = (paths: string[]): ChartFile[] => paths.map(p => ({ path: p, sha: sha(read(path.join(ROOT, p))) }))
export const chartDigest = (n: number): string => sha(manifest(chartFiles(n)).map(f => `${f.path}\n${f.sha}\n`).join(''))

function readRow(n: number): Row | null {
  try {
    const v = JSON.parse(read(approvalPath(n))) as Partial<Row>
    return typeof v.digest === 'string' && Array.isArray(v.files) && v.files.every(f => typeof f?.path === 'string' && typeof f?.sha === 'string') ? (v as Row) : null
  } catch { return null }
}
export function writeChartApproval(n: number, by: string): void {
  const row: Row = { by, at: now(), digest: chartDigest(n), files: manifest(chartFiles(n)) }
  fs.mkdirSync(APPROVALS, { recursive: true })
  fs.writeFileSync(approvalPath(n), JSON.stringify(row, null, 2) + '\n')
}
const approvedSprints = (): number[] => (exists(APPROVALS) ? fs.readdirSync(APPROVALS).flatMap(f => { const m = /^chart-(\d{1,4})\.json$/.exec(f); return m?.[1] ? [Number(m[1])] : [] }) : [])

// The paths of `current` that differ from what `row` recorded (kept by `keep`), plus recorded paths now gone.
function drift(row: Row, current: ChartFile[], keep: (p: string) => boolean): string[] {
  const before = new Map(row.files.filter(f => keep(f.path)).map(f => [f.path, f.sha]))
  return [...current.filter(f => before.get(f.path) !== f.sha).map(f => f.path), ...[...before.keys()].filter(p => !current.some(f => f.path === p))].sort()
}
// Own files must match this sprint's approval. Shared files must match it too, or match the approval of a later sprint whose
// own files still match its approval: charting sprint N+1 edits the architecture and test plan, and once a person approves
// chart-(N+1) the unstarted intents of sprint N stay startable.
export function chartState(n: number): { state: ChartState; changed: string[] } {
  const row = readRow(n)
  if (!row) return { state: 'missing', changed: chartFiles(n) }
  const own = drift(row, manifest(ownFiles(n)), p => !isShared(p))
  const sharedNow = manifest(sharedFiles())
  const sharedBy = (m: number): boolean => {
    const r = readRow(m)
    return Boolean(r) && drift(r as Row, sharedNow, isShared).length === 0 && (m === n || drift(r as Row, manifest(ownFiles(m)), p => !isShared(p)).length === 0)
  }
  const sharedOk = sharedBy(n) || approvedSprints().some(m => m > n && sharedBy(m))
  const changed = [...own, ...(sharedOk ? [] : drift(row, sharedNow, isShared))].sort()
  return { state: changed.length ? 'stale' : 'approved', changed }
}

// The trace rules over the files, plus what only the files can say: unresolved concerns and the architecture's open questions.
export function chartFindings(n: number, withCases: boolean): ChartFinding[] {
  const testplan = path.join(PRODUCT, 'testplan')
  const found = traceReport({
    prd: read(prdPath(n)), intents: intentsOf(n), cases: withCases ? parseCases(read(path.join(testplan, 'cases.md'))) : null,
    exists: p => exists(path.join(testplan, p)),
  })
  const arch = read(path.join(PRODUCT, 'architecture.md'))
  for (const q of openQuestions(arch)) found.push({ rule: 'open-question', severity: 'block', where: 'architecture', message: `architecture.md has an open question: ${q}` })
  const concerns = /^##\s+Concerns\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(arch)?.[1] ?? ''
  for (const l of concerns.split('\n').map(x => x.replace(/^\s*[-*]\s*/, '').trim()).filter(x => x && !/^none\.?$/i.test(x))) found.push({ rule: 'concern', severity: 'block', where: 'architecture', message: `unresolved concern: ${l}` })
  return found
}

// Whether an intent can be started now, and if not, why.
export function intentReady(slug: string): { ready: boolean; why: string[] } {
  const i = allIntents().find(t => t.slug === slug)
  if (!i) return { ready: false, why: [`no such intent: ${slug}`] }
  if (exists(changeDir(slug))) return { ready: false, why: ['already started'] }
  if (i.sprint === null) return { ready: false, why: ['the intent has no sprint: in its frontmatter'] }
  const why: string[] = []
  const s = chartState(i.sprint)
  if (s.state === 'missing') why.push(`chart-${i.sprint} is not approved`)
  else if (s.state === 'stale') why.push(`chart-${i.sprint} is stale: run /rig:approve chart-${i.sprint} after reviewing (changed: ${s.changed.join(', ')})`)
  const blocked = i.depends.filter(d => !isShipped(d))
  if (blocked.length) why.push(`blocked by ${blocked.join(', ')}`)
  return { ready: !why.length, why }
}
