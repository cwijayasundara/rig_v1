import fs from 'node:fs'
import path from 'node:path'

export function writeReport(out, list) {
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(list.map(c => c.toJSON()), null, 2))
  const md = list.map(c => `## ${c.title}\n\n${c.results.map(r => `- ${r.status} ${r.name}${r.why ? ` (${r.why})` : ''}`).join('\n')}\n`).join('\n')
  fs.writeFileSync(path.join(out, 'report.md'), `# e2e report\n\n${md}`)
}

// The journey's report: stages, every verdict with its evidence, spend and time, then the optional scripted-only group.
export function writeJourneyReport(out, { results, log, sandbox, recordedSet, costUsd, minutes, extras }) {
  fs.mkdirSync(out, { recursive: true })
  const stage = r => `## ${r.stage}: ${r.status}\n\n${r.checks.results.map(c => `- ${c.status} ${c.name}${c.why ? ` (${c.why})` : ''}`).join('\n')}${r.verdicts.length ? `\n\n${r.verdicts.map(v => `- ${v.verdict.toUpperCase()} ${v.id} [${v.severity}] ${v.note} — ${v.evidence}`).join('\n')}` : ''}\n\n$${r.costUsd.toFixed(2)}, ${r.minutes.toFixed(1)} min\n`
  const md = [`# journey report`, '', `Sandbox: ${sandbox}`, `Driver: ${recordedSet}`, `Spend $${costUsd.toFixed(2)}, ${minutes.toFixed(1)} min`, `Violations: ${log.open().length} open, ${log.accepted().length} accepted`, '', ...results.map(stage),
    ...(extras ? ['## scripted-only extras', '', ...extras.results.map(c => `- ${c.title}: ${c.results.length - c.failed.length}/${c.results.length}`)] : [])].join('\n')
  fs.writeFileSync(path.join(out, 'report.md'), md)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ results: results.map(r => ({ stage: r.stage, status: r.status, checks: r.checks.toJSON(), verdicts: r.verdicts, costUsd: r.costUsd, minutes: r.minutes })), violations: log.all(), extras: extras?.results.map(c => c.toJSON()) }, null, 2))
}
