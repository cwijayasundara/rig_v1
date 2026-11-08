// Intent map (design 2026-11-07): the contract of a change that opts in. Port of the acceptance oracle eval/intent-map.mjs;
// both must return the same rule ids. Pure functions: callers run the formal command and the tests, and pass the results in.
import crypto from 'node:crypto'

export const RULES = ['unmapped-said', 'unknown-kind', 'missing-clause', 'orphan-clause', 'both-ways', 'missing-scenario', 'empirical-early', 'empirical-open', 'empirical-unrecorded', 'stale-scenario', 'missing-not-promised', 'formal-failed', 'unmutated', 'vacuous', 'prune', 'behaviours-drift', 'result-unbacked', 'formal-targets-diff', 'one-way-unjustified', 'trusted-unpinned', 'property-failed'] as const
// behaviours-drift is the wiring's own rule (spec.md ## Behaviours against the map); the oracle has no spec.md, so it has no such rule.
export type RuleId = typeof RULES[number]
export type IntentFinding = { rule: RuleId; detail: string }
export type Scenario = { id: string; title?: string; given?: string; when?: string; then?: string; status?: string; command?: string; commit?: string }
export type Row = { id: string; said: string; decision: string; kind: string; clauses: string[]; scenarios: string[] }
export type Clause = { id: string; direction: string; text: string }
export type Trusted = { name: string; contract: string; pin: string }
// propertyCommand: the optional ## Property command line; propertySection is true when the section exists, even if its line is empty.
export type IntentMap = { formalCommand: string; propertyCommand: string; propertySection: boolean; trusted: Trusted[]; said: { id: string; text: string }[]; decisions: { id: string; text: string }[]; rows: Row[]; clauses: Clause[]; scenarios: Scenario[]; notPromised: { id: string; text: string }[] }
export type Mutant = { id: string; clause: string; holds: boolean }
export type Results = Record<string, { status: string; command?: string; commit?: string; run?: string }>
// One line of evidence/runs.jsonl: the ledger a recorded pass must be found in.
export type LedgerRun = { id?: string; cmd: string; exit: number; commit?: string; scenario?: string }
// A person's ruling on a surviving mutant (stored beside the map in adjudications.json, written by `intent-adjudicate`):
// only a non-bug with an approver and a reason clears the vacuous finding; clause-vacuous keeps it.
export type Adjudication = { verdict: 'non-bug' | 'clause-vacuous'; because: string; by: string }
export type Adjudications = Record<string, Adjudication>
export type CheckOpts = { phase: 'plan' | 'ship'; freeze?: Record<string, string>; clauses?: Record<string, boolean>; mutants?: Mutant[]; tests?: string[]; formalError?: string; adjudications?: Adjudications }
const clears = (a: Adjudication | undefined): a is Adjudication => a?.verdict === 'non-bug' && Boolean(a.by?.trim()) && Boolean(a.because?.trim())

const rowHead = /^- ([RSTN]\d+): (.+)$/
const saidHead = /^- (S\d+): (.+)$/
const decisionHead = /^- (D\d+): (.+)$/
const clauseHead = /^### (C\d+)(?: (only-when|always))?$/
const scenarioHead = /^### (E\d+)$/
const promisedHead = /^- (N\d+): (.+)$/

// `- <name>: <contract>. pin: <command>`; a line with no `pin:` has an empty pin, which trusted-unpinned reports.
function trustedLine(line: string): Trusted | undefined {
  const m = /^- ([\w.]+): (.*)\.?\s*pin:\s*(.*)$/.exec(line) ?? /^- ([\w.]+): (.*)$/.exec(line)
  return m ? { name: m[1]!, contract: (m[2] ?? '').trim().replace(/\.$/, ''), pin: (m[3] ?? '').trim() } : undefined
}

const normalize = (text: string): string => text.replace(/\r\n/g, '\n')
const finding = (rule: RuleId, detail: string): IntentFinding => ({ rule, detail })
const list = (value: string | undefined): string[] => value ? value.split(',').map(s => s.trim()).filter(Boolean) : []

export function scenarioHash(s: { given?: string; when?: string; then?: string }): string {
  return crypto.createHash('sha256').update(`given: ${s.given}\nwhen: ${s.when}\nthen: ${s.then}\n`).digest('hex')
}

