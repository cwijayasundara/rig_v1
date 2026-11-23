// The one-page approval summary (`chart summary <N>`, three-gates C5): a reviewer approves a chart from one generated page with one
// decision, approve or not approved; a no records nothing, they correct the chart and decide again. Pure text from the chart's files: no model.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT, SENSORS_PATH, git, read, exists, fail, fmList, toPosix, skillRef, writeAtomic, type HookInput} from './core.ts'
import { section, openQuestions } from './model.ts'
import { ARCH_REL, reviewPath, approvalMdPath, testplanDir, planPath, implPlanPath, sprintDir, sprintRel, sprintsOnDisk, holdoutDir, ledgerPath, coveragePath, prdPath, writeProductIgnore } from './product.ts'
import { PR_SEAL, designDocOf, intentsOf, chartReview, chartWaivers, chartOpenFindings, chartState, conversionMapOf, adrFilesOf, type ApprovalAnswer } from './chart.ts'
import { parseLedger, parseCases, requiredHoldouts, SUFFIX } from './chartcheck.ts'
import { parseMap } from './prdformat.ts'
import { parseCoverage } from './prdcoverage.ts'
import { proposedMore, proposedReport } from './prdcmd.ts'
import { caseId } from './holdout.ts'
import { parseRegistry } from './registry.ts'

const WHY = 'Is that what the client wants, and why?'
const MAX_ROWS = 40, MAX_QUESTIONS = 3, MARK = /\s*\((?:proposed|default|decided) at chart\)/gi
const cell = (t: string): string => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const short = (t: string, n = 110): string => (t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t)
// Rows `risky` says need a look are never dropped: only the rest is cut, and the count says what was cut.
const table = (head: string[], rows: string[][], risky: (r: string[]) => boolean = () => false): string[] => {
  const hot = rows.filter(risky), rest = rows.filter(r => !risky(r)), keep = rest.slice(0, Math.max(0, MAX_ROWS - hot.length)), cut = rest.length - keep.length
  return [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...[...hot, ...keep].map(r => `| ${r.map(cell).join(' | ')} |`), ...(cut ? [`... ${cut} more fully covered row${cut === 1 ? '' : 's'} (see requirements.md)`] : [])]
}
const list = (items: string[], none: string): string[] => (items.length ? items.map(i => `- ${i}`) : [none]) // never truncated: each line is something not covered

// Contract files and one-way-door lines the sprint's intents name.
function contracts(n: number): { slug: string; text: string }[] {
  return intentsOf(n).flatMap(i => [...i.contractFiles.map(f => ({ slug: i.slug, text: `contract ${f}` })),
    ...read(i.file).split('\n').filter(l => /one-way/i.test(l)).map(l => ({ slug: i.slug, text: `one-way: ${l.replace(/^[\s>*#-]+/, '').trim()}` }))])
}

type Row = ReturnType<typeof parseLedger>[number]
// Each ledger row with its source line, intents and test cases; a case counts as hidden when its holdout file exists (file names only: a case is never opened here).
function rowsOf(n: number): { r: Row; src: string; slugs: string[]; mine: string[]; hidden: boolean }[] {
  const rows = exists(ledgerPath(n)) ? parseLedger(read(ledgerPath(n))) : []
  const map = conversionMapOf(n) === null ? [] : parseMap(read(path.join(sprintDir(n), 'conversion.md')))
  const cases = exists(path.join(sprintDir(n), 'testplan', 'cases.md')) ? parseCases(read(path.join(sprintDir(n), 'testplan', 'cases.md'))) : []
  const hidden = new Set(exists(holdoutDir(n)) ? fs.readdirSync(holdoutDir(n)).map(caseId) : [])
  return rows.map(r => {
    const ids = [r.id, ...(r.alias ? [r.alias] : [])], src = map.find(m => m.ids.some(i => ids.includes(i)))
    const mine = cases.filter(c => [...c.reqs, ...c.rules].some(i => ids.includes(i))).map(c => c.id)
    return { r, src: src ? `; source.md:${src.line}` : '', slugs: intentsOf(n).filter(i => i.behaviours.some(b => [...b.reqs, ...b.rules].some(x => ids.includes(x)))).map(i => i.slug), mine, hidden: mine.some(c => hidden.has(c)) }
  })
}

