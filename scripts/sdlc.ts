#!/usr/bin/env node
// rig: the deterministic core of the sdlc plugin. Zero dependencies.
// Runs directly with Node >= 22.18 (built-in TypeScript type stripping) on macOS, Linux and Windows:
//   node --disable-warning=ExperimentalWarning scripts/sdlc.ts <command>
// Everything the model must not judge for itself lives in these scripts: change state, approvals,
// scope drift, sensors and hook decisions. This file is the CLI.
import fs from 'node:fs'
import path from 'node:path'
import { waiverLive, whoami, ownerOrFail,
  ROOT, SDLC, CHANGES, SLUG_RE, SOFT_HOOK_FAILURE, exists, read, now, defaultBase, toPosix, out, fail, git, parseArgs, optString, listChanges, scanSecrets, checkSlug,
  WAIVERS, readJsonl, type Waiver, ensureGitignore, PLUGIN_ROOT, skillRef, sanctionWrites, readGate, type Args,
} from './core.ts'
import { formatFindings, SENSOR_NAMES, type Finding } from './model.ts'
import { readBaseline, branchDiff, turnDiff, type Snapshot } from './diffs.ts'
import { cmdHook } from './hooks.ts'
import { cmdCheck, cmdCheckFile, loadConfig } from './check.ts'
import { inertSensors, type Inert } from './registry.ts'
import { runCommand, recordRun } from './runs.ts'
import { cmdVendor, installStandalone } from './vendor.ts'
import { cmdBaseline } from './initbaseline.ts'
import { cmdVerify } from './verify.ts'
import { cmdHooks, cmdCheckPush } from './githooks.ts'
import { cmdPr } from './pr.ts'
import { treeStamp } from './stamp.ts'
import { declareStack } from './stackinit.ts'
import { cmdSync } from './sync.ts'
import { cmdWiki } from './wiki.ts'
import { cmdLearn } from './learn.ts'
import { cmdReport } from './report.ts'
import { cmdArch, layerState, layerStateText } from './arch.ts'
import { cmdQueue, conflictsFor } from './queue.ts'
import { intentScope } from './scope.ts'
import { prdFormatProblems } from './prdformat.ts'
import { intentRelOf, prdRel, sprintRel, prdPath, reviewPath } from './product.ts'
import { cmdSlice } from './slice.ts'
import { cmdMaintain } from './maintain.ts'
import { cmdReadiness } from './readiness.ts'
import { cmdAutonomy, initAutonomy } from './autonomy.ts'
import { cmdApp, draftApps, appStates } from './app.ts'
import { CHART_RE, intentOf, intentReady, chartFindings, chartState, writeChartApproval, chartReport, readyIntents, planRows, writePlan, sprintPlan, chartFiles, sprintsKnown, sprintIntents, chartReview, chartOpenFindings, waiveChartFinding, changeRequirements } from './chart.ts'
import { journey, journeyText } from './journey.ts'
import { TYPES, toType, changeDir, newChange, setActive, activeSlug, isShipped, status, nextStep, changeType, approvalRefusal, approvalState, readApproval, freezeRecord, writeApproval } from './lifecycle.ts'

// ---------- commands ----------

// NaN (a missing or unreadable date) is treated as infinitely old, so it can never hide from the stale check.
const ageDays = (at: string): number => { const n = Math.floor((Date.now() - Date.parse(at)) / 86_400_000); return Number.isFinite(n) ? Math.max(0, n) : Infinity }
const STALE_WAIVER_DAYS = 30
const MAX_WAIVER_DAYS = 180
const expiryText = (w: Waiver): string => (!w.expires ? 'no expiry' : !waiverLive(w) ? 'expired' : `expires in ${Math.max(1, Math.ceil((Date.parse(w.expires) - Date.now()) / 86_400_000))}d`)

