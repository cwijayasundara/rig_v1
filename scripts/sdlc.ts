#!/usr/bin/env node
// rig: the deterministic core of the sdlc plugin. Zero dependencies.
// Runs directly with Node >= 22.18 (built-in TypeScript type stripping) on macOS, Linux and Windows:
//   node --disable-warning=ExperimentalWarning scripts/sdlc.ts <command>
// Everything the model must not judge for itself lives in these scripts: change state, approvals,
// scope drift, sensors and hook decisions. This file is the CLI.
import fs from 'node:fs'
import path from 'node:path'
import {
  ROOT, SDLC, CHANGES, SLUG_RE, SOFT_HOOK_FAILURE, exists, read, now, defaultBase, toPosix, out, fail, git, parseArgs, optString, listChanges, scanSecrets, checkSlug,
  WAIVERS, readJsonl, type Waiver, ensureGitignore, PLUGIN_ROOT, skillRef, sanctionWrites, type Args,
} from './core.ts'
import { formatFindings, SENSOR_NAMES, type Finding } from './model.ts'
import { readBaseline, branchDiff, turnDiff, type Snapshot } from './diffs.ts'
import { cmdHook, readGate } from './hooks.ts'
import { cmdCheck, cmdCheckFile, loadConfig } from './check.ts'
import { runCommand, recordRun } from './runs.ts'
import { cmdVendor, installStandalone } from './vendor.ts'
import { cmdBaseline } from './initbaseline.ts'
import { cmdVerify } from './verify.ts'
import { cmdHooks, cmdCheckPush } from './githooks.ts'
import { cmdPr } from './pr.ts'
import { treeStamp } from './stamp.ts'
import { declareStack } from './stackinit.ts'
import { cmdSync } from './sync.ts'
import { TYPES, toType, changeDir, newChange, setActive, activeSlug, status, nextStep, changeType, approvalRefusal, approvalState, readApproval, freezeRecord, writeApproval } from './lifecycle.ts'

// ---------- commands ----------

// Who approvals, waivers and a scaffolded policy owner are recorded as: the git identity, then the OS user.
function whoami(): string | null {
  return git(['config', 'user.name']) || process.env.USER || process.env.USERNAME || null
}

function cmdInit(args: Args): void {
  // Ship and the PR gate read git, so a directory outside any repo gets one.
  const newRepo = git(['rev-parse', '--is-inside-work-tree']) !== 'true' && git(['init', '-q', '-b', 'main']) !== null
  fs.mkdirSync(CHANGES, { recursive: true })
  ensureGitignore()
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
  if (!SLUG_RE.test(slug)) fail(`usage: new <kebab-slug> [--type ${TYPES.join('|')}] [--title "..."]`)
  const raw = optString(args, 'type') ?? 'feature'
  // The four types, plus the older names toType folds in (greenfield, incident, migration, spike).
  if (![...TYPES, 'greenfield', 'incident', 'migration', 'spike'].includes(raw)) fail(`usage: new <slug> [--type ${TYPES.join('|')}] [--title "..."]`)
  if (exists(changeDir(slug))) fail(`${slug} already exists: /rig:start ${slug} continues it`)
  if (!exists(SDLC)) cmdInit({ pos: [], opt: {} })
  ensureGitignore()
  newChange(slug, toType(raw), optString(args, 'title') ?? slug)
  out(`created .rig/changes/${slug}/intent.md (type ${toType(raw)}); ${slug} is the active change`)
}

function cmdActivate(args: Args): void {
  const slug = checkSlug(args.pos[0] ?? '')
  if (!exists(changeDir(slug))) fail(`no such change: ${slug}`)
  setActive(slug)
  out(`active change: ${slug}`)
}

function cmdStatus(args: Args): void {
  const json = Boolean(args.opt.json)
  if (!exists(SDLC)) return out(json ? JSON.stringify({ initialised: false }) : `rig not initialised here: run ${skillRef('init')}`)
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
  if (process.env.SDLC_HUMAN !== '1') fail(`approvals are human-only: the person runs /rig:approve <slug>. If that command is not listed, restart Claude Code, or the person types: ${humanFallback('approve', '<slug>')}`, 3)
  const given = words(args)[0] // a second word (the old stage name) is ignored
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(changeDir(slug))) fail('usage: approve <slug>')
  const refusal = approvalRefusal(slug)
  if (refusal) fail(refusal)
  if (approvalState(slug) === 'approved' && JSON.stringify(readApproval(slug)?.contracts ?? {}) === JSON.stringify(freezeRecord(slug))) return out(`${slug} is already approved. Next: /rig:build ${slug}`)
  const by = optString(args, 'by') || whoami() || 'unknown'
  const a = writeApproval(slug, by)
  const n = Object.keys(a.contracts).length
  out(`approved ${slug} by ${by}: spec.md and plan.md${n ? `, ${n} contract file(s) frozen` : ''}. Next: /rig:build ${slug}`)
}

