// The $0 driver: replays recorded stage snapshots, inspector verdicts and reviewer decisions through the same orchestrator.
// A set with gates.json (the synthetic set) replays the gate results too; a recorded set runs the real gates on real snapshots.
import fs from 'node:fs'
import path from 'node:path'
import { inspect } from './inspector.mjs'
import { STAGES } from './stages.mjs'
import { packSnapshot, unpackSnapshot } from './snapshot.mjs'

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const sprintOf = p => (/sprint-(\d)/.exec(p) ?? [])[1] === '2' ? 2 : 1

export function recordStage({ sb, stage, verdicts, decision, recordedDir, snapshot = true }) {
  fs.mkdirSync(path.join(recordedDir, 'verdicts'), { recursive: true })
  if (snapshot) packSnapshot({ dir: sb.dir, recordedDir, stage })
  fs.writeFileSync(path.join(recordedDir, 'verdicts', `${stage}.json`), JSON.stringify({ stage, items: verdicts }, null, 1))
  if (decision) {
    const file = path.join(recordedDir, 'decisions.json')
    fs.writeFileSync(file, JSON.stringify({ ...(readJson(file) ?? {}), [stage]: decision }, null, 1))
  }
}

// driver, inspector, reviewer and stages for runJourney, all replaying `recordedDir`.
export function scriptedKit({ sb, recordedDir }) {
  const unpack = stage => { unpackSnapshot({ dir: sb.dir, recordedDir, stage }) }
  let sprint = 1
  const driver = {
    spentUsd: () => 0,
    async init() { unpack('J0') },
    async chart(n) { unpack(n === 1 ? 'J1' : 'J4') },
    async approveChart(n) { unpack(n === 1 ? 'J2' : 'J5') },
    async startIntent(p) { sprint = sprintOf(p); return path.basename(p, '.md') },
    async buildIntent() { unpack(sprint === 1 ? 'J3' : 'J6') },
  }
  const inspector = {
    inspect: ({ sb: s, stage, rubric, context }) => inspect({
      sb: s, stage, rubric, context,
      launch: async () => ({ text: fs.existsSync(path.join(recordedDir, 'verdicts', `${stage}.json`)) ? fs.readFileSync(path.join(recordedDir, 'verdicts', `${stage}.json`), 'utf8') : '', costUsd: 0 }),
    }),
  }
  const decisions = readJson(path.join(recordedDir, 'decisions.json')) ?? {}
  const reviewer = { review: async ({ stage }) => ({ decision: decisions[stage] ?? 'approve', reasons: decisions[stage] === 'reject' ? ['recorded reject'] : [], costUsd: 0 }) }
  const gates = readJson(path.join(recordedDir, 'gates.json'))
  const stages = gates
    ? STAGES.map(s => ({ ...s, gate: async c => { await c.check(`${s.id} gate (replayed)`, () => gates[s.id] === 'pass' || 'recorded gate failed') } }))
    : STAGES
  // The synthetic set has no repo to ask: one stand-in intent per build stage. A recorded set asks the real sdlc.
  const built = new Set()
  const ready = gates ? stage => (built.has(stage.id) ? [] : (built.add(stage.id), [{ slug: 'synthetic', sprint: stage.sprint }])) : null
  return { driver, inspector, reviewer, stages, ...(ready ? { ready } : {}) }
}
