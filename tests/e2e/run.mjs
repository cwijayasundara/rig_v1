// The one e2e command: node tests/e2e/run.mjs [--driver live|scripted] [--intents N] [--from J0..J6] [--cap USD] [--minutes N]
// [--full] [--record] [--out DIR] [--recorded SET] [--triage FILE] [--no-extras] [--no-notify]
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

const HERE = import.meta.dirname
const has = f => process.argv.includes(`--${f}`)
const live = arg('driver', 'scripted') === 'live'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.resolve(arg('out', path.join(HERE, 'out', stamp)))
fs.mkdirSync(out, { recursive: true })
if (!arg('out')) {
  const latest = path.join(HERE, 'out', 'latest')
  try { fs.unlinkSync(latest) } catch { /* none yet */ }
  fs.symlinkSync(out, latest)
}

const recordedRoot = path.join(HERE, 'journey/recorded')
const recordedSet = arg('recorded', fs.existsSync(path.join(recordedRoot, 'real/snapshots/J6.tar.gz')) ? 'real' : 'synthetic')
const recordedDir = path.join(recordedRoot, recordedSet)

const resume = arg('from', 'J0') !== 'J0'
if (resume && !arg('out')) { console.error('--from needs --out <the kept run folder>'); process.exit(2) }
// The default is a 20 minute smoke journey: one intent per sprint, a hard wall-clock deadline for every session. --full builds every intent.
const full = has('full')
const minutes = Number(arg('minutes', full ? 60 : 20))
const intents = arg('intents') ? Number(arg('intents')) : full ? Infinity : 1
const t0 = Date.now()
const sb = createSandbox({ name: 'journey', out, reuse: resume })
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
try {
  results = await runJourney({
    sb, log, rubricDir: path.join(HERE, 'journey/rubrics'), ...kit,
    capUsd: Number(arg('cap', 25)), minutes, intents, from: arg('from', 'J0'),
    onStageDone: live && has('record') ? (r, { stage }) => recordStage({ sb, stage: stage.id, verdicts: r.verdicts, decision: stage.approve ? 'approve' : null, recordedDir: path.join(recordedRoot, 'real') }) : null,
  })
} catch (err) {
  failure = String(err?.message ?? err)
  results = err.partial ?? []
  log.add({ stage: 'run', item: 'run-aborted', severity: 'block', evidence: failure, note: failure.split('\n')[0], session: '', area: 'unknown' })
}

let extras = null
if (!live && !has('no-extras') && !failure) extras = await runExtras({ out })
const took = (Date.now() - t0) / 60_000
if (live && took > minutes) log.add({ stage: 'run', item: 'over-time-budget', severity: 'block', evidence: `${took.toFixed(1)} min of ${minutes}`, note: `the journey took ${took.toFixed(1)} min, over its ${minutes} min budget`, session: '', area: 'unknown' })
const costUsd = results.reduce((n, r) => n + r.costUsd, 0)
writeJourneyReport(out, { results, log, sandbox: sb.dir, recordedSet: live ? 'live' : recordedSet, costUsd, minutes: took, extras })
fs.writeFileSync(path.join(out, 'violations.md'), log.toMarkdown())
const extrasFailed = extras ? extras.results.some(c => c.failed.length) || extras.lost.length > 0 : false
if (extras) for (const c of extras.results) if (c.failed.length) c.print()
for (const m of extras?.lost ?? []) console.error(`coverage floor: ${m}`)
const code = alert(log, { summary: summarise(log, { stages: results, costUsd, minutes: took }), ...(has('no-notify') ? { notify: () => {} } : {}) })
console.log(`report and sandbox: ${out}`)
// A halted journey is never green, whatever the triage says: triage only quiets the alert for a violation already decided.
const halted = results.some(r => r.status === 'fail' || r.status === 'not-run') || failure !== null
process.exitCode = code || (halted || extrasFailed ? 1 : 0)
