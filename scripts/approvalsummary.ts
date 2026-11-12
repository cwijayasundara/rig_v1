// The one-page approval summary (`chart summary <N>`, three-gates C5): a reviewer approves a chart from one generated page and
// answers its check questions in their own words before the approval is recorded. Pure text from the chart's files: no model.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, read, exists, fail, toPosix, type HookInput } from './core.ts'
import { section, openQuestions } from './model.ts'
import { approvalMdPath, sprintDir, sprintRel, holdoutDir, ledgerPath, coveragePath, prdPath, writeProductIgnore } from './product.ts'
import { intentsOf, chartReview, chartWaivers, chartOpenFindings, conversionMapOf, adrFilesOf, type ApprovalAnswer } from './chart.ts'
import { parseLedger, parseCases } from './chartcheck.ts'
import { parseMap } from './prdformat.ts'
import { parseCoverage } from './prdcoverage.ts'
import { proposedMore, proposedReport } from './prdcmd.ts'
import { caseId } from './holdout.ts'

const MAX_ROWS = 40, MAX_QUESTIONS = 3, MARK = /\s*\((?:proposed|default|decided) at chart\)/gi
const cell = (t: string): string => t.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const short = (t: string, n = 110): string => (t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t)
const table = (head: string[], rows: string[][]): string[] => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.slice(0, MAX_ROWS).map(r => `| ${r.map(cell).join(' | ')} |`),
  ...(rows.length > MAX_ROWS ? [`... ${rows.length - MAX_ROWS} more row${rows.length - MAX_ROWS === 1 ? '' : 's'} (see requirements.md)`] : [])]
const list = (items: string[], none: string): string[] => (items.length ? [...items.slice(0, MAX_ROWS).map(i => `- ${i}`), ...(items.length > MAX_ROWS ? [`- ... ${items.length - MAX_ROWS} more`] : [])] : [none])

// Contract files and one-way-door lines the sprint's intents name.
function contracts(n: number): { slug: string; text: string }[] {
  return intentsOf(n).flatMap(i => [...i.contractFiles.map(f => ({ slug: i.slug, text: `contract ${f}` })),
    ...read(i.file).split('\n').filter(l => /one-way/i.test(l)).map(l => ({ slug: i.slug, text: `one-way: ${l.replace(/^[\s>*#-]+/, '').trim()}` }))])
}

// At most 3, in this order: values nobody at the client said, NFR rows with a number, then contracts and one-way doors. Each is answered in the reviewer's words.
export function checkQuestions(n: number): string[] {
  const rows = exists(ledgerPath(n)) ? parseLedger(read(ledgerPath(n))) : []
  const more = proposedMore(n, read(prdPath(n)), conversionMapOf(n))
  const ask = (what: string, tail: string): string => `${what}. ${tail}`
  return [
    ...rows.filter(r => r.origin === 'proposed').map(r => ask(`${r.id} "${short(r.quote.replace(MARK, ''))}" (proposed at chart)`, 'Is that what the client wants, and why?')),
    ...(more.behaviours ?? []).filter(b => b.why.includes('marked')).map(b => ask(`${b.where} "${short(b.text.replace(MARK, ''))}" (proposed at chart)`, 'Is that what the client wants, and why?')),
    ...(more.decisions ?? []).map(d => ask(`${d.where} "${short(d.text)}" (proposed at chart)`, 'Is that what the client wants, and why?')),
    ...rows.filter(r => /^NFR-/.test(r.id) && /\d/.test(r.quote.replace(/^NFR-\d+/, ''))).map(r => ask(`${r.id} "${short(r.quote)}" sets a numeric target`, 'Is that the number the client needs, and what happens if it is missed?')),
    ...contracts(n).map(c => ask(`${c.slug}: ${c.text} cannot be changed cheaply once others build on it`, 'Is that the interface the client needs, and why?')),
  ].slice(0, MAX_QUESTIONS)
}

