// The sprint chart's trace rules (outer-loop spec 2026-10-17 §7): parse the PRD, the intents and the test cases, and report
// where the chain requirement → intent → behaviour → test case breaks. Pure over text; no repo, no model.
import { frontmatter } from './core.ts'
import { openQuestions } from './model.ts'

export type Behaviour = { id: string; reqs: string[]; text: string }
export type Intent = {
  slug: string; sprint: number | null; prd: string[]; depends: string[]; estimateDays: number | null; kind: 'boundary' | 'internal' | null
  behaviours: Behaviour[]; contractFiles: string[]; exampleFiles: string[]; openQuestions: string[]
}
export type TestCase = { id: string; reqs: string[]; intent: string; behaviour: string; level: string; data: string }
export type ChartFinding = { rule: string; severity: 'block' | 'report'; where: string; message: string }

const REQ = /\bN?FR-\d+\b/g
const SPRINT_DAYS = 10
const MAX_DAYS = 2

// Frontmatter lists are flow style on one line; brackets, quotes and a trailing `.md` are tolerated.
export const listField = (v: string | undefined): string[] =>
  (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '').replace(/\.md$/, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
const section = (text: string, heading: string): string =>
  new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm').exec(text)?.[1] ?? ''
const whole = (v: string | undefined): number | null => (/^\d{1,4}$/.test(v ?? '') ? Number(v) : null)

// Requirement ids the PRD defines: a heading `### FR-3: ...` or a table row `| NFR-2 | ...`. Ids in prose are references.
export function prdIds(text: string): string[] {
  const ids = new Set<string>()
  for (const l of text.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^#{2,4}\s+(N?FR-\d+)\b/.exec(l) ?? /^\|\s*(N?FR-\d+)\s*\|/.exec(l)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort()
}

// `- B1 (FR-3, NFR-1): text` lines under `## Behaviours`, in an intent or a change's spec.md.
export function parseBehaviours(text: string): Behaviour[] {
  return section(text.replace(/\r\n/g, '\n'), 'Behaviours').split('\n').flatMap((l): Behaviour[] => {
    const m = /^\s*[-*]\s+(B\d+)\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/.exec(l)
    return m?.[1] ? [{ id: m[1], reqs: (m[2] ?? '').match(REQ) ?? [], text: (m[3] ?? '').trim() }] : []
  })
}

export function parseIntent(slug: string, raw: string): Intent {
  const text = raw.replace(/\r\n/g, '\n')
  const { data } = frontmatter(text)
  const iface = section(text, 'Interfaces').split('\n')
  const files = (label: string): string[] => iface.flatMap(l => { const m = new RegExp(`^\\s*[-*]?\\s*${label}:\\s*(\\S+)`).exec(l); return m?.[1] ? [m[1]] : [] })
  return {
    slug, sprint: whole(data.sprint), prd: listField(data.prd), depends: listField(data.depends), estimateDays: whole(data.estimate_days),
    kind: data.kind === 'boundary' || data.kind === 'internal' ? data.kind : null,
    behaviours: parseBehaviours(text), contractFiles: files('Contract'), exampleFiles: files('Example'), openQuestions: openQuestions(text),
  }
}

// cases.md rows: | ID | Requirement | Intent | Behaviour | Level | Data | Expected |
export function parseCases(text: string): TestCase[] {
  return text.replace(/\r\n/g, '\n').split('\n').map(l => l.split('|').map(c => c.trim())).filter(c => /^TC-\d+$/.test(c[1] ?? '')).map(c => ({
    id: c[1] ?? '', reqs: (c[2] ?? '').match(REQ) ?? [], intent: (c[3] ?? '').replace(/\.md$/, ''), behaviour: c[4] ?? '', level: c[5] ?? '', data: c[6] || '-',
  }))
}

// Slugs on a dependency cycle (a self-dependency is one), found by asking whether each can reach itself.
function cyclic(intents: Intent[]): Set<string> {
  const deps = new Map(intents.map(i => [i.slug, i.depends]))
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean =>
    (deps.get(from) ?? []).some(d => d === target || (!seen.has(d) && (seen.add(d), reaches(d, target, seen))))
  return new Set(intents.filter(i => reaches(i.slug, i.slug)).map(i => i.slug))
}

export function traceReport(i: { prd: string; intents: Intent[]; cases: TestCase[] | null; exists: (path: string) => boolean; engineers?: number }): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string, severity: 'block' | 'report' = 'block'): number => out.push({ rule, severity, where, message })
  const defined = new Set(prdIds(i.prd))
  const slugs = new Set(i.intents.map(t => t.slug))
  const cycle = cyclic(i.intents)
  for (const q of openQuestions(i.prd)) add('open-question', 'prd', `the PRD has an open question: ${q}`)
  for (const t of i.intents) {
    if (!t.prd.length || !t.behaviours.length || t.behaviours.some(b => !b.reqs.length)) add('intent-untraced', t.slug, `${t.slug} has a behaviour or an intent that cites no PRD requirement`)
    const cited = [...t.prd, ...t.behaviours.flatMap(b => b.reqs)]
    for (const id of new Set(cited)) if (!defined.has(id)) add('unknown-id', t.slug, `${t.slug} cites ${id}, which the PRD does not define`)
    if (t.estimateDays === null || t.estimateDays > MAX_DAYS || t.estimateDays < 1) add('estimate', t.slug, `${t.slug} needs estimate_days of 1 or ${MAX_DAYS} (split anything larger)`)
    if (t.kind === 'boundary' && (!t.contractFiles.length || !t.exampleFiles.length)) add('boundary-contract', t.slug, `${t.slug} is a boundary intent: name a Contract: file and an Example: file under ## Interfaces`)
    for (const q of t.openQuestions) add('open-question', t.slug, `${t.slug} has an open question: ${q}`)
    for (const d of t.depends) if (!slugs.has(d)) add('depends', t.slug, `${t.slug} depends on ${d}, which is not an intent`)
    if (cycle.has(t.slug)) add('depends', t.slug, `${t.slug} is on a dependency cycle`)
  }
  const covered = new Set(i.intents.flatMap(t => t.prd))
  for (const id of defined) if (!covered.has(id)) add('req-uncovered', id, `${id} has no intent`)
  if (i.cases) {
    const byIntent = new Map(i.intents.map(t => [t.slug, new Set(t.behaviours.map(b => b.id))]))
    for (const c of i.cases) {
      if (!c.reqs.length) add('case-untraced', c.id, `${c.id} cites no PRD requirement`)
      for (const id of c.reqs) if (!defined.has(id)) add('unknown-id', c.id, `${c.id} cites ${id}, which the PRD does not define`)
      if (!byIntent.get(c.intent)?.has(c.behaviour)) add('case-orphan', c.id, `${c.id} names ${c.intent}#${c.behaviour}, which does not exist`)
      if (c.data !== '-' && !i.exists(c.data)) add('case-data-missing', c.id, `${c.id} data ${c.data} does not exist`)
    }
    const tested = new Set(i.cases.flatMap(c => c.reqs))
    for (const id of defined) if (!tested.has(id)) add('req-untested', id, `${id} has no test case`)
  }
  const engineers = i.engineers ?? whole(frontmatter(i.prd.replace(/\r\n/g, '\n')).data.engineers) ?? 1
  const days = i.intents.reduce((n, t) => n + (t.estimateDays ?? 0), 0)
  if (days > SPRINT_DAYS * engineers) add('capacity', 'sprint', `${days} intent-days against ${SPRINT_DAYS * engineers} available (${engineers} engineer${engineers === 1 ? '' : 's'} × ${SPRINT_DAYS} days)`, 'report')
  return out
}

// A change started from an intent keeps its behaviours (spec.md may drop the citations) and adds only ones that serve a requirement of the intent.
export function intentSpecProblems(intent: Intent, spec: string): string[] {
  const inSpec = parseBehaviours(spec)
  const known = new Set(intent.behaviours.map(b => b.id))
  return [
    ...intent.behaviours.filter(b => !inSpec.some(x => x.id === b.id)).map(b => `${b.id} of ${intent.slug} is missing from spec.md`),
    ...inSpec.filter(b => !known.has(b.id) && !b.reqs.some(r => intent.prd.includes(r))).map(b => `${b.id} is not in the intent ${intent.slug} and cites no requirement of ${intent.slug} (${intent.prd.join(', ') || 'none'})`),
  ]
}
