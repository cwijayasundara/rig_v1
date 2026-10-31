// The eval runner (spec §9): node eval/run.mjs [--arms all|a,b] [--runs 10] [--seed N] [--variant links|rules] [--cap-run 6] [--cap-total 300] [--out DIR] [--results FILE] [--dry]
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
import { EVAL_ALLOW, arg, nextRunAllowed, resultsAllowed } from './lib/cli.mjs'
import { armsFrom } from './arms.mjs'
import { scoreRun } from './score.mjs'
import { setupBare, setupRig, dryBare, BARE_PROMPT, BARE_PROMPT_LINKS, BARE_PROMPT_RULES } from './setup.mjs'
import { PHASE as S7 } from './variants/links.mjs'
import { PHASE_S8 as S8, PHASE_S9 as S9 } from './variants/rules.mjs'

const RESULTS = path.resolve(import.meta.dirname, 'results')

// Arm order is shuffled per run from a seed (recorded in the row), so no arm always goes first and meets the quiet hours or the cold cache.
export function orderArms(arms, seed, n) {
  // mulberry32 over a hash of (seed, run): successive runs are not linear in each other
  let x = (Math.imul(Math.trunc(Number(seed)) ^ 0x9e3779b9, 2654435761) + Math.imul(n, 40503)) >>> 0
  const rand = () => { x = (x + 0x6d2b79f5) >>> 0; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32 }
  return arms.map(a => [rand(), a]).sort((a, b) => a[0] - b[0]).map(([, a]) => a)
}

const PHASES = { links: [S2, S3, S7], rules: [S2, S3, S7, S8, S9] }
const failing = (driver, failAt) => (failAt ? { ...driver, [failAt]: async () => { throw new Error(`injected failure at ${failAt}`) } } : driver)

// Where a run's sessions, dollars and denials went, kept in the row because the sandboxes are deleted after scoring.
export const sessionTrace = sessions => sessions.map(s => ({
  label: path.basename(s.file).replace(/^\d+-/, '').replace(/\.jsonl$/, ''),
  usd: Number(s.costUsd.toFixed(4)), turns: s.turns,
  denied: s.denials.map(d => `${d.tool_name}: ${String(d.tool_input?.command ?? d.tool_input?.file_path ?? d.tool_input?.skill ?? '').slice(0, 80)}`),
  agents: s.agents, skills: s.skills,
  models: Object.fromEntries(Object.entries(s.models).map(([m, v]) => [m.replace(/^claude-/, '').replace(/-\d.*$/, ''), Number(v.costUsd.toFixed(4))])),
}))

