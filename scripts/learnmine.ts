// Mining committed evidence for the learning loop (design 2026-10-17): evaluator findings in review.md and waivers. Zero tokens.
// Only a key seen in at least two distinct changes is a candidate; one occurrence is never a lesson.
import fs from 'node:fs'
import path from 'node:path'
import { readJsonl, gitIn, type Waiver } from './core.ts'
import type { Lesson } from './learnfile.ts'

export type Candidate = { key: string; kind: 'finding' | 'waiver'; changes: string[]; count: number; sample: string }
export type Shipped = { slug: string; date: string; keys: string[] }

export const MIN_CHANGES = 2
export const STALE_AFTER = 10
export const WAIVED_AFTER = 3
const CATEGORY = /\[category: ([a-z-]+)\]/g

const changesDir = (root: string): string => path.join(root, '.rig', 'changes')
const slugsOf = (root: string): string[] =>
  fs.existsSync(changesDir(root)) ? fs.readdirSync(changesDir(root), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : []
const reviewOf = (root: string, slug: string): string => {
  try { return fs.readFileSync(path.join(changesDir(root), slug, 'review.md'), 'utf8') } catch { return '' }
}
const waiversOf = (root: string): Waiver[] => readJsonl<Waiver>(path.join(root, '.rig', 'waivers.jsonl')).filter(w => typeof w.slug === 'string' && typeof w.sensor === 'string')

// Each finding line of a review, keyed by its category.
const findingsOf = (review: string): { key: string; line: string }[] =>
  review.split('\n').flatMap(line => [...line.matchAll(CATEGORY)].map(m => ({ key: m[1] as string, line: line.replace(/^-\s*/, '').trim() })))

export function mineCandidates(root: string): Candidate[] {
  const slugs = slugsOf(root)
  const acc = new Map<string, Candidate>()
  const add = (kind: Candidate['kind'], key: string, slug: string, sample: string): void => {
    const id = `${kind}:${key}`
    const c = acc.get(id) ?? { key, kind, changes: [], count: 0, sample }
    c.count++
    if (!c.changes.includes(slug)) c.changes.push(slug)
    acc.set(id, c)
  }
  for (const slug of slugs) for (const f of findingsOf(reviewOf(root, slug))) add('finding', f.key, slug, f.line)
  for (const w of waiversOf(root)) if (slugs.includes(w.slug)) add('waiver', w.sensor, w.slug, w.reason ?? '')
  return [...acc.values()].filter(c => c.changes.length >= MIN_CHANGES).sort((a, b) => b.changes.length - a.changes.length || a.key.localeCompare(b.key))
}

// A shipped change is dated by the commit that added its pr.md. One whose pr.md was never committed (unmerged, shallow clone) is left out.
export function shippedChanges(root: string): Shipped[] {
  const waivers = waiversOf(root)
  const out: Shipped[] = []
  for (const slug of slugsOf(root)) {
    const log = gitIn(root, ['log', '--diff-filter=A', '--format=%cI', '--', `.rig/changes/${slug}/pr.md`])
    const date = log?.split('\n').filter(Boolean).pop()?.slice(0, 10)
    if (!date) continue
    const keys = [...new Set([...findingsOf(reviewOf(root, slug)).map(f => f.key), ...waivers.filter(w => w.slug === slug).map(w => w.sensor)])]
    out.push({ slug, date, keys })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug))
}

// When each lesson last fired (a later change carrying its key), and which lessons to propose retiring.
// A rule's waiver is told apart only by the rule id in the waiver's reason, because waivers record the sensor (`rules`), not the rule.
export function lessonStatus(lessons: Lesson[], shipped: Shipped[], waivers: { sensor: string; reason?: string }[]): { lastFired: Record<string, string>; retire: { id: string; why: string }[] } {
  const lastFired: Record<string, string> = {}
  const retire: { id: string; why: string }[] = []
  for (const l of lessons) {
    const fired = shipped.filter(s => s.date > l.first && s.keys.includes(l.key)).map(s => s.date).sort().pop()
    lastFired[l.id] = fired && fired > l.lastFired ? fired : l.lastFired
    if (l.status === 'active') {
      const later = shipped.filter(s => s.date > (lastFired[l.id] as string)).length
      if (later >= STALE_AFTER) retire.push({ id: l.id, why: `not fired in ${later} later changes` })
    } else if (l.status.startsWith('promoted:')) {
      const rule = l.status.slice('promoted:'.length)
      const waived = waivers.filter(w => w.sensor === 'rules' && (w.reason ?? '').includes(rule)).length
      if (waived >= WAIVED_AFTER) retire.push({ id: l.id, why: `rule ${rule} waived ${waived} times` })
    }
  }
  return { lastFired, retire }
}
