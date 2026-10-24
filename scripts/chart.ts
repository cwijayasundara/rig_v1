// The sprint chart on disk (outer-loop spec 2026-10-17 §5, §7): which files make up sprint N, their digest, a person's
// approval of them, and whether an intent can be started. A sprint's own files are its PRD, its intents, its test plan and the
// contract files those name, all under sprints/sprint-N/; the architecture and ADRs are shared and every sprint edits them.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, exists, read, sha, now, toPosix, frontmatter } from './core.ts'
import { openQuestions, section } from './model.ts'
import { changeDir, isShipped } from './lifecycle.ts'
import { planText, type PlanRow } from './plan.ts'
import { PRODUCT, prdPath, intentsDir, testplanDir, approvalPath, sprintDir, sprintsOnDisk, intentRel, planPath, sprintRel } from './product.ts'
import { designIntents, architectureProblems, accessProblems, parseAccess, parseIntent, parseCases, parkedDecisions, prdIds, traceReport, uncomment, escapes, type Intent, type ChartFinding } from './chartcheck.ts'

const ARCH = toPosix(path.relative(ROOT, path.join(PRODUCT, 'architecture.md')))
const SHARED_DIRS = ['adr'].map(d => `${toPosix(path.relative(ROOT, path.join(PRODUCT, d)))}/`)
export const CHART_RE = /^chart-(\d{1,4})$/
type ChartFile = { path: string; sha: string }
type ChartState = 'approved' | 'stale' | 'missing'
type Row = { by: string; at: string; digest: string; files: ChartFile[] }

export { prdPath }
const isShared = (p: string): boolean => p === ARCH || SHARED_DIRS.some(d => p.startsWith(d))

// Dotfiles (.DS_Store, editor swap files) and backups (name~) are machine-local: hashing them would make a chart stale on every clone but the approver's.
const local = (name: string): boolean => name.startsWith('.') || name.endsWith('~')
function walk(dir: string): string[] {
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => !local(e.name)).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}
const rel = (abs: string[]): string[] => [...new Set(abs.filter(f => exists(f)).map(f => toPosix(path.relative(ROOT, f))))].sort()

// The folder an intent sits in is its sprint; `declared` is what its frontmatter says, and a difference is a finding.
type Charted = Omit<Intent, 'sprint'> & { sprint: number; declared: number | null; file: string }
const allIntents = (): Charted[] => sprintsOnDisk().flatMap(n => {
  const dir = intentsDir(n)
  return exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md') && !local(f)).sort().map(f => { const file = path.join(dir, f), i = parseIntent(f.slice(0, -3), read(file)); return { ...i, declared: i.sprint, sprint: n, file } }) : []
})
const intentsOf = (n: number): Charted[] => allIntents().filter(i => i.sprint === n)
export const intentOf = (slug: string): Intent | null => allIntents().find(i => i.slug === slug) ?? null

// The sprint's design doc. `design:` in architecture.md frontmatter names the newest one (a repo-relative posix path, or `none`, or the template's
// `<path or none>` prompt left in); an older sprint's is the `<date>-sprint-<N>-design.md` beside it, so charting sprint 2 leaves sprint 1's design,
// and its approval, alone. The raw string comes back for a path outside the repo, so the design-missing rule can name it.
export function designDocOf(n: number): string | null {
  const arch = path.join(PRODUCT, 'architecture.md')
  const d = exists(arch) ? frontmatter(read(arch).replace(/\r\n/g, '\n')).data.design?.trim() : undefined
  if (!d || d === 'none' || d.startsWith('<')) return null
  if (escapes(d)) return d
  const named = path.join(ROOT, path.dirname(d))
  const mine = exists(named) ? fs.readdirSync(named).filter(f => f.endsWith(`-sprint-${n}-design.md`)).sort().at(-1) : undefined
  const of = /-sprint-(\d+)-design\.md$/.exec(d)?.[1]
  if (!mine && of !== undefined && Number(of) !== n) return null // the newest design belongs to another sprint
  return toPosix(path.relative(ROOT, mine ? path.join(named, mine) : path.join(ROOT, d)))
}
const designFile = (n: number): string[] => { const d = designDocOf(n); return d && !escapes(d) ? [path.join(ROOT, d)] : [] }

