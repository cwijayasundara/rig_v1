// The chart-quality eval (outer-loop spec 2026-10-17 §10): can the architect turn a PRD into a chart that traces to it?
// node eval/chart.mjs [--key sprint-a|sprint-b] [--arms architect-opus,architect-sonnet] [--runs 3] [--cap-run 3] [--out DIR] [--results FILE] [--dry]
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
import { parseIntent, parseLedger, normalise } from '../scripts/chartcheck.ts'
import { parseMap, prdCriteria } from '../scripts/prdformat.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
// An answer key under fixtures/chart/: sprint-a (the default, with a known-good chart for --dry) or sprint-b (rules stated in prose).
export const loadKey = (name = 'sprint-a') => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `fixtures/chart/${name}.json`), 'utf8'))
const KEY = loadKey()
export const CHART_ARMS = [
  { id: 'architect-opus', model: MODELS.opus, rig: true, policy: 'continuous' },
  { id: 'architect-sonnet', model: MODELS.sonnet, rig: true, policy: 'continuous' },
]

const share = (n, of) => (of ? n / of : 0)
// Scores one generated chart against the answer key: findings are `chart check --json`, intents the parsed intent files, ledger the
// parsed requirements.md rows. A key with `rules` also scores whether each was quoted, cited, and kept by the behaviour citing it;
// with `conversion` ({ map, criteria } of a converted PRD) it follows each rule through the map into the criterion it became.
export function scoreChart(key, findings, intents, ledger = [], conversion = null) {
  const defined = new Set(key.requirements)
  const cited = new Set(intents.flatMap(i => i.prd))
  const boundary = intents.filter(i => i.kind === 'boundary')
  const invented = i => !i.prd.length || i.prd.some(r => !defined.has(r)) || i.behaviours.some(b => !b.reqs.length || b.reqs.some(r => !defined.has(r)))
  const rules = conversion ? key.rules?.map(k => {
    const row = conversion.map.find(m => normalise(m.quote).includes(normalise(k.quote)) || normalise(k.quote).includes(normalise(m.quote)))
    const became = conversion.criteria.filter(c => row?.ids.includes(c.id))
    const cited = intents.flatMap(i => i.behaviours).some(b => (b.rules ?? []).some(id => row?.ids.includes(id)))
    return { quoted: Boolean(row), cited, kept: became.length > 0 && k.mustKeep.every(re => became.some(c => new RegExp(re, 'i').test(c.text))) }
  }) : key.rules?.map(k => {
    const row = ledger.find(l => normalise(l.quote).includes(normalise(k.quote)))
    const citing = row ? intents.flatMap(i => i.behaviours).filter(b => (b.rules ?? []).some(id => id === row.id || id === row.alias)) : []
    return { quoted: Boolean(row), cited: citing.length > 0, kept: k.mustKeep.every(re => citing.some(b => new RegExp(re, 'i').test(b.text))) }
  })
  const ruleScores = rules ? { rulesQuoted: share(rules.filter(x => x.quoted).length, rules.length), rulesCited: share(rules.filter(x => x.cited).length, rules.length), constraintsKept: share(rules.filter(x => x.kept).length, rules.length) } : {}
  return {
    ...ruleScores,
    recall: share(key.requirements.filter(r => cited.has(r)).length, key.requirements.length),
    inventedIntentRate: share(intents.filter(invented).length, intents.length),
    sizeCompliance: share(intents.filter(i => i.estimateDays === 1 || i.estimateDays === 2).length, intents.length),
    dependenciesValid: !findings.some(f => f.rule === 'depends'),
    designCoverage: share(intents.filter(i => i.design > 0).length, intents.length),
    failureCoverage: boundary.length ? share(boundary.filter(i => i.failures.length).length, boundary.length) : 1,
  }
}

