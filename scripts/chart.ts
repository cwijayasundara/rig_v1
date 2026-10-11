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
export const listField = (v: string | undefined): string[] =>
  (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
export const sprintOf = (v: string | undefined): number | null => (/^\d{1,4}$/.test(v ?? '') ? Number(v) : null)
export const prdPath = (n: number): string => path.join(PRODUCT, 'prd', `sprint-${n}.md`)

function walk(dir: string): string[] {
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

export function chartFiles(n: number): string[] {
  const intents = exists(INTENTS) ? fs.readdirSync(INTENTS).filter(f => f.endsWith('.md')).map(f => path.join(INTENTS, f)) : []
  const abs = [
    prdPath(n),
    path.join(PRODUCT, 'architecture.md'),
    ...walk(path.join(PRODUCT, 'adr')).filter(f => f.endsWith('.md')),
    ...walk(path.join(PRODUCT, 'testplan')),
    ...intents.filter(f => sprintOf(frontmatter(read(f)).data.sprint) === n),
  ].filter(f => exists(f))
  return [...new Set(abs.map(f => toPosix(path.relative(ROOT, f))))].sort()
}
export const chartManifest = (n: number): ChartFile[] => chartFiles(n).map(p => ({ path: p, sha: sha(read(path.join(ROOT, p))) }))
export const chartDigest = (n: number): string => sha(chartManifest(n).map(f => `${f.path}\n${f.sha}\n`).join(''))

export const chartRows = (n: number): ChartApproval[] => readJsonl<ChartApproval>(APPROVALS).filter(a => a.slug === `chart-${n}` && a.stage === 'chart')
export function chartApproval(n: number): ChartState {
  const latest = chartRows(n).at(-1)
  if (!latest) return 'missing'
  return latest.digest === chartDigest(n) ? 'approved' : 'stale'
}
// Paths added, edited or removed since the last approval (every file when there is none), so a re-review reads only those.
export function changedSinceApproval(n: number): string[] {
  const before = new Map((chartRows(n).at(-1)?.files ?? []).map(f => [f.path, f.sha]))
  const current = chartManifest(n)
  const changed = current.filter(f => before.get(f.path) !== f.sha).map(f => f.path)
  const removed = [...before.keys()].filter(p => !current.some(f => f.path === p))
  return [...changed, ...removed].sort()
}

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