function cmdInit(args: Args): void {
  // Ship and the PR gate read git, so a directory outside any repo gets one.
  const newRepo = git(['rev-parse', '--is-inside-work-tree']) !== 'true' && git(['init', '-q', '-b', 'main']) !== null
  fs.mkdirSync(CHANGES, { recursive: true })
  ensureGitignore()
  initAutonomy()
  const guides = path.join(SDLC, 'guides')
  if (!exists(guides) && exists(path.join(PLUGIN_ROOT, 'guides'))) {
    fs.cpSync(path.join(PLUGIN_ROOT, 'guides'), guides, { recursive: true })
    sanctionWrites(fs.readdirSync(guides).map(f => `.rig/guides/${f}`))
  }
  out(`initialised ${toPosix(path.relative(ROOT, SDLC)) || SDLC}${newRepo ? ' (ran git init: no repository was here)' : ''}`)
  if (args.opt.stack) out(declareStack(args.opt.stack))
  if (args.opt.full) out(installStandalone(Boolean(args.opt.workflows)))
  const me = whoami()
  out(me ? `approvals and waivers are recorded as "${me}" (git user.name); change it with: git config user.name "<name>"` : 'no user name found: set one with `git config user.name "<name>"` so approvals say who approved')
}

function cmdNew(args: Args): void {
  const slug = args.pos[0] ?? ''
  if (!SLUG_RE.test(slug)) fail(`usage: new <kebab-slug> [--type ${TYPES.join('|')}] [--title "..."] [--source .rig/product/sprints/sprint-<N>/intents/<slug>.md]`)
  const raw = optString(args, 'type') ?? 'feature'
  // The four types, plus the older names toType folds in (greenfield, incident, migration, spike).
  if (![...TYPES, 'greenfield', 'incident', 'migration', 'spike'].includes(raw)) fail(`usage: new <slug> [--type ${TYPES.join('|')}] [--title "..."]`)
  if (exists(changeDir(slug))) fail(`${slug} already exists: ${skillRef('start')} ${slug} continues it`)
  const source = optString(args, 'source')
  if (source) {
    const rel = toPosix(path.relative(ROOT, path.resolve(ROOT, source)))
    const expected = intentRelOf(slug)
    if (rel !== expected) fail(`the slug must equal the intent's: new ${slug} --source ${rel} (expected ${expected ?? `.rig/product/sprints/sprint-<N>/intents/${slug}.md`})`)
    const ready = intentReady(slug)
    if (!ready.ready) fail(`${slug} cannot start:\n${ready.why.map(w => `  - ${w}`).join('\n')}${blockedHint(slug)}`)
  }
  if (!exists(SDLC)) cmdInit({ pos: [], opt: {} })
  ensureGitignore()
  const intent = source ? intentOf(slug) : null
  const title = optString(args, 'title') ?? (source ? /^#\s+(.+)$/m.exec(read(path.resolve(ROOT, source)))?.[1] : undefined) ?? slug
  newChange(slug, toType(raw), title, source && toPosix(path.relative(ROOT, path.resolve(ROOT, source))))
  if (intent) fs.writeFileSync(path.join(changeDir(slug), 'spec.md'), `# Spec: ${title}\n\n## Behaviours\n${intent.behaviours.map(b => { const ids = [...new Set([...b.reqs, ...b.rules])]; return `- ${b.id}${ids.length ? ` (${ids.join(', ')})` : ''}: ${b.text}` }).join('\n')}\n\n## Out of scope\n\n## Open questions\nnone\n`)
  const reqs = intent ? changeRequirements(slug) : null
  if (reqs) fs.writeFileSync(path.join(changeDir(slug), 'requirements.md'), reqs)
  out(`created .rig/changes/${slug}/intent.md (type ${toType(raw)}); ${slug} is the active change${intent ? `; spec.md starts with the ${intent.behaviours.length} behaviour(s) of the intent` : ''}${reqs ? `; requirements.md holds the PRD rows it cites` : ''}`)
}

// After a refusal because of dependencies: where the whole order is, and what can start instead.
function blockedHint(slug: string): string {
  const i = intentOf(slug)
  if (!i || i.sprint === null || !i.depends.length) return ''
  const next = chartState(i.sprint).state === 'approved' ? planRows(i.sprint).filter(r => r.status === 'ready') : []
  return `\nThe build order is in ${writePlan(i.sprint)}.${next.length ? ` Ready now: ${next.map(r => r.slug).join(', ')}.` : ''}`
}

function cmdActivate(args: Args): void {
  const slug = checkSlug(args.pos[0] ?? '')
  if (!exists(changeDir(slug))) fail(`no such change: ${slug}`)
  setActive(slug)
  out(`active change: ${slug}`)
}

const notInitialised = (json: boolean): void => out(json ? JSON.stringify({ initialised: false }) : `rig not initialised here: run ${skillRef('init')}`)

function cmdStatus(args: Args): void {
  const json = Boolean(args.opt.json)
  if (args.opt.journey) {
    if (!exists(SDLC)) return notInitialised(json)
    const j = journey({ gates: loadConfig().registry.gates, tree: treeStamp() })
    return out(json ? JSON.stringify({ ...j, sensors: sensorStatus() }) : journeyText(j))
  }
  if (!exists(SDLC)) return notInitialised(json)
  const gates = loadConfig().registry.gates
  const tree = treeStamp()
  const active = activeSlug()
  const changes = listChanges().map(slug => { const s = status(slug, gates, tree); return { slug, type: changeType(slug), status: s, next: nextStep(slug, s) } })
    .filter(c => c.status !== 'shipped' || c.slug === active)
  if (json) return out(JSON.stringify({ initialised: true, active, changes, sensors: sensorStatus() }))
  if (!changes.length) return out(`no changes yet: start one with ${skillRef('start')} "<request>"`)
  out(changes.map(c => `${c.slug === active ? '▶' : ' '} ${c.slug.padEnd(28)} ${c.type.padEnd(8)} ${c.status.padEnd(8)} next: ${c.next}`).join('\n'))
}

// A standalone repo's /rig:approve and /rig:waive skills pass '$ARGUMENTS' as one quoted string, so the shell never globs it.
const words = (args: Args): string[] => (args.pos.length === 1 ? (args.pos[0] ?? '').trim().split(/\s+/) : args.pos)

// What the person can type when their /rig-<cmd> slash command is not listed (a session started before the harness was vendored).
const humanFallback = (cmd: string, usage: string): string => `! SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning ${path.relative(process.cwd(), process.argv[1] ?? 'sdlc.ts')} ${cmd} ${usage}`

function cmdApprove(args: Args): void {
  if (process.env.SDLC_HUMAN !== '1') fail(`approvals are human-only: the person runs ${skillRef('approve')} <slug>. If that command is not listed, restart Claude Code, or the person types: ${humanFallback('approve', '<slug>')}`, 3)
  const given = words(args)[0] // a second word (the old stage name) is ignored
  if (!given && args.opt.ask) return out(approveTarget())
  const chart = CHART_RE.exec(given ?? '')?.[1]
  if (chart) return approveChart(Number(chart), args)
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(changeDir(slug))) fail('usage: approve <slug>')
  const refusal = approvalRefusal(slug)
  if (refusal) fail(refusal)
  if (approvalState(slug) === 'approved' && JSON.stringify(readApproval(slug)?.contracts ?? {}) === JSON.stringify(freezeRecord())) return out(`${slug} is already approved. Next: ${skillRef('build')} ${slug}`)
  const by = ownerOrFail(args, 'approvals')
  const a = writeApproval(slug, by)
  const n = Object.keys(a.contracts).length
  out(`approved ${slug} by ${by}: spec.md and plan.md${n ? `, ${n} contract file(s) frozen` : ''}. Next: ${skillRef('build')} ${slug}`)
  // Not a refusal: the person may know better. But two writers on one file is a merge conflict later, so say so now.
  const clash = conflictsFor(slug)
  if (clash.length) out(`warning: another in-flight plan names the same file(s): ${clash.map(o => `${o.file} (${o.changes.join(' and ')})`).join('; ')}. Land one first, or split the work.`)
}

