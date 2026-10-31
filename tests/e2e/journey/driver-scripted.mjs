// The $0 driver: replays recorded stage snapshots, inspector verdicts and reviewer decisions through the same orchestrator.
// A set with gates.json (the synthetic set) replays the gate results too; a recorded set runs the real gates on real snapshots.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspect } from './inspector.mjs'
import { STAGES } from './stages.mjs'

const EXCLUDE = ['.venv', '__pycache__', 'node_modules', '.tmp', '.mypy_cache', '.pytest_cache', '.ruff_cache']
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const sprintOf = p => (/sprint-(\d)/.exec(p) ?? [])[1] === '2' ? 2 : 1
const must = (r, what) => { if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || '').toString().trim().split('\n')[0]}`) }

export function recordStage({ sb, stage, verdicts, decision, recordedDir }) {
  fs.mkdirSync(path.join(recordedDir, 'snapshots'), { recursive: true })
  fs.mkdirSync(path.join(recordedDir, 'verdicts'), { recursive: true })
  must(spawnSync('tar', ['czf', path.join(recordedDir, 'snapshots', `${stage}.tar.gz`), ...EXCLUDE.map(e => `--exclude=${e}`), '-C', sb.dir, '.']), 'tar')
  fs.writeFileSync(path.join(recordedDir, 'verdicts', `${stage}.json`), JSON.stringify({ stage, items: verdicts }, null, 1))
  if (decision) {
    const file = path.join(recordedDir, 'decisions.json')
    fs.writeFileSync(file, JSON.stringify({ ...(readJson(file) ?? {}), [stage]: decision }, null, 1))
  }
}

// driver, inspector, reviewer and stages for runJourney, all replaying `recordedDir`.
export function scriptedKit({ sb, recordedDir }) {
  const unpack = stage => {
    const snap = path.join(recordedDir, 'snapshots', `${stage}.tar.gz`)
    if (!fs.existsSync(snap)) return
    for (const e of fs.readdirSync(sb.dir)) fs.rmSync(path.join(sb.dir, e), { recursive: true, force: true })
    must(spawnSync('tar', ['xzf', snap, '-C', sb.dir]), 'untar')
  }
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
  return { driver, inspector, reviewer, stages }
}
