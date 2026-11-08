// `sdlc intent-recheck` (incorporations spec 2026-11-08, item 2): a shipped change's frozen checks are re-run on the trunk, because the
// world moves (dependency upgrades, refactors) while the map stays frozen. Drift becomes one proposed intent under .rig/maintain/proposals/
// (the maintain mechanism: once per drift, a person starts it). Nothing is written into a change record and no map or approval changes.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, exists, sha, type Args } from './core.ts'
import { runCommand } from './runs.ts'
import { isShipped } from './lifecycle.ts'
import { applyResults, parse, shipCheck } from './intentmap.ts'
import { readResults, readAdjudications } from './intentmapio.ts'
import { propose, type Finding } from './maintain.ts'

// Only rules a moved world can break. Structure rules added after a change shipped (a newer map rule) are not drift.
const DRIFT = new Set(['formal-failed', 'vacuous', 'property-failed'])
const run = (cmd: string): { exit: number; tail: string } => { const r = runCommand(cmd, { timeoutMs: 600_000 }); return { exit: r.exit, tail: r.tail } }

export function recheckFindings(slug: string): Finding[] {
  const mapPath = path.join(CHANGES, slug, 'intent-map.md')
  const results = readResults(slug)
  const text = applyResults(fs.readFileSync(mapPath, 'utf8'), results)
  const drift = shipCheck({ text, results, adjudications: readAdjudications(slug), tests: [], run }).findings.filter(f => DRIFT.has(f.rule)).map((f): { id: string; line: string } => ({ id: f.rule, line: `${f.rule}: ${f.detail}` }))
  for (const sc of parse(text).scenarios) if (sc.status === 'pass' && sc.command && run(sc.command).exit !== 0) drift.push({ id: sc.id, line: `${sc.id}: \`${sc.command}\` now fails` })
  if (!drift.length) return []
  const file = `.rig/changes/${slug}/intent-map.md`
  return [{ kind: 'recheck', key: sha(`recheck ${slug} ${drift.map(d => d.id).sort().join(',')}`), title: `Recheck ${slug}: its intent map no longer holds`, files: [file], evidence: `The frozen checks of the shipped change ${slug} fail on the trunk now:\n\n${drift.map(d => `- ${d.line}`).join('\n')}\n\nThe map is frozen and unchanged; the code, a dependency or the environment moved.` }]
}

export function cmdIntentRecheck(args: Args): void {
  const slugs = (exists(CHANGES) ? fs.readdirSync(CHANGES) : []).filter(s => exists(path.join(CHANGES, s, 'intent-map.md')) && isShipped(s)).sort()
  propose(slugs.flatMap(recheckFindings), args, 'intent-recheck')
}
