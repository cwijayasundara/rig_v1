// `sdlc app` (harness readiness 2.1, design 2026-10-21): journeys. A repo-local driver launches the real app, walks a few named journeys and
// exits 0 or 1; a person approves it once; from then on verify, ship and CI run it, and a failed journey blocks. The driver is any command, so
// nothing here assumes what kind of app it is. A driver nobody has approved is a draft: not enforced, and listed as such.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, PLUGIN_ROOT, ownerOrFail, out, fail, read, exists, sha, writeAtomic, sanctionWrites, type Args } from './core.ts'
import { runCommand } from './runs.ts'
import { formatFindings, type Finding } from './model.ts'
import type { Inert } from './registry.ts'

const VERIFY = '.rig/verify'
export type App = { name: string; run: string; files: string[]; timeoutMs: number }
export type AppState = 'draft' | 'current' | 'changed' | 'stale'
type Approval = { by: string; at: string; hash: string }

const readJson = <T>(rel: string): T | null => { try { return JSON.parse(read(path.join(ROOT, rel))) as T } catch { return null } }

export function listApps(): App[] {
  const dir = path.join(ROOT, VERIFY)
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(d.name)).flatMap(d => {
    const def = readJson<{ run?: unknown; files?: unknown; timeoutMs?: unknown }>(`${VERIFY}/${d.name}/app.json`)
    if (!def || typeof def.run !== 'string' || !def.run.trim() || !Array.isArray(def.files)) return []
    return [{ name: d.name, run: def.run, files: def.files.filter((f): f is string => typeof f === 'string' && !f.includes('..')), timeoutMs: Number(def.timeoutMs) > 0 ? Number(def.timeoutMs) : 120_000 }]
  })
}

const featureFiles = (a: App): string[] => {
  const dir = path.join(ROOT, VERIFY, a.name, 'features')
  return exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => `${VERIFY}/${a.name}/features/${f}`) : []
}
// Everything that makes the journeys what they are: the definition, the driver files and the feature map.
const hashOf = (a: App): string => sha([`${VERIFY}/${a.name}/app.json`, ...a.files.map(f => `${VERIFY}/${a.name}/${f}`), ...featureFiles(a)].map(f => `${f}\n${read(path.join(ROOT, f))}`).join('\n--\n'))
const approvalOf = (a: App): Approval | null => readJson<Approval>(`${VERIFY}/${a.name}.approved.json`)

// A feature file says where its feature lives with `entry: <path>` lines; a path that no longer exists means the map has gone stale.
export function missingEntries(a: App): string[] {
  return featureFiles(a).flatMap(f => [...read(path.join(ROOT, f)).matchAll(/^entry:\s*(\S+)\s*$/gm)].map(m => m[1] as string).filter(p => !exists(path.join(ROOT, p))).map(p => `${path.basename(f)}: ${p}`))
}

export function appState(a: App): AppState {
  const ap = approvalOf(a)
  if (!ap) return 'draft'
  if (missingEntries(a).length) return 'stale'
  return ap.hash === hashOf(a) ? 'current' : 'changed'
}

export const draftApps = (): Inert[] => listApps().filter(a => appState(a) === 'draft').map(a => ({ id: 'journeys', reason: `${a.name} is a draft: never approved, so not enforced` }))
export const appStates = (): { name: string; state: AppState }[] => listApps().map(a => ({ name: a.name, state: appState(a) }))

function runDriver(a: App, budgetMs: number): { exit: number; tail: string; timedOut: boolean } {
  process.env.RIG_VERIFY_STATE = path.join(SDLC, 'state', 'verify', a.name)
  fs.mkdirSync(process.env.RIG_VERIFY_STATE, { recursive: true })
  const row = runCommand(a.run, { timeoutMs: Math.max(1000, Math.min(a.timeoutMs, budgetMs)) })
  return { exit: row.exit, tail: row.tail, timedOut: Boolean(row.timedOut) }
}