// What a bare /rig:approve would approve, for the skill to confirm with the person: the active change, else the first sprint chart waiting.
function approveTarget(): string {
  const active = activeSlug()
  if (active && exists(changeDir(active)) && !isShipped(active)) return `ASK change ${active}`
  const chart = sprintsKnown().find(n => exists(prdPath(n)) && sprintIntents(n).length > 0 && chartState(n).state !== 'approved')
  return chart === undefined ? 'ASK none: no change is in flight and no chart is waiting' : `ASK chart-${chart}`
}

const needPrd = (n: number): void => { if (!exists(prdPath(n))) fail(`no PRD for sprint ${n}: write ${prdRel(n)} first`) }

function approveChart(n: number, args: Args): void {
  needPrd(n)
  const block = chartFindings(n, true).filter(f => f.severity === 'block')
  if (block.length) fail(`chart-${n} has ${block.length} blocking finding(s); fix them, then approve:\n${block.map(f => `  [${f.rule}] ${f.message}`).join('\n')}`)
  if (chartState(n).state === 'approved') return out(`chart-${n} is already approved`)
  const open = chartOpenFindings(n)
  if (!open) fail(`chart-${n} has no chart-review.md: run ${skillRef('chart')} ${n} through its review step, then approve`)
  if (!open.length && !/^verdict:\s*pass\s*$/m.test(read(reviewPath(n)).split('\n')[0] ?? '') && !chartReview(n)?.length) fail(`chart-${n}'s chart-review.md says changes-needed but lists no finding rig can read: write each as a \`- \` line under \`## Findings\``)
  if (open.length) fail(`chart-${n} has ${open.length} review finding(s) not confirmed fixed:\n${open.map(f => `  ${f.n}. ${f.text}${f.status === 'claimed' ? ' (marked fixed, never confirmed)' : ''}`).join('\n')}\nFix them and re-run the chart's confirm pass, or waive one with ${skillRef('waive')} chart-${n} <finding number> <reason>`)
  const by = ownerOrFail(args, 'approvals')
  writeChartApproval(n, by)
  writePlan(n)
  out(`approved chart-${n} by ${by}: ${chartFiles(n).length} file(s). Next: engineers run \`ready\` to see which intents can start, then ${skillRef('start')} ${sprintRel(n)}/intents/<slug>.md`)
}