// 1 to 3 questions, answered in the reviewer's words. One candidate list per category, in this order: criteria with no test case or no hidden case,
// what is not covered, values nobody at the client said, NFRs with a number, contracts and one-way doors. Each category gives its first before any gives a second;
// a sprint with nothing to ask gets the fallback, so the gate is never empty.
export function checkQuestions(n: number): string[] {
  const rows = exists(ledgerPath(n)) ? parseLedger(read(ledgerPath(n))) : []
  const more = proposedMore(n, read(prdPath(n)), conversionMapOf(n))
  const ask = (what: string, tail: string): string => `${what}. ${tail}`
  const unproven = rowsOf(n).filter(x => !x.mine.length || !x.hidden)
  const open = [...(exists(coveragePath(n)) ? parseCoverage(read(coveragePath(n))).filter(c => c.state !== 'covered' && c.state !== 'answered').map(c => `${c.id} is ${c.state === 'n/a' ? 'marked n/a' : c.state === 'proposed' ? 'the agent\'s assumption' : c.state}${c.reason ? ` (${short(c.reason, 60)})` : ''}`) : []), ...openQuestions(read(prdPath(n))).map(q => `PRD open question "${short(q)}"`)]
  const proposed = [
    ...rows.filter(r => r.origin === 'proposed').map(r => ask(`${r.id} "${short(r.quote.replace(MARK, ''))}" (proposed at chart)`, WHY)),
    ...(more.behaviours ?? []).map(b => ask(`${b.where} "${short(b.text.replace(MARK, ''))}" (${b.why.includes('marked') ? 'proposed at chart' : 'unattributed'})`, WHY)),
    ...(more.decisions ?? []).map(d => ask(`${d.where} "${short(d.text)}" (proposed at chart)`, WHY))]
  const cats = [
    unproven.map(x => ask(`${x.r.id} "${short(x.r.quote)}" has ${!x.mine.length ? 'no test case' : 'no hidden case'}`, 'Which test proves it, and what would that test miss?')),
    open.map(o => ask(/ is marked n\/a\b/.test(o) ? o : `${o} is not covered`, 'Is it safe to leave out, and who decided?')),
    proposed,
    rows.filter(r => /^NFR-/.test(r.id) && /\d/.test(r.quote.replace(/^NFR-\d+/, ''))).map(r => ask(`${r.id} "${short(r.quote)}" sets a numeric target`, 'Is that the number the client needs, and what happens if it is missed?')),
    contracts(n).map(c => ask(`${c.slug}: ${c.text} cannot be changed cheaply once others build on it`, 'Is that the interface the client needs, and why?'))]
  const picked = [...cats.flatMap(c => c.slice(0, 1)), ...cats.flatMap(c => c.slice(1))].slice(0, MAX_QUESTIONS)
  return picked.length ? picked : ['Which acceptance criterion is riskiest, and which test case proves it?']
}

function acceptance(n: number): string[] {
  const rows = rowsOf(n).map(x => ({ cells: [x.r.id, `"${x.r.quote}" prd.md:${x.r.line}${x.src}`, x.slugs.join(', ') || 'none', x.mine.join(', ') || 'none', x.hidden ? 'yes' : 'no'] }))
  return table(['id', 'PRD quote', 'intents', 'test cases', 'hidden case'], rows.map(r => r.cells), r => r.slice(2).some(c => c === 'none' || c === 'no'))
}

// The NFR rows: limits that must hold in every change built on this chart, with the PRD line they come from. Nothing when the PRD has none.
function invariants(n: number): string[] {
  const rows = rowsOf(n).filter(x => x.r.id.startsWith('NFR-'))
  return rows.length ? ['## Invariants and limits', '', ...list(rows.map(x => `${x.r.id}: "${x.r.quote}" prd.md:${x.r.line}`), ''), ''] : []
}