function fieldsOf(rest: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of rest.replace(/\.$/, '').split('. ')) {
    const [key, ...value] = part.split(' ')
    out[key ?? ''] = value.join(' ').replace(/\.$/, '')
  }
  return out
}

export function parse(raw: string): IntentMap {
  const lines = normalize(raw).split('\n')
  const map: IntentMap = { said: [], decisions: [], rows: [], clauses: [], scenarios: [], notPromised: [], formalCommand: '', propertyCommand: '', propertySection: false, trusted: [] }
  let section = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.startsWith('## ')) { section = line.slice(3).trim(); if (section === 'Property command') map.propertySection = true; continue }
    if (section === 'Said') { const m = saidHead.exec(line); if (m) map.said.push({ id: m[1]!, text: m[2]! }) }
    if (section === 'Decisions') { const m = decisionHead.exec(line); if (m) map.decisions.push({ id: m[1]!, text: m[2]! }) }
    if (section === 'Map') {
      const m = rowHead.exec(line)
      if (!m) continue
      const f = fieldsOf(m[2]!)
      map.rows.push({ id: m[1]!, said: f.said ?? '', decision: f.decision ?? '', kind: f.kind ?? '', clauses: list(f.clauses), scenarios: list(f.scenarios) })
    }
    if (section === 'Formal') {
      const m = clauseHead.exec(line)
      const last = map.clauses.at(-1)
      if (m) map.clauses.push({ id: m[1]!, direction: m[2] ?? '', text: '' })
      else if (last && line.trim()) last.text += (last.text ? ' ' : '') + line.trim()
    }
    if (section === 'Empirical') {
      const m = scenarioHead.exec(line)
      if (!m) continue
      const scenario: Scenario = { id: m[1]! }
      for (i += 1; i < lines.length; i++) {
        const next = lines[i] ?? ''
        if (next.startsWith('#') || next.startsWith('- ')) { i -= 1; break }
        const field = /^(\w+): (.*)$/.exec(next)
        if (field) (scenario as Record<string, string>)[field[1]!] = field[2]!
      }
      map.scenarios.push(scenario)
    }
    if (section === 'Formal command' && !map.formalCommand && line.trim()) map.formalCommand = line.trim().replace(/^`|`$/g, '')
    if (section === 'Property command' && !map.propertyCommand && line.trim()) map.propertyCommand = line.trim().replace(/^`|`$/g, '')
    if (section === 'Trusted') { const t = trustedLine(line); if (t) map.trusted.push(t) }
    if (section === 'Not promised') { const m = promisedHead.exec(line); if (m) map.notPromised.push({ id: m[1]!, text: m[2]! }) }
  }
  return map
}

export function freezeFor(text: string): Record<string, string> {
  return Object.fromEntries(parse(text).scenarios.map(s => [s.id, scenarioHash(s)]))
}

// Every symbol a formal clause leans on (written in backticks) is a Trusted entry or the subject of an Empirical scenario, and every
// Trusted entry is pinned by a command. The pin is not run here; naming and pinning is the promise.
function trustedFindings(map: IntentMap): IntentFinding[] {
  const out: IntentFinding[] = []
  for (const t of map.trusted) if (!t.pin) out.push(finding('trusted-unpinned', `Trusted ${t.name} has no pin: <command>`))
  const names = new Set(map.trusted.map(t => t.name))
  const subjects = map.scenarios.map(s => [s.title, s.given, s.when, s.then].join(' ')).join(' ')
  const wanted = new Set(map.rows.filter(r => r.kind === 'formal').flatMap(r => r.clauses))
  for (const c of map.clauses.filter(c => wanted.has(c.id))) {
    for (const sym of new Set([...c.text.matchAll(/`([A-Za-z_][\w.]*)`/g)].map(m => m[1]!))) {
      if (!names.has(sym) && !new RegExp(`\\b${sym.replace(/\./g, '\\.')}\\b`).test(subjects)) out.push(finding('trusted-unpinned', `${c.id} leans on ${sym}, which is in no Trusted entry and no empirical scenario`))
    }
  }
  return out
}

