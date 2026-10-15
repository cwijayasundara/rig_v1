// `verify` runs a change's verification commands through the recorder and writes verification.md; `verify-report`
// only writes the report from runs already recorded. Verdicts come from captured exit codes, never from a model.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, planPath, planVerificationBullets, planVerification, planApproved, checkSlug, exists, read, now, out, fail, defaultBase, type Args } from './core.ts'
import { activeSlug, loadChange, nextCommand } from './graph.ts'
import { loadConfig, runDeclared } from './check.ts'
import { formatFindings, isSource } from './model.ts'
import { branchDiff } from './diffs.ts'
import { treeStamp } from './stamp.ts'
import { runCommand, recordRun, readRuns, renderVerification, runsDigest, normCmd } from './runs.ts'
import { requiredLevels, levelResults } from './levels.ts'
import { recordRound, readRatchet, unblock, block } from './ratchet.ts'

// sensors.json is protected, so its commands always count. The plan document is the model's own file unless the person
// approved it (the approval is bound to its digest), so its ## Verification counts only then.
export function declaredCommandSet(slug: string | null): Set<string> {
  const { config } = loadConfig()
  const cmds = [...Object.values(config.fast), ...Object.values(config.full), ...Object.values(config.levels), ...Object.values(config.quality).map(q => q.cmd), config.behavioral?.validate ?? '', config.behavioral?.run ?? '', ...(slug && planApproved(slug) ? planVerification(slug) : [])]
  return new Set(cmds.filter((c): c is string => Boolean(c)).map(normCmd))
}

function slugOf(args: Args, usage: string): string {
  const slug = args.pos[0] ? checkSlug(args.pos[0]) : activeSlug()
  if (!slug || !exists(path.join(CHANGES, slug))) fail(usage)
  return slug
}

const FULL_BUDGET_MS = 1_800_000

// `before` is the stamp taken before any command ran: the report is stamped only when the tree is unchanged since, so a
// command that rewrites files (a formatter, codegen) never vouches for a tree the tests did not run on. verify-report alone
// never yields `full: pass`.
function writeReport(slug: string, full: 'pass' | 'fail' | 'none' = 'none', before?: string | null): 'pass' | 'fail' {
  const rows = readRuns(slug)
  const plan = planVerificationBullets(slug)
  const change = loadChange(slug)
  const { config } = loadConfig()
  const required = change.type === 'spike' ? [] : requiredLevels(change, read(planPath(slug)), config)
  const latest = new Map(rows.filter(r => !r.expectFail && !r.source).map(r => [normCmd(r.cmd), r.exit]))
  // Plan commands stand in for an undeclared unit level; with no plan list, any explicit green run does (the no-plan fallback).
  const planned = plan.commands.map(normCmd)
  const planPassed = planned.length ? planned.every(c => latest.get(c) === 0) : latest.size > 0 && [...latest.values()].every(e => e === 0)
  const levels: { level: string; cmd: string | null; status: string }[] = levelResults(slug, required, config, planPassed)
  // Behavioural row from the latest recorded exits: validate gates run, and no recorded run is not a pass.
  if (config.behavioral) {
    const exitOf = (cmd?: string): number | undefined => (cmd ? latest.get(normCmd(cmd)) : undefined)
    const v = exitOf(config.behavioral.validate), r = exitOf(config.behavioral.run)
    const status = v !== undefined && v !== 0 ? 'fail' : config.behavioral.run ? (r === undefined ? 'not-run' : r === 0 ? 'pass' : 'fail') : v === 0 ? 'pass' : 'not-run'
    levels.push({ level: 'behavioral', cmd: config.behavioral.run ?? config.behavioral.validate ?? null, status })
  }
  const after = treeStamp()
  const tree = before === undefined || before === after ? after : null
  const { text, result } = renderVerification(rows, runsDigest(slug, rows.length), plan.commands, plan.ignored, levels, { tree, full: full === 'pass' && !tree ? 'none' : full })
  fs.writeFileSync(path.join(CHANGES, slug, 'verification.md'), text)
  // A required level nobody declared is not fixable by code (spec §5.2): block with the exact edit a person makes.
  // The level kind clears first, so a cap reached in this same run is recorded rather than refused behind the old block.
  const undeclared = levels.find(l => l.status === 'undeclared')
  if (!undeclared) unblock(slug, 'levels declared', 'level')
  // A failing report is always a new finding (counter keeps the hash unique), so only the test node's cap applies.
  if (result === 'fail') {
    recordRound(slug, 'test', [{ severity: 'high', category: 'tests', text: `verification failed at ${now()} (${rows.length} runs, round ${readRatchet(slug).nodes.test?.hashes.length ?? 0})` }], { cap: config.ratchet.rounds.test })
  }
  if (undeclared) block(slug, 'test', `level ${undeclared.level} required but not declared: add "${undeclared.level}": "<cmd>" to .rig/sensors.json levels: declare it on the trunk first, as a separate harness change to .rig/sensors.json reviewed by the code owners; then rebase this change`, 'level')
  out(`verification ${result}: ${rows.length} recorded run(s). Next: ${nextCommand(loadChange(slug))}`)
  return result
}

