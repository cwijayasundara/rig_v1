// rig:upgrade: decide, per harness file, what to do with the project's copy. Pure; the caller reads disk and writes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, SDLC, SENSORS_PATH, IS_VENDORED, skillRef, exists, read, out, fail, sha, type Args } from './core.ts'
import { isObject } from './model.ts'
import { isRegistryShape } from './registry.ts'
import { loadPacks, PACKS_DIR } from './stackpacks.ts'
import { harnessFiles, readManifest, pluginVersion, older, type Manifest } from './vendor.ts'
import { pendingMigrations, type Migration } from './migrations.ts'

export type Verdict = 'noop' | 'replace' | 'keep' | 'add' | 'delete' | 'conflict'

// base: hashes recorded at install (null: no manifest). disk: current text, null when absent. next: this plugin's files.
export function classify(base: Record<string, string> | null, disk: Map<string, string | null>, next: Map<string, string>): Map<string, Verdict> {
  const out = new Map<string, Verdict>()
  const paths = new Set([...next.keys(), ...disk.keys(), ...Object.keys(base ?? {})])
  for (const rel of paths) {
    const now = disk.get(rel) ?? null
    const want = next.get(rel)
    const was = base?.[rel]
    if (want === undefined) {
      if (now === null) continue
      out.set(rel, was !== undefined && sha(now) === was ? 'delete' : 'conflict')
    } else if (now === null) out.set(rel, 'add')
    else if (now === want) out.set(rel, 'noop')
    else if (was === undefined) out.set(rel, 'conflict')
    else if (sha(now) === was) out.set(rel, 'replace')
    else out.set(rel, sha(want) === was ? 'keep' : 'conflict')
  }
  return out
}

const idOf = (s: unknown): string | null => (isObject(s) && typeof s.id === 'string' ? s.id : null)

// Pack sensors whose id the team's registry lacks. Ids only: the team's commands are never compared or edited. Data only, never writes.
export function proposeSensors(sensorsJson: string, packs: ReturnType<typeof loadPacks>['packs']): { stack: string; sensors: Record<string, unknown>[] } | null {
  if (!isRegistryShape(sensorsJson)) return null
  const reg = JSON.parse(sensorsJson) as { stack?: unknown; sensors: unknown[] }
  const pack = packs.find(p => p.stack === reg.stack)
  if (!pack) return null
  const have = new Set(reg.sensors.map(idOf))
  const sensors = pack.sensors.filter((s): s is Record<string, unknown> => isObject(s) && !have.has(idOf(s)))
  return sensors.length ? { stack: pack.stack, sensors } : null
}

type Proposals = ReturnType<typeof proposeSensors>
export type Plan = {
  from: string; to: string; standalone: boolean
  files: Map<string, Verdict> // every harness file, noop included
  next: Map<string, string> // this plugin's text per path
  disk: Map<string, string | null> // the project's text per path, null when absent
  manifest: Manifest | null
  migrations: Migration[]
  proposals: Proposals
}

// The refusals both the dry run and apply share, in order.
export function upgradeGates(args: Args): void {
  if (IS_VENDORED) fail('run upgrade from the sdlc plugin, not from a project copy')
  if (!exists(SDLC)) fail(`no .rig/ here: run ${skillRef('init')} first`)
  const have = read(path.join(SDLC, 'bin', 'VERSION')).trim()
  const next = pluginVersion()
  if (have && older(next, have) && !args.opt.force) fail(`.rig/bin is ${have}, newer than this plugin (${next}); upgrade the plugin first, or pass --force to downgrade`)
  try { if (read(path.join(ROOT, '.claude', 'settings.json'))) JSON.parse(read(path.join(ROOT, '.claude', 'settings.json'))) } catch { fail('.claude/settings.json is not plain JSON (comments or trailing commas?); fix it first so upgrading does not leave a half-written tree') }
}

// Reads disk and the plugin; writes nothing.
export function buildPlan(): Plan {
  const from = read(path.join(SDLC, 'bin', 'VERSION')).trim()
  const to = pluginVersion()
  const standalone = exists(path.join(ROOT, '.claude/skills/rig-start/SKILL.md'))
  const manifest = readManifest()
  const next = standalone ? harnessFiles(true) : new Map<string, string>()
  const disk = new Map<string, string | null>()
  if (standalone) for (const rel of new Set([...Object.keys(manifest?.files ?? {}), ...next.keys()])) {
    if (rel.endsWith('.rig-new')) continue
    disk.set(rel, exists(path.join(ROOT, rel)) ? read(path.join(ROOT, rel)) : null)
  }
  const files = classify(manifest?.files ?? null, disk, next)
  const sensors = read(SENSORS_PATH)
  return { from, to, standalone, files, next, disk, manifest, migrations: pendingMigrations(from, to), proposals: sensors ? proposeSensors(sensors, loadPacks(PACKS_DIR).packs) : null }
}

const countsOf = (files: Map<string, Verdict>): Record<Verdict, number> => {
  const c: Record<Verdict, number> = { noop: 0, replace: 0, keep: 0, add: 0, delete: 0, conflict: 0 }
  for (const v of files.values()) c[v]++
  return c
}

function showDiff(plan: Plan, rel: string): void {
  if (!plan.files.has(rel)) fail(`${rel} is not a harness file in this plan`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-upgrade-'))
  try {
    const want = plan.next.get(rel)
    const wantPath = want === undefined ? os.devNull : path.join(tmp, path.basename(rel))
    if (want !== undefined) fs.writeFileSync(wantPath, want)
    const have = plan.disk.get(rel) === null ? os.devNull : path.join(ROOT, rel)
    out(spawnSync('git', ['diff', '--no-index', '--', have, wantPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

export function cmdUpgrade(args: Args): void {
  upgradeGates(args)
  if (args.opt.apply) fail('upgrade --apply is not implemented yet')
  const plan = buildPlan()
  if (typeof args.opt.diff === 'string') return showDiff(plan, args.opt.diff)
  const counts = countsOf(plan.files)
  const todo = [...plan.files].filter(([, v]) => v !== 'noop')
  if (args.opt.json) {
    return out(JSON.stringify({ from: plan.from, to: plan.to, standalone: plan.standalone, files: Object.fromEntries(todo), counts, migrations: plan.migrations.map(m => m.id), proposals: plan.proposals }, null, 2))
  }
  const lines = [`upgrade ${plan.from || 'unversioned'} -> ${plan.to}${plan.standalone ? ' (standalone)' : ' (plugin mode: no project copies to update)'}`]
  if (plan.standalone) lines.push(Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', '))
  const conflicts = todo.filter(([, v]) => v === 'conflict').map(([rel]) => rel)
  if (conflicts.length) lines.push('conflicts (edited here and changed upstream; the new copy goes beside as .rig-new on apply):', ...conflicts.map(rel => `  ${rel}`))
  if (plan.migrations.length) lines.push('migrations:', ...plan.migrations.map(m => `  ${m.id}`))
  if (plan.proposals) lines.push(`proposed ${plan.proposals.stack} sensors (not applied):`, ...plan.proposals.sensors.map(s => `  ${String(s.id)}`))
  if (!todo.length && !plan.migrations.length && !plan.proposals) lines.push('already current')
  out(lines.join('\n'))
}
