// Files and processes around the intent map (design 2026-11-07): the pure rules are in intentmap.ts.
// Results the script records live in intent-results.json, outside the approved (hashed) map.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, exists, git, out, fail, checkSlug } from './core.ts'
import { runCommand, recordRun } from './runs.ts'
import { isTest, type Finding, type FileDiff } from './model.ts'
import type { Registry } from './registry.ts'
import { shipCheck, parse, type Results } from './intentmap.ts'

const dir = (slug: string): string => path.join(CHANGES, slug)
const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch { return fallback } }

export const readResults = (slug: string): Results => readJson<Results>(path.join(dir(slug), 'intent-results.json'), {})

// Runs the command and records what the process did: pass on exit 0, else fail; the commit is HEAD. The agent never types these.
export function recordResult(slug: string, scenario: string, cmd: string): { status: string; exit: number } {
  const map = path.join(dir(slug), 'intent-map.md')
  if (!exists(map)) throw new Error(`${slug} has no intent-map.md`)
  if (!parse(fs.readFileSync(map, 'utf8')).scenarios.some(s => s.id === scenario)) throw new Error(`${scenario} is not an Empirical scenario of ${slug}`)
  const row = runCommand(cmd)
  recordRun(slug, { ...row, source: 'ship' })
  const status = row.exit === 0 ? 'pass' : 'fail'
  const results = readResults(slug)
  results[scenario] = { status, command: row.cmd, commit: git(['rev-parse', '--short', 'HEAD']) ?? '' }
  fs.writeFileSync(path.join(dir(slug), 'intent-results.json'), JSON.stringify(results, null, 2) + '\n')
  return { status, exit: row.exit }
}

// The ship phase for a change that has a map; no map, no findings.
export function intentShipFindings(slug: string, config: Registry, diffs: FileDiff[], budgetMs: number): Finding[] {
  const mapPath = path.join(dir(slug), 'intent-map.md')
  if (!exists(mapPath)) return []
  const tests = diffs.filter(d => d.status !== 'D' && !d.binary && isTest(d.file, config.paths)).map(d => fs.readFileSync(path.join(ROOT, d.file), 'utf8'))
  const freeze = readJson<Record<string, string> | undefined>(path.join(dir(slug), 'freeze.json'), undefined)
  const result = shipCheck({
    text: fs.readFileSync(mapPath, 'utf8'), results: readResults(slug), freeze, tests,
    run: cmd => { const row = runCommand(cmd, { timeoutMs: Math.max(budgetMs, 600_000) }); recordRun(slug, { ...row, source: 'ship' }); return { exit: row.exit, tail: row.tail } },
  })
  return result.findings.map(f => ({ sensor: f.rule, severity: 'block' as const, file: `.rig/changes/${slug}/intent-map.md`, message: f.detail, fix: fixFor(f.rule) }))
}

const FIX: Record<string, string> = {
  'formal-failed': 'make the implementation meet the clause, or fix the ## Formal command; a clause is never moved to not-promised without a person re-approving the map',
  'vacuous': 'tighten the clause so the planted bug is rejected; the clause rules nothing out as written (a map edit needs a re-approval)',
  'unmutated': 'plant one bug for the clause in a scratch copy and add it to the formal command output',
  'empirical-open': 'run the scenario with `S intent-record <slug> <E-id> -- "<command>"`',
  'empirical-unrecorded': 'record the result with `S intent-record`, never by hand',
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
