// The eval runner (spec §9): node eval/run.mjs [--arms all|a,b] [--runs 10] [--cap-run 6] [--cap-total 300] [--out DIR] [--results FILE] [--dry]
// Live runs cost money and are started by a person; --dry replays fixtures at $0 and never writes under eval/results.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { runChange } from '../tests/e2e/lib/flow.mjs'
import { mergeToMain } from '../tests/e2e/lib/merge.mjs'
import { scriptedDriver } from '../tests/e2e/driver/scripted.mjs'
import { createSessions, liveDriver } from '../tests/e2e/driver/live.mjs'
import { totals } from '../tests/e2e/assert/process.mjs'
import { PHASE as S2 } from '../tests/e2e/phases/s2-greenfield.mjs'
import { PHASE as S3 } from '../tests/e2e/phases/s3-delete.mjs'
import { armsFrom } from './arms.mjs'
import { scoreRun } from './score.mjs'
import { setupBare, setupRig, dryBare, BARE_PROMPT } from './setup.mjs'

const RESULTS = path.resolve(import.meta.dirname, 'results')
// The same extra permissions for every arm: a bare model must be able to run its own tests, as a rig arm does through sdlc.ts.
export const EVAL_ALLOW = ['Bash(npm *)', 'Bash(node *)', 'Bash(git *)', 'Bash(ls *)', 'Bash(mkdir *)', 'Bash(cat *)']

export const nextRunAllowed = (spent, capRun, capTotal) => spent + capRun <= capTotal + 1e-9
export const resultsAllowed = (file, dry) => (dry && path.resolve(file).startsWith(RESULTS + path.sep) ? 'dry runs never write under eval/results: they replay fixtures, not a model' : null)

const failing = (driver, failAt) => (failAt ? { ...driver, [failAt]: async () => { throw new Error(`injected failure at ${failAt}`) } } : driver)

export async function runOne(arm, n, { dry, out, capRunUsd, failAt }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  // Subagents run on the arm's own model (the template pins them to Sonnet), so an arm measures its model; rig's evaluator agent keeps
  // its own pin (spec §3.5) and shows in the per-model usage.
  const sessions = dry ? null : createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model, allow: EVAL_ALLOW, env: { CLAUDE_CODE_SUBAGENT_MODEL: arm.model } })
  const row = { arm: arm.id, run: n, model: arm.model, rig: arm.rig, policy: arm.policy ?? null, at: new Date().toISOString() }
  let base = null
  try {
    if (arm.rig) {
      base = await setupRig(sb, arm, { dry })
      for (const phase of [S2, S3]) {
        const driver = failing(dry ? scriptedDriver(sb, phase) : liveDriver(sb, phase, { sessions }), failAt)
        const { slug } = await runChange(sb, phase, driver)
        mergeToMain(sb, slug)
      }
    } else {
      base = setupBare(sb, { dry })
      if (dry) dryBare(sb)
      if (failAt) throw new Error(`injected failure at ${failAt}`)
      if (!dry) sessions.run('bare', BARE_PROMPT)
    }
  } catch (err) {
    row.error = String(err?.message ?? err).split('\n')[0]
  } finally {
    // Whatever the run left, committed, so tamper judges it even when the session or a change failed midway.
    if (base) { try { sb.commitAll('chore: run result') } catch {} }
  }
  const score = base ? await scoreRun(sb, base).catch(e => ({ checks: 0, of: 3, accepted: false, error: e.message })) : { checks: 0, of: 3, accepted: false }
  const t = sessions ? totals(sessions.sessions) : { costUsd: 0, inputTokens: 0, outputTokens: 0, denials: [], models: {} }
  const commits = base ? Number(sb.git('rev-list', '--count', `${base}..HEAD`)) : 0
  return {
    ...row, ...score, accepted: !row.error && score.accepted, error: row.error ?? score.error,
    inputTokens: t.inputTokens, outputTokens: t.outputTokens, usd: Number(t.costUsd.toFixed(4)),
    minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)), sessions: sessions?.sessions.length ?? 0,
    denials: t.denials.length, models: t.models, commits,
  }
}

if (process.argv[1] === import.meta.filename) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const dry = process.argv.includes('--dry')
  const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-'))))
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(RESULTS, `${new Date().toISOString().slice(0, 10)}.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const runs = Number(arg('runs', 10))
  const capRunUsd = Number(arg('cap-run', 6))
  const capTotal = Number(arg('cap-total', 300))
  fs.mkdirSync(path.dirname(results), { recursive: true })
  let spent = 0
  let stopped = false
  for (let n = 1; n <= runs && !stopped; n++) {
    for (const arm of armsFrom(arg('arms'))) {
      if (!dry && !nextRunAllowed(spent, capRunUsd, capTotal)) { console.log(`stopped at cap: $${spent.toFixed(2)} spent of $${capTotal}`); stopped = true; break }
      const row = await runOne(arm, n, { dry, out, capRunUsd })
      spent += row.usd
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${arm.id} #${n}: ${row.accepted ? 'accepted' : 'not accepted'} ${row.checks}/${row.of}, $${row.usd}, ${row.minutes} min${row.error ? ` (${row.error})` : ''}`)
    }
  }
  console.log(`\n${results}\nsandboxes: ${out}`)
}