function cmdChart(args: Args): void {
  const [sub, num] = args.pos
  if ((sub !== 'check' && sub !== 'report' && sub !== 'plan') || !/^\d{1,4}$/.test(num ?? '')) fail('usage: chart (check [--cases] [--json] | report | plan [--print]) <sprint number>')
  const n = Number(num)
  needPrd(n)
  if (sub === 'plan') return out(args.opt.print ? sprintPlan(n) : `wrote ${writePlan(n)}`)
  if (sub === 'report') return out(chartReport(n))
  const found = chartFindings(n, Boolean(args.opt.cases))
  if (args.opt.json) return out(JSON.stringify(found))
  const block = found.filter(f => f.severity === 'block')
  out([...found.map(f => `[${f.rule}] ${f.severity === 'report' ? '(report) ' : ''}${f.message}`), `chart-${n}: ${block.length ? `${block.length} blocking finding(s)` : 'no blocking findings'}`].join('\n'))
}

// The PRD format for coding agents (spec 2026-10-26): `prd check <N>` says whether the sprint PRD is in rig's template.
function cmdPrd(args: Args): void {
  const [sub, num] = args.pos
  if (sub !== 'check' || !/^\d{1,4}$/.test(num ?? '')) fail('usage: prd check [--json] <sprint number>')
  const n = Number(num)
  needPrd(n)
  const found = prdFormatProblems(read(prdPath(n)))
  if (args.opt.json) return out(JSON.stringify(found))
  out([...found.map(f => `[${f.rule}] ${f.where}: ${f.message}`), `prd-${n}: ${found.length ? `${found.length} format finding(s); convert it into templates/prd-format.md` : 'in format'}`].join('\n'))
}

const readyRow = (i: ReturnType<typeof readyIntents>[number]): string => `${i.slug.padEnd(28)} sprint ${i.sprint}  ${i.estimateDays ?? '?'} day(s)`

