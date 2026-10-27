// The risk tier (proposal 2026-10-27 B1, B2): which changes a person must read. The tier is the max over signals from the change's
// own files and the config; nothing lowers it. Tier 2 suggests a second reviewer, which branch protection enforces, never rig.
import path from 'node:path'
import { CHANGES, ROOT, SENSORS_JSON, read, readJson, out, optString, checkSlug, defaultBase, type Args } from './core.ts'
import { section, matchesAny, type FileDiff } from './model.ts'
import { parseRegistry, type Registry } from './registry.ts'
import { isProtected } from './sensors.ts'
import { parseAccess, type AccessRule } from './chartcheck.ts'
import { branchDiff } from './diffs.ts'
import { activeSlug } from './lifecycle.ts'
import { archPath } from './product.ts'

export type Risk = { tier: 0 | 1 | 2; reasons: string[] }
type RiskInput = { files: string[]; lines: number; slugs: string[]; read: (slug: string, name: string) => string; access: AccessRule[]; risk: Registry['risk']; contractGlobs: string[]; ci: boolean }

const TWO = 'two reviewers, one a code owner, recommended; enforce it in branch protection'
const bullets = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => /^[-*]\s+\S/.test(l))
const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

// A finding is open until the confirm pass closes it (` → fixed (confirmed)`): a bare ` → fixed` is the builder's own claim.
export function reviewSignals(review: string): { open: number; dismissed: number; unverifiable: number } {
  return {
    open: bullets(section(review, 'Findings')).filter(l => !/→\s*fixed \(confirmed\)\s*$/.test(l)).length,
    dismissed: bullets(section(review, 'Dismissed')).length,
    unverifiable: bullets(section(review, 'Unverifiable')).length,
  }
}

export function assessRisk(i: RiskInput): Risk {
  const fold = (s: string): string => (i.ci ? s.toLowerCase() : s)
  const human = [...i.risk.alwaysHuman, '.github/workflows/**'].map(fold)
  const two = [
    ...i.files.filter(f => isProtected(f, i.ci) || matchesAny(fold(f), human)).map(f => `always-human path: ${f}`),
    ...i.access.filter(a => i.slugs.includes(a.intent)).map(a => `access: ${a.intent} builds "${a.action}"`),
  ]
  const reviews = i.slugs.map(s => i.read(s, 'review.md'))
  const sig = reviews.map(reviewSignals).reduce((a, b) => ({ open: a.open + b.open, dismissed: a.dismissed + b.dismissed, unverifiable: a.unverifiable + b.unverifiable }), { open: 0, dismissed: 0, unverifiable: 0 })
  const oneWay = i.slugs.some(s => bullets(section(i.read(s, 'plan.md'), 'Contracts')).length > 0) || i.files.some(f => matchesAny(fold(f), i.contractGlobs.map(fold)))
  const one = [
    oneWay ? 'one-way door' : '',
    i.slugs.length ? '' : 'no change record',
    reviews.some(r => !r.trim()) ? 'no review.md: the change was not reviewed' : '',
    sig.open ? count(sig.open, 'finding still open', 'findings still open') : '',
    sig.dismissed ? count(sig.dismissed, 'finding dismissed by the builder', 'findings dismissed by the builder') : '',
    sig.unverifiable ? count(sig.unverifiable, 'item the reviewer could not verify', 'items the reviewer could not verify') : '',
    i.lines > i.risk.maxLines ? `diff of ${i.lines} lines is over risk.maxLines (${i.risk.maxLines})` : '',
  ].filter(Boolean)
  if (two.length) return { tier: 2, reasons: [...two, ...one, TWO] }
  return { tier: one.length ? 1 : 0, reasons: one }
}

// The inputs every caller shares: the diff's files and size, and the change records read from the working tree.
export function riskOf(diffs: FileDiff[], slugs: string[], registry: Registry, access: AccessRule[], ci: boolean): Risk {
  return assessRisk({
    // a rename is judged by both paths, so moving a workflow or contract out of its glob still counts
    files: diffs.flatMap(d => (d.from ? [d.file, d.from] : [d.file])), lines: diffs.reduce((n, d) => n + d.added.length + d.removed.length, 0), slugs,
    read: (slug, name) => read(path.join(CHANGES, slug, name)), access, risk: registry.risk, contractGlobs: registry.contracts.files, ci,
  })
}

export const formatRisk = (r: Risk): string => [`tier: ${r.tier}`, ...r.reasons.map(x => `- ${x}`)].join('\n')

export function cmdRisk(args: Args): void {
  const slug = args.pos[0] ? checkSlug(args.pos[0]) : activeSlug()
  const base = optString(args, 'base') ?? (slug ? readJson<{ base?: string } | null>(path.join(CHANGES, slug, 'verify.json'), null)?.base : undefined) ?? defaultBase() ?? 'HEAD'
  const r = riskOf(branchDiff(base), slug ? [slug] : [], parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry, parseAccess(read(archPath)), false)
  out(args.opt.json ? JSON.stringify(r) : formatRisk(r))
}
