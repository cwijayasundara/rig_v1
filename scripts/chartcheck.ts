// The sprint chart's trace rules (outer-loop spec 2026-10-17 §7): parse the PRD, the intents and the test cases, and report
// where the chain requirement → intent → behaviour → test case breaks. Pure over text; no repo, no model.
import path from 'node:path'
import { frontmatter, fmList } from './core.ts'
import { openQuestions, section } from './model.ts'

export type Behaviour = { id: string; reqs: string[]; text: string }
export type Intent = {
  slug: string; sprint: number | null; prd: string[]; depends: string[]; estimateDays: number | null; kind: 'boundary' | 'internal' | null
  behaviours: Behaviour[]; contractFiles: string[]; exampleFiles: string[]; openQuestions: string[]
  failures: string[]; design: number // B-numbers under `### Failure behaviour`; `## Design` table rows
  owner: string // who builds it: a person fills it in when the sprint is allocated; empty until then
}
export type TestCase = { id: string; reqs: string[]; intent: string; behaviour: string; level: string; data: string; access: string }
// A row of architecture.md `## Access`: who may take an action, on which interfaces. `nobody`: the cell says no role may.
export type AccessRule = { action: string; allowed: string[]; nobody: boolean; interfaces: string[]; intent: string }
export type ChartFinding = { rule: string; severity: 'block' | 'report'; where: string; message: string }

const REQ = /\bN?FR-\d+\b/g
const SPRINT_DAYS = 10
const MAX_DAYS = 2