function acceptance(n: number): string[] {
  const rows = exists(ledgerPath(n)) ? parseLedger(read(ledgerPath(n))) : []
  const map = conversionMapOf(n) === null ? [] : parseMap(read(path.join(sprintDir(n), 'conversion.md')))
  const cases = exists(path.join(sprintDir(n), 'testplan', 'cases.md')) ? parseCases(read(path.join(sprintDir(n), 'testplan', 'cases.md'))) : []
  const hidden = new Set(exists(holdoutDir(n)) ? fs.readdirSync(holdoutDir(n)).map(caseId) : []) // file names only: a case is never opened here
  const ids = (r: (typeof rows)[number]): string[] => [r.id, ...(r.alias ? [r.alias] : [])]
  return table(['id', 'PRD quote', 'intents', 'test cases', 'hidden case'], rows.map(r => {
    const src = map.find(m => m.ids.some(i => ids(r).includes(i)))
    const mine = cases.filter(c => [...c.reqs, ...c.rules].some(i => ids(r).includes(i))).map(c => c.id)
    const slugs = intentsOf(n).filter(i => i.behaviours.some(b => [...b.reqs, ...b.rules].some(x => ids(r).includes(x)))).map(i => i.slug)
    return [r.id, `"${short(r.quote)}" prd.md:${r.line}${src ? `; source.md:${src.line}` : ''}`, slugs.join(', ') || 'none', mine.join(', ') || 'none', mine.some(c => hidden.has(c)) ? 'yes' : 'no']
  }))
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
  return [`<!-- Generated by \`chart summary ${n}\` from the chart's files. Do not edit: change the chart and regenerate. The approval records this page's hash. -->`,
    `# Approval summary: sprint ${n}`, '', 'Read this page first; the chart bundle is the evidence behind it.', '',
    '## Acceptance criteria', '', ...acceptance(n), '',
    '## Supplied by the agent', '', ...(proposed.length > MAX_ROWS ? [...proposed.slice(0, MAX_ROWS), `... ${proposed.length - MAX_ROWS} more line(s): run \`prd proposed ${n}\``] : proposed), '',
    '## Not covered', '', ...notCovered(n), '',
    '## Decisions', '', ...decisions(n), '',
    '## Check questions', '', ...(qs.length ? ['Answer each in your own words when you approve; a blank, "skip" or "n/a" is refused.', '', ...qs.map((q, i) => `${i + 1}. ${q}`)] : ['No check questions: nothing was proposed, no NFR carries a number and no contract is named.']), ''].join('\n')
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
// Regenerates the page, then returns the answers the approval records; refuses (naming each question) until every question has a real answer.
export function approvalGate(n: number, file: string | undefined): ApprovalAnswer[] {
  const page = writeApprovalPage(n), qs = checkQuestions(n)
  if (!qs.length) return []
  const numbered = qs.map((q, i) => `  ${i + 1}. ${q}`).join('\n')
  const how = `read ${page}, put each question to the person (free text, no skip) and run approve chart-${n} --answers <json file holding an array of ${qs.length} answer string(s), in order>`
  if (!file || file === 'true') fail(`chart-${n} has ${qs.length} check question(s) the approver answers in their own words (${page}):\n${numbered}\n${how}`)
  let given: unknown
  try { given = JSON.parse(read(path.resolve(file))) } catch { fail(`cannot read answers from ${file}: it must be a JSON array of ${qs.length} string(s)`) }
  if (!Array.isArray(given) || given.length !== qs.length) fail(`${qs.length} answer(s) are needed, in order, one per question:\n${numbered}\nthe file holds ${Array.isArray(given) ? given.length : 'no array'}`)
  const bad = qs.flatMap((q, i) => { const why = badAnswer(given[i]); return why ? [`the answer to\n  ${i + 1}. ${q}\nis ${why}: write it in your own words (at least 10 characters; not "skip" or "n/a")`] : [] })
  if (bad.length) fail(bad.join('\n'))
  return qs.map((question, i) => ({ question, answer: String(given[i]).trim() }))
}

// The model never writes the page (it is generated; a hand edit is a stale approval): the guard denies Write and Edit on it.
export function generatedDenied(input: HookInput): string | null {
  const t = input.tool_input ?? {}, p = [t.file_path, t.notebook_path].find((v): v is string => typeof v === 'string')
  return ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(input.tool_name ?? '') && p && /\.rig\/product\/sprints\/sprint-\d+\/approval\.md$/.test(toPosix(path.resolve(input.cwd ?? ROOT, p)))
    ? 'approval.md is generated by `chart summary <N>`: never edit it; change the chart and regenerate, and the approver reads it' : null
}