export function renderChartTable(rows) {
  const ruled = rows.some(r => r.rulesQuoted !== undefined)
  const head = `| arm | runs | recall | invented | size ok | deps valid | design | failure |${ruled ? ' rules quoted | rules cited | kept |' : ''} USD (mean) |\n|---|---|---|---|---|---|---|---|${ruled ? '---|---|---|' : ''}---|`
  const arms = [...new Set(rows.map(r => r.arm))]
  return [head, ...arms.map(a => {
    const rs = rows.filter(r => r.arm === a)
    return `| ${a} | ${rs.length} | ${mean(rs.map(r => r.recall))} | ${mean(rs.map(r => r.inventedIntentRate))} | ${mean(rs.map(r => r.sizeCompliance))} | ${rs.filter(r => r.dependenciesValid).length}/${rs.length} | ${mean(rs.map(r => r.designCoverage))} | ${mean(rs.map(r => r.failureCoverage))} |${ruled ? ` ${mean(rs.map(r => r.rulesQuoted ?? 0))} | ${mean(rs.map(r => r.rulesCited ?? 0))} | ${mean(rs.map(r => r.constraintsKept ?? 0))} |` : ''} $${mean(rs.map(r => r.usd)).toFixed(2)} |`
  })].join('\n')
}

export async function runChartOne(arm, n, { dry, out, capRunUsd, key = KEY }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  const sessions = dry ? null : createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model, allow: EVAL_ALLOW, env: { CLAUDE_CODE_SUBAGENT_MODEL: arm.model } })
  const row = { arm: arm.id, run: n, model: arm.model, at: new Date().toISOString() }
  let intents = []
  let findings = []
  let ledger = []
  let conversion = null
  try {
    await setupRig(sb, arm, { dry })
    sb.write('.rig/product/sprints/sprint-1/prd.md', fs.readFileSync(path.join(ROOT, key.prd), 'utf8'))
    sb.commitAll('docs: sprint 1 requirements')
    if (dry) writeFixture(sb)
    else {
      sessions.run('chart', '/rig-chart 1', { withPlugin: false })
      // A converted PRD stops the chart for a person's approval; the eval plays the person, as S6 does for the chart.
      if (/^(missing|stale)/.test(sb.sdlc(['prd', 'status', '1']).stdout)) {
        sb.sdlc(['approve', 'prd-1', '--by', 'eval'], { human: true })
        sessions.run('chart-after-prd', '/rig-chart 1', { withPlugin: false })
      }
    }
    findings = JSON.parse(sb.sdlc(['chart', 'check', '1', '--cases', '--json']).stdout || '[]')
    const dir = path.join(sb.dir, '.rig/product/sprints/sprint-1/intents')
    const ledgerFile = path.join(sb.dir, '.rig/product/sprints/sprint-1/requirements.md')
    ledger = fs.existsSync(ledgerFile) ? parseLedger(fs.readFileSync(ledgerFile, 'utf8')) : []
    const sprint = path.join(sb.dir, '.rig/product/sprints/sprint-1')
    const read = f => fs.readFileSync(path.join(sprint, f), 'utf8')
    conversion = fs.existsSync(path.join(sprint, 'conversion.md')) ? { map: parseMap(read('conversion.md')), criteria: prdCriteria(read('prd.md')) } : null
    intents = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => parseIntent(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8'))) : []
  } catch (err) {
    row.error = String(err?.message ?? err).split('\n')[0]
  }
  const t = sessions ? totals(sessions.sessions) : { costUsd: 0, inputTokens: 0, outputTokens: 0 }
  return {
    ...row, ...scoreChart(key, findings, intents, ledger, conversion), intents: intents.length, blocking: findings.filter(f => f.severity === 'block').length,
    inputTokens: t.inputTokens, outputTokens: t.outputTokens, usd: Number(t.costUsd.toFixed(4)), minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)),
  }
}

if (process.argv[1] === import.meta.filename) {
  const dry = process.argv.includes('--dry')
  const keyName = arg('key', 'sprint-a')
  if (dry && keyName !== 'sprint-a') { console.error(`no known-good chart for ${keyName}: --dry replays sprint-a only`); process.exit(2) }
  const key = loadKey(keyName)
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
      const row = await runChartOne(arm, n, { dry, out, capRunUsd: Number(arg('cap-run', 3)), key })
      rows.push(row)
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${arm.id} #${n}: recall ${row.recall}, invented ${row.inventedIntentRate}, size ok ${row.sizeCompliance}, design ${row.designCoverage}, failure ${row.failureCoverage}, $${row.usd}${row.error ? ` (${row.error})` : ''}`)
    }
  }
  console.log(`\n${renderChartTable(rows)}\n\n${results}`)
}
