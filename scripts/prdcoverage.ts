// The sufficiency probe (plan 2026-11-03 PRD sufficiency): fidelity asks "did we keep what the client wrote", this asks "did the client
// write enough". coverage.md has one row per topic, written from source.md only; a pure script checks it, as conversion.md is checked.
import { normalise, prdBlocks, type ChartFinding } from './chartcheck.ts'
import { prdCriteria, prdOrigins } from './prdformat.ts'

export type Topic = { id: string; label: string; agent: boolean; question: string }
// In the order the chart asks them: the first four absent ones join the gap-pass batch.
export const TOPICS: Topic[] = [
  { id: 'failure', label: 'Failure handling', agent: false, question: 'What happens when an input is bad, a dependency is down or a step fails: the error, the exit code or status, what is left unchanged?' },
  { id: 'escalation', label: 'Escalation and hand-off', agent: false, question: 'When does the system hand over to a person, who is that person, and what do they receive?' },
  { id: 'ground-truth', label: 'Ground truth and sample data', agent: false, question: 'Which real or labelled examples (inputs with the expected outputs) define "correct" and will be used to accept the work?' },
  { id: 'security', label: 'Security and access', agent: false, question: 'Who may do what, how are they identified, and what data must never be exposed or logged?' },
  { id: 'rollout', label: 'Rollout and operations', agent: false, question: 'How does this go live, who runs it, how is it monitored, and how is it rolled back?' },
  { id: 'accuracy', label: 'Accuracy benchmark', agent: true, question: 'What accuracy (or other quality measure) must the model reach on the ground-truth set, as a number, to count as done?' },
  { id: 'autonomy', label: 'Autonomy limits', agent: true, question: 'What may the agent do on its own, and what needs a person\'s approval first?' },
  { id: 'fallback', label: 'Confidence and fallback', agent: true, question: 'Below what confidence, or after what failure, does the agent stop and fall back, and to what?' },
  { id: 'budget', label: 'Cost and latency budget', agent: true, question: 'What are the limits on cost per run and time per answer, as numbers?' },
  { id: 'audit', label: 'Audit trail', agent: true, question: 'What must be recorded about each decision (inputs, output, who approved) and for how long?' },
]

export type CoverageRow = { id: string; state: 'covered' | 'answered' | 'open' | 'n/a'; line?: number; quote?: string; ids?: string[]; by?: string; reason?: string }
const ROW = /^\s*[-*]\s+(\S+)\s+(covered|answered|open|n\/a)\b(.*)$/
const COVERED = /^\s+source\.md:(\d+)\s+"(.*)"\s*$/
const NA = /^(?:\s+by\s+(.+?))?(?:\s+[—–-]+\s*(.*))?\s*$/
const SLACK = 3

export const parseCoverage = (text: string): CoverageRow[] => text.replace(/\r\n/g, '\n').split('\n').flatMap((l): CoverageRow[] => {
  const m = ROW.exec(l)
  if (!m) return []
  const id = m[1]!
  const state = m[2] as CoverageRow['state']
  const rest = m[3] ?? ''
  if (state === 'covered') { const c = COVERED.exec(rest); return [{ id, state, line: c ? Number(c[1]) : 0, quote: c?.[2] ?? '' }] }
  if (state === 'answered') return [{ id, state, ids: rest.split(/[\s,]+/).filter(Boolean) }]
  if (state === 'n/a') { const n = NA.exec(rest); return [{ id, state, ...(n?.[1] ? { by: n[1] } : {}), reason: (n?.[2] ?? '').trim() }] }
  return [{ id, state }]
})

export function coverageProblems(i: { source: string; prd: string; coverage: string | null }): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string): number => out.push({ rule, severity: 'block', where, message })
  if (i.coverage === null) { add('coverage-missing', 'coverage', `coverage.md is missing: for each of ${TOPICS.map(t => t.id).join(', ')} write one row from source.md (covered with a quote, answered with ids, open, or n/a with a reason)`); return out }
  for (const l of i.coverage.replace(/\r\n/g, '\n').split('\n')) if (/^\s*[-*]\s+\S/.test(l) && !ROW.test(l)) add('coverage-row', 'coverage', `coverage.md has a row that does not read as \`- <topic> covered|answered|open|n/a ...\`: ${l.trim()}`)
  const rows = parseCoverage(i.coverage)
  const known = new Set(TOPICS.map(t => t.id))
  const seen = new Map<string, number>()
  for (const r of rows) { seen.set(r.id, (seen.get(r.id) ?? 0) + 1); if (!known.has(r.id)) add('coverage-topic', r.id, `"${r.id}" is not a topic; the topics are ${TOPICS.map(t => t.id).join(', ')}`) }
  for (const [id, n] of seen) if (n > 1 && known.has(id)) add('coverage-row', id, `${id} has ${n} rows; write one`)
  for (const t of TOPICS) if (!seen.has(t.id)) add('coverage-row', t.id, `${t.label} (${t.id}) has no row in coverage.md`)
  const blocks = prdBlocks(i.source, { allSections: true })
  const origins = prdOrigins(i.prd, null)
  const defined = new Set(prdCriteria(i.prd).map(c => c.id))
  for (const r of rows.filter(x => known.has(x.id))) {
    const t = TOPICS.find(x => x.id === r.id)!
    if (r.state === 'open') add('coverage-open', r.id, `${t.label}: the source says nothing. Ask the client: ${t.question}`)
    else if (r.state === 'n/a' && !r.reason) add('coverage-reason', r.id, `${r.id} is n/a: add " — <why it does not apply>"`)
    else if (r.state === 'covered') {
      const q = normalise(r.quote ?? '')
      const near = blocks.filter(b => q && b.text.includes(q))
      if (!near.length) add('coverage-quote', r.id, `${r.id}: "${r.quote}" is not in source.md word for word`)
      else if (!near.some(b => Math.abs(b.line - (r.line ?? 0)) <= SLACK || ((r.line ?? 0) >= b.line && (r.line ?? 0) <= b.end))) add('coverage-quote', r.id, `${r.id}: "${r.quote}" is at source.md:${near.map(b => b.line).join(', ')}, not ${r.line}`)
    } else if (r.state === 'answered') {
      if (!r.ids?.length) add('coverage-answer', r.id, `${r.id} is answered but names no criterion: write \`answered AC-n.m\``)
      for (const id of r.ids ?? []) {
        if (!defined.has(id)) add('coverage-answer', r.id, `${r.id} is answered by ${id}, which prd.md does not define`)
        else if (origins.get(id) !== 'confirmed') add('coverage-answer', r.id, `${r.id} is answered by ${id}, which no person confirmed: it needs "(confirmed at chart by <who>)", not the agent's own value`)
      }
    }
  }
  return out
}

// What goes back to the client: one entry per open topic, in the chart's order.
export function clientGaps(coverage: string): string {
  const open = new Set(parseCoverage(coverage).filter(r => r.state === 'open').map(r => r.id))
  const rows = TOPICS.filter(t => open.has(t.id))
  return ['# Gaps in the PRD (generated by rig from coverage.md)', '',
    ...(rows.length ? ['The PRD does not say the following. Each needs an answer from the client before the sprint can be approved.', '', ...rows.map(t => `- **${t.label}** (${t.id}): ${t.question}`)] : ['Nothing is missing.']), ''].join('\n')
}
