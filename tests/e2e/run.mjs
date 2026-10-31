// The one e2e command: node tests/e2e/run.mjs [--driver live|scripted] [--intents N] [--from J0..J6] [--cap USD] [--minutes N]
// [--mode fast|chart|full] [--record] [--out DIR] [--sandbox DIR] [--recorded SET] [--triage FILE] [--no-extras] [--no-notify]
// It drives rig through init, chart, approve and build for Library Desk sprint 1 (greenfield) and sprint 2 (brownfield) on one
// sandbox. Each stage acts (Haiku, live), passes deterministic gates, then a Sonnet inspector judges the artefacts against a
// rubric. Every violation is logged and alerted; the run never fixes anything. Scripted replays recorded snapshots at $0.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from './lib/sandbox.mjs'
import { arg } from '../../eval/lib/cli.mjs'
import { createSessions } from './driver/live.mjs'
import { runJourney } from './journey/journey.mjs'
import { STAGES } from './journey/stages.mjs'
import { journeyDriver, setupSandbox } from './journey/driver-live.mjs'
import { scriptedKit, recordStage } from './journey/driver-scripted.mjs'
import { inspect } from './journey/inspector.mjs'
import { review } from './journey/reviewer.mjs'
import { createViolationLog, loadTriage } from './journey/violations.mjs'
import { alert, summarise } from './journey/alert.mjs'
import { writeJourneyReport } from './lib/report.mjs'
import { runExtras } from './extras.mjs'
import { PLUGIN } from './lib/sandbox.mjs'
import { MODES, SEEDS, legStages } from './journey/legs.mjs'
import { seedSandbox, snapshotFile } from './journey/snapshot.mjs'

const HERE = import.meta.dirname
const has = f => process.argv.includes(`--${f}`)
const live = arg('driver', 'scripted') === 'live'
// fast (default, under 20 min): build one intent greenfield and one brownfield, each from a recorded approved chart. chart: init and the two
// charts. full: everything from nothing, and the way the snapshots are recorded. Scripted always replays the full journey.
const mode = arg('mode', has('full') ? 'full' : 'fast')
if (!MODES[mode]) { console.error(`unknown --mode ${mode}: fast, chart or full`); process.exit(2) }
if (has('record') && mode !== 'full') { console.error('--record needs --mode full: the snapshots the other modes start from come from a whole journey'); process.exit(2) }
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.resolve(arg('out', path.join(HERE, 'out', stamp)))
fs.mkdirSync(out, { recursive: true })
if (!arg('out')) {
  const latest = path.join(HERE, 'out', 'latest')
  try { fs.unlinkSync(latest) } catch { /* none yet */ }
  fs.symlinkSync(out, latest)
}

const recordedRoot = path.join(HERE, 'journey/recorded')
const recordedSet = arg('recorded', live ? 'real' : fs.existsSync(path.join(recordedRoot, 'real/snapshots/J6.tar.gz')) ? 'real' : 'synthetic')
const recordedDir = path.join(recordedRoot, recordedSet)