function structure(map: IntentMap, phase: 'plan' | 'ship'): IntentFinding[] {
  const out: IntentFinding[] = []
  const clauseById = new Map(map.clauses.map(c => [c.id, c]))
  const scenarioById = new Map(map.scenarios.map(s => [s.id, s]))
  const promised = new Set(map.notPromised.map(n => n.id))
  const seenSaid = new Set(map.rows.map(r => r.said).filter(Boolean))
  for (const s of map.said) if (!seenSaid.has(s.id)) out.push(finding('unmapped-said', `${s.id} is in Said and on no row`))
  for (const row of map.rows) {
    if (!['formal', 'empirical', 'not-promised'].includes(row.kind)) out.push(finding('unknown-kind', `${row.id} has kind ${row.kind || '(none)'}`))
    if (row.kind === 'formal') {
      if (!row.clauses.length) out.push(finding('missing-clause', `${row.id} is formal and names no clause`))
      for (const id of row.clauses) if (!clauseById.has(id)) out.push(finding('missing-clause', `${row.id} names ${id}, which has no Formal section`))
      const decision = map.decisions.find(d => d.id === row.decision)
      if (!decision || !(decision.text.startsWith('both-ways') || /one-way-because:\s*\S/.test(decision.text))) out.push(finding('one-way-unjustified', `${row.id} is formal and its decision ${row.decision || '(none)'} is neither both-ways nor says one-way-because: <why only one direction>`))
      if (decision?.text.startsWith('both-ways')) {
        const dirs = row.clauses.map(id => clauseById.get(id)?.direction)
        if (!dirs.includes('only-when') || !dirs.includes('always')) out.push(finding('both-ways', `${row.id} records ${row.decision} both-ways and needs an only-when clause and an always clause`))
      }
    }
    if (row.kind === 'empirical') {
      if (!row.scenarios.length) out.push(finding('missing-scenario', `${row.id} is empirical and names no scenario`))
      for (const id of row.scenarios) {
        const sc = scenarioById.get(id)
        if (!sc) { out.push(finding('missing-scenario', `${row.id} names ${id}, which has no Empirical section`)); continue }
        if (phase === 'plan' && sc.status !== 'planned') out.push(finding('empirical-early', `${id} is ${sc.status || 'unset'} at plan time; the scenario is written before the test runs`))
        if (phase === 'ship' && sc.status !== 'pass') out.push(finding('empirical-open', `${id} is ${sc.status || 'unset'} at ship time; only a recorded pass ships`))
        if (phase === 'ship' && sc.status === 'pass' && (!sc.command || !sc.commit)) out.push(finding('empirical-unrecorded', `${id} says pass without a command and a commit`))
      }
    }
    if (row.kind === 'not-promised' && !promised.has(row.id)) out.push(finding('missing-not-promised', `${row.id} is not-promised and is absent from Not promised`))
  }
  out.push(...trustedFindings(map))
  const used = new Set(map.rows.flatMap(r => r.clauses))
  for (const c of map.clauses) if (!used.has(c.id)) out.push(finding('orphan-clause', `${c.id} is in Formal and on no row`))
  return out
}

function freezeFindings(map: IntentMap, freeze: Record<string, string> | undefined): IntentFinding[] {
  if (!freeze) return []
  return map.scenarios.flatMap(s => freeze[s.id] && scenarioHash(s) !== freeze[s.id] ? [finding('stale-scenario', `${s.id} differs from the text hashed at approval`)] : [])
}

// Fail closed: a formal row with no verdicts at all (the command did not run) is formal-failed, never a pass.
function formalFindings(map: IntentMap, holds: Record<string, boolean> | undefined, mutants: Mutant[] | undefined, why: string, adj: Adjudications = {}): IntentFinding[] {
  const wanted = [...new Set(map.rows.filter(r => r.kind === 'formal').flatMap(r => r.clauses))]
  if (!wanted.length) return []
  if (!holds) return [finding('formal-failed', `no formal verdicts (${why}), so no formal clause is checked`)]
  const out: IntentFinding[] = []
  for (const id of wanted) if (holds[id] !== true) out.push(finding('formal-failed', `${id} ${holds[id] === false ? 'has a counterexample on the implementation' : 'has no verdict from the formal command'}`))
  const ids = new Set<string>()
  for (const m of mutants ?? []) { if (ids.has(m.id)) out.push(finding('formal-failed', `duplicate mutant id ${m.id}`)); ids.add(m.id) }
  for (const id of wanted) {
    const planted = (mutants ?? []).filter(m => m.clause === id)
    if (!planted.length) out.push(finding('unmutated', `${id} has no planted bug`))
    for (const m of planted) if (m.holds && !clears(adj[m.id])) out.push(finding('vacuous', `${id} still holds under ${m.id}, so the clause rules nothing out`))
  }
  return out
}