// What the person approves: the sprint's intents, then each part of the bundle with its path and a count read from disk.
function approving(n: number): string[] {
  const rel = (p: string): string => toPosix(path.relative(ROOT, p)), intents = intentsOf(n), sub = (d: string): number => (exists(d) ? fs.readdirSync(d, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).length : 0)
  const part = (what: string, p: string, count = ''): string => `- ${what}: ${rel(p)}${exists(p) ? count : ' (missing)'}`
  const cases = path.join(testplanDir(n), 'cases.md'), design = designDocOf(n), nContracts = new Set(intents.flatMap(i => i.contractFiles)).size
  return ['## What you are approving', '', ...table(['intent', 'requirements', 'days', 'depends on'], intents.map(i => [i.slug, i.prd.join(', ') || 'none', String(i.estimateDays ?? '?'), i.depends.join(', ') || '-'])), '',
    part('test plan', path.join(testplanDir(n), 'plan.md')), part('test cases', cases, `, ${exists(cases) ? parseCases(read(cases)).length : 0} cases`), part('test data', path.join(testplanDir(n), 'data'), `, ${sub(path.join(testplanDir(n), 'data'))} files`), part('holdout tests', holdoutDir(n), `, ${exists(holdoutDir(n)) ? fs.readdirSync(holdoutDir(n)).filter(f => /^TC-\d+$/.test(caseId(f))).length : 0} test files`), part('architecture', path.join(ROOT, ARCH_REL)), `- ADRs of this sprint: ${adrFilesOf(n).length}`, `- contracts the intents name: ${nContracts}`, part('build order', planPath(n)), part('tasks and lanes', implPlanPath(n)), ...(design ? [part('design doc', path.join(ROOT, design))] : []), '']
}

function criticalCases(n: number): string[] {
  const cases = requiredHoldouts(parseCases(read(path.join(sprintDir(n), 'testplan', 'cases.md'))))
  if (!cases.length) return []
  return ['## Required holdout cases', '', ...table(['case', 'intent', 'behaviour', 'observable result'], cases.map(c => [c.id, c.intent, c.behaviour, c.expected || 'missing']), () => true), '']
}

function outcomesAndScope(n: number): string[] {
  const { gates } = parseRegistry(read(SENSORS_PATH)).registry
  if (gates.plan || !gates.requireChart) return []
  const intents = intentsOf(n)
  return ['## Outcomes and allowed scope', '', ...intents.flatMap(i => [
    `### ${i.slug}`, '',
    `Allowed paths: ${[...i.scope, ...fmList(read(i.file), 'touches')].join(', ') || 'none declared'}`, '',
    ...list(i.behaviours.map(b => `${b.id} ${b.text}`), 'No behaviours declared.'), '',
  ])]
}

// The reviewer's ## Deferred items (a tier S chart parks its medium findings there): the approver reads them here.
const deferred = (n: number): string[] => (/^#{2,3}[ \t]+Deferred\b[^\n]*\n([\s\S]*?)(?=^#{2,3}[ \t]|(?![\s\S]))/m.exec(exists(reviewPath(n)) ? read(reviewPath(n)) : '')?.[1] ?? '').split(/\n(?=[-*]\s)/).filter(c => /^[-*]\s/.test(c)).map(c => c.replace(/^[-*]\s+/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(c => c && !/^(none|nothing|no .*)\.?$/i.test(c) && SUFFIX.exec(c)?.[1]?.startsWith('reopened') !== false).map(c => `deferred review item: ${short(c, 160)}`)

function notCovered(n: number): string[] {
  const review = chartReview(n) ?? [], open = new Set((chartOpenFindings(n) ?? []).map(f => f.n)), waivers = chartWaivers(n)
  const coverage = exists(coveragePath(n)) ? parseCoverage(read(coveragePath(n))).filter(c => c.state !== 'covered' && c.state !== 'answered') : []
  // n/a rows with no "by" and the same reason are one bullet naming all their topics; open rows and rows with a "by" stay one per line.
  const merged = new Map<string, string[]>(), lines: string[] = []
  for (const c of coverage) { const tail = `${c.state}${c.by ? ` by ${c.by}` : ''}${c.reason ? ` — ${c.reason}` : ''}`; if (c.state !== 'n/a' || c.by) { lines.push(`${c.id}: ${tail}`); continue }; const ids = merged.get(tail); if (ids) ids.push(c.id); else { merged.set(tail, [c.id]); lines.push(`\0${tail}`) } }
  return list([
    ...lines.map(l => (l.startsWith('\0') ? `${merged.get(l.slice(1))!.join(', ')}: ${l.slice(1)}` : l)),
    ...openQuestions(read(prdPath(n))).map(q => `PRD open question: ${q}`),
    ...review.filter(f => f.status !== 'confirmed').flatMap(f => {
      const w = waivers.find(x => x.finding === f.n && x.text_sha === f.sha)
      return open.has(f.n) ? [`finding ${f.n}: ${short(f.text, 160)} (not confirmed)`] : f.status === 'claimed' && !w ? [`finding ${f.n}: ${short(f.text, 160)} (tier S: fixed, never confirmed; read the fix)`] : w ? [`finding ${f.n}: ${short(f.text, 160)} (waived by ${w.by}: ${w.reason})`] : []
    }),
    ...deferred(n)], 'Nothing: every topic is covered, no question is open, every review finding is confirmed.')
}

// `- <NNNN title>: <the sentence under ## Decision>` per ADR of the sprint, then each contract the intents name.
function decisions(n: number): string[] {
  const adrs = adrFilesOf(n).map(f => {
    const text = read(f), title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? path.basename(f, '.md')
    const body = section(text, 'Decision').split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).find(Boolean) ?? ''
    return `${title}: ${short(/^.*?[.!?](?=\s|$)/.exec(body)?.[0] ?? body, 160)}`
  })
  return list([...adrs, ...contracts(n).map(c => `${c.slug}: ${c.text}`)], 'No ADR and no contract.')
}