// Before anything is created or spent: every leg that starts from a snapshot needs it on disk.
if (live) {
  for (const leg of MODES[mode].legs) {
    if (leg.seed && !fs.existsSync(snapshotFile(recordedDir, leg.seed))) { console.error(`mode ${mode} starts from the recorded ${leg.seed} snapshot, which is missing in ${recordedDir}. Record it once with: npm run e2e:full -- --record`); process.exit(2) }
  }
}
const resume = arg('from', 'J0') !== 'J0'
if (resume && !arg('out')) { console.error('--from needs --out <the kept run folder>'); process.exit(2) }
// Every mode has a hard wall-clock deadline for its sessions; fast is the 20 minute one.
const minutes = Number(arg('minutes', MODES[mode].minutes))
const intents = arg('intents') ? Number(arg('intents')) : MODES[mode].intents
const t0 = Date.now()
// The sandbox repo lives in the system temp folder, never inside this repo: a claude session whose repo is nested in another project
// has its writes to CLAUDE.md and README.md refused as "sensitive files" (found by the first live run). Reports and logs stay in `out`.
const sandboxRoot = path.resolve(arg('sandbox', resume ? fs.readFileSync(path.join(out, 'sandbox-path.txt'), 'utf8').trim() : path.join(os.tmpdir(), `rig-journey-${stamp}`)))
if (sandboxRoot === PLUGIN || sandboxRoot.startsWith(PLUGIN + path.sep)) { console.error(`the sandbox must be outside the rig repo (${PLUGIN}): a session inside it cannot write CLAUDE.md. Got ${sandboxRoot}`); process.exit(2) }
fs.mkdirSync(sandboxRoot, { recursive: true })
fs.writeFileSync(path.join(out, 'sandbox-path.txt'), sandboxRoot)
const sb = createSandbox({ name: 'journey', out: sandboxRoot, reuse: resume })
if (!resume) setupSandbox(sb)
const log = createViolationLog({ dir: out, run: stamp, sandbox: sb.dir, triage: loadTriage(arg('triage', path.join(HERE, 'journey/triage.json'))) })
const inspector = { inspect: a => inspect(a) }
const reviewer = { review: a => review(a) }
let kit
if (live) {
  const sessions = createSessions({ sb, out, capUsd: Number(arg('cap', 25)), model: 'claude-haiku-5-5', deadline: t0 + minutes * 60_000 })
  kit = { driver: journeyDriver({ sb, sessions, reviewer }), inspector, reviewer, stages: STAGES }
} else {
  kit = scriptedKit({ sb, recordedDir })
}
let results = []
let failure = null
const legs = live ? MODES[mode].legs : MODES.full.legs
const live_record = live && has('record') ? (r, { stage }) => recordStage({ sb, stage: stage.id, verdicts: r.verdicts, decision: stage.approve ? 'approve' : null, recordedDir: path.join(recordedRoot, 'real'), snapshot: SEEDS.includes(stage.id) }) : null
try {
  for (const leg of legs) {
    if (live && leg.seed) seedSandbox({ sb, recordedDir, stage: leg.seed })
    const stages = legStages(kit.stages, leg.stages)
    results.push(...await runJourney({
      sb, log, rubricDir: path.join(HERE, 'journey/rubrics'), ...kit, stages, startedAt: t0,
      capUsd: Number(arg('cap', 25)), minutes, intents, from: legs.length === 1 ? arg('from', stages[0].id) : stages[0].id,
      onStageDone: live_record,
    }))
  }
} catch (err) {
  failure = String(err?.message ?? err)
  results.push(...(err.partial ?? []))
  log.add({ stage: 'run', item: 'run-aborted', severity: 'block', evidence: failure, note: failure.split('\n')[0], session: '', area: 'unknown' })
}

let extras = null
if (!live && !has('no-extras') && !failure) extras = await runExtras({ out })
const took = (Date.now() - t0) / 60_000
if (live && took > minutes) log.add({ stage: 'run', item: 'over-time-budget', severity: 'block', evidence: `${took.toFixed(1)} min of ${minutes}`, note: `the journey took ${took.toFixed(1)} min, over its ${minutes} min budget`, session: '', area: 'unknown' })
const costUsd = results.reduce((n, r) => n + r.costUsd, 0)
writeJourneyReport(out, { results, log, sandbox: sb.dir, recordedSet: live ? 'live' : recordedSet, costUsd, minutes: took, extras, config: live ? [`mode ${mode}`, `evaluator pinned to sonnet in the sandbox: ${/^model: sonnet$/m.test(sb.read('.claude/agents/rig-evaluator.md')) ? 'yes' : 'no'} (rig ships it on opus)`, 'actor model claude-haiku-5-5; inspector and reviewer claude-sonnet-5-5'] : [] })
fs.writeFileSync(path.join(out, 'violations.md'), log.toMarkdown())
const extrasFailed = extras ? extras.results.some(c => c.failed.length) || extras.lost.length > 0 : false
if (extras) for (const c of extras.results) if (c.failed.length) c.print()
for (const m of extras?.lost ?? []) console.error(`coverage floor: ${m}`)
const code = alert(log, { summary: summarise(log, { stages: results, costUsd, minutes: took }), ...(has('no-notify') ? { notify: () => {} } : {}) })
console.log(`report and sandbox: ${out}`)
// A halted journey is never green, whatever the triage says: triage only quiets the alert for a violation already decided.
const halted = results.some(r => r.status === 'fail' || r.status === 'not-run') || failure !== null
process.exitCode = code || (halted || extrasFailed ? 1 : 0)
