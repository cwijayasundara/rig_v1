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
// Short per command: the workflow step has its own 10 minute cap, and a hang must not sink the day's maintain proposals.
const RECHECK_TIMEOUT_MS = 180_000
const run = (cmd: string): { exit: number; tail: string } => { const r = runCommand(cmd, { timeoutMs: RECHECK_TIMEOUT_MS }); return { exit: r.exit, tail: r.tail } }

// One finding per drifting check, keyed by it: E1 proposed last week does not come back when E2 drifts too.
export function recheckFindings(slug: string): Finding[] {
  const mapPath = path.join(CHANGES, slug, 'intent-map.md')
  const results = readResults(slug)
  const text = applyResults(fs.readFileSync(mapPath, 'utf8'), results)
  const map = parse(text)
  // An empty ## Property command section was never runnable (ship refuses it now); an old map with one is not drift.
  const drift = shipCheck({ text, results, adjudications: readAdjudications(slug), tests: [], run }).findings
    .filter(f => DRIFT.has(f.rule) && !(f.rule === 'property-failed' && !map.propertyCommand))
    .map((f): { id: string; line: string } => ({ id: f.rule, line: `${f.rule}: ${f.detail}` }))
  for (const sc of map.scenarios) if (sc.status === 'pass' && sc.command && run(sc.command).exit !== 0) drift.push({ id: sc.id, line: `${sc.id}: \`${sc.command}\` now fails` })
  const file = `.rig/changes/${slug}/intent-map.md`
  return drift.map(d => ({ kind: 'recheck', key: sha(`recheck ${slug} ${d.id}`), title: `Recheck ${slug}: ${d.id} no longer holds`, files: [file], evidence: `A frozen check of the shipped change ${slug} fails on the trunk now:\n\n- ${d.line}\n\nThe map is frozen and unchanged; the code, a dependency or the environment moved.` }))
}

export function cmdIntentRecheck(args: Args): void {
  const slugs = (exists(CHANGES) ? fs.readdirSync(CHANGES) : []).filter(s => exists(path.join(CHANGES, s, 'intent-map.md')) && isShipped(s)).sort()
  for (const s of slugs) if (!exists(path.join(CHANGES, s, 'intent-results.json')) && parse(fs.readFileSync(path.join(CHANGES, s, 'intent-map.md'), 'utf8')).scenarios.length) process.stderr.write(`intent-recheck: ${s} has scenarios but no intent-results.json, so they were not rechecked\n`)
  propose(slugs.flatMap(recheckFindings), args, 'intent-recheck')
}
