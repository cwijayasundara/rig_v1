// Files and processes around the intent map (design 2026-11-07): the pure rules are in intentmap.ts.
// Results the script records live in intent-results.json, outside the approved (hashed) map.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, exists, git, out, fail, checkSlug, sanctionWrites } from './core.ts'
import { runCommand, recordRun } from './runs.ts'
import { isTest, isSource, type Finding, type FileDiff } from './model.ts'
import { formalTargets } from './intenttargets.ts'
import type { Registry } from './registry.ts'
import { PROPERTY_LABEL, shipCheck, parse, receipt, applyResults, behavioursFrom, type Results, type Adjudications, type Mutant, type LedgerRun } from './intentmap.ts'

const dir = (slug: string): string => path.join(CHANGES, slug)
const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return fallback } }

export const readResults = (slug: string): Results => readJson<Results>(path.join(dir(slug), 'intent-results.json'), {})

// The change's run ledger (evidence/runs.jsonl), one parsed line per run; unreadable lines are skipped.
export function readRuns(slug: string): (LedgerRun & { tail: string })[] {
  const f = path.join(dir(slug), 'evidence', 'runs.jsonl')
  return (exists(f) ? fs.readFileSync(f, 'utf8') : '').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as LedgerRun & { tail: string }] } catch { return [] } })
}

const adjPath = (slug: string): string => path.join(dir(slug), 'adjudications.json')
const VERDICTS = ['non-bug', 'clause-vacuous']
// A missing or malformed file reads as no adjudication, so a surviving mutant stays vacuous.
export const readAdjudications = (slug: string): Adjudications => { const a = readJson<unknown>(adjPath(slug), {}); return a && typeof a === 'object' && !Array.isArray(a) ? a as Adjudications : {} }

// A person's ruling on a surviving mutant. by and because are required; the script writes the file and sanctions the write,
// so a hand edit is what harness-tamper sees (the path is PROTECTED).
export function adjudicate(slug: string, mutant: string, verdict: string, because: string, by: string): void {
  if (!VERDICTS.includes(verdict)) throw new Error(`verdict must be one of ${VERDICTS.join(', ')}`)
  if (!by.trim() || !because.trim()) throw new Error('an adjudication needs --by <approver> and a reason after --')
  const all = readAdjudications(slug)
  all[mutant] = { verdict: verdict as 'non-bug' | 'clause-vacuous', because: because.trim(), by: by.trim() }
  fs.writeFileSync(adjPath(slug), JSON.stringify(all, null, 2) + '\n')
  sanctionWrites([path.relative(ROOT, adjPath(slug))])
}

// Runs the command and records what the process did: pass on exit 0, else fail; the commit is HEAD. The agent never types these.
export function recordResult(slug: string, scenario: string, cmd: string): { status: string; exit: number } {
  const map = path.join(dir(slug), 'intent-map.md')
  if (!exists(map)) throw new Error(`${slug} has no intent-map.md`)
  if (!parse(fs.readFileSync(map, 'utf8')).scenarios.some(s => s.id === scenario)) throw new Error(`${scenario} is not an Empirical scenario of ${slug}`)
  const row = runCommand(cmd)
  const commit = git(['rev-parse', '--short', 'HEAD']) ?? ''
  const run = recordRun(slug, { ...row, source: 'ship', commit, scenario })
  const status = row.exit === 0 ? 'pass' : 'fail'
  const results = readResults(slug)
  results[scenario] = { status, command: row.cmd, commit, run }
  fs.writeFileSync(path.join(dir(slug), 'intent-results.json'), JSON.stringify(results, null, 2) + '\n')
  return { status, exit: row.exit }
}

// The ship phase for a change that has a map; no map, no findings.
export function intentShipFindings(slug: string, config: Registry, diffs: FileDiff[], budgetMs: number): Finding[] {
  const mapPath = path.join(dir(slug), 'intent-map.md')
  if (!exists(mapPath)) return []
  const tests = diffs.filter(d => d.status !== 'D' && !d.binary && isTest(d.file, config.paths)).map(d => fs.readFileSync(path.join(ROOT, d.file), 'utf8'))
  const freeze = readJson<Record<string, string> | undefined>(path.join(dir(slug), 'freeze.json'), undefined)
  const text = fs.readFileSync(mapPath, 'utf8')
  const command = parse(text).formalCommand
  const diffSource = diffs.filter(d => d.status !== 'D' && !d.binary && isSource(d.file, config.paths) && !isTest(d.file, config.paths)).map(d => d.file)
  const result = shipCheck({
    text, targets: command ? { files: formalTargets(command, ROOT), diffSource } : undefined, results: readResults(slug), freeze, tests,
    adjudications: readAdjudications(slug), runs: readRuns(slug),
    run: cmd => { const row = runCommand(cmd, { timeoutMs: Math.max(budgetMs, 600_000) }); recordRun(slug, { ...row, source: 'ship' }); return { exit: row.exit, tail: row.tail } },
  })
  return result.findings.map(f => ({ sensor: f.rule, severity: 'block' as const, file: `.rig/changes/${slug}/intent-map.md`, message: f.detail, fix: fixFor(f.rule) }))
}

