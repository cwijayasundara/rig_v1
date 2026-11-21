// The differential runner (design 2026-11-21): the approved journey driver runs on the base revision and on the head; the base's trace is the
// oracle. A difference blocks unless a person approved it on the base branch (.rig/verify/<app>/differences.json, read from the base ref).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, PLUGIN_ROOT, read, readJson, writeAtomic, optString, fail, out, defaultBase, type Args } from './core.ts'
import { showAt } from './diffs.ts'
import { withBaseTree } from './basetree.ts'
import { runDriver, listApps, type App } from './app.ts'

export type Step = { name: string; ok: boolean; observed?: unknown }
export type Rule = { step: string; replace: string; with: string }
export type Diff = { id: string; step: string; before: unknown; after: unknown }
export type Approved = { id: string; reason?: string; by?: string }

const DEFAULTS: Rule[] = [
  { step: '*', replace: '\\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z?', with: '<time>' },
  { step: '*', replace: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', with: '<uuid>' },
  { step: '*', replace: '(?<=:)\\d{4,5}\\b', with: '<port>' },
]
const glob = (g: string, name: string): boolean => new RegExp(`^${g.split('*').map(x => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(name)
const slug = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Irrelevant differences (times, ids, ports, and what the app names) are replaced in the JSON text of each observed value.
export function normalise(steps: Step[], rules: Rule[] = []): Step[] {
  return steps.map(s => {
    if (s.observed === undefined) return s
    let t = JSON.stringify(s.observed)
    for (const r of [...DEFAULTS, ...rules]) if (glob(r.step, s.name)) t = t.replace(new RegExp(r.replace, 'g'), r.with)
    return { ...s, observed: JSON.parse(t) }
  })
}

// Steps are matched by name. A step on one side only is a difference ('absent'). A step whose two head runs disagree is unstable, not a difference.
export function compare(base: Step[], head: Step[], head2: Step[]): { diffs: Diff[]; unstable: string[]; executed: number } {
  const by = (l: Step[]): Map<string, Step> => new Map(l.map(s => [s.name, s]))
  const b = by(base), h = by(head), h2 = by(head2), names = [...new Set([...b.keys(), ...h.keys()])]
  const val = (s: Step | undefined): unknown => (s === undefined ? 'absent' : { ok: s.ok, observed: s.observed })
  const unstable: string[] = [], diffs: Diff[] = [], used = new Map<string, number>()
  for (const name of names) {
    if (JSON.stringify(val(h.get(name))) !== JSON.stringify(val(h2.get(name)))) { unstable.push(name); continue }
    if (JSON.stringify(val(b.get(name))) === JSON.stringify(val(h.get(name)))) continue
    const base_ = `D-${slug(name)}`, n = (used.get(base_) ?? 0) + 1
    used.set(base_, n)
    diffs.push({ id: n === 1 ? base_ : `${base_}-${n}`, step: name, before: val(b.get(name)), after: val(h.get(name)) })
  }
  return { diffs, unstable, executed: names.length }
}

export function report(diffs: Diff[], approved: Approved[], executed: number, unstable: string[] = []): { lines: string[]; unapproved: Diff[]; stale: string[] } {
  const ok = new Set(approved.map(a => a.id)), unapproved = diffs.filter(d => !ok.has(d.id)), stale = approved.filter(a => !diffs.some(d => d.id === a.id)).map(a => a.id)
  const j = (v: unknown): string => JSON.stringify(v).slice(0, 120)
  return { unapproved, stale, lines: [
    `differential: ${executed} step(s) run, ${diffs.length} difference(s), ${diffs.length - unapproved.length} approved, ${unapproved.length} unapproved`,
    ...diffs.map(d => `${d.id}: ${d.step}: ${j(d.before)} -> ${j(d.after)} (${ok.has(d.id) ? 'approved' : 'UNAPPROVED'})`),
    ...stale.map(id => `${id}: approved but no longer differs (stale)`),
    ...unstable.map(n => `unstable: ${n} (the head's two runs disagree; not compared)`)] }
}

// The people-approved list, from the base ref only: a PR that edits it does not approve itself.
export function approvedAt(base: string, app: string): Approved[] {
  try { const v = JSON.parse(showAt(base, `.rig/verify/${app}/differences.json`) ?? '[]'); return Array.isArray(v) ? v.filter((a): a is Approved => typeof a?.id === 'string') : [] } catch { return [] }
}

const traceOf = (dir: string): Step[] => readJson<{ steps?: Step[] } | null>(path.join(dir, 'evidence.json'), null)?.steps ?? []
const rulesOf = (app: string, root: string): Rule[] => { const n = readJson<{ normalize?: unknown } | null>(path.join(root, '.rig/verify', app, 'app.json'), null)?.normalize; return Array.isArray(n) ? n.filter((r): r is Rule => typeof r?.step === 'string' && typeof r?.replace === 'string' && typeof r?.with === 'string') : [] }

export type DiffRun = { ok: true; diffs: Diff[]; unstable: string[]; executed: number } | { ok: false; error: string }
export function appDiff(app: App, base: string): DiffRun {
  const state = (n: string): string => fs.mkdtempSync(path.join(ROOT, '.rig', `diff-${n}-`))
  const dirs: string[] = []
  try {
    const head = state('h1'), head2 = state('h2'), basel = state('b'); dirs.push(head, head2, basel)
    const h1 = runDriver(app, app.timeoutMs, { stateDir: head }); runDriver(app, app.timeoutMs, { stateDir: head2 })
    if (h1.exit !== 0) return { ok: false, error: `the driver fails on the head (exit ${h1.exit})` }
    const b = withBaseTree(base, dir => {
      // The base records what the head's helper records, so an older helper there cannot hide an observed value.
      writeAtomic(path.join(dir, '.rig/verify/lib.mjs'), read(path.join(PLUGIN_ROOT, 'templates', 'verify', 'lib.mjs')))
      return runDriver(app, app.timeoutMs, { cwd: dir, stateDir: basel })
    })
    if (!b.ok) return { ok: false, error: b.error }
    if (b.value.exit !== 0) return { ok: false, error: `the driver fails on the base ${base} (exit ${b.value.exit}): there is no oracle` }
    const rules = rulesOf(app.name, ROOT)
    return { ok: true, ...compare(normalise(traceOf(basel), rules), normalise(traceOf(head), rules), normalise(traceOf(head2), rules)) }
  } finally { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) }
}

// The intent's `replaces: <app>` front-matter line: the change rewrites behaviour that app's journeys cover.
export const replacesOf = (intent: string): string | null => /^replaces:\s*([a-z0-9][a-z0-9-]*)\s*$/m.exec(/^---\n([\s\S]*?)\n---/.exec(intent)?.[1] ?? '')?.[1] ?? null

// `app diff <app> [--base <ref>]`: exit 1 on any unapproved difference, or when the diff could not run.
export function cmdAppDiff(args: Args): void {
  const app = listApps().find(a => a.name === args.pos[1]) ?? fail(`usage: app diff <app> [--base <ref>] (known: ${listApps().map(a => a.name).join(', ') || 'none'})`)
  const base = optString(args, 'base') ?? defaultBase() ?? fail('app diff needs --base <ref>')
  const r = appDiff(app, base)
  if (!r.ok) { out(`differential: not run: ${r.error}`); process.exitCode = 1; return }
  const rep = report(r.diffs, approvedAt(base, app.name), r.executed, r.unstable), text = rep.lines.join('\n')
  out(text)
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Differential evidence\n\n' + rep.lines.map(l => '    ' + l).join('\n') + '\n')
  process.exitCode = rep.unapproved.length ? 1 : 0
}