function cmdReady(args: Args): void {
  const ready = readyIntents()
  if (args.opt.json) return out(JSON.stringify(ready))
  out(ready.length ? ready.map(readyRow).join('\n') : 'no intents are ready')
}

// The opening of /rig:start: the branch warning and the intents ready to build, so the skill does not need the model to ask for them.
function cmdStartBrief(): void {
  const branch = git(['branch', '--show-current']) ?? ''
  const base = git(['rev-parse', '--verify', '-q', 'main']) === null && git(['rev-parse', '--verify', '-q', 'master']) !== null ? 'master' : 'main'
  const lines: string[] = []
  if (branch && branch !== base) lines.push(`WARNING: you are on branch ${branch}, not ${base}. The previous change may not be merged yet; a new change starts from this branch.`)
  const ready = readyIntents()
  const plans = sprintsKnown().filter(n => exists(prdPath(n)) && planRows(n).some(r => r.status !== 'done')).map(writePlan)
  if (plans.length) lines.push(`build order (waves and dependency graph): ${plans.join(', ')}`)
  lines.push(ready.length ? `ready intents:\n${ready.map(i => `  ${readyRow(i)}`).join('\n')}` : 'no intents are ready')
  out(lines.join('\n'))
}

function cmdSecrets(args: Args): void {
  const hits = args.pos.flatMap(scanSecrets)
  if (!hits.length) return out('no secrets found')
  process.stderr.write(hits.join('\n') + '\n')
  process.exitCode = 2
}

// ---------- main ----------

// `run` takes its command after `--`, as one quoted argument: sdlc.ts run [--slug s] [--expect-fail] -- "<test command>"
function cmdRun(): void {
  const argv = process.argv.slice(3)
  const dash = argv.indexOf('--')
  if (dash < 0 || dash === argv.length - 1) fail('usage: run [--slug s] [--expect-fail] -- "<command>"')
  const head = parseArgs(argv.slice(0, dash))
  const cmd = argv.slice(dash + 1).join(' ')
  const given = optString(head, 'slug')
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(path.join(CHANGES, slug))) fail(`no such change: run ${skillRef('start')} first, or pass an existing --slug`)
  const expectFail = Boolean(head.opt['expect-fail'])
  const before = treeStamp()
  const row = runCommand(cmd)
  const tree = treeStamp() === before ? before : null
  const stamped = tree ? { ...row, tree } : row
  recordRun(slug, expectFail ? { ...stamped, expectFail: true } : stamped)
  if (row.tail) out(row.tail)
  out(`sdlc run: exit ${row.exit}${row.timedOut ? ' (timed out)' : ''} in ${row.ms} ms, recorded in ${slug}/evidence/runs.jsonl`)
  process.exitCode = expectFail ? (row.exit !== 0 ? 0 : 1) : row.exit
}

function cmdDiff(args: Args): void {
  const trunk = args.opt.trunk ? defaultBase() ?? 'HEAD' : null
  const base = optString(args, 'base')
  if (!base && !trunk && !args.opt.turn) fail('usage: diff (--turn | --trunk | --base <ref>) [--json]')
  const snap = base || trunk ? null : readBaseline()
  if (!base && !trunk && !snap) return out('no turn baseline yet (run a prompt first)')
  const diffs = trunk ? branchDiff(trunk) : base ? branchDiff(git(['merge-base', 'HEAD', base]) ?? base) : turnDiff(snap as Snapshot)
  if (args.opt.json) return out(JSON.stringify(diffs))
  out(diffs.map(d => `${d.status} ${d.file} (+${d.added.length} -${d.removed.length})`).join('\n') || 'no changes')
}

