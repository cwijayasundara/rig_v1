// The chart-quality eval (outer-loop spec 2026-10-17 §10): can the architect turn a PRD into a chart that traces to it?
// node eval/chart.mjs [--arms architect-opus,architect-sonnet] [--runs 3] [--cap-run 3] [--out DIR] [--results FILE] [--dry]
// Live runs cost money and are started by a person; --dry replays the known-good chart at $0 and never writes under eval/results.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { createSessions } from '../tests/e2e/driver/live.mjs'
import { totals } from '../tests/e2e/assert/process.mjs'
import { writeFixture } from '../tests/e2e/phases/s6-chart.mjs'
import { setupRig } from './setup.mjs'
import { MODELS } from './arms.mjs'
import { EVAL_ALLOW, resultsAllowed, arg, mean } from './lib/cli.mjs'
import { parseIntent } from '../scripts/chartcheck.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const KEY = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/chart/sprint-a.json'), 'utf8'))
export const CHART_ARMS = [
  { id: 'architect-opus', model: MODELS.opus, rig: true, policy: 'continuous' },
  { id: 'architect-sonnet', model: MODELS.sonnet, rig: true, policy: 'continuous' },
]

const share = (n, of) => (of ? n / of : 0)
// Scores one generated chart against the answer key: findings are `chart check --json`, intents the parsed intent files.
export function scoreChart(key, findings, intents) {
  const defined = new Set(key.requirements)
  const cited = new Set(intents.flatMap(i => i.prd))
  const boundary = intents.filter(i => i.kind === 'boundary')
  const invented = i => !i.prd.length || i.prd.some(r => !defined.has(r)) || i.behaviours.some(b => !b.reqs.length || b.reqs.some(r => !defined.has(r)))
  return {
    recall: share(key.requirements.filter(r => cited.has(r)).length, key.requirements.length),
    inventedIntentRate: share(intents.filter(invented).length, intents.length),
    sizeCompliance: share(intents.filter(i => i.estimateDays === 1 || i.estimateDays === 2).length, intents.length),
    dependenciesValid: !findings.some(f => f.rule === 'depends'),
    designCoverage: share(intents.filter(i => i.design > 0).length, intents.length),
    failureCoverage: boundary.length ? share(boundary.filter(i => i.failures.length).length, boundary.length) : 1,
  }
}

export function renderChartTable(rows) {
  const head = '| arm | runs | recall | invented | size ok | deps valid | design | failure | USD (mean) |\n|---|---|---|---|---|---|---|---|---|'
  const arms = [...new Set(rows.map(r => r.arm))]
  return [head, ...arms.map(a => {
    const rs = rows.filter(r => r.arm === a)
    return `| ${a} | ${rs.length} | ${mean(rs.map(r => r.recall))} | ${mean(rs.map(r => r.inventedIntentRate))} | ${mean(rs.map(r => r.sizeCompliance))} | ${rs.filter(r => r.dependenciesValid).length}/${rs.length} | ${mean(rs.map(r => r.designCoverage))} | ${mean(rs.map(r => r.failureCoverage))} | $${mean(rs.map(r => r.usd)).toFixed(2)} |`
  })].join('\n')
}

export async function runChartOne(arm, n, { dry, out, capRunUsd }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  const sessions = dry ? null : createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model, allow: EVAL_ALLOW, env: { CLAUDE_CODE_SUBAGENT_MODEL: arm.model } })
  const row = { arm: arm.id, run: n, model: arm.model, at: new Date().toISOString() }
  let intents = []
  let findings = []
  try {
    await setupRig(sb, arm, { dry })
    sb.write('.rig/product/sprints/sprint-1/prd.md', fs.readFileSync(path.join(ROOT, KEY.prd), 'utf8'))
    sb.commitAll('docs: sprint 1 requirements')
    if (dry) writeFixture(sb)
    else sessions.run('chart', '/rig-chart 1', { withPlugin: false })
    findings = JSON.parse(sb.sdlc(['chart', 'check', '1', '--cases', '--json']).stdout || '[]')
    const dir = path.join(sb.dir, '.rig/product/sprints/sprint-1/intents')
    intents = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => parseIntent(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8'))) : []
  } catch (err) {
    row.error = String(err?.message ?? err).split('\n')[0]
  }
  const t = sessions ? totals(sessions.sessions) : { costUsd: 0, inputTokens: 0, outputTokens: 0 }
  return {
    ...row, ...scoreChart(KEY, findings, intents), intents: intents.length, blocking: findings.filter(f => f.severity === 'block').length,
    inputTokens: t.inputTokens, outputTokens: t.outputTokens, usd: Number(t.costUsd.toFixed(4)), minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)),
  }
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-chart-'))))
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(import.meta.dirname, 'results', `${new Date().toISOString().slice(0, 10)}-chart.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const wanted = (arg('arms') ?? 'all').split(',')
  const arms = CHART_ARMS.filter(a => wanted.includes('all') || wanted.includes(a.id))
  fs.mkdirSync(path.dirname(results), { recursive: true })
  const rows = []
  for (let n = 1; n <= Number(arg('runs', 3)); n++) {
    for (const arm of arms) {
      const row = await runChartOne(arm, n, { dry, out, capRunUsd: Number(arg('cap-run', 3)) })
      rows.push(row)
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${arm.id} #${n}: recall ${row.recall}, invented ${row.inventedIntentRate}, size ok ${row.sizeCompliance}, design ${row.designCoverage}, failure ${row.failureCoverage}, $${row.usd}${row.error ? ` (${row.error})` : ''}`)
    }
  }
  console.log(`\n${renderChartTable(rows)}\n\n${results}`)
}
