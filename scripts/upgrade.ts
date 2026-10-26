// rig:upgrade: decide, per harness file, what to do with the project's copy. Pure; the caller reads disk and writes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, SDLC, SENSORS_PATH, IS_VENDORED, skillRef, exists, read, out, fail, sha, git, sanctionWrites, type Args } from './core.ts'
import { isObject } from './model.ts'
import { isRegistryShape } from './registry.ts'
import { loadPacks, PACKS_DIR } from './stackpacks.ts'
import { harnessFiles, readManifest, isHarnessPath, mergeProjectFiles, MANIFEST, pluginVersion, older, type Manifest } from './vendor.ts'
import { pendingMigrations, runMigrations, type Migration } from './migrations.ts'
import { cmdSync } from './sync.ts'
import { cmdBaseline } from './initbaseline.ts'

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
  ignoredManifestKeys: string[] // manifest entries outside the harness namespace, never acted on
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
  const raw = readManifest()
  const ignoredManifestKeys = Object.keys(raw?.files ?? {}).filter(rel => !isHarnessPath(rel))
  const manifest = raw && { ...raw, files: Object.fromEntries(Object.entries(raw.files ?? {}).filter(([rel]) => isHarnessPath(rel))) }
  const next = standalone ? harnessFiles(true) : new Map<string, string>()
  const disk = new Map<string, string | null>()
  if (standalone) for (const rel of new Set([...Object.keys(manifest?.files ?? {}), ...next.keys()])) {
    if (rel.endsWith('.rig-new')) continue
    disk.set(rel, exists(path.join(ROOT, rel)) ? read(path.join(ROOT, rel)) : null)
  }
  const files = classify(manifest?.files ?? null, disk, next)
  // VERSION is rig's bookkeeping, not the project's file: it is never a conflict or a keep, it always follows the plugin.
  const ver = '.rig/bin/VERSION'
  if (next.has(ver)) files.set(ver, disk.get(ver) === next.get(ver) ? 'noop' : 'replace')
  const sensors = read(SENSORS_PATH)
  return { from, to, standalone, files, next, disk, manifest, migrations: pendingMigrations(from, to).filter(m => m.applies(ROOT)), ignoredManifestKeys, proposals: sensors ? proposeSensors(sensors, loadPacks(PACKS_DIR).packs) : null }
}

const countsOf = (files: Map<string, Verdict>): Record<Verdict, number> => {
  const c: Record<Verdict, number> = { noop: 0, replace: 0, keep: 0, add: 0, delete: 0, conflict: 0 }
  for (const v of files.values()) c[v]++
  return c
}

// Nothing to write: every file is noop or kept, no migration applies, and the install already carries this version.
const isCurrent = (plan: Plan): boolean => [...plan.files.values()].every(v => v === 'noop' || v === 'keep') && !plan.migrations.length && (!plan.standalone || plan.from === plan.to)