// A frontmatter list of ids, flow or block style; brackets, quotes and a trailing `.md` are tolerated.
const listField = (text: string, key: string): string[] =>
  fmList(text, key).map(s => s.replace(/\.md$/, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
// Template prompts are HTML comments: they are never content.
export const uncomment = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '')
export const escapes = (p: string): boolean => path.isAbsolute(p) || p.split(/[\\/]/).includes('..')
const whole = (v: string | undefined): number | null => (/^\d{1,4}$/.test(v ?? '') ? Number(v) : null)

// Requirement ids the PRD defines: a heading `### FR-3: ...` or a table row `| NFR-2 | ...`. Ids in prose are references.
export function prdIds(text: string): string[] {
  const ids = new Set<string>()
  for (const l of uncomment(text.replace(/\r\n/g, '\n')).split('\n')) {
    const m = /^#{2,4}\s+(N?FR-\d+)\b/.exec(l) ?? /^\|\s*(N?FR-\d+)\s*\|/.exec(l)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort()
}

// `- B1 (FR-3, NFR-1): text` lines under `## Behaviours`, in an intent or a change's spec.md.
function parseBehaviours(text: string): Behaviour[] {
  return section(text.replace(/\r\n/g, '\n'), 'Behaviours').split('\n').flatMap((l): Behaviour[] => {
    const m = /^\s*[-*]\s+(B\d+)\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/.exec(l)
    return m?.[1] ? [{ id: m[1], reqs: (m[2] ?? '').match(REQ) ?? [], text: (m[3] ?? '').trim() }] : []
  })
}

export function parseIntent(slug: string, raw: string): Intent {
  const text = uncomment(raw.replace(/\r\n/g, '\n'))
  const { data } = frontmatter(text)
  const iface = section(text, 'Interfaces').split('\n')
  const files = (label: string): string[] => iface.flatMap(l => { const m = new RegExp(`^\\s*[-*]?\\s*${label}:\\s*(\\S+)`).exec(l); return m?.[1] ? [m[1]] : [] })
  return {
    slug, sprint: whole(data.sprint), prd: listField(text, 'prd'), depends: listField(text, 'depends'), estimateDays: whole(data.estimate_days),
    kind: data.kind === 'boundary' || data.kind === 'internal' ? data.kind : null,
    behaviours: parseBehaviours(text), contractFiles: files('Contract'), exampleFiles: files('Example'), openQuestions: openQuestions(text),
    failures: [...(section(text, 'Behaviours').split(/^###\s+Failure behaviour\s*$/m)[1] ?? '').matchAll(/^\s*[-*]\s+(B\d+)/gm)].map(m => m[1]!),
    design: Math.max(0, section(text, 'Design').split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]*$/.test(l)).length - 1),
    owner: (data.owner ?? '').replace(/(^|\s)#.*$/, '').trim().replace(/^["']|["']$/g, ''), // a `# ...` comment is not a name
  }
}

// `- slug: scope (ids)` lines (a `*` bullet, bold or backticked slug also read; fenced blocks skipped) under `## Intents` in the sprint design doc: the intents the design says the sprint is made of.
export const designIntents = (designDoc: string): string[] =>
  section(uncomment(designDoc.replace(/\r\n/g, '\n')).replace(/^(```|~~~)[\s\S]*?^\1/gm, ''), 'Intents').split('\n').flatMap(l => { const m = /^[-*]\s+(?:\*\*|`)?([a-z0-9]+(?:-[a-z0-9]+)*)(?:\*\*|`)?\s*:/.exec(l); return m?.[1] ? [m[1]] : [] })

// cases.md rows: | ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access | (Access optional: a seven-column table still reads)
export function parseCases(text: string): TestCase[] {
  return text.replace(/\r\n/g, '\n').split('\n').map(l => l.split('|').map(c => c.trim())).filter(c => /^TC-\d+$/.test(c[1] ?? '')).map(c => ({
    id: c[1] ?? '', reqs: (c[2] ?? '').match(REQ) ?? [], intent: (c[3] ?? '').replace(/\.md$/, ''), behaviour: c[4] ?? '', level: c[5] ?? '', data: c[6] || '-', access: c[8] || '-',
  }))
}

// Slugs on a dependency cycle (a self-dependency is one), found by asking whether each can reach itself.
function cyclic(intents: Intent[]): Set<string> {
  const deps = new Map(intents.map(i => [i.slug, i.depends]))
  const reaches = (from: string, target: string, seen = new Set<string>()): boolean =>
    (deps.get(from) ?? []).some(d => d === target || (!seen.has(d) && (seen.add(d), reaches(d, target, seen))))
  return new Set(intents.filter(i => reaches(i.slug, i.slug)).map(i => i.slug))
}

// `others` are the intents of other sprints (a dependency may name one; their test cases are theirs to check); `exists` resolves a case's
// data path under the test plan, `repoExists` a contract or example path in the repo.
export function traceReport(i: { prd: string; intents: Intent[]; others?: Intent[]; cases: TestCase[] | null; exists: (path: string) => boolean; repoExists?: (path: string) => boolean }): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string, severity: 'block' | 'report' = 'block'): number => out.push({ rule, severity, where, message })
  const prd = uncomment(i.prd.replace(/\r\n/g, '\n'))
  const others = i.others ?? []
  const repoExists = i.repoExists ?? ((): boolean => true)
  const defined = new Set(prdIds(prd))
  const slugs = new Set([...i.intents, ...others].map(t => t.slug))
  const cycle = cyclic([...i.intents, ...others])
  for (const q of openQuestions(prd)) add('open-question', 'prd', `the PRD has an open question: ${q}`)
  for (const t of i.intents) {
    const untraced = t.behaviours.filter(b => !b.reqs.length).map(b => b.id) // name them: `(AC-4.1)` alone blocked shop_app with no hint
    const gaps = [!t.prd.length && 'its `prd:` frontmatter is empty', !t.behaviours.length && 'it has no `- B<n> (FR-n): ...` behaviours', untraced.length && `${untraced.join(', ')} cite no requirement`].filter(Boolean)
    if (gaps.length) add('intent-untraced', t.slug, `${t.slug}: ${gaps.join('; ')}. Cite an FR-n or NFR-n id in the parentheses, e.g. \`- B1 (FR-4, AC-4.1): ...\`; an acceptance-criterion id alone does not count`)
    const cited = [...t.prd, ...t.behaviours.flatMap(b => b.reqs)]
    for (const id of new Set(cited)) if (!defined.has(id)) add('unknown-id', t.slug, `${t.slug} cites ${id}, which the PRD does not define`)
    if (t.estimateDays === null || t.estimateDays > MAX_DAYS || t.estimateDays < 1) add('estimate', t.slug, `${t.slug} needs estimate_days of 1 or ${MAX_DAYS} (split anything larger)`)
    if (t.kind === 'boundary' && !t.failures.length) add('failure-behaviour', t.slug, `${t.slug} is a boundary intent with no ### Failure behaviour: state its timeouts and error responses as behaviours`, 'report')
    if (t.kind === 'boundary' && (!t.contractFiles.length || !t.exampleFiles.length)) add('boundary-contract', t.slug, `${t.slug} is a boundary intent: name a Contract: file and an Example: file under ## Interfaces`)
    for (const f of [...t.contractFiles, ...t.exampleFiles]) {
      if (escapes(f)) add('contract-path', t.slug, `${t.slug} names ${f}, which is outside the repo`)
      else if (!repoExists(f)) add('contract-path', t.slug, `${t.slug} names ${f}, which does not exist`)
    }
    for (const q of t.openQuestions) add('open-question', t.slug, `${t.slug} has an open question: ${q}`)
    for (const d of t.depends) if (!slugs.has(d)) add('depends', t.slug, `${t.slug} depends on ${d}, which is not an intent`)
    if (cycle.has(t.slug)) add('depends', t.slug, `${t.slug} is on a dependency cycle`)
  }
  const covered = new Set(i.intents.flatMap(t => t.prd))
  for (const id of defined) if (!covered.has(id)) add('req-uncovered', id, `${id} has no intent`)
  if (i.cases) {
    const byIntent = new Map(i.intents.map(t => [t.slug, new Set(t.behaviours.map(b => b.id))]))
    const mine = new Set(i.intents.map(t => t.slug))
    const theirs = new Set(others.map(t => t.slug))
    const rows = i.cases.filter(c => mine.has(c.intent) || !theirs.has(c.intent))
    for (const c of rows) {
      if (!c.reqs.length) add('case-untraced', c.id, `${c.id} cites no PRD requirement`)
      for (const id of c.reqs) if (!defined.has(id)) add('unknown-id', c.id, `${c.id} cites ${id}, which the PRD does not define`)
      if (!byIntent.get(c.intent)?.has(c.behaviour)) add('case-orphan', c.id, `${c.id} names ${c.intent}#${c.behaviour}, which does not exist`)
      if (c.data !== '-' && (escapes(c.data) || !i.exists(c.data))) add('case-data-missing', c.id, `${c.id} data ${c.data} does not exist`)
    }
    const tested = new Set(rows.flatMap(c => c.reqs))
    for (const id of defined) if (!tested.has(id)) add('req-untested', id, `${id} has no test case`)
  }
  const engineers = whole(frontmatter(prd).data.engineers) ?? 1
  const days = i.intents.reduce((n, t) => n + (t.estimateDays ?? 0), 0)
  if (days > SPRINT_DAYS * engineers) add('capacity', 'sprint', `${days} intent-days against ${SPRINT_DAYS * engineers} available (${engineers} engineer${engineers === 1 ? '' : 's'} × ${SPRINT_DAYS} days)`, 'report')
  return out
}

// An owner decision parked in a section the check does not block on (`## Risks`, `## Risks and notes`, `## Notes`) is reported, never blocked:
// a risk with an owner is legitimate, but a gap that needs a person's answer belongs under `## Concerns`.
export function parkedDecisions(where: string, text: string): ChartFinding[] {
  const body = uncomment(text.replace(/\r\n/g, '\n'))
  return (['Risks', 'Risks and notes', 'Notes'] as const).flatMap(h => section(body, h).split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(l => /\bowner\s*:|\bdecision\b/i.test(l)).map((l): ChartFinding => ({ rule: 'parked-decision', severity: 'report', where, message: `${where} parks a decision under "${h}": ${l}` })))
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

// A fenced block, not mermaid, with a drawing in it: the ASCII twin of a mermaid diagram (owner, 2026-10-26: mermaid does not render in a terminal).
const asciiDiagram = (body: string): boolean =>
  [...body.matchAll(/^(```|~~~)([^\n]*)\n([\s\S]*?)^\1/gm)].some(m => !/mermaid/i.test(m[2] ?? '') && Boolean(m[3]?.trim()))

// What architecture.md must hold to be an architecture document and not a summary: the stack by name, a diagram, the code structure,
// a key flow, a tactic for every NFR the PRD defines, and this sprint's row in the history. Pure over text.
export function architectureProblems(arch: string, prd: string, sprint: number): ChartFinding[] {
  // A `#` line inside a fence (a tree, a shell snippet) must not end its section.
  const text = uncomment(arch.replace(/\r\n/g, '\n')).replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1/gm, b => b.replace(/^#/gm, '\u200b#'))
  const out: ChartFinding[] = []
  const add = (rule: string, message: string): number => out.push({ rule, severity: 'block', where: 'architecture', message: `architecture.md ${message}` })
  const rows = (name: string): string[][] => section(text, name).split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]*$/.test(l)).map(l => l.trim().replace(/^\|+/, '').replace(/\|+$/, '').split('|').map(c => c.trim()))
  const stack = rows('Technology stack')
  for (const need of ['Language', 'Framework']) if (!stack.some(r => r[0]?.toLowerCase() === need.toLowerCase() && r[1])) add('arch-stack', `## Technology stack has no ${need} row with a Choice: name the real ${need.toLowerCase()} from the PRD ("none (standard library)" when there is no framework)`)
  if (!/^```mermaid/m.test(section(text, 'Architecture diagram'))) add('arch-diagram', 'has no mermaid diagram under ## Architecture diagram: draw the modules, the external systems and the dependency direction')
  if (!asciiDiagram(section(text, 'Architecture diagram'))) add('arch-diagram-text', 'has no ASCII diagram under ## Architecture diagram: draw the same modules and arrows in a ```text block beside the mermaid one, for terminals and plain-text readers')
  const tree = (/^```[^\n]*\n([\s\S]*?)^```/m.exec(section(text, 'Code structure'))?.[1] ?? '').split('\n').filter(l => l.trim())
  if (tree.length < 3) add('arch-structure', 'has no source tree under ## Code structure: show the directories and files this architecture implies, one comment each')
  if (!/^```mermaid/m.test(section(text, 'Key flows'))) add('arch-flow', 'has no mermaid sequence diagram under ## Key flows: draw the main use case through the modules')
  if (!asciiDiagram(section(text, 'Key flows'))) add('arch-flow-text', 'has no ASCII diagram under ## Key flows: draw the main flow in a ```text block beside the mermaid sequence diagram')
  const tactics = section(text, 'Quality tactics')
  for (const id of prdIds(prd).filter(x => x.startsWith('NFR-'))) if (!new RegExp(`\\b${id}\\b`).test(tactics)) add('arch-nfr', `## Quality tactics has no row for ${id}, which the PRD defines`)
  if (!rows('Sprint history').some(r => Number(/^(?:sprint[\s-]*)?(\d+)\.?$/i.exec(r[0] ?? '')?.[1]) === sprint)) add('arch-history', `## Sprint history has no row for sprint ${sprint}`)
  return out
}

const tableRows = (text: string, name: string): string[][] =>
  section(text, name).split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]*$/.test(l)).map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
// Backticks dropped and inner spaces collapsed, so `mobile  app` in a row and mobile app in a case are one name.
const norm = (s: string): string => s.replace(/`/g, '').replace(/\s+/g, ' ').trim()
const names = (cell: string): string[] => cell.split(',').map(s => norm(s).toLowerCase()).filter(Boolean)

// `| Action | Allowed | Interfaces | Intent |` rows under architecture.md `## Access`; `nobody` allows no role.
export function parseAccess(arch: string): AccessRule[] {
  return tableRows(uncomment(arch.replace(/\r\n/g, '\n')), 'Access').slice(1).map(c => ({
    action: norm(c[0] ?? ''), allowed: names(c[1] ?? '').filter(r => r !== 'nobody'), nobody: names(c[1] ?? '').includes('nobody'), interfaces: names(c[2] ?? ''), intent: norm(c[3] ?? ''),
  }))
}

// Permissions checked both ways (proposal 2026-10-23 §2): each row well formed and built by a charted intent; with cases, every interface of a
// row whose intent is this sprint's (`mine`, default every slug) has a refused case and, unless nobody may take the action, an allowed one. Shared backend code proves nothing about another interface.
export function accessProblems(rules: AccessRule[], slugs: string[], cases: TestCase[] | null, mine: string[] = slugs): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string): number => out.push({ rule, severity: 'block', where, message })
  const tested = new Set((cases ?? []).flatMap(c => { const m = /^(.+?):\s*(allowed|refused)\s+(.+)$/i.exec(norm(c.access)); return m ? [`${m[1]!.trim().toLowerCase()}|${m[2]!.toLowerCase()}|${m[3]!.toLowerCase()}`] : [] }))
  const seen = new Set<string>()
  for (const r of rules) {
    const nobody = r.nobody && !r.allowed.length
    if (seen.has(r.action.toLowerCase())) { add('access-row', r.action, `## Access lists "${r.action}" twice: one row per action`); continue }
    seen.add(r.action.toLowerCase())
    if (!r.action || !r.interfaces.length || !r.intent || (!r.allowed.length && !r.nobody)) { add('access-row', r.action || 'architecture', `## Access row "${r.action}" needs an action, allowed roles (or nobody), interfaces and an intent`); continue }
    if (!slugs.includes(r.intent)) add('access-intent', r.action, `## Access row "${r.action}" names ${r.intent}, which is not a charted intent`)
    if (cases && mine.includes(r.intent)) for (const i of r.interfaces) for (const way of nobody ? ['refused'] : ['allowed', 'refused'])
      if (!tested.has(`${r.action.toLowerCase()}|${way}|${i}`)) add('access-untested', r.action, `no case tests "${r.action}" ${way} on ${i}: add a case with Access "${r.action}: ${way} ${i}"`)
  }
  return out
}


// The sprint implementation plan (implementation-plan.md, owner 2026-10-26): how the sprint's intents are handed to engineers and built.
// `## Allocation` lanes cover every intent once and keep each lane in dependency order; a `### <slug>` section per intent has checkbox tasks
// and cites every behaviour of that intent, and no behaviour it does not have. Pure over text.
export function implementationPlanProblems(plan: string, intents: Intent[]): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string, severity: 'block' | 'report' = 'block'): number => out.push({ rule, severity, where, message: `implementation-plan.md ${message}` })
  const text = uncomment(plan.replace(/\r\n/g, '\n')).replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1/gm, b => b.replace(/^#/gm, '\u200b#'))
  const by = new Map(intents.map(t => [t.slug, t]))
  const sections = new Map<string, string>()
  // `### <slug>` under `## Intents`; a heading may say more after the slug (`### cart-model (wave 2)`).
  for (const m of section(text, 'Intents').matchAll(/^###\s+`?([a-z0-9]+(?:-[a-z0-9]+)*)`?:?(?:\s[^\n]*)?$([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)) sections.set(m[1]!, m[2] ?? '')
  for (const s of sections.keys()) if (!by.has(s)) add('impl-intent', s, `has a section for ${s}, which is not an intent of this sprint`)
  for (const t of intents) {
    const body = sections.get(t.slug)
    if (body === undefined) { add('impl-intent', t.slug, `has no \`### ${t.slug}\` section: plan every intent`); continue }
    if (!/^\s*[-*]\s+\[[ xX]\]\s+\S/m.test(body)) add('impl-tasks', t.slug, `### ${t.slug} has no \`- [ ]\` tasks`)
    const cited = new Set(body.match(/\bB\d+\b/g) ?? [])
    const known = new Set(t.behaviours.map(b => b.id))
    const unknown = [...cited].filter(b => !known.has(b))
    if (unknown.length) add('impl-behaviour', t.slug, `### ${t.slug} cites ${unknown.join(', ')}, which ${t.slug} does not have`)
    const missing = [...known].filter(b => !cited.has(b))
    if (missing.length) add('impl-behaviour', t.slug, `### ${t.slug} has no task for ${missing.join(', ')}: every behaviour gets a failing test first`)
  }
  const lanes = section(text, 'Allocation').split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s|:-]*$/.test(l)).slice(1)
    .map(l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()))
  if (!lanes.length) { add('impl-allocation', 'sprint', 'has no `## Allocation` table: one row per lane, its intents in build order'); return out }
  const placed = new Map<string, number>()
  for (const [i, row] of lanes.entries()) {
    const slugs = (row[1] ?? '').replace(/`/g, '').split(/\s*(?:,|→|->)\s*/).map(s => s.trim()).filter(Boolean)
    for (const [k, s] of slugs.entries()) {
      if (!by.has(s)) { add('impl-allocation', s, `lane ${row[0] || i + 1} names ${s}, which is not an intent of this sprint`); continue }
      placed.set(s, (placed.get(s) ?? 0) + 1)
      const later = by.get(s)!.depends.filter(d => slugs.indexOf(d) > k)
      if (later.length) add('impl-allocation', s, `lane ${row[0] || i + 1} puts ${s} before ${later.join(', ')}, which it depends on`)
    }
  }
  for (const t of intents) {
    const n = placed.get(t.slug) ?? 0
    if (n !== 1) add('impl-allocation', t.slug, n ? `allocates ${t.slug} to ${n} lanes: one lane per intent` : `allocates ${t.slug} to no lane`)
  }
  return out
}
