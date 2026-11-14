// proof per behaviour (W2 N1): a behaviour must be named by a holdout case or by a current journey, as well as by a test.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHANGES, read, exists, readJson } from './core.ts'
import { showAt } from './diffs.ts'
import { type Finding } from './model.ts'
import type { Registry } from './registry.ts'
import { behaviourIds, missingBehaviours } from './sensors.ts'
import { parseCases } from './chartcheck.ts'
import { sprintOf } from './holdout.ts'
import { testplanDir } from './product.ts'
import { appStates } from './app.ts'

const VERIFY = path.join(ROOT, '.rig/verify')
export const EXEMPT = 'no app.json and no holdout cases for this change'

// Driver files and feature maps of every journey whose approval is current; a draft, changed or stale one proves nothing.
function journeyText(): { any: boolean; text: string } {
  const apps = exists(VERIFY) ? fs.readdirSync(VERIFY, { withFileTypes: true }).filter(d => d.isDirectory() && exists(path.join(VERIFY, d.name, 'app.json'))).map(d => d.name) : []
  const current = new Set(appStates().filter(a => a.state === 'current').map(a => a.name))
  const text = apps.filter(n => current.has(n)).flatMap(n => {
    const files = readJson<{ files?: unknown }>(path.join(VERIFY, n, 'app.json'), {}).files
    const feats = path.join(VERIFY, n, 'features')
    return [...(Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : []).map(f => read(path.join(VERIFY, n, f))), ...(exists(feats) ? fs.readdirSync(feats).filter(f => f.endsWith('.md')).map(f => read(path.join(feats, f))) : [])]
  }).join('\n')
  return { any: apps.length > 0, text }
}

// At CI the test plan is the base's: a PR cannot prove its own change with a holdout row it adds. A journey names a behaviour of this change as <slug>#B<n>, like a case orphan.
export function unproved(slug: string, base: string | null = null): { ids: string[]; exempt: string | null } {
  const ids = behaviourIds(read(path.join(CHANGES, slug, 'spec.md')), 'Behaviours')
  const sprint = sprintOf(slug)
  const planFile = sprint === null ? '' : path.join(testplanDir(sprint), 'cases.md')
  const cases = base && sprint !== null ? showAt(base, path.relative(ROOT, planFile).split(path.sep).join('/')) ?? '' : exists(planFile) ? read(planFile) : ''
  const holdout = parseCases(cases).filter(c => c.intent === slug && c.level.toLowerCase() === 'holdout')
  const j = journeyText()
  if (!j.any && !holdout.length) return { ids: [], exempt: EXEMPT }
  const named = (id: string): boolean => new RegExp(`(?<![A-Za-z0-9])${slug.replace(/[^\w-]/g, '')}#${id}(?!\\d)`).test(j.text)
  return { ids: missingBehaviours(ids, holdout.map(c => c.behaviour).join('\n')).filter(id => !named(id)), exempt: null }
}

export function proofFindings(slug: string, registry: Registry, base: string | null = null): Finding[] {
  if (!exists(path.join(CHANGES, slug, 'spec.md'))) return []
  return unproved(slug, base).ids.map(id => ({ sensor: 'proof', severity: registry.proof, message: `${id} is proved only by unit tests: name it in a holdout case (test plan row) or an approved journey step as <slug>#B<n>`, fix: 'add a holdout case row naming the behaviour, or a step of an approved journey that covers it' }))
}