function ownFiles(n: number): string[] {
  const own = intentsOf(n)
  return rel([prdPath(n), ...designFile(n), ...walk(testplanDir(n)), ...own.map(i => i.file), ...own.flatMap(i => [...i.contractFiles, ...i.exampleFiles]).filter(f => !escapes(f)).map(f => path.join(ROOT, f))])
}
const sharedFiles = (): string[] => rel([path.join(PRODUCT, 'architecture.md'), ...walk(path.join(PRODUCT, 'adr')).filter(f => f.endsWith('.md'))])
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
  fs.mkdirSync(sprintDir(n), { recursive: true })
  fs.writeFileSync(approvalPath(n), JSON.stringify(row, null, 2) + '\n')
}
const approvedSprints = (): number[] => sprintsOnDisk().filter(n => exists(approvalPath(n)))

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
  const testplan = testplanDir(n)
  const cases = withCases ? parseCases(read(path.join(testplan, 'cases.md'))) : null
  const found = traceReport({
    prd: read(prdPath(n)), intents: intentsOf(n), others: allIntents().filter(i => i.sprint !== n), repoExists: p => exists(path.join(ROOT, p)), cases,
    exists: p => exists(path.join(testplan, p)),
  })
  for (const i of intentsOf(n)) if (i.declared !== n) found.push({ rule: 'sprint-mismatch', severity: 'block', where: i.slug, message: `${i.slug} sits in sprint-${n}/intents/ but its frontmatter says sprint: ${i.declared ?? 'nothing'}` })
  for (const i of intentsOf(n)) {
    const same = allIntents().filter(t => t.slug === i.slug)
    if (same.length > 1) found.push({ rule: 'duplicate-slug', severity: 'block', where: i.slug, message: `${i.slug} is an intent of more than one sprint (${same.map(t => `sprint ${t.sprint}`).join(', ')}); a slug names one change` })
  }
  const design = designDocOf(n)
  if (design && (escapes(design) || !exists(path.join(ROOT, design)))) found.push({ rule: 'design-missing', severity: 'block', where: 'architecture', message: `architecture.md names a design doc that does not exist: ${design}` })
  else if (design) {
    const listed = designIntents(read(path.join(ROOT, design)))
    const mine = intentsOf(n).map(i => i.slug)
    for (const s of listed.filter(x => !mine.includes(x))) found.push({ rule: 'design-intent', severity: 'block', where: 'architecture', message: `${s} is in the design doc's ## Intents but has no ${intentRel(n, s)} (the list is read from \`- <slug>: scope\` lines; slugs are lowercase kebab-case)` })
    for (const s of mine.filter(x => !listed.includes(x))) found.push({ rule: 'design-intent', severity: 'block', where: s, message: `${s} is an intent of sprint ${n} but the design doc's ## Intents does not list it` })
  }
  const arch = uncomment(read(path.join(PRODUCT, 'architecture.md')).replace(/\r\n/g, '\n'))
  found.push(...architectureProblems(arch, read(prdPath(n)), n))
  found.push(...accessProblems(parseAccess(arch), allIntents().map(i => i.slug), cases, intentsOf(n).map(i => i.slug)))
  for (const q of openQuestions(arch)) found.push({ rule: 'open-question', severity: 'block', where: 'architecture', message: `architecture.md has an open question: ${q}` })
  for (const l of section(arch, 'Concerns').split('\n').map(x => x.replace(/^\s*[-*]\s*/, '').trim()).filter(x => x && !/^none\.?$/i.test(x) && !/^\[x\]/i.test(x) && !/\(resolved\)/i.test(x))) found.push({ rule: 'concern', severity: 'block', where: 'architecture', message: `unresolved concern: ${l}` })
  for (const [where, file] of [['architecture.md', path.join(PRODUCT, 'architecture.md')], ...intentsOf(n).map(i => [`${i.slug}.md`, i.file] as const)]) found.push(...parkedDecisions(where, read(file)))
  return found
}

