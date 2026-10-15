// `ratchet record <slug> build --checks`: a slice's verdict from captured evidence. The model never certifies its own slice.
import { defaultBase, scopeDrift, planApproved, planVerification } from './core.ts'
import { loadConfig, runChecks } from './check.ts'
import { branchDiff, showAt } from './diffs.ts'
import { loadChange } from './graph.ts'
import { readRuns, normCmd, runCommand } from './runs.ts'
import { matchesAny } from './model.ts'
import { treeStamp } from './stamp.ts'

export type SliceCheck = { ok: true } | { ok: false; why: string }

export function checkSlice(slug: string): SliceCheck {
  if (loadChange(slug).tier === 'L') return { ok: false, why: 'tier L slices need a reviewer verdict (rig:reviewer), not --checks' }
  const { config, rules } = loadConfig()
  const base = defaultBase()
  const drift = scopeDrift(slug, base).drift
  if (drift.length) return { ok: false, why: `files outside the plan's ## Files: ${drift.join(', ')}` }
  const diffs = branchDiff(base ?? 'HEAD')
  const gate = runChecks({ point: 'stop', diffs, config, rules, slugs: [slug], commands: 'none', budgetMs: 60_000, before: f => showAt(base ?? 'HEAD', f) ?? '', base, ratchet: false })
  if (gate.blocks.length) return { ok: false, why: `sensors block: ${gate.blocks.map(b => `${b.sensor}${b.file ? ` ${b.file}` : ''}: ${b.message}`).join('; ')}` }
  // Continuous cadence: the behavioural suite runs per slice only when the slice touches its files, a contract, or a change-local behavioural file.
  const b = config.behavioral
  if (b?.cadence === 'continuous' && diffs.some(d => d.file.startsWith(`.rig/changes/${slug}/behavioral/`) || matchesAny(d.file, [...b.files, ...config.contracts]))) {
    if (b.validate && runCommand(b.validate, { timeoutMs: 60_000 }).exit !== 0) return { ok: false, why: 'behavioral validate failed: examples do not match the specs' }
    if (b.run && runCommand(b.run, { timeoutMs: 60_000 }).exit !== 0) return { ok: false, why: 'behavioral run failed: fix the implementation or the execution setup, never the examples or specs' }
  }
  const tests = new Set([config.fast.test, config.full.test, ...Object.values(config.levels), ...(planApproved(slug) ? planVerification(slug) : [])].filter((c): c is string => Boolean(c)).map(normCmd))
  const tree = treeStamp()
  const green = tree !== null && readRuns(slug).some(r => !r.expectFail && !r.source && !r.timedOut && r.exit === 0 && r.tree === tree && tests.has(normCmd(r.cmd)))
  return green ? { ok: true } : { ok: false, why: 'no green run of a declared test command on the current tree (declared: fast.test or full.test in sensors.json, levels.*, or the approved plan ## Verification): run one with sdlc.ts run -- "<command>", then record again' }
}
