// The one-page approval summary (`chart summary <N>`, three-gates C5): a reviewer approves a chart from one generated page and
// answers its check questions in their own words before the approval is recorded. Pure text from the chart's files: no model.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT, read, exists, fail, toPosix, skillRef, type HookInput } from './core.ts'
import { section, openQuestions } from './model.ts'
import { approvalMdPath, sprintDir, sprintRel, sprintsOnDisk, holdoutDir, ledgerPath, coveragePath, prdPath, writeProductIgnore } from './product.ts'
import { intentsOf, chartReview, chartWaivers, chartOpenFindings, chartState, conversionMapOf, adrFilesOf, type ApprovalAnswer } from './chart.ts'
import { parseLedger, parseCases } from './chartcheck.ts'
import { parseMap } from './prdformat.ts'
import { parseCoverage } from './prdcoverage.ts'
import { proposedMore, proposedReport } from './prdcmd.ts'
import { caseId } from './holdout.ts'

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
  const open = [...(exists(coveragePath(n)) ? parseCoverage(read(coveragePath(n))).filter(c => c.state === 'open' || c.state === 'n/a').map(c => `${c.id} is ${c.state}${c.reason ? ` (${short(c.reason, 60)})` : ''}`) : []), ...openQuestions(read(prdPath(n))).map(q => `PRD open question "${short(q)}"`)]
  const proposed = [
    ...rows.filter(r => r.origin === 'proposed').map(r => ask(`${r.id} "${short(r.quote.replace(MARK, ''))}" (proposed at chart)`, WHY)),
    ...(more.behaviours ?? []).map(b => ask(`${b.where} "${short(b.text.replace(MARK, ''))}" (${b.why.includes('marked') ? 'proposed at chart' : 'unattributed'})`, WHY)),
    ...(more.decisions ?? []).map(d => ask(`${d.where} "${short(d.text)}" (proposed at chart)`, WHY))]
  const cats = [
    unproven.map(x => ask(`${x.r.id} "${short(x.r.quote)}" has ${!x.mine.length ? 'no test case' : 'no hidden case'}`, 'Which test proves it, and what would that test miss?')),
    open.map(o => ask(`${o} is not covered`, 'Is it safe to leave out, and who decided?')),
    proposed,
    rows.filter(r => /^NFR-/.test(r.id) && /\d/.test(r.quote.replace(/^NFR-\d+/, ''))).map(r => ask(`${r.id} "${short(r.quote)}" sets a numeric target`, 'Is that the number the client needs, and what happens if it is missed?')),
    contracts(n).map(c => ask(`${c.slug}: ${c.text} cannot be changed cheaply once others build on it`, 'Is that the interface the client needs, and why?'))]
  const picked = [...cats.flatMap(c => c.slice(0, 1)), ...cats.flatMap(c => c.slice(1))].slice(0, MAX_QUESTIONS)
  return picked.length ? picked : ['Which acceptance criterion is riskiest, and which test case proves it?']
}

function acceptance(n: number): string[] {
  const rows = rowsOf(n).map(x => ({ cells: [x.r.id, `"${short(x.r.quote)}" prd.md:${x.r.line}${x.src}`, x.slugs.join(', ') || 'none', x.mine.join(', ') || 'none', x.hidden ? 'yes' : 'no'] }))
  return table(['id', 'PRD quote', 'intents', 'test cases', 'hidden case'], rows.map(r => r.cells), r => r.slice(2).some(c => c === 'none' || c === 'no'))
}

