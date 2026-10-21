// The results table of spec §9 from one or more runner JSONL files: node eval/report.mjs <results.jsonl...> [--out FILE]
import fs from 'node:fs'
import { ARMS } from './arms.mjs'

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = xs => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null)

export function summarize(rows) {
  // The same row read twice (a file passed twice, a copy) counts once; two real runs differ in their start time.
  const seen = new Set()
  const unique = rows.filter(r => { const k = `${r.arm}|${r.run}|${r.at}`; if (seen.has(k)) return false; seen.add(k); return true })
  return ARMS.map(({ id }) => {
    const rs = unique.filter(r => r.arm === id)
    return {
      arm: id, runs: rs.length, accepted: rs.filter(r => r.accepted).length,
      checksMean: mean(rs.map(r => r.checks ?? 0)), inMedian: median(rs.map(r => r.inputTokens ?? 0)), outMedian: median(rs.map(r => r.outputTokens ?? 0)),
      usdMean: mean(rs.map(r => r.usd ?? 0)), usdTotal: rs.reduce((n, r) => n + (r.usd ?? 0), 0), minutesMedian: median(rs.map(r => r.minutes ?? 0)),
      tamper: rs.reduce((n, r) => n + (r.tamper?.testTamper ?? 0) + (r.tamper?.suppression ?? 0), 0),
      layerViolations: rs.reduce((n, r) => n + (r.layerViolations ?? 0), 0),
      unjudged: rs.reduce((n, r) => n + (r.tamper?.unjudged ?? 0), 0),
      models: rs.reduce((acc, r) => { for (const [m, v] of Object.entries(r.models ?? {})) acc[m] = (acc[m] ?? 0) + (v.costUsd ?? 0); return acc }, {}),
      errors: rs.filter(r => r.error).map(r => r.error),
    }
  })
}

const dash = (v, f = x => String(x)) => (v === null || v === undefined ? '–' : f(v))
const rate = a => (a.runs ? a.accepted / a.runs : null)

// Which models did the work, by cost: a rig arm also runs its evaluator agent on its own model (spec §3.5).
const mix = summary => {
  const lines = summary.filter(a => Object.keys(a.models).length).map(a => {
    const total = Object.values(a.models).reduce((n, v) => n + v, 0)
    return `- ${a.arm}: ${Object.entries(a.models).sort((x, y) => y[1] - x[1]).map(([m, v]) => `${m} ${total ? Math.round((v / total) * 100) : 0}%`).join(', ')}`
  })
  return lines.length ? ['Model mix by cost:', ...lines, ''] : []
}

export function renderMarkdown(summary, { date, files }) {
  const base = rate(summary.find(a => a.arm === 'haiku-bare') ?? { runs: 0 })
  const lift = a => (a.arm === 'haiku-bare' ? 'baseline' : rate(a) === null || base === null ? '–' : `${rate(a) >= base ? '+' : ''}${Math.round((rate(a) - base) * 100)} pts`)
  const rows = summary.map(a => `| ${a.arm} | ${a.accepted}/${a.runs} | ${lift(a)} | ${dash(a.checksMean, x => x.toFixed(1))}/3 | ${dash(a.inMedian, Math.round)} | ${dash(a.outMedian, Math.round)} | ${dash(a.usdMean, x => '$' + x.toFixed(2))} | ${a.runs ? (a.accepted ? '$' + (a.usdTotal / a.accepted).toFixed(2) : 'none accepted') : '–'} | ${dash(a.minutesMedian, x => x.toFixed(1))} | ${a.runs ? `${a.tamper}${a.unjudged ? ` (+${a.unjudged} unjudged)` : ''}` : '–'} | ${a.runs ? a.layerViolations : '–'} |`)
  const thin = summary.filter(a => a.runs && a.runs < 3).map(a => a.arm)
  const errs = summary.filter(a => a.errors.length).map(a => `${a.arm} ${a.errors.length} (${[...new Set(a.errors)].slice(0, 2).join('; ')})`)
  return [
    `# Eval results ${date}`, '',
    `Task: the shop brief (B1–B6), scored by the hidden acceptance (npm test, import, HTTP). Spec §9. Source: ${files.join(', ')}.`, '',
    '| arm | accepted | lift vs haiku-bare | checks (mean) | input tokens (median) | output tokens (median) | USD (mean) | USD per accepted | minutes (median) | tamper findings | layer violations |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows, '',
    errs.length ? `errors: ${errs.join(', ')}` : 'errors: none', '',
    ...(thin.length ? [`n < 3 for ${thin.join(', ')}: direction only, not a result. Negative and null results are published as they came.`, ''] : []),
    ...mix(summary), 
    'Rule (spec §9): a sensor, guide or gate with no lift over haiku-bare after two passes is a candidate for removal. These arms measure rig as a whole and its two policies; per-component lift needs ablation arms.',
    '',
  ].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--out')
  const outFile = i >= 0 ? args[i + 1] : null
  const files = args.filter((a, k) => i < 0 || (k !== i && k !== i + 1))
  const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)))
  const date = (files[0]?.match(/\d{4}-\d{2}-\d{2}/) ?? [new Date().toISOString().slice(0, 10)])[0]
  const md = renderMarkdown(summarize(rows), { date, files })
  if (outFile) fs.writeFileSync(outFile, md)
  else process.stdout.write(md)
}