function cmdWaive(args: Args): void {
  if (process.env.SDLC_HUMAN !== '1') fail(`waivers are human-only: the person runs ${skillRef('waive')} <sensor> <file|*> <reason>. If that command is not listed, restart Claude Code, or the person types: ${humanFallback('waive', "<sensor> <file|*> '<reason>'")}`, 3)
  const chart = CHART_RE.exec(words(args)[0] ?? '')?.[1]
  if (chart) return waiveChart(Number(chart), args)
  const [sensor, file, ...reason] = words(args)
  const given = optString(args, 'slug')
  const slug = given ? checkSlug(given) : activeSlug()
  if (!sensor || !file || !reason.length || !slug) fail('usage: waive <sensor> <file|*> <reason...>  (needs an active change)')
  const commandIds = loadConfig().registry.sensors.filter(s => s.cmd).map(s => s.id)
  if (!SENSOR_NAMES.includes(sensor) && !commandIds.includes(sensor)) fail(`unknown sensor "${sensor}"; known: ${[...SENSOR_NAMES, ...commandIds].join(', ')}`)
  const by = ownerOrFail(args, 'waivers')
  const days = optString(args, 'days') === undefined ? 30 : Number(optString(args, 'days'))
  if (!Number.isInteger(days) || days < 1 || days > MAX_WAIVER_DAYS) fail(`--days must be a whole number from 1 to ${MAX_WAIVER_DAYS}: a waiver ends, and is renewed by waiving again`)
  const row: Waiver = { slug, sensor, file, reason: reason.join(' '), by, at: now(), expires: new Date(Date.now() + days * 86_400_000).toISOString() }
  fs.appendFileSync(WAIVERS, JSON.stringify(row) + '\n')
  out(`waived ${sensor} for ${file} in ${slug}: ${row.reason} (by ${by}, expires in ${days} day${days === 1 ? '' : 's'})`)
}

// A person accepts a chart review finding as it stands: no active change and no expiry, since it is an approval decision.
function waiveChart(n: number, args: Args): void {
  const [, k, ...reason] = words(args)
  if (!/^\d{1,3}$/.test(k ?? '') || !reason.length) fail(`usage: waive chart-${n} <finding number> <reason...>`)
  const f = chartReview(n)?.find(x => x.n === Number(k))
  if (!f) fail(`chart-${n} has no review finding ${k}${chartReview(n) ? '' : ' (no chart-review.md)'}`)
  const by = ownerOrFail(args, 'waivers')
  waiveChartFinding(n, f, by, reason.join(' '))
  out(`waived chart-${n} finding ${f.n}: ${reason.join(' ')} (by ${by})`)
}

const unresolvedFindings = (): Finding[] => {
  try { return (JSON.parse(read(path.join(SDLC, 'unresolved.json'))) as { findings: Finding[] }).findings } catch { return [] }
}

function sensorStatus(): { blocks: number; warns: number; bySensor: Record<string, number>; unresolved: number; knownRed: number; waivers: number; inert: Inert[]; layers: string } | null {
  if (!exists(SDLC)) return null
  const last = readGate().last
  const slug = activeSlug()
  const { registry, rules } = loadConfig()
  return {
    blocks: last?.blocks ?? 0, warns: last?.warns ?? 0, bySensor: last?.bySensor ?? {}, unresolved: unresolvedFindings().length,
    knownRed: registry.knownRed.length, inert: inertSensors(registry, rules.length, draftApps()), layers: layerStateText(layerState()),
    waivers: readJsonl<Waiver>(WAIVERS).filter(w => w.slug === slug).length,
  }
}

function cmdSensors(): void {
  const s = sensorStatus()
  if (!s) return out('sdlc not initialised here')
  const { registry } = loadConfig()
  const slug = activeSlug()
  const unresolved = unresolvedFindings()
  const waivers = readJsonl<Waiver>(WAIVERS).filter(w => w.slug === slug)
  out([
    `last gate: ${s.blocks} block(s), ${s.warns} warning(s)${Object.keys(s.bySensor).length ? ' · ' + Object.entries(s.bySensor).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`,
    unresolved.length ? `unresolved:\n${formatFindings(unresolved)}` : 'unresolved: none',
    ...(s.inert.length ? [`not configured (passing checks nothing): ${s.inert.map(i => `${i.id} (${i.reason})`).join('; ')}`] : []),
    `layers: ${s.layers}`,
    `journeys: ${appStates().map(a => `${a.name} ${a.state}`).join(', ') || 'none'}`,
    `scope: ${slug && intentScope(slug) ? `${slug} is checked against ${intentScope(slug)?.scope.join(', ')}` : 'not checked (the active change has no scope: in its product intent)'}`,
    `ratchets: ${Object.entries(registry.ratchets ?? {}).map(([k, v]) => `${k} ${v}${registry.sensors.some(x => x.id === k && x.ratchet) ? '' : ' (no sensor ratchets it now)'}`).join(', ') || 'none'}`,
    `known red: ${registry.knownRed.join(', ') || 'none'}`,
    `waivers (${slug ?? 'no change'}): ${waivers.map(w => `${w.sensor} ${w.file} ${w.reason} (by ${!w.by || w.by === 'unknown' ? 'no owner' : w.by}, ${Number.isFinite(ageDays(w.at)) ? `${ageDays(w.at)}d` : 'age unknown'}, ${expiryText(w)}${ageDays(w.at) > STALE_WAIVER_DAYS ? ', stale: review it' : ''})`).join('; ') || 'none'}`,
  ].join('\n'))
}