function notCovered(n: number): string[] {
  const review = chartReview(n) ?? [], open = new Set((chartOpenFindings(n) ?? []).map(f => f.n)), waivers = chartWaivers(n)
  const coverage = exists(coveragePath(n)) ? parseCoverage(read(coveragePath(n))).filter(c => c.state === 'open' || c.state === 'n/a') : []
  return list([
    ...coverage.map(c => `${c.id}: ${c.state}${c.by ? ` by ${c.by}` : ''}${c.reason ? ` — ${c.reason}` : ''}`),
    ...openQuestions(read(prdPath(n))).map(q => `PRD open question: ${q}`),
    ...review.filter(f => f.status !== 'confirmed').flatMap(f => {
      const w = waivers.find(x => x.finding === f.n && x.text_sha === f.sha)
      return open.has(f.n) ? [`finding ${f.n}: ${short(f.text, 160)} (not confirmed)`] : w ? [`finding ${f.n}: ${short(f.text, 160)} (waived by ${w.by}: ${w.reason})`] : []
    })], 'Nothing: every topic is covered, no question is open, every review finding is confirmed.')
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
    '## Acceptance criteria', '', ...acceptance(n), '',
    '## Supplied by the agent', '', ...(proposed.length > MAX_ROWS ? [...proposed.slice(0, MAX_ROWS), `... ${proposed.length - MAX_ROWS} more line(s): run \`prd proposed ${n}\``] : proposed), '',
    '## Not covered', '', ...notCovered(n), '',
    '## Decisions', '', ...decisions(n), '',
    '## Check questions', '', 'Answer each in your own words when you approve; a blank, "skip" or "n/a" is refused.', '', ...qs.map((q, i) => `${i + 1}. ${q}`), ''].join('\n')
}
export function writeApprovalPage(n: number): string {
  fs.mkdirSync(sprintDir(n), { recursive: true }); writeProductIgnore()
  fs.writeFileSync(approvalMdPath(n), approvalPage(n))
  return `${sprintRel(n)}/approval.md`
}

// What an answer must be: the reviewer's own words, not a way past the question.
const badAnswer = (a: unknown): string | null => {
  if (typeof a !== 'string') return 'not text'
  const t = a.trim().replace(/[.!\s]+$/, '').toLowerCase()
  return !t ? 'blank' : /^(skip|n\/a|na|none|-)$/.test(t) ? `"${a.trim()}"` : t.length < 10 ? 'under 10 characters' : null
}
// The answers file is written by the AskUserQuestion hook, never by the model; it is tied to the page the person saw by the page's hash
// (the generated-on line is left out, so a later day does not change it).
const pendingPath = (n: number): string => path.join(sprintDir(n), 'answers.pending.json')
const pageSha = (page: string): string => crypto.createHash('sha256').update(page.split('\n').slice(1).join('\n')).digest('hex')
const text = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : v && typeof v === 'object' ? String((v as { answer?: unknown }).answer ?? '') : '')

// PostToolUse on AskUserQuestion. The tool_response shape is not documented in this repo; this reads `answers` as an object keyed by question text
// (or an array in question order), beside the `tool_input.questions[].question` shape the `asked` hook already reads. A batch that is not this
// chart's questions, each carrying the page sha marker, writes nothing.
export function recordAnswers(input: HookInput): void {
  if (input.tool_name !== 'AskUserQuestion') return
  try {
    const asked = (Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : []).map(q => String((q as { question?: unknown } | null)?.question ?? ''))
    const resp = input.tool_response?.answers
    for (const n of sprintsOnDisk()) {
      if (!exists(prdPath(n)) || chartState(n).state === 'approved') continue
      const sha = pageSha(approvalPage(n)), qs = checkQuestions(n)
      if (asked.length !== qs.length || !qs.every((q, i) => asked[i]!.includes(q) && asked[i]!.includes(`page sha ${sha.slice(0, 12)}`))) continue
      const given = (i: number): unknown => (Array.isArray(resp) ? resp[i] : resp && typeof resp === 'object' ? (resp as Record<string, unknown>)[asked[i]!] : undefined)
      fs.writeFileSync(pendingPath(n), JSON.stringify({ page_sha: sha, at: new Date().toISOString(), answers: qs.map((question, i) => ({ question, answer: text(given(i)).trim() })) }, null, 2) + '\n')
    }
  } catch { /* nothing recorded: the approval then refuses */ }
}