const FIX: Record<string, string> = {
  'formal-failed': 'make the implementation meet the clause, or fix the ## Formal command; a clause is never moved to not-promised without a person re-approving the map',
  'vacuous': 'tighten the clause so the planted bug is rejected (a map edit needs a re-approval); if the mutant is equivalent (not a bug), a person records it: `S intent-adjudicate <slug> <mutant-id> non-bug --by <name> -- "<reason>"`',
  'formal-targets-diff': 'point the ## Formal command at a checker that imports the code this change edits (or name that file in the command); a checker that imports a copy of it proves the copy, and a map edit needs a re-approval',
  'one-way-unjustified': 'give the formal row a decision in ## Decisions that starts both-ways, or says `one-way-because: <why only one direction is promised>` (a map edit needs a re-approval)',
  'trusted-unpinned': 'add a `- <name>: <contract>. pin: <command>` line under ## Trusted for the symbol, with a command that pins its contract (a map edit needs a re-approval)',
  'property-failed': 'make the property hold (the generated counterexample is in the run output), or fix the ## Property command; a map edit needs a re-approval',
  'unmutated': 'plant one bug for the clause in a scratch copy and add it to the formal command output',
  'empirical-open': 'run the scenario with `S intent-record <slug> <E-id> -- "<command>"`',
  'empirical-unrecorded': 'record the result with `S intent-record`, never by hand',
  'result-unbacked': 'record the scenario with `S intent-record <slug> <E-id> -- "<command>"`; a result written by hand has no ledger run and never ships',
  'stale-scenario': 'revert the scenario text, or ask a person to re-approve the plan',
  'prune': 'drop the test that only repeats a proved clause, or make it name an empirical scenario',
}
const fixFor = (rule: string): string => FIX[rule] ?? 'fix intent-map.md; a person re-approves the plan'

// `intent-record <slug> <E-id> -- "<command>"`: runs the scenario's command and records pass or fail with the commit.
export function cmdIntentRecord(): void {
  const argv = process.argv.slice(3)
  const dash = argv.indexOf('--')
  const [given, scenario] = argv.slice(0, dash < 0 ? 0 : dash)
  if (dash < 0 || dash === argv.length - 1 || !given || !scenario) fail('usage: intent-record <slug> <E-id> -- "<command>"')
  const slug = checkSlug(given)
  if (!exists(dir(slug))) fail(`no such change: ${slug}`)
  try {
    const r = recordResult(slug, scenario, argv.slice(dash + 1).join(' '))
    out(`${scenario}: ${r.status} (exit ${r.exit}), recorded in .rig/changes/${slug}/intent-results.json`)
    process.exitCode = r.exit === 0 ? 0 : 1
  } catch (e) { fail((e as Error).message) }
}

// `intent-adjudicate <slug> <mutant-id> <non-bug|clause-vacuous> --by <name> -- "<reason>"`.
export function cmdIntentAdjudicate(): void {
  const argv = process.argv.slice(3)
  const dash = argv.indexOf('--')
  const head = dash < 0 ? argv : argv.slice(0, dash)
  const byAt = head.indexOf('--by')
  const [given, mutant, verdict] = head
  const by = byAt < 0 ? '' : head[byAt + 1] ?? ''
  const usage = 'usage: intent-adjudicate <slug> <mutant-id> <non-bug|clause-vacuous> --by <name> -- "<reason>"'
  if (!given || !mutant || !verdict || dash < 0 || dash === argv.length - 1) fail(usage)
  const slug = checkSlug(given)
  if (!exists(path.join(dir(slug), 'intent-map.md'))) fail(`${slug} has no intent-map.md`)
  try { adjudicate(slug, mutant, verdict, argv.slice(dash + 1).join(' '), by); out(`${mutant}: ${verdict}, recorded in .rig/changes/${slug}/adjudications.json`) } catch (e) { fail((e as Error).message) }
}

// The receipt block for the PR body, from the map, the recorded results and the last recorded run of the formal command (no new run).
export function intentReceipt(slug: string): string {
  const mapPath = path.join(dir(slug), 'intent-map.md')
  if (!exists(mapPath)) return ''
  const map = parse(applyResults(fs.readFileSync(mapPath, 'utf8'), readResults(slug)))
  const runs = readRuns(slug)
  const last = runs.findLast(r => r.cmd === map.formalCommand)
  let clauses: Record<string, boolean> = {}
  let mutants: Mutant[] = []
  try { const v = JSON.parse(last?.tail.trim().split('\n').at(-1) ?? '{}') as { clauses?: Record<string, boolean>; mutants?: Mutant[] }; clauses = v.clauses ?? {}; mutants = Array.isArray(v.mutants) ? v.mutants : [] } catch { /* no verdict recorded: every clause reads as holds only if the check passed, so say nothing false */ }
  // A clause with no recorded verdict never reads as holding.
  const wanted = map.rows.flatMap(r => r.kind === 'formal' ? r.clauses : [])
  const commands = map.scenarios.flatMap(sc => sc.status === 'pass' && sc.command ? [`${sc.id} \`${sc.command}\``] : [])
  const prop = !map.propertySection ? '' : (() => { const l = runs.findLast(r => r.cmd === map.propertyCommand); return `\n- property: ${!l ? 'not run' : l.exit === 0 ? `pass ${PROPERTY_LABEL}` : 'fails'}` })()
  return receipt(map, Object.fromEntries(wanted.map(id => [id, clauses[id] === true])), mutants, readAdjudications(slug)) + prop + (commands.length ? `\n\nCommands: ${commands.join(', ')}` : '')
}

// `intent-project <slug>`: prints the ## Behaviours section the map generates, for plan to write into spec.md.
export function cmdIntentProject(): void {
  const given = process.argv[3]
  if (!given) fail('usage: intent-project <slug>')
  const slug = checkSlug(given)
  const mapPath = path.join(dir(slug), 'intent-map.md')
  if (!exists(mapPath)) fail(`${slug} has no intent-map.md`)
  out(behavioursFrom(parse(fs.readFileSync(mapPath, 'utf8'))))
}