// What verify, ship and CI run: every approved app's driver. A draft is skipped.
export function journeyFindings(budgetMs: number, only?: string): Finding[] {
  const findings: Finding[] = []
  let left = budgetMs
  for (const a of listApps().filter(x => !only || x.name === only)) {
    const state = appState(a)
    if (state === 'draft') continue
    if (state === 'stale') findings.push({ sensor: 'journeys', severity: 'block', message: `journeys ${a.name}: the feature map names a path that no longer exists (${missingEntries(a).join('; ')})`, fix: 'update the feature files for what the app is now, then `app approve` again' })
    if (state === 'changed') findings.push({ sensor: 'journeys', severity: 'warn', message: `journeys ${a.name} changed since a person approved it`, fix: 'a code owner reviews the driver and feature files; `app approve` records the new version', labels: ['weakens-harness'] })
    if (left <= 0) { findings.push({ sensor: 'journeys', severity: 'block', message: `journeys ${a.name} not run: the time budget ran out`, fix: 'raise the budget or make the driver faster', outOfTime: true }); continue }
    const t0 = Date.now()
    const r = runDriver(a, left)
    left -= Date.now() - t0
    if (r.exit !== 0) findings.push({ sensor: 'journeys', severity: 'block', message: `a journey of ${a.name} failed (exit ${r.exit}${r.timedOut ? ', timed out' : ''}):\n${r.tail.split('\n').slice(-12).map(l => `      ${l}`).join('\n')}`, fix: `fix the app; the journey is how a person uses it. Rerun: ${a.run}`, ...(r.timedOut ? { outOfTime: true as const } : {}) })
  }
  return findings
}

const pick = (args: Args, apps: App[]): App => {
  const name = args.pos[1]
  const a = name ? apps.find(x => x.name === name) : apps.length === 1 ? apps[0] : undefined
  if (!a) fail(apps.length ? `name the app: ${apps.map(x => x.name).join(', ')}` : 'no app under .rig/verify/<name>/app.json; run /rig:app')
  return a as App
}

export function cmdApp(args: Args): void {
  const sub = args.pos[0]
  const apps = listApps()
  if (sub === 'init') {
    fs.mkdirSync(path.join(ROOT, VERIFY), { recursive: true })
    writeAtomic(path.join(ROOT, VERIFY, 'lib.mjs'), read(path.join(PLUGIN_ROOT, 'templates', 'verify', 'lib.mjs')))
    sanctionWrites([`${VERIFY}/lib.mjs`])
    return out(`wrote ${VERIFY}/lib.mjs: the optional Node helper (launch, verify). A driver in any language works; see /rig:app.`)
  }
  if (sub === 'status') {
    const states = appStates()
    if (args.opt.json) return out(JSON.stringify(states))
    return out(states.length ? states.map(s => `${s.name}: ${({ draft: 'draft (never approved, not enforced)', current: 'current', changed: 'changed since approved (review it)', stale: 'stale (the feature map names a missing path)' })[s.state]}`).join('\n') : 'journeys: not configured (run /rig:app)')
  }
  if (sub === 'run') {
    const a = pick(args, apps)
    const r = runDriver(a, a.timeoutMs)
    out(r.tail)
    process.exitCode = r.exit === 0 ? 0 : 1
    return
  }
  if (sub === 'approve') {
    if (process.env.SDLC_HUMAN !== '1') fail('journey approvals are human-only: the person runs `! SDLC_HUMAN=1 node .rig/bin/sdlc.ts app approve <app>`', 3)
    const a = pick(args, apps)
    const by = ownerOrFail(args, 'journey approvals')
    const miss = missingEntries(a)
    if (miss.length) fail(`not approving: the feature map names a path that does not exist: ${miss.join('; ')}`)
    const r = runDriver(a, a.timeoutMs)
    if (r.exit !== 0) fail(`not approving: a journey failed (exit ${r.exit}${r.timedOut ? ', timed out' : ''}):\n${r.tail}`)
    writeAtomic(path.join(ROOT, VERIFY, `${a.name}.approved.json`), JSON.stringify({ by, at: new Date().toISOString(), hash: hashOf(a) } satisfies Approval, null, 2) + '\n')
    sanctionWrites([`${VERIFY}/${a.name}.approved.json`])
    return out(`journeys ${a.name} approved by ${by}: the driver passed, and verify, ship and CI now run it.`)
  }
  if (sub === 'check') {
    const found = journeyFindings(1_800_000, args.pos[1])
    out(formatFindings(found) || (apps.length ? 'journeys: pass' : 'journeys: not configured'))
    process.exitCode = found.some(f => f.severity === 'block') ? 1 : 0
    return
  }
  fail('usage: app (init | run | status | approve | check) [<app>]')
}
