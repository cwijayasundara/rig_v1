// Where the product's files live. What belongs to one sprint sits under `.rig/product/sprints/sprint-<N>/` (its PRD, intents,
// test plan, chart review and approval), so two teams charting different sprints touch different folders. What every sprint
// edits stays at `.rig/product/`: brief.md, architecture.md and adr/. Paths here are the only place that layout is written down.
import fs from 'node:fs'
import path from 'node:path'
import { SDLC, exists } from './core.ts'

export const PRODUCT = path.join(SDLC, 'product')
export const ARCH_REL = '.rig/product/architecture.md'
export const archPath = path.join(PRODUCT, 'architecture.md')
const SPRINTS = path.join(PRODUCT, 'sprints')
const SPRINT_DIR_RE = /^sprint-(\d{1,4})$/

export const sprintDir = (n: number): string => path.join(SPRINTS, `sprint-${n}`)
export const prdPath = (n: number): string => path.join(sprintDir(n), 'prd.md')
export const intentsDir = (n: number): string => path.join(sprintDir(n), 'intents')
export const testplanDir = (n: number): string => path.join(sprintDir(n), 'testplan')
export const planPath = (n: number): string => path.join(sprintDir(n), 'plan.md')
export const approvalPath = (n: number): string => path.join(sprintDir(n), 'approval.json')

// Repo-relative posix forms, for messages and for matching git paths.
export const sprintRel = (n: number): string => `.rig/product/sprints/sprint-${n}`
export const prdRel = (n: number): string => `${sprintRel(n)}/prd.md`
// Where a person is told to put a PRD: a repo-owned folder, not rig's. /rig:chart copies it to prdRel(n).
export const prdHint = (n: number): string => `docs/prd/sprint-${n}.md`
export const intentRel = (n: number, slug: string): string => `${sprintRel(n)}/intents/${slug}.md`

export function sprintsOnDisk(): number[] {
  if (!exists(SPRINTS)) return []
  return fs.readdirSync(SPRINTS, { withFileTypes: true }).flatMap(e => { const m = e.isDirectory() ? SPRINT_DIR_RE.exec(e.name) : null; return m?.[1] ? [Number(m[1])] : [] }).sort((a, b) => a - b)
}

// The repo-relative path of an intent by slug, from a list of repo-relative files (the working tree by default, a git tree at a base ref for the scope check).
export function intentRelOf(slug: string, files: string[] = sprintsOnDisk().flatMap(n => (exists(intentsDir(n)) ? fs.readdirSync(intentsDir(n)).map(f => `${sprintRel(n)}/intents/${f}`) : []))): string | null {
  return files.find(f => new RegExp(`^\\.rig/product/sprints/sprint-\\d{1,4}/intents/${slug.replace(/[^\w-]/g, '')}\\.md$`).test(f)) ?? null
}