export function approvalPage(n: number): string {
  const qs = checkQuestions(n), proposed = proposedReport(n).split('\n')
  return [`<!-- Generated ${new Date().toISOString().slice(0, 10)} by \`chart summary ${n}\` from prd.md, requirements.md, the intents, the test plan, coverage.md, chart-review.md and the ADRs; regenerated by ${skillRef('approve')} before hashing. Do not edit. -->`,
    `# Approval summary: sprint ${n}`, '', 'Read this page first; the chart bundle is the evidence behind it.', '',
    '## The decision', '', git(['remote', 'get-url', 'origin']) !== null
      ? 'One decision covers this chart: your approving review of the pull request head commit. It records who approved and which commit, and CI ties it to the chart seal. Any later push to the chart needs a new review.'
      : `One decision covers this chart: your ${skillRef('approve')} chart-${n}. It records who approved and the hash of this page, and merges the chart branch into the trunk (this repo has no remote, so there is no pull request). Any later edit to the chart needs a new approval.`, '',
    ...approving(n),
    '## Supplied by the agent', '', ...(proposed.length > MAX_ROWS ? [...proposed.slice(0, MAX_ROWS), `... ${proposed.length - MAX_ROWS} more line(s): run \`prd proposed ${n}\``] : proposed), '',
    '## Look at first', '', 'Nothing to answer: these are the points most worth a look before you decide approve or not approved.', '', ...qs.map(q => `- ${q}`), '',
    ...invariants(n),
    '## Acceptance criteria', '', ...acceptance(n), '',
    ...criticalCases(n),
    '## Not covered', '', ...notCovered(n), '',
    '## Decisions', '', ...decisions(n), '',
    ...outcomesAndScope(n)].join('\n')
}
export function writeApprovalPage(n: number): string {
  fs.mkdirSync(sprintDir(n), { recursive: true }); writeProductIgnore()
  fs.writeFileSync(approvalMdPath(n), approvalPage(n))
  return `${sprintRel(n)}/approval.md`
}

// The decision is one AskUserQuestion with two options; the hook, never the model, records it. Only the exact label "Approve chart-N" approves: a free-text
// answer, the other option or a skipped question records nothing. The record is tied to the page the person saw by the page's hash (the generated-on line
// is left out, so a later day does not change it).
const pendingPath = (n: number): string => path.join(sprintDir(n), 'answers.pending.json')
const pageSha = (page: string): string => crypto.createHash('sha256').update(page.split('\n').slice(1).join('\n')).digest('hex')
const text = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? String((v as { answer?: unknown }).answer ?? '') : '')
const APPROVE = (n: number): string => `Approve chart-${n}`