// Regenerates the page, then returns the answers the hook recorded for it; refuses (naming each question) until every question has a real answer.
// `ask` (the skill's preamble) only prints the questions: it never approves.
export function approvalGate(n: number, ask = false): ApprovalAnswer[] {
  const page = writeApprovalPage(n), sha = pageSha(read(approvalMdPath(n))), qs = checkQuestions(n)
  const numbered = qs.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
  const how = `page sha ${sha}\nread ${page}, then put each question to the person through ${skillRef('approve')} (AskUserQuestion, free text, no skip), each question starting "[page sha ${sha.slice(0, 12)}] " then the text as listed; the hook records their answers, then run approve chart-${n}`
  if (ask) fail(`chart-${n} has ${qs.length} check question(s) the approver answers in their own words (${page}):\n${numbered}\n${how}`)
  let rec: { page_sha?: unknown; answers?: unknown } = {}
  try { rec = JSON.parse(read(pendingPath(n))) as typeof rec } catch { fail(`no recorded answers for chart-${n}: answer the questions through ${skillRef('approve')}\n${numbered}\n${how}`) }
  if (rec.page_sha !== sha) fail(`the recorded answers are for another version of the page (${String(rec.page_sha).slice(0, 12)}, now ${sha.slice(0, 12)}): answer the questions again through ${skillRef('approve')}\n${numbered}\n${how}`)
  const given = Array.isArray(rec.answers) ? rec.answers as { question?: unknown; answer?: unknown }[] : []
  if (given.length !== qs.length || qs.some((q, i) => given[i]?.question !== q)) fail(`the recorded answers are not for these questions: answer them again through ${skillRef('approve')}\n${numbered}\n${how}`)
  const bad = qs.flatMap((q, i) => { const why = badAnswer(given[i]!.answer); return why ? [`the answer to\n  ${i + 1}. ${q}\nis ${why}: ask it again in the person's own words (at least 10 characters; not "skip" or "n/a")`] : [] })
  if (bad.length) fail(bad.join('\n'))
  return qs.map((question, i) => ({ question, answer: String(given[i]!.answer).trim() }))
}
export const echoAnswers = (a: ApprovalAnswer[]): string => `recorded answers:\n${a.map(x => `  ${short(x.question, 80)} -> ${short(x.answer, 80)}`).join('\n')}\n`

// CI's row for a chart approval: who, and each answer cut short; INCOMPLETE when it holds fewer answers than its page lists questions (a page absent at HEAD: an older approval).
export const INCOMPLETE = 'INCOMPLETE ANSWERS'
export function approvalRow(f: string, name: string, by: string, clean: (v: unknown) => string): string {
  let a: ApprovalAnswer[] = []
  try { const v = (JSON.parse(read(path.join(ROOT, f))) as { answers?: unknown }).answers; if (Array.isArray(v)) a = v as ApprovalAnswer[] } catch { /* a row with none */ }
  const page = path.join(ROOT, path.dirname(f), 'approval.md'), listed = exists(page) ? (read(page).split('## Check questions')[1]?.match(/^\d+\. /gm) ?? []).length : 0
  return `approval ${name} by ${clean(by)}${a.map(x => `; Q: "${clean(short(String(x?.question), 80))}" A: "${clean(short(String(x?.answer), 80))}"`).join('')}${a.length < listed ? ` [${INCOMPLETE}: ${a.length} for ${listed} question(s)]` : ''}`
}

// The model never writes the page or the answers file (the first is generated, the second is the hook's record of what the person said): the guard denies Write and Edit on them.
export function generatedDenied(input: HookInput): string | null {
  const t = input.tool_input ?? {}, p = [t.file_path, t.notebook_path].find((v): v is string => typeof v === 'string')
  return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name ?? '') && p && /\.rig\/product\/sprints\/sprint-\d+\/(approval\.md|answers\.pending\.json)$/.test(toPosix(path.resolve(input.cwd ?? ROOT, p)))
    ? 'approval.md is generated by `chart summary <N>` and answers.pending.json is written by the hook from the person\'s answers: never edit either; change the chart and regenerate, and the approver answers through the approve skill' : null
}
