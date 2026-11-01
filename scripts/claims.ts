// Claims against evidence (docs/superpowers/specs/2026-11-01-run-your-claims-design.md): what review.md and plan.md say, compared with the tree.
// Every rule only suggests. Nothing here may fail a ship or a verify.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHANGES, exists, read, readJson, out, git, writeAtomic, checkSlug, type Args } from './core.ts'
import { section, bullets, planFiles } from './model.ts'
import { behaviourIds } from './sensors.ts'

export type ReviewFinding = { text: string; file: string; line: number; fixed: boolean; confirmed: boolean; repro: string | null }
export type ClaimRow = { rule: 'C1' | 'C2' | 'C3' | 'C4' | 'C5'; claim: string; status: 'ok' | 'suggest' | 'skipped'; detail: string }

const FINDING = /^\s*-\s*\[severity:[^\]]*\]\s*\[category:[^\]]*\]\s*(\S+?):(\d+):/
const REPRO = /\bRepro:\s*(.+?)\s+→/

// Kept findings only: the lines under ## Findings. Deferred, Dismissed and Pre-existing are not claims about this change.
export function parseFindings(review: string): ReviewFinding[] {
  return section(review, 'Findings').split('\n').flatMap(l => {
    const m = FINDING.exec(l)
    if (!m) return []
    return [{ text: l.trim(), file: m[1]!, line: Number(m[2]), fixed: /→ fixed\b/.test(l), confirmed: /→ fixed \(confirmed\)/.test(l), repro: REPRO.exec(l)?.[1] ?? null }]
  })
}

export type FileEvidence = {
  findings: ReviewFinding[]; exists: (rel: string) => boolean; lineCount: (rel: string) => number
  planFiles: string[]; changed: (rel: string) => boolean; amendments: string; behaviourIds: string[]
}

// C1 a cited path:line exists; C3 a planned file changed; C4 an amendment cites a real behaviour; C5 a confirmed finding's repro should now pass.
export function fileRows(i: FileEvidence): ClaimRow[] {
  const rows: ClaimRow[] = []
  for (const f of i.findings) {
    const cite = `${f.file}:${f.line}`
    const bad = !i.exists(f.file) ? `${cite}: the file does not exist` : f.line > i.lineCount(f.file) || f.line < 1 ? `${cite}: the file has no such line` : ''
    rows.push({ rule: 'C1', claim: `finding cites ${cite}`, status: bad ? 'suggest' : 'ok', detail: bad || `${cite} exists` })
  }
  for (const p of i.planFiles) {
    const did = i.changed(p)
    rows.push({ rule: 'C3', claim: `plan lists ${p}`, status: did ? 'ok' : 'suggest', detail: did ? `${p} changed` : `${p} is in plan.md but has no change since the base: check the plan or the build` })
  }
  for (const l of bullets(section(i.amendments, 'Amendments')).filter(x => !/^[-*]\s+none\.?$/i.test(x))) {
    const cited = l.match(/\bB\d+\b/g) ?? []
    const missing = cited.filter(b => !i.behaviourIds.includes(b))
    rows.push({ rule: 'C4', claim: l, status: missing.length ? 'suggest' : 'ok', detail: missing.length ? `amendment cites ${missing.join(', ')}, which spec.md does not have` : 'cites behaviours spec.md has' })
  }
  for (const f of i.findings.filter(x => x.confirmed && x.repro)) {
    rows.push({ rule: 'C5', claim: `${f.file}:${f.line} confirmed fixed`, status: 'suggest', detail: `run its repro, it should now pass: ${f.repro}` })
  }
  return rows
}

const STAMP = 'claims-stamp.json'
type Stamp = Record<string, string | null>

const hashOf = (rel: string): string | null => (exists(path.join(ROOT, rel)) ? (git(['hash-object', '--', rel]) ?? '').trim() || null : null)
const reviewOf = (slug: string): string => read(path.join(CHANGES, slug, 'review.md'))

// Written right after review.md and before the fix wave: the fixes are uncommitted until `S pr`, so a commit sha cannot mark the review.
export function stampReview(slug: string): void {
  const stamp: Stamp = {}
  for (const f of parseFindings(reviewOf(slug))) stamp[f.file] = hashOf(f.file)
  writeAtomic(path.join(CHANGES, slug, STAMP), JSON.stringify(stamp, null, 2) + '\n')
}

// C2: a finding marked fixed whose cited file has the same hash as at the review. The fix may have landed elsewhere, so this only suggests.
export function fixedRows(findings: ReviewFinding[], stamp: Stamp | null, hash: (rel: string) => string | null): ClaimRow[] {
  return findings.filter(f => f.fixed).map(f => {
    const cite = `${f.file}:${f.line}`
    if (!stamp || !(f.file in stamp)) return { rule: 'C2', claim: `${cite} marked fixed`, status: 'skipped', detail: `no review stamp for ${f.file}` } as ClaimRow
    const same = stamp[f.file] === hash(f.file)
    return { rule: 'C2', claim: `${cite} marked fixed`, status: same ? 'suggest' : 'ok', detail: same ? `${cite} is marked fixed but ${f.file} is unchanged since the review: check the fix landed elsewhere` : `${f.file} changed since the review` } as ClaimRow
  })
}

const readStamp = (slug: string): Stamp | null => {
  try { const v: unknown = JSON.parse(read(path.join(CHANGES, slug, STAMP))); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Stamp) : null } catch { return null }
}

// Files this change touched since its verified base: tracked changes (committed or not) and new files. null when the base is unknown.
function changedSince(slug: string): ((rel: string) => boolean) | null {
  const base = readJson<{ base?: string } | null>(path.join(CHANGES, slug, 'verify.json'), null)?.base
  if (!base) return null
  const names = new Set([...(git(['diff', '--name-only', base]) ?? '').split('\n'), ...(git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n')].filter(Boolean))
  return rel => names.has(rel)
}

export function claimRows(slug: string): ClaimRow[] {
  const dir = path.join(CHANGES, slug), at = (n: string): string => (exists(path.join(dir, n)) ? read(path.join(dir, n)) : '')
  const findings = parseFindings(at('review.md')), changed = changedSince(slug)
  const rows = fileRows({
    findings, exists: rel => exists(path.join(ROOT, rel)), lineCount: rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length,
    planFiles: changed ? planFiles(at('plan.md')) : [], changed: changed ?? (() => true), amendments: at('amendments.md'), behaviourIds: behaviourIds(at('spec.md'), 'Behaviours'),
  })
  return [...rows, ...fixedRows(findings, readStamp(slug), hashOf)].sort((a, b) => a.rule.localeCompare(b.rule))
}

export function cmdClaims(args: Args): void {
  const stamping = args.pos[0] === 'stamp', slug = checkSlug((stamping ? args.pos[1] : args.pos[0]) ?? '')
  if (stamping) { stampReview(slug); return out(`claims: stamped ${slug}`) }
  const lines = claimRows(slug).filter(r => r.status !== 'ok').map(r => `${r.rule} ${r.status}: ${r.detail}`)
  out(lines.length ? lines.join('\n') : 'claims: nothing to suggest')
}