// PostToolUse on AskUserQuestion. The tool_response shape is not documented in this repo; this reads `answers` as an object keyed by question text
// (or an array in question order), beside the `tool_input.questions[].question` shape the `asked` hook already reads. A batch that is not exactly this
// chart's one decision question, carrying the page sha marker, writes nothing; any answer but the approve label clears an earlier record.
export function recordDecision(input: HookInput): void {
  if (input.tool_name !== 'AskUserQuestion') return
  try {
    const asked = (Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : []).map(q => String((q as { question?: unknown } | null)?.question ?? ''))
    const resp = input.tool_response?.answers
    for (const n of sprintsOnDisk()) {
      if (!exists(prdPath(n)) || chartState(n).state === 'approved') continue
      const sha = pageSha(approvalPage(n))
      if (asked.length !== 1 || !asked[0]!.includes(`page sha ${sha.slice(0, 12)}`) || !asked[0]!.includes(APPROVE(n) + '?')) continue
      const given = Array.isArray(resp) ? resp[0] : resp && typeof resp === 'object' ? (resp as Record<string, unknown>)[asked[0]!] : undefined
      if (text(given).trim().toLowerCase() === APPROVE(n).toLowerCase()) writeAtomic(pendingPath(n), JSON.stringify({ page_sha: sha, at: new Date().toISOString(), decision: 'approved' }, null, 2) + '\n')
      else fs.rmSync(pendingPath(n), { force: true })
    }
  } catch { /* nothing recorded: the approval then refuses */ }
}

// Regenerates the page, then checks the hook recorded "approved" for it; refuses until it did. `ask` (the skill's preamble) only prints how to ask: it never approves.
export function approvalGate(n: number, ask = false): void {
  const page = writeApprovalPage(n), sha = pageSha(read(approvalMdPath(n)))
  const how = `page sha ${sha}\nread ${page}, then put ONE question to the person through ${skillRef('approve')} (AskUserQuestion): "[page sha ${sha.slice(0, 12)}] ${APPROVE(n)}?" with exactly two options, "${APPROVE(n)}" and "Not approved: I will fix it"; the hook records the choice. On approve run approve chart-${n}; on anything else stop (nothing is recorded: they correct the chart and run ${skillRef('approve')} chart-${n} again)`
  if (ask) fail(`chart-${n} waits for one decision, approve or not approved (${page})\n${how}`)
  let rec: { page_sha?: unknown; decision?: unknown } = {}
  try { rec = JSON.parse(read(pendingPath(n))) as typeof rec } catch { fail(`no recorded decision for chart-${n}: the person decides through ${skillRef('approve')}\n${how}`) }
  if (rec.page_sha !== sha) fail(`the recorded decision is for another version of the page (${String(rec.page_sha).slice(0, 12)}, now ${sha.slice(0, 12)}): ask again through ${skillRef('approve')}\n${how}`)
  if (rec.decision !== 'approved') fail(`the recorded decision is not an approval: ask again through ${skillRef('approve')}\n${how}`)
}

// CI's row for a chart approval: who, and each stored answer cut short (an approval made before the single decision kept check answers).
export function approvalRow(f: string, name: string, by: string, clean: (v: unknown) => string): string {
  let a: ApprovalAnswer[] = []
  // A seal records no answers: the independent review of the PR head decides, and the row names the revision it covers.
  if (by === PR_SEAL) { let d = '?'; try { d = String((JSON.parse(read(path.join(ROOT, f))) as { digest?: unknown }).digest ?? '?').slice(0, 12) } catch { /* shown as ? */ } return `approval ${name} sealed at ${clean(d)}; decided by the independent review of the PR head` }
  try { const v = (JSON.parse(read(path.join(ROOT, f))) as { answers?: unknown }).answers; if (Array.isArray(v)) a = v as ApprovalAnswer[] } catch { /* a row with none */ }
  return `approval ${name} by ${clean(by)}${a.map(x => `; Q: "${clean(short(String(x?.question), 80))}" A: "${clean(short(String(x?.answer), 80))}"`).join('')}`
}

// The model never writes the page or the answers file (the first is generated, the second is the hook's record of what the person said): the guard denies Write and Edit on them.
export function generatedDenied(input: HookInput): string | null {
  const t = input.tool_input ?? {}, p = [t.file_path, t.notebook_path].find((v): v is string => typeof v === 'string')
  return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name ?? '') && p && /\.rig\/product\/sprints\/sprint-\d+\/(approval\.md|answers\.pending\.json)$/.test(toPosix(path.resolve(input.cwd ?? ROOT, p)))
    ? 'approval.md is generated by `chart summary <N>` and answers.pending.json is written by the hook from the person\'s answers: never edit either; change the chart and regenerate, and the approver answers through the approve skill' : null
}
