// The regression gate (harness readiness 3.2): compare an eval run's results with a committed baseline and fail when an arm got worse.
// node eval/gate.mjs <results.jsonl...> [--baseline eval/baseline.json] [--variant links]
// baseline.json: { "<variant>": { "<arm>": { "minRuns": 3, "minAcceptedRate": 0.5, "maxUsdPerAccepted": 1.0 } } }. An arm with no baseline is
// listed as not enforced, never silently passed: a gate that checks nothing must say so (the same rule as an inert sensor).
import fs from 'node:fs'
import path from 'node:path'

export function gate(rows, baseline, variant = 'default') {
  const want = baseline?.[variant] ?? {}
  const arms = [...new Set(rows.map(r => r.arm))]
  const lines = [], failures = [], unenforced = []
  for (const arm of arms) {
    const rs = rows.filter(r => r.arm === arm && !r.failed)
    const b = want[arm]
    const accepted = rs.filter(r => r.accepted).length
    const rate = rs.length ? accepted / rs.length : null
    const usdPer = accepted ? rs.reduce((n, r) => n + (r.usd ?? 0), 0) / accepted : null
    lines.push(`${arm}: ${accepted}/${rs.length} accepted${usdPer === null ? '' : `, $${usdPer.toFixed(2)} per accepted`}`)
    if (!b) { unenforced.push(arm); continue }
    if (rs.length < (b.minRuns ?? 1)) { failures.push(`${arm}: ${rs.length} run(s), the baseline needs ${b.minRuns}; this proves nothing`); continue }
    if (b.minAcceptedRate !== undefined && rate < b.minAcceptedRate) failures.push(`${arm}: accepted ${Math.round(rate * 100)}%, below the baseline ${Math.round(b.minAcceptedRate * 100)}%`)
    if (b.maxUsdPerAccepted !== undefined && (usdPer === null || usdPer > b.maxUsdPerAccepted)) failures.push(`${arm}: ${usdPer === null ? 'nothing accepted' : `$${usdPer.toFixed(2)} per accepted`}, over the baseline $${b.maxUsdPerAccepted.toFixed(2)}`)
  }
  for (const arm of Object.keys(want)) if (!arms.includes(arm)) failures.push(`${arm}: has a baseline but no results in this run`)
  return { lines, failures, unenforced, pass: !failures.length }
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2)
  const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null }
  const skip = new Set(['--baseline', opt('baseline'), '--variant', opt('variant')])
  const files = args.filter(a => !skip.has(a))
  const baselineFile = path.resolve(opt('baseline') ?? path.join(import.meta.dirname, 'baseline.json'))
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : {}
  const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)))
  const r = gate(rows, baseline, opt('variant') ?? 'default')
  console.log([...r.lines, ...(r.unenforced.length ? [`not enforced (no baseline): ${r.unenforced.join(', ')}`] : []), ...r.failures.map(f => `REGRESSION ${f}`), r.pass ? 'gate: pass' : 'gate: FAIL'].join('\n'))
  process.exitCode = r.pass ? 0 : 1
}