function showDiff(plan: Plan, rel: string): void {
  if (!isHarnessPath(rel) || !plan.files.has(rel)) fail(`${rel} is not a harness file in this plan`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-upgrade-'))
  try {
    const want = plan.next.get(rel)
    const wantPath = want === undefined ? os.devNull : path.join(tmp, path.basename(rel))
    if (want !== undefined) fs.writeFileSync(wantPath, want)
    const have = plan.disk.get(rel) === null ? os.devNull : path.join(ROOT, rel)
    out(spawnSync('git', ['diff', '--no-index', '--', have, wantPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

type Decision = 'mine' | 'new' | 'later'

function parseDecisions(raw: unknown, conflicts: string[]): Map<string, Decision> {
  const m = new Map<string, Decision>()
  if (raw === undefined) return m
  let j: unknown
  try { j = typeof raw === 'string' ? JSON.parse(raw) : null } catch { j = null }
  if (!isObject(j)) return fail('--decide needs a JSON object: {"<path>": "mine" | "new" | "later"}')
  for (const [rel, v] of Object.entries(j)) {
    if (v !== 'mine' && v !== 'new' && v !== 'later') fail(`--decide: "${String(v)}" for ${rel} is not mine, new or later`)
    if (!conflicts.includes(rel)) fail(`--decide: ${rel} is not a conflict in this plan`)
    m.set(rel, v as Decision)
  }
  return m
}

// Applies the plan on a new branch and stops: never commits to main, never pushes.
function applyUpgrade(args: Args): void {
  const plan = buildPlan()
  const conflicts = [...plan.files].filter(([, v]) => v === 'conflict').map(([rel]) => rel)
  const decisions = parseDecisions(args.opt.decide, conflicts)
  const wanted = typeof args.opt['add-sensors'] === 'string' ? args.opt['add-sensors'].split(',').map(s => s.trim()).filter(Boolean) : []
  const unknown = wanted.filter(id => !plan.proposals?.sensors.some(s => s.id === id))
  if (unknown.length) fail(`--add-sensors: not a proposed sensor: ${unknown.join(', ')}`)
  // Proposals are work only when the person picked some: otherwise a bare --apply would leave an empty branch.
  const current = isCurrent(plan) && !wanted.length
  if (current) {
    const ids = plan.proposals?.sensors.map(s => String(s.id)) ?? []
    return out(`already current: nothing to apply, no branch created${ids.length ? `\n${ids.length} sensors proposed (${ids.join(', ')}); re-run with --add-sensors <id,id> to add them` : ''}`)
  }
  const branch = `chore/rig-upgrade-${plan.to}`
  const dirty = git(['status', '--porcelain'])
  if (dirty === null) fail('could not read git status: is this a git repository?')
  if (dirty) fail('the working tree is not clean: commit or stash first, so the upgrade branch holds only the upgrade')
  const undecided = conflicts.filter(rel => !decisions.has(rel))
  if (undecided.length) fail(`decide each conflict with --decide '{"<path>": "mine" | "new" | "later"}'; undecided:\n${undecided.map(rel => `  ${rel}`).join('\n')}`)
  if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) fail(`branch ${branch} already exists: merge or delete it first`)
  const previous = git(['branch', '--show-current']) || git(['rev-parse', 'HEAD']) || 'main'
  if (git(['checkout', '-q', '-b', branch]) === null) fail(`could not create branch ${branch}`)

  const written: string[] = []
  const put = (rel: string, text: string): void => {
    if (!isHarnessPath(rel)) fail(`refusing to write ${rel}: outside the harness`)
    fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true })
    fs.writeFileSync(path.join(ROOT, rel), text)
    if (rel.startsWith('.rig/githooks/')) fs.chmodSync(path.join(ROOT, rel), 0o755)
    written.push(rel)
  }
  const drop = (rel: string): void => { if (!isHarnessPath(rel)) fail(`refusing to delete ${rel}: outside the harness`); fs.rmSync(path.join(ROOT, rel), { force: true }); written.push(rel) }
  for (const [rel, v] of plan.files) {
    const text = plan.next.get(rel)
    const d = decisions.get(rel)
    if (v === 'replace' || v === 'add') put(rel, text as string)
    else if (v === 'delete') drop(rel)
    else if (v === 'conflict' && d === 'new') text === undefined ? drop(rel) : put(rel, text)
    else if (v === 'conflict' && d === 'later' && text !== undefined) put(`${rel}.rig-new`, text)
  }
  if (plan.standalone) mergeProjectFiles(written)
  const notes = runMigrations(plan.migrations, ROOT)
  for (const rel of plan.migrations.length ? ['.rig/sensors.json.rig-new'] : []) if (exists(path.join(ROOT, rel))) written.push(rel)
  if (wanted.length) {
    const reg = JSON.parse(read(SENSORS_PATH)) as { sensors: unknown[] }
    for (const id of wanted) reg.sensors.push(structuredClone(plan.proposals?.sensors.find(s => s.id === id)))
    fs.writeFileSync(SENSORS_PATH, JSON.stringify(reg, null, 2) + '\n')
    written.push('.rig/sensors.json')
  }
  if (plan.standalone) {
    const files = Object.fromEntries([...plan.next].map(([rel, text]) => [rel, sha(text)]).sort(([a], [b]) => (a as string).localeCompare(b as string, 'en')))
    put(MANIFEST, JSON.stringify({ version: plan.to, files }, null, 2) + '\n')
  }
  sanctionWrites(written)
  out(`upgrade ${plan.from || 'unversioned'} -> ${plan.to} applied on ${branch}\n${written.length} files written${notes.length ? '\n' + notes.join('\n') : ''}`)
  if (isRegistryShape(read(SENSORS_PATH))) {
    out(`applied on branch ${branch}; running sync and baseline (if one fails: fix it, then re-run sdlc.ts sync and sdlc.ts baseline by name, or discard with: git checkout -- . && git clean -fd && git checkout ${previous} && git branch -D ${branch})`)
    cmdSync({ pos: [], opt: {} }); cmdBaseline()
  }
  out(`branch ${branch}\nreview and merge; nothing was pushed`)
}

export function cmdUpgrade(args: Args): void {
  upgradeGates(args)
  if (args.opt.apply) return applyUpgrade(args)
  const plan = buildPlan()
  if (typeof args.opt.diff === 'string') return showDiff(plan, args.opt.diff)
  const counts = countsOf(plan.files)
  const todo = [...plan.files].filter(([, v]) => v !== 'noop')
  if (args.opt.json) {
    return out(JSON.stringify({ from: plan.from, to: plan.to, standalone: plan.standalone, files: Object.fromEntries(todo), counts, migrations: plan.migrations.map(m => m.id), proposals: plan.proposals, ignoredManifestKeys: plan.ignoredManifestKeys }, null, 2))
  }
  const lines = [`upgrade ${plan.from || 'unversioned'} -> ${plan.to}${plan.standalone ? ' (standalone)' : ' (plugin mode: no project copies to update)'}`]
  if (plan.standalone) lines.push(Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', '))
  const conflicts = todo.filter(([, v]) => v === 'conflict').map(([rel]) => rel)
  if (conflicts.length) lines.push('conflicts (edited here and changed upstream; when applying you choose mine, new or later for each):', ...conflicts.map(rel => `  ${rel}`))
  if (plan.migrations.length) lines.push('migrations:', ...plan.migrations.map(m => `  ${m.id}`))
  if (plan.proposals) lines.push(`proposed ${plan.proposals.stack} sensors (not applied):`, ...plan.proposals.sensors.map(s => `  ${String(s.id)}`))
  if (plan.ignoredManifestKeys.length) lines.push(`ignored ${plan.ignoredManifestKeys.length} manifest entries outside the harness`)
  if (isCurrent(plan)) lines.push('already current')
  out(lines.join('\n'))
}