function pruneFindings(tests: string[], mapClauses: Set<string>): IntentFinding[] {
  const out: IntentFinding[] = []
  for (const src of tests) {
    const clauses = [...src.matchAll(/\b(C\d+)\b/g)].map(m => m[1]!).filter(id => mapClauses.has(id))
    if (clauses.length && !/\bE\d+\b/.test(src)) out.push(finding('prune', `a test names ${[...new Set(clauses)].join(', ')} and no empirical scenario; the formal check already covers it`))
  }
  return out
}

export function receipt(map: IntentMap, holds: Record<string, boolean> = {}, mutants: Mutant[] = [], adj: Adjudications = {}): string {
  return map.rows.map(row => {
    if (row.kind === 'formal') {
      const planted = mutants.filter(m => row.clauses.includes(m.clause)).map(m => `${m.id} ${!m.holds ? 'rejected' : clears(adj[m.id]) ? `adjudicated non-bug: ${adj[m.id]!.because}` : 'survives'}`)
      return `- ${row.id} formal: ${row.clauses.map(id => `${id} ${holds[id] === false ? 'fails' : 'holds'}`).join(', ')}${planted.length ? ` (planted: ${planted.join(', ')})` : ''}`
    }
    if (row.kind === 'empirical') {
      const bits = row.scenarios.map(id => {
        const sc = map.scenarios.find(s => s.id === id)
        return sc?.status === 'pass' ? `${id} evidence @ ${sc.commit}` : `${id} ${sc?.status ?? 'missing'}`
      })
      return `- ${row.id} empirical: ${bits.join(', ')} (evidence, not proof)`
    }
    return `- ${row.id} not promised: ${map.notPromised.find(n => n.id === row.id)?.text ?? ''}`
  }).join('\n')
}

export function check(text: string, opts: CheckOpts): { map: IntentMap; findings: IntentFinding[]; pass: boolean; receipt: string } {
  const map = parse(text)
  const findings = [...structure(map, opts.phase), ...freezeFindings(map, opts.freeze), ...(opts.phase === 'ship' ? formalFindings(map, opts.clauses, opts.mutants, opts.formalError ?? 'no formal command ran', opts.adjudications) : []), ...pruneFindings(opts.tests ?? [], new Set(map.clauses.map(c => c.id)))]
  return { map, findings, pass: !findings.length, receipt: receipt(map, opts.clauses, opts.mutants, opts.adjudications) }
}

// Merge script-recorded results into the (frozen) map text. The agent never writes these lines; unknown ids are ignored.
// A scenario's old status/command/commit lines are dropped and the recorded ones written at the end of its block.
export function applyResults(raw: string, results: Results): string {
  const out: string[] = []
  let section = '', current: string | null = null
  const close = (): void => {
    const r = current ? results[current] : undefined
    if (!r) return
    const blanks: string[] = []
    while (out.at(-1) === '') blanks.push(out.pop()!)
    out.push(`status: ${r.status}`, ...(r.command ? [`command: ${r.command}`] : []), ...(r.commit ? [`commit: ${r.commit}`] : []), ...blanks)
  }
  for (const line of normalize(raw).split('\n')) {
    const head = section === 'Empirical' ? scenarioHead.exec(line) : null
    if (line.startsWith('## ') || head) { close(); current = head ? head[1]! : null; if (!head) section = line.slice(3).trim() }
    if (current && results[current] && /^(status|command|commit): /.test(line)) continue
    out.push(line)
  }
  close()
  return out.join('\n')
}