// A starting policy skill for design and review to apply; only the person-run init writes it, and never over an existing one.
function scaffoldPolicy(): string {
  const rel = '.claude/skills/policy-security/SKILL.md'
  const src = path.join(PLUGIN_ROOT, 'templates', 'policy-security.md')
  if (exists(path.join(ROOT, rel)) || !exists(src)) return ''
  fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true })
  const me = whoami()
  const text = read(src)
  fs.writeFileSync(path.join(ROOT, rel), me ? text.replace(/^owner: <[^>\n]*>$/m, `owner: ${me}`) : text)
  sanctionWrites([rel])
  return `wrote ${rel}: ${me ? `owner is ${me}; change it if someone else owns the policy, and set its source` : 'set its owner and source'}`
}

const COMMANDS: Record<string, (args: Args) => void> = {
  stamp: () => out(treeStamp() ?? 'none'),
  init: args => { cmdInit(args); if (args.opt.full) { const note = scaffoldPolicy(); if (note) out(note) } },
  new: cmdNew,
  activate: cmdActivate,
  status: cmdStatus,
  approve: cmdApprove,
  chart: cmdChart,
  prd: cmdPrd,
  ready: cmdReady,
  'start-brief': () => cmdStartBrief(),
  pr: cmdPr,
  run: () => cmdRun(),
  verify: cmdVerify,
  secrets: cmdSecrets,
  hook: cmdHook,
  diff: cmdDiff,
  baseline: () => cmdBaseline(),
  check: args => (args.opt.at === 'push' ? cmdCheckPush(args) : cmdCheck(args)),
  'check-file': cmdCheckFile,
  sync: cmdSync,
  vendor: cmdVendor,
  hooks: cmdHooks,
  waive: cmdWaive,
  sensors: () => cmdSensors(),
  wiki: args => cmdWiki(args),
  learn: args => cmdLearn(args),
  report: cmdReport,
  arch: cmdArch,
  queue: cmdQueue,
  app: cmdApp,
  slice: cmdSlice,
  maintain: cmdMaintain,
  readiness: cmdReadiness,
  autonomy: cmdAutonomy,
}

const [command = '', ...rest] = process.argv.slice(2)
const run = COMMANDS[command]
if (!run) fail(`usage: sdlc.ts <${Object.keys(COMMANDS).join('|')}> ...`)
try {
  run(parseArgs(rest))
} catch (err) {
  // Hooks must never wedge a session: a crashing hook reports and lets the action through.
  const message = err instanceof Error ? err.message : String(err)
  if (command === 'hook') process.stderr.write(`${SOFT_HOOK_FAILURE}: ${message}\n`)
  else if (command === 'check' && /^(?:commit|push)$/.test(String(parseArgs(rest).opt.at))) {
    // Inside a git hook (spec §2): a broken checker must not wedge the repo; CI judges the result.
    process.stderr.write(`rig: the checker crashed (${message}); allowing — CI still checks\n`)
    process.exitCode = 0
  } else if (command === 'check') fail(`sdlc check crashed (fails closed): ${message}`)
  else fail(err instanceof Error ? err.stack ?? message : message)
}