// Whether an intent can be started now, and if not, why.
export function intentReady(slug: string): { ready: boolean; why: string[] } {
  const i = allIntents().find(t => t.slug === slug)
  if (!i) return { ready: false, why: [`no such intent: ${slug}`] }
  if (exists(changeDir(slug))) return { ready: false, why: ['already started'] }
  const why: string[] = []
  const s = chartState(i.sprint)
  if (s.state === 'missing') why.push(`chart-${i.sprint} is not approved`)
  else if (s.state === 'stale') why.push(`chart-${i.sprint} is stale: run /rig:approve chart-${i.sprint} after reviewing (changed: ${s.changed.join(', ')})`)
  const blocked = i.depends.filter(d => !isShipped(d))
  if (blocked.length) why.push(`blocked by ${blocked.join(', ')}`)
  return { ready: !why.length, why }
}

// Sprint numbers that have a folder or an intent, ascending: the journey view's way to find the sprint in flight.
export function sprintsKnown(): number[] {
  return [...new Set([...sprintsOnDisk(), ...allIntents().map(i => i.sprint)])].sort((a, b) => a - b)
}
export const sprintIntents = (n: number): string[] => intentsOf(n).map(i => i.slug)

// Every intent that can start now.
export function readyIntents(): { slug: string; sprint: number; estimateDays: number | null }[] {
  return allIntents().filter(i => i.sprint !== null && intentReady(i.slug).ready).map(i => ({ slug: i.slug, sprint: i.sprint, estimateDays: i.estimateDays }))
}

// The chain for one sprint and how far the work has got: requirement → intent → behaviour → test case, then started and shipped.
export function chartReport(n: number): string {
  const intents = intentsOf(n)
  const cases = parseCases(read(path.join(testplanDir(n), 'cases.md')))
  const ids = prdIds(read(prdPath(n)))
  const inCase = (id: string): string[] => cases.filter(c => c.reqs.includes(id)).map(c => c.id)
  const chain = ids.map(id => `  ${id} → ${intents.filter(i => i.prd.includes(id)).map(i => `${i.slug}#${i.behaviours.filter(b => b.reqs.includes(id)).map(b => b.id).join(',')}`).join(' ') || '(no intent)'} → ${inCase(id).join(' ') || '(no test case)'}`)
  const started = intents.filter(i => exists(changeDir(i.slug))).length
  const shipped = intents.filter(i => isShipped(i.slug)).length
  const days = intents.reduce((sum, i) => sum + (i.estimateDays ?? 0), 0)
  return [
    `chart-${n}: ${chartState(n).state}`,
    `requirements ${ids.length}: with an intent ${ids.filter(id => intents.some(i => i.prd.includes(id))).length}, with a test case ${ids.filter(id => inCase(id).length).length}`,
    `intents ${intents.length} (${days} engineer-days): started ${started}, shipped ${shipped}`,
    ...chain,
  ].join('\n')
}

// The sprint plan view: waves and graphs generated from the intents' `depends:` lines (see plan.ts), written beside the PRD. Not a chart
// file, so regenerating it never makes an approved chart stale.
export function planRows(n: number): PlanRow[] {
  return intentsOf(n).map(i => ({
    slug: i.slug, depends: i.depends, estimateDays: i.estimateDays,
    status: isShipped(i.slug) ? 'done' : exists(changeDir(i.slug)) ? 'active' : i.depends.every(isShipped) ? 'ready' : 'blocked',
  }))
}
export function sprintPlan(n: number): string {
  return planText(n, planRows(n), { chart: chartState(n).state, startCmd: slug => `/rig:start ${intentRel(n, slug)}` })
}
export function writePlan(n: number): string {
  fs.mkdirSync(sprintDir(n), { recursive: true })
  fs.writeFileSync(planPath(n), sprintPlan(n))
  return `${sprintRel(n)}/plan.md`
}