function cmdSecrets(args: Args): void {
  const hits = args.pos.flatMap(scanSecrets)
  if (!hits.length) return out('no secrets found')
  process.stderr.write(hits.join('\n') + '\n')
  process.exitCode = 2
}

// ---------- main ----------

// `run` takes its command after `--`, as one quoted argument: sdlc.ts run [--slug s] [--expect-fail] -- "npm test"
function cmdRun(): void {
  const argv = process.argv.slice(3)
  const dash = argv.indexOf('--')
  if (dash < 0 || dash === argv.length - 1) fail('usage: run [--slug s] [--expect-fail] -- "<command>"')
  const head = parseArgs(argv.slice(0, dash))
  const cmd = argv.slice(dash + 1).join(' ')
  const given = optString(head, 'slug')
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(path.join(CHANGES, slug))) fail('no such change: run /rig:start first, or pass an existing --slug')
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

// Every script the checker imports; testkit and specs stay behind. CI runs this copy, so it never needs the plugin.
function cmdWaive(args: Args): void {
  if (process.env.SDLC_HUMAN !== '1') fail(`waivers are human-only: the person runs /rig:waive <sensor> <file|*> <reason>. If that command is not listed, restart Claude Code, or the person types: ${humanFallback('waive', "<sensor> <file|*> '<reason>'")}`, 3)
  const [sensor, file, ...reason] = words(args)
  const given = optString(args, 'slug')
  const slug = given ? checkSlug(given) : activeSlug()
  if (!sensor || !file || !reason.length || !slug) fail('usage: waive <sensor> <file|*> <reason...>  (needs an active change)')
  if (!SENSOR_NAMES.includes(sensor)) fail(`unknown sensor "${sensor}"; known: ${SENSOR_NAMES.join(', ')}`)
  const by = whoami() || 'unknown'
  const row: Waiver = { slug, sensor, file, reason: reason.join(' '), by, at: now() }
  fs.appendFileSync(WAIVERS, JSON.stringify(row) + '\n')
  out(`waived ${sensor} for ${file} in ${slug}: ${row.reason} (by ${by})`)
}

function sensorStatus(): { blocks: number; warns: number; bySensor: Record<string, number>; unresolved: number; knownRed: number; waivers: number } | null {
  if (!exists(SDLC)) return null
  const last = readGate().last
  const slug = activeSlug()
  let unresolved = 0
  try {
    unresolved = (JSON.parse(read(path.join(SDLC, 'unresolved.json'))) as { findings: unknown[] }).findings.length
  } catch {
    unresolved = 0
  }
  return {
    blocks: last?.blocks ?? 0, warns: last?.warns ?? 0, bySensor: last?.bySensor ?? {}, unresolved,
    knownRed: loadConfig().registry.knownRed.length,
    waivers: readJsonl<Waiver>(WAIVERS).filter(w => w.slug === slug).length,
  }
}

function cmdSensors(): void {
  const s = sensorStatus()
  if (!s) return out('sdlc not initialised here')
  const slug = activeSlug()
  let unresolved: Finding[] = []
  try {
    unresolved = (JSON.parse(read(path.join(SDLC, 'unresolved.json'))) as { findings: Finding[] }).findings
  } catch {
    unresolved = []
  }
  const waivers = readJsonl<Waiver>(WAIVERS).filter(w => w.slug === slug)
  out([
    `last gate: ${s.blocks} block(s), ${s.warns} warning(s)${Object.keys(s.bySensor).length ? ' · ' + Object.entries(s.bySensor).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`,
    unresolved.length ? `unresolved:\n${formatFindings(unresolved)}` : 'unresolved: none',
    `known red: ${loadConfig().registry.knownRed.join(', ') || 'none'}`,
    `waivers (${slug ?? 'no change'}): ${waivers.map(w => `${w.sensor} ${w.file} ${w.reason}`).join('; ') || 'none'}`,
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
