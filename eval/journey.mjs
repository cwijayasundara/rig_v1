// The journey eval: the e2e journey run N times per arm, scored by the inspector's verdicts (per-stage pass share, blocking items, how far it got).
// node eval/journey.mjs [--arms haiku-rig,sonnet-rig] [--runs 3] [--cap-run 25] [--cap-total 60] [--intents N] [--results FILE] [--dry] [--dry-check] [--agreement]
// Live runs cost money and are started by a person. --dry replays the recorded set at $0 and never writes under eval/results.
// --dry-check replays every seeded-bad case and fails when its expected violation is not raised (the replay pipeline; a live check of the
// inspector itself needs seeded-bad snapshots, recorded after the first good live run).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { createSessions } from '../tests/e2e/driver/live.mjs'
import { runJourney } from '../tests/e2e/journey/journey.mjs'
import { STAGES } from '../tests/e2e/journey/stages.mjs'
import { journeyDriver, setupSandbox } from '../tests/e2e/journey/driver-live.mjs'
import { scriptedKit } from '../tests/e2e/journey/driver-scripted.mjs'
import { inspect } from '../tests/e2e/journey/inspector.mjs'
import { review } from '../tests/e2e/journey/reviewer.mjs'
import { createViolationLog } from '../tests/e2e/journey/violations.mjs'
import { MODELS } from './arms.mjs'
import { arg, mean, nextRunAllowed, resultsAllowed } from './lib/cli.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const RECORDED = path.join(ROOT, 'tests/e2e/journey/recorded')
const RUBRICS = path.join(ROOT, 'tests/e2e/journey/rubrics')
const BASELINE = path.join(import.meta.dirname, 'journey-baseline.json')

export const JOURNEY_ARMS = [
  { id: 'haiku-rig', model: MODELS.haiku },
  { id: 'sonnet-rig', model: MODELS.sonnet },
]

const share = r => (r.verdicts.length ? r.verdicts.filter(v => v.verdict === 'pass').length / r.verdicts.length : r.status === 'not-run' ? null : 0)

export async function runJourneyOnce({ arm, n, dry, out, capRunUsd, intents = Infinity, recordedDir = path.join(RECORDED, 'synthetic'), agreement = false }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  setupSandbox(sb)
  const log = createViolationLog({ dir: path.join(out, `${arm.id}-${n}`), run: `${arm.id}-${n}`, sandbox: sb.dir, triage: {} })
  const same = []
  const judge = a => inspect(a)
  const inspector = {
    inspect: async a => {
      const first = await judge(a)
      if (agreement && a.stage === 'J1') {
        const second = await judge(a)
        same.push(first.items.filter((x, i) => x.verdict === second.items[i]?.verdict).length / (first.items.length || 1))
      }
      return first
    },
  }
  const reviewer = { review: a => review(a) }
  const kit = dry
    ? scriptedKit({ sb, recordedDir })
    : (() => {
        const sessions = createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model, env: { CLAUDE_CODE_SUBAGENT_MODEL: arm.model } })
        return { driver: journeyDriver({ sb, sessions, reviewer }), inspector, reviewer, stages: STAGES }
      })()
  let results = []
  let error
  try { results = await runJourney({ sb, log, rubricDir: RUBRICS, ...kit, capUsd: capRunUsd, minutes: 60, intents }) } catch (err) { error = String(err?.message ?? err).split('\n')[0] }
  const reached = [...results].reverse().find(r => r.status !== 'not-run')
  return {
    arm: arm.id, run: n, model: arm.model, at: new Date().toISOString(),
    stageReached: reached?.stage ?? null,
    passShare: Object.fromEntries(results.map(r => [r.stage, share(r)]).filter(([, v]) => v !== null)),
    blocking: log.all().filter(v => v.severity === 'block').length,
    usd: Number(results.reduce((x, r) => x + r.costUsd, 0).toFixed(4)),
    minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)),
    agreement: same.length ? Number(mean(same).toFixed(2)) : null,
    ...(error ? { error } : {}),
  }
}