export function cmdVerifyReport(args: Args): void {
  writeReport(slugOf(args, 'usage: verify-report <slug>'))
}

// Runs the plan's `## Verification` commands and each required level's declared command, one after another, recording
// each as it finishes. Only commands the harness already trusts run unprompted (sensors.json, or a plan a person
// approved); the rest are listed for the model to run with `run`, which asks the person.
export function cmdVerify(args: Args): void {
  const slug = slugOf(args, 'usage: verify <slug>')
  const { config } = loadConfig()
  const change = loadChange(slug)
  const required = change.type === 'spike' ? [] : requiredLevels(change, read(planPath(slug)), config)
  const wanted = [...planVerificationBullets(slug).commands, ...required.map(l => config.levels[l] ?? '')].filter(Boolean)
  const trusted = declaredCommandSet(slug)
  const before = treeStamp()
  const seen = new Set<string>()
  const skipped: string[] = []
  const ran = new Set<string>()
  // Behavioural: validate first (the guide/sensor sync step); a failed validate means run never executes.
  let behavioralOk = true
  if (config.behavioral?.validate) {
    const row = runCommand(config.behavioral.validate)
    recordRun(slug, row)
    ran.add(normCmd(config.behavioral.validate))
    seen.add(normCmd(config.behavioral.validate))
    out(`exit ${row.exit}${row.timedOut ? ' (timed out)' : ''} in ${row.ms} ms: ${config.behavioral.validate}`)
    if (row.exit !== 0) { behavioralOk = false; out('[behavioral] examples do not match the specs: fix the examples or the specs — a person re-approves if the specs change') }
  }
  for (const cmd of wanted) {
    const key = normCmd(cmd)
    if (seen.has(key)) continue
    seen.add(key)
    if (!behavioralOk && config.behavioral?.run && key === normCmd(config.behavioral.run)) continue
    if (!trusted.has(key)) { skipped.push(cmd); continue }
    const row = runCommand(cmd)
    recordRun(slug, row)
    ran.add(key)
    out(`exit ${row.exit}${row.timedOut ? ' (timed out)' : ''} in ${row.ms} ms: ${cmd}`)
  }
  if (config.behavioral?.run && behavioralOk && !ran.has(normCmd(config.behavioral.run))) {
    const row = runCommand(config.behavioral.run)
    recordRun(slug, row)
    ran.add(normCmd(config.behavioral.run))
    out(`exit ${row.exit}${row.timedOut ? ' (timed out)' : ''} in ${row.ms} ms: ${config.behavioral.run}`)
    if (row.exit !== 0) out('[behavioral] the behavioural suite failed: fix the implementation or the execution setup, never the examples or specs')
  }
  if (skipped.length) out(`not run (not declared in sensors.json and the plan is not approved): ${skipped.map(c => `\`${c}\``).join(', ')}. Run each with \`sdlc.ts run --slug ${slug} -- "<command>"\`, which asks the person, then \`verify-report ${slug}\`.`)
  // One authoritative run: the declared full commands run here too, so ship and push can check the stamp instead.
  // The full commands of the scopes the branch touches (source files only), skipping any the loop above already ran.
  // With no base to diff against, every scope's: an empty selection must never stamp `full: pass`. A source-less branch (docs
  // or harness only) runs the top-level ones (undefined), for the same reason.
  const base = defaultBase()
  const changed = base ? branchDiff(base).map(d => d.file).filter(f => isSource(f, config)) : 'all'
  const files = changed.length ? changed : undefined
  const failed = runDeclared('full', config, slug, FULL_BUDGET_MS, false, files, ran).filter(f => f.severity === 'block')
  if (failed.length) out(formatFindings(failed))
  if (writeReport(slug, failed.length ? 'fail' : 'pass', before) !== 'pass') process.exitCode = 1
}
