// The scope check (harness readiness 1.3): a charted intent may say which paths its change may touch, and a diff outside them is a finding.
// Deterministic and free. The scope lives in the product intent (`.rig/product/intents/<slug>.md`), which the chart approval freezes, so a PR
// cannot widen its own scope without a person re-approving the chart; a change with no product intent or no `scope:` is simply not checked.
import path from 'node:path'
import { ROOT, read, frontmatter } from './core.ts'
import { matchesAny, isTest, type FileDiff, type Finding } from './model.ts'
import type { Paths } from './registry.ts'

const list = (v: string | undefined): string[] => (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)

export function intentScope(slug: string): { scope: string[]; touches: string[] } | null {
  const data = frontmatter(read(path.join(ROOT, '.rig/product/intents', `${slug}.md`))).data
  const scope = list(data.scope as string | undefined)
  return scope.length ? { scope, touches: list(data.touches as string | undefined) } : null
}

// Warn while the model works (edit, Stop), block when the change is judged (ship, CI), like the size limits.
export function scopeFindings(diffs: FileDiff[], slugs: string[], paths: Paths, point: 'edit' | 'stop' | 'ship' | 'ci', scopeOf: (slug: string) => ReturnType<typeof intentScope> = intentScope): Finding[] {
  const scoped = slugs.flatMap(slug => { const s = scopeOf(slug); return s ? [{ slug, ...s }] : [] })
  if (!scoped.length) return []
  const allowed = [...new Set(scoped.flatMap(s => [...s.scope, ...s.touches, `.rig/changes/${s.slug}/**`]))]
  return diffs.filter(d => !d.binary && !d.file.startsWith('.rig/') && !matchesAny(d.file, allowed) && !isTest(d.file, paths) && !matchesAny(d.file, paths.testSupport)).map(d => ({
    sensor: 'scope', severity: point === 'edit' || point === 'stop' ? 'warn' as const : 'block' as const, file: d.file,
    message: `${d.file} is outside the scope of ${scoped.map(s => s.slug).join(', ')} (scope: ${scoped.flatMap(s => s.scope).join(', ')})`,
    fix: 'put this change in its own intent, or name the path under `touches:` in the intent for deliberate cross-slice work (the chart approval freezes it, so a person re-approves it)',
  }))
}