// baseline: { "<arm>": { minRuns, minPassShare: { J1: 0.9 }, maxBlocking } }. An arm with no baseline is listed, never silently passed.
export function journeyGate(rows, baseline) {
  const lines = [], failures = [], unenforced = []
  for (const arm of [...new Set(rows.map(r => r.arm))]) {
    const rs = rows.filter(r => r.arm === arm && !r.error)
    const b = baseline?.[arm]
    lines.push(`${arm}: ${rs.length} run(s), mean blocking ${mean(rs.map(r => r.blocking)).toFixed(1)}`)
    if (!b) { unenforced.push(arm); continue }
    if (rs.length < (b.minRuns ?? 3)) { failures.push(`${arm}: ${rs.length} run(s), the baseline needs ${b.minRuns ?? 3}; this proves nothing`); continue }
    for (const [stage, min] of Object.entries(b.minPassShare ?? {})) {
      const m = mean(rs.map(r => r.passShare[stage] ?? 0))
      if (m < min - 0.1) failures.push(`${arm}: ${stage} pass share ${m.toFixed(2)}, more than 0.10 under the baseline ${min}`)
    }
    const blk = mean(rs.map(r => r.blocking))
    if (blk > (b.maxBlocking ?? 0) + 1) failures.push(`${arm}: ${blk.toFixed(1)} blocking items per run, more than one over the baseline ${b.maxBlocking ?? 0}`)
  }
  return { lines, failures, unenforced, pass: failures.length === 0 }
}

export async function checkBadCases({ recordedRoot = RECORDED, out }) {
  const dir = path.join(recordedRoot, 'bad')
  const missed = []
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.')) : []) {
    const expected = JSON.parse(fs.readFileSync(path.join(dir, name, 'expected.json'), 'utf8')).violation
    const sb = createSandbox({ name: `bad-${name}`, out })
    setupSandbox(sb)
    const log = createViolationLog({ dir: path.join(out, `bad-${name}`), run: name, sandbox: sb.dir, triage: {} })
    await runJourney({ sb, log, rubricDir: RUBRICS, ...scriptedKit({ sb, recordedDir: path.join(dir, name) }), capUsd: 5, minutes: 10 })
    if (!log.all().some(v => v.id === expected)) missed.push(name)
  }
  return { missed }
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-journey-'))))
  if (process.argv.includes('--dry-check')) {
    const { missed } = await checkBadCases({ out })
    console.log(missed.length ? `inspector pipeline missed: ${missed.join(', ')}` : 'every seeded-bad case raised its expected violation')
    process.exit(missed.length ? 1 : 0)
  }
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(import.meta.dirname, 'results', `${new Date().toISOString().slice(0, 10)}-journey.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  fs.mkdirSync(path.dirname(results), { recursive: true })
  const wanted = (arg('arms') ?? 'haiku-rig').split(',')
  const arms = JOURNEY_ARMS.filter(a => wanted.includes(a.id))
  const capRun = Number(arg('cap-run', 25)), capTotal = Number(arg('cap-total', 60))
  const rows = []
  let spent = 0
  for (let n = 1; n <= Number(arg('runs', 3)); n++) {
    for (const arm of arms) {
      if (!dry && !nextRunAllowed(spent, capRun, capTotal)) { console.log(`stopping: $${spent.toFixed(2)} spent, the next run could pass the $${capTotal} total cap`); break }
      const row = await runJourneyOnce({ arm, n, dry, out, capRunUsd: capRun, intents: arg('intents') ? Number(arg('intents')) : Infinity, agreement: process.argv.includes('--agreement') })
      spent += row.usd
      rows.push(row)
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${arm.id} #${n}: reached ${row.stageReached}, blocking ${row.blocking}, $${row.usd}, ${row.minutes} min${row.error ? ` (${row.error})` : ''}`)
    }
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {}
  const g = journeyGate(rows, baseline)
  console.log([...g.lines, ...(g.unenforced.length ? [`not enforced (no baseline): ${g.unenforced.join(', ')}`] : []), ...g.failures.map(f => `REGRESSION ${f}`), g.pass ? 'gate: pass' : 'gate: FAIL', results].join('\n'))
  process.exitCode = g.pass ? 0 : 1
}
