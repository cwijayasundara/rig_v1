// The journey's violation log: one JSON line per violation, matched against the person's triage decisions.
import fs from 'node:fs'
import path from 'node:path'

// { "<id>": { decision: 'fix' | 'accept' | 'wontfix', reason? } }. Only the person edits the file.
export function loadTriage(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
}

const QUIET = new Set(['accept', 'wontfix'])

export function createViolationLog({ dir, run, sandbox, triage = {} }) {
  const list = []
  const file = path.join(dir, 'violations.jsonl')
  const quiet = v => QUIET.has(triage[v.id]?.decision)
  return {
    dir,
    add({ stage, item, severity, evidence, note, session, area }) {
      const v = { id: item, stage, item, severity, evidence, note, sandbox, session, area, run }
      list.push(v)
      fs.mkdirSync(dir, { recursive: true })
      fs.appendFileSync(file, JSON.stringify(v) + '\n')
      return v
    },
    isQuiet: id => QUIET.has(triage[id]?.decision),
    all: () => [...list],
    open: () => list.filter(v => !quiet(v)),
    accepted: () => list.filter(quiet),
    toMarkdown() {
      const row = v => `- **${v.id}** (${v.severity}, ${v.stage}) ${v.note}\n  - evidence: ${v.evidence}\n  - session: ${v.session}; area: ${v.area}`
      const acc = list.filter(quiet)
      const open = list.filter(v => !quiet(v))
      return `# Violations (run ${run})\n\nSandbox: ${sandbox}\n\n## Open (${open.length})\n\n${open.map(row).join('\n') || 'none'}\n\n## Accepted (${acc.length})\n\n${acc.map(v => `${row(v)}\n  - triage: ${triage[v.id].decision}${triage[v.id].reason ? ` — ${triage[v.id].reason}` : ''}`).join('\n') || 'none'}\n`
    },
  }
}