export async function runOne(arm, n, { dry, out, capRunUsd, failAt, seed = null, position = null, variant = null }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  // Subagents run on the arm's own model (the template pins them to Sonnet), so an arm measures its model; rig's evaluator agent keeps
  // its own pin (spec §3.5) and shows in the per-model usage.
  const sessions = dry ? null : createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model, allow: EVAL_ALLOW, env: { CLAUDE_CODE_SUBAGENT_MODEL: arm.model } })
  const row = { arm: arm.id, run: n, model: arm.model, rig: arm.rig, policy: arm.policy ?? null, variant, seed, position, at: new Date().toISOString() }
  let base = null
  let settled = null // HEAD once rig's own setup commits are down: tamper judges the builder's commits, not the harness's
  try {
    if (arm.rig) {
      base = await setupRig(sb, arm, { dry, variant })
      settled = sb.git('rev-parse', 'HEAD')
      for (const phase of PHASES[variant] ?? [S2, S3]) {
        const driver = failing(dry ? scriptedDriver(sb, phase) : liveDriver(sb, arm.full ? { ...phase, prompt: `${phase.prompt} --full` } : phase, { sessions }), failAt)
        const { slug, answered } = await runChange(sb, phase, driver)
        row.reapproved = (row.reapproved ?? 0) + (driver.reapproved ?? 0)
        if (driver.reapprovalNotes?.length) row.reapprovalNotes = [...(row.reapprovalNotes ?? []), ...driver.reapprovalNotes]
        row.answered = (row.answered ?? 0) + (answered ? 1 : 0) // changes whose open questions the driver answered: they cost an extra session
        mergeToMain(sb, slug)
      }
    } else {
      base = setupBare(sb, { dry, variant })
      if (dry) dryBare(sb, { variant })
      if (failAt) throw new Error(`injected failure at ${failAt}`)
      if (!dry) sessions.run('bare', { links: BARE_PROMPT_LINKS, rules: BARE_PROMPT_RULES }[variant] ?? BARE_PROMPT)
    }
  } catch (err) {
    row.error = String(err?.message ?? err).split('\n')[0]
  } finally {
    // Whatever the run left, committed, so tamper judges it even when the session or a change failed midway.
    if (base) { try { sb.commitAll('chore: run result') } catch {} }
  }
  const score = base ? await scoreRun(sb, base, { variant, judgeFrom: settled ?? base }).catch(e => ({ checks: 0, of: 3, accepted: false, layerViolations: null, error: e.message })) : { checks: 0, of: 3, accepted: false, layerViolations: null }
  const t = sessions ? totals(sessions.sessions) : { costUsd: 0, inputTokens: 0, outputTokens: 0, denials: [], models: {} }
  const commits = base ? Number(sb.git('rev-list', '--count', `${base}..HEAD`)) : 0
  // The machine slept during a session: the run measured the laptop, not the arm. It is kept for its cost, never scored, and retried.
  const infra = sessions?.sessions.some(x => x.slept) ? 'sleep' : null
  const estimated = sessions?.sessions.some(x => x.estimated) ?? false
  return {
    ...row, ...score, accepted: !infra && !row.error && score.accepted, error: row.error ?? score.error, ...(infra && { infra }), ...(estimated && { estimated }),
    inputTokens: t.inputTokens, outputTokens: t.outputTokens, usd: Number(t.costUsd.toFixed(4)),
    minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)), sessions: sessions?.sessions.length ?? 0,
    denials: t.denials.length, models: t.models, commits, ...(sessions && { trace: sessionTrace(sessions.sessions) }),
  }
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-'))))
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(RESULTS, `${new Date().toISOString().slice(0, 10)}.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const runs = Number(arg('runs', 10))
  const capRunUsd = Number(arg('cap-run', 6))
  const capTotal = Number(arg('cap-total', 300))
  const retries = Number(arg('retries', 1)) // reruns of a run the machine slept through
  fs.mkdirSync(path.dirname(results), { recursive: true })
  const variant = arg('variant', null)
  if (variant && variant !== 'links' && variant !== 'rules') { console.error('--variant must be: links or rules'); process.exit(2) }
  const seed = Number(arg('seed', Date.now() % 1_000_000))
  if (!Number.isInteger(seed) || seed < 0) { console.error('--seed must be a non-negative integer'); process.exit(2) }
  console.log(`arm order seed ${seed} (pass --seed ${seed} to repeat it)`)
  let spent = 0
  for (let n = 1; n <= runs; n++) {
    const round = orderArms(armsFrom(arg('arms')), seed, n)
    // The cap is checked once per round, for every arm in it, so a stop never leaves a round with some arms missing (an unpaired run).
    if (!dry && !nextRunAllowed(spent, capRunUsd * round.length, capTotal)) { console.log(`stopped before round ${n}: $${spent.toFixed(2)} spent, and a round of ${round.length} arm(s) can cost up to $${(capRunUsd * round.length).toFixed(2)} (--cap-run ${capRunUsd} x arms) against --cap-total ${capTotal}; lower --cap-run or raise --cap-total`); break }
    for (const [position, arm] of round.entries()) {
      for (let attempt = 0; ; attempt++) {
        const row = await runOne(arm, n, { dry, out, capRunUsd, seed, position, variant })
        spent += row.usd
        fs.appendFileSync(results, JSON.stringify(row) + '\n')
        console.log(`${arm.id} #${n}: ${row.infra ? `INVALID (${row.infra}), not scored` : `${row.accepted ? 'accepted' : 'not accepted'} ${row.checks}/${row.of}`}, $${row.usd}${row.estimated ? ' (estimated)' : ''}, ${row.minutes} min${row.error ? ` (${row.error})` : ''}`)
        if (!row.infra || attempt >= retries) break
        if (!nextRunAllowed(spent, capRunUsd, capTotal)) { console.log(`no retry of ${arm.id} #${n}: $${spent.toFixed(2)} spent against --cap-total ${capTotal}`); break }
        console.log(`retrying ${arm.id} #${n} (${attempt + 1} of ${retries})`)
      }
    }
  }
  console.log(`\n${results}\nsandboxes: ${out}`)
}