// Ship phase for a real change: merge the script-recorded results, run the map's own formal command once and judge.
// The command (the line under `## Formal command`, frozen with the map) prints one last JSON line:
// {"clauses": {"C2": true}, "mutants": [{"id": "...", "clause": "C2", "holds": false}]}. Any other outcome fails closed.
// targets: the files the formal command checks and the changed source files of the diff; absent in the pure paths, which skips the rule.
export type ShipInput = { text: string; results: Results; runs?: LedgerRun[]; targets?: { files: string[]; diffSource: string[] }; adjudications?: Adjudications; freeze?: Record<string, string>; tests: string[]; run: (cmd: string) => { exit: number; tail: string } }
// Every scenario that reads pass must be backed by a ledger line (same run id, command and commit, exit 0), so a hand-typed pass fails
// closed. A caller that passes no ledger (the pure oracle path) is not checked; the real ship path always passes one, empty if nothing ran.
function resultFindings(map: IntentMap, results: Results, runs: LedgerRun[] | undefined): IntentFinding[] {
  if (!runs) return []
  return map.scenarios.filter(s => s.status === 'pass').flatMap(s => {
    const r = results[s.id]
    const line = r?.run ? runs.find(l => l.id === r.run) : undefined
    // The line must be this scenario's own newest run: another scenario's pass, or an older pass after a newer run, is not its evidence.
    const newest = runs.filter(l => l.scenario === s.id).at(-1)
    return line && line === newest && line.exit === 0 && line.cmd === r?.command && line.commit === r?.commit ? [] : [finding('result-unbacked', `${s.id} says pass with no matching run in the ledger (same run id, command and commit, exit 0)`)]
  })
}

function targetFindings(map: IntentMap, targets: ShipInput['targets']): IntentFinding[] {
  if (!targets || !map.formalCommand || !map.rows.some(r => r.kind === 'formal')) return []
  return targets.files.some(f => targets.diffSource.includes(f)) ? [] : [finding('formal-targets-diff', `\`${map.formalCommand}\` checks no source file this change edits, so its verdicts are about something else`)]
}

// The sampled tier (hypothesis, fast-check): optional, run once at ship, exit 0 passes. It is evidence over generated inputs, never proof.
export const PROPERTY_LABEL = '(evidence, sampled, not exhaustive)'
function propertyResult(map: IntentMap, run: ShipInput['run']): { findings: IntentFinding[]; line: string } | undefined {
  if (!map.propertySection) return undefined
  if (!map.propertyCommand) return { findings: [finding('property-failed', 'the ## Property command section has no command')], line: '- property: fails' }
  const r = run(map.propertyCommand)
  return r.exit === 0 ? { findings: [], line: `- property: pass ${PROPERTY_LABEL}` } : { findings: [finding('property-failed', `\`${map.propertyCommand}\` exited ${r.exit}`)], line: '- property: fails' }
}

export function shipCheck(i: ShipInput): ReturnType<typeof check> {
  const r = shipCore(i)
  const prop = propertyResult(r.map, i.run)
  const extra = [...resultFindings(r.map, i.results, i.runs), ...targetFindings(r.map, i.targets), ...(prop?.findings ?? [])]
  const out = prop ? { ...r, receipt: `${r.receipt}\n${prop.line}` } : r
  return extra.length ? { ...out, findings: [...r.findings, ...extra], pass: false } : out
}

function shipCore(i: ShipInput): ReturnType<typeof check> {
  const text = applyResults(i.text, i.results)
  const map = parse(text)
  const needsFormal = map.rows.some(r => r.kind === 'formal')
  const base = { phase: 'ship' as const, freeze: i.freeze, tests: i.tests, adjudications: i.adjudications }
  if (!needsFormal) return check(text, base)
  if (!map.formalCommand) return check(text, { ...base, formalError: 'the map has no ## Formal command' })
  const r = i.run(map.formalCommand)
  if (r.exit !== 0) return check(text, { ...base, formalError: `the formal command exited ${r.exit}` })
  try {
    const out = JSON.parse(r.tail.trim().split('\n').at(-1) ?? '') as { clauses?: Record<string, boolean>; mutants?: Mutant[] }
    if (!out.clauses || typeof out.clauses !== 'object') throw new Error('no clauses')
    return check(text, { ...base, clauses: out.clauses, mutants: Array.isArray(out.mutants) ? out.mutants : [] })
  } catch { return check(text, { ...base, formalError: 'the formal command did not print a JSON verdict as its last line' }) }
}

// The `## Behaviours` of a spec whose change has a map: one line per said sentence, in Said order. Generated, never hand-edited.
export function behavioursFrom(map: IntentMap): string {
  return map.said.map(s => {
    const row = map.rows.find(r => r.said === s.id)
    const refs = row ? (row.kind === 'empirical' ? row.scenarios : row.clauses).join(', ') : ''
    return `- ${s.id}: ${s.text}${row ? ` (${row.kind}${refs ? ` ${refs}` : ''})` : ''}`
  }).join('\n')
}
