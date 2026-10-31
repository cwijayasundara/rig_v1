// The one e2e command: node tests/e2e/run.mjs [--driver live|scripted] [--intents N] [--from J0..J6] [--cap USD] [--minutes N]
// [--record] [--out DIR] [--recorded SET] [--triage FILE] [--no-extras] [--no-notify]
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
  fs.rmSync(latest, { force: true })
  fs.symlinkSync(out, latest)
}

const recordedRoot = path.join(HERE, 'journey/recorded')
const recordedSet = arg('recorded', fs.existsSync(path.join(recordedRoot, 'real/snapshots/J6.tar.gz')) ? 'real' : 'synthetic')
const recordedDir = path.join(recordedRoot, recordedSet)

const sb = createSandbox({ name: 'journey', out })
setupSandbox(sb)
const log = createViolationLog({ dir: out, run: stamp, sandbox: sb.dir, triage: loadTriage(arg('triage', path.join(HERE, 'journey/triage.json'))) })
const inspector = { inspect: a => inspect(a) }
const reviewer = { review: a => review(a) }
let kit
if (live) {
  const sessions = createSessions({ sb, out, capUsd: Number(arg('cap', 25)), model: 'claude-haiku-5-5' })
  kit = { driver: journeyDriver({ sb, sessions, reviewer }), inspector, reviewer, stages: STAGES }
} else {
  kit = scriptedKit({ sb, recordedDir })
}
const t0 = Date.now()
let results = []
let failure = null
try {
  results = await runJourney({
    sb, log, rubricDir: path.join(HERE, 'journey/rubrics'), ...kit,
    capUsd: Number(arg('cap', 25)), minutes: Number(arg('minutes', 60)), intents: arg('intents') ? Number(arg('intents')) : Infinity, from: arg('from', 'J0'),
    onStageDone: live && has('record') ? (r, { stage }) => recordStage({ sb, stage: stage.id, verdicts: r.verdicts, decision: stage.approve ? 'approve' : null, recordedDir: path.join(recordedRoot, 'real') }) : null,
  })
} catch (err) {
  failure = String(err?.message ?? err)
  log.add({ stage: 'run', item: 'run-aborted', severity: 'block', evidence: failure, note: failure.split('\n')[0], session: '', area: 'unknown' })
}

let extras = null
if (!live && !has('no-extras') && !failure) extras = await runExtras({ out })
const minutes = (Date.now() - t0) / 60_000
const costUsd = results.reduce((n, r) => n + r.costUsd, 0)
writeJourneyReport(out, { results, log, sandbox: sb.dir, recordedSet: live ? 'live' : recordedSet, costUsd, minutes, extras })
fs.writeFileSync(path.join(out, 'violations.md'), log.toMarkdown())
const extrasFailed = extras ? extras.results.some(c => c.failed.length) || extras.lost.length > 0 : false
if (extras) for (const c of extras.results) if (c.failed.length) c.print()
for (const m of extras?.lost ?? []) console.error(`coverage floor: ${m}`)
const code = alert(log, { summary: summarise(log, { stages: results, costUsd, minutes }), ...(has('no-notify') ? { notify: () => {} } : {}) })
console.log(`report and sandbox: ${out}`)
process.exitCode = code || (extrasFailed ? 1 : 0)
