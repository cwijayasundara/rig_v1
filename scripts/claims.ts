// Claims against evidence (docs/superpowers/specs/2026-11-01-run-your-claims-design.md): what review.md and plan.md say, compared with the tree.
// Every rule only suggests. Nothing here may fail a ship or a verify.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHANGES, exists, read, readJson, out, git, writeAtomic, checkSlug, toPosix, type Args } from './core.ts'
import { section, bullets, planFiles, normPath, matchesAny } from './model.ts'
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
  // A fixed finding's file and line were cited against the reviewed tree; the fix wave may have moved or deleted them.
  for (const f of i.findings.filter(x => !x.fixed)) {
    const cite = `${f.file}:${f.line}`
    const bad = !i.exists(f.file) ? `${cite}: is not a file in this repo` : f.line > i.lineCount(f.file) || f.line < 1 ? `${cite}: the file has no such line` : ''
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

// A path a model wrote, as a repo-relative posix path; null when it points outside the repo or is not a regular file.
function repoFile(f: string): string | null {
  if (!f) return null
  const rel = path.relative(ROOT, path.resolve(ROOT, f))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  try { return fs.statSync(path.join(ROOT, rel)).isFile() ? toPosix(rel) : null } catch { return null }
}
const hashOf = (f: string): string | null => { const rel = repoFile(f); return rel ? (git(['hash-object', '--', rel]) ?? '').trim() || null : null }
// Files a finding's fix text names (`→ strengthen test/a.test.ts`): a fix may land there instead of in the cited file.
const fixPaths = (text: string): string[] => [...new Set([...text.split('→').slice(1).join('→').matchAll(/[\w@.-]+(?:\/[\w@.-]+)+|[\w-]+\.[A-Za-z]{1,5}\b/g)].map(m => m[0]))]
const reviewOf = (slug: string): string => read(path.join(CHANGES, slug, 'review.md'))

// Written right after review.md and before the fix wave: the fixes are uncommitted until `S pr`, so a commit sha cannot mark the review.
export function stampReview(slug: string): void {
  const stamp: Stamp = {}
  for (const f of parseFindings(reviewOf(slug))) for (const p of [f.file, ...fixPaths(f.text)]) if (p === f.file || repoFile(p)) stamp[p] = hashOf(p)
  writeAtomic(path.join(CHANGES, slug, STAMP), JSON.stringify(stamp, null, 2) + '\n')
}

// C2: a finding marked fixed whose cited file has the same hash as at the review. The fix may have landed elsewhere, so this only suggests.
export function fixedRows(findings: ReviewFinding[], stamp: Stamp | null, hash: (rel: string) => string | null): ClaimRow[] {
  return findings.filter(f => f.fixed).map((f): ClaimRow => {
    const cite = `${f.file}:${f.line}`, claim = `${cite} marked fixed`
    if (!stamp || !(f.file in stamp)) return { rule: 'C2', claim, status: 'skipped', detail: `no review stamp for ${f.file}` }
    if (stamp[f.file] === null && hash(f.file) === null) return { rule: 'C2', claim, status: 'skipped', detail: `${f.file} is not a file in this repo, so a change cannot be seen` }
    const named = [f.file, ...fixPaths(f.text).filter(p => p in stamp)]
    const moved = named.some(p => stamp[p] !== hash(p))
    return { rule: 'C2', claim, status: moved ? 'ok' : 'suggest', detail: moved ? `${f.file} (or a file its fix names) changed since the review` : `${cite} is marked fixed but ${f.file} is unchanged since the review: check the fix landed elsewhere` }
  })
}

const readStamp = (slug: string): Stamp | null => {
  try { const v: unknown = JSON.parse(read(path.join(CHANGES, slug, STAMP))); return v && typeof v === 'object' && !Array.isArray(v) ? (v as Stamp) : null } catch { return null }
}

// Whether a plan entry (a file, a directory, a glob, or ./file) was touched since the verified base. null when the base is unknown.
function changedSince(slug: string): ((entry: string) => boolean) | null {
  const base = readJson<{ base?: string } | null>(path.join(CHANGES, slug, 'verify.json'), null)?.base
  if (!base) return null
  const names = [...new Set([...(git(['diff', '--name-only', '--no-renames', base]) ?? '').split('\n'), ...(git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n')].filter(Boolean).map(normPath))]
  return entry => {
    const e = normPath(entry).replace(/\/$/, '')
    return /[*?]/.test(e) ? names.some(n => matchesAny(n, [e])) : names.some(n => n === e || n.startsWith(`${e}/`))
  }
}

export function claimRows(slug: string): ClaimRow[] {
  const dir = path.join(CHANGES, slug), at = (n: string): string => (exists(path.join(dir, n)) ? read(path.join(dir, n)) : '')
  const findings = parseFindings(at('review.md')), changed = changedSince(slug)
  const rows = fileRows({
    findings, exists: rel => repoFile(rel) !== null, lineCount: rel => { const r = repoFile(rel); return r ? fs.readFileSync(path.join(ROOT, r), 'utf8').split('\n').length : 0 },
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
