// Bookkeeping the chart writes into its own files: `chart finding` marks review findings, `chart answer` moves an open question to ## Resolved.
import fs from 'node:fs'; import path from 'node:path'
import { ROOT, read, out, fail, whoami, writeAtomic, exists, git, toPosix, skillRef } from './core.ts'
import { parseReview, parseCases, requiredHoldouts, SUFFIX } from './chartcheck.ts'
import { chartOpenFindings, chartDone, intentsOf, designDocOf, adrFilesOf } from './chart.ts'; import { approvalPage } from './approvalsummary.ts'; import { caseId } from './holdout.ts'
import { archPath, intentsDir, reviewPath, prdPath, ledgerPath, coveragePath, implPlanPath, planPath, testplanDir, holdoutDir, approvalMdPath } from './product.ts'

const USAGE_FINDING = 'usage: chart finding <sprint> <numbers: 3 | 1,3,5 | 1-8> <fixed|confirmed|reopened> ["why"]  (why is required for reopened)'
const USAGE_ANSWER = 'usage: chart answer <sprint> <intent-slug|architecture> <Qn> "<answer>" [--proposed]'
const NO_NAME = 'no identity; set git user.name (git config user.name "<name>")'

export function cmdWhoami(): void { out(whoami() ?? fail(`whoami: ${NO_NAME}`)) }

const numbersOf = (spec: string, max: number): number[] => [...new Set(spec.split(',').flatMap(part => {
  const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim()), a = Number(m?.[1]), b = Number(m?.[2] ?? m?.[1])
  if (!m || a < 1 || b < a || b > max) fail(`"${part}" is not among the ${max} finding(s) of chart-review.md. ${USAGE_FINDING}`)
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}))].sort((x, y) => x - y)

// chart finding <N> <numbers> <fixed|confirmed|reopened> ["why"]: the finding's text before the suffix is left byte for byte (a waiver pins its sha).
function markFindings(n: number, pos: string[]): void {
  const [spec, status, ...why] = pos, reason = why.join(' ').replace(/\s+/g, ' ').trim()
  if (!spec || !['fixed', 'confirmed', 'reopened'].includes(status ?? '')) fail(USAGE_FINDING); if (status === 'reopened' && !reason) fail(`reopened needs a reason. ${USAGE_FINDING}`); if (!exists(reviewPath(n))) fail(`chart-${n} has no chart-review.md: nothing to mark`)
  const text = read(reviewPath(n)), before = parseReview(text), picked = new Set(numbersOf(spec, before.length))
  const suffix = status === 'fixed' ? ' → fixed' : status === 'confirmed' ? ' → fixed (confirmed)' : ` → reopened: ${reason}`; let inside = false, k = 0
  const next = text.split('\n').map(line => {
    if (/^##\s/.test(line)) { inside = /^##\s+Findings\s*$/.test(line); return line }
    return !inside || !/^[-*]\s+\S|^\d+[.)]\s+\S/.test(line) || !picked.has(++k) ? line : line.replace(SUFFIX, '') + suffix
  }).join('\n')
  if (parseReview(next).some((f, i) => f.sha !== before[i]?.sha || f.n !== before[i]?.n)) fail('chart finding: a finding\'s text would change; nothing was written')
  writeAtomic(reviewPath(n), next)
  const verdict = (chartOpenFindings(n) ?? []).length ? 'changes-needed' : 'pass'; const rest = next.split('\n')
  if (/^verdict:/i.test(rest[0] ?? '')) rest[0] = `verdict: ${verdict}`; else rest.unshift(`verdict: ${verdict}`); writeAtomic(reviewPath(n), rest.join('\n')); out([...[...picked].map(i => `finding ${i}: ${suffix.slice(3)}`), `verdict: ${verdict}`].join('\n'))
}

// chart answer <N> <intent-slug|architecture> <Qn> "<answer>" [--proposed]
function answerQuestion(n: number, pos: string[], proposed: boolean): void {
  const [target, q, ...words] = pos, answer = words.join(' ').replace(/\s+/g, ' ').trim()
  if (!target || !/^Q\d+$/.test(q ?? '') || !answer) fail(USAGE_ANSWER); const who = proposed ? null : whoami(); if (!proposed && !who) fail(`chart answer: ${NO_NAME} or pass --proposed`)
  const file = target === 'architecture' ? archPath : path.join(intentsDir(n), `${target.replace(/\.md$/, '')}.md`); if (!exists(file)) fail(`chart answer: ${path.relative(process.cwd(), file)} does not exist`)
  const lines = read(file).split('\n')
  const head = lines.findIndex(l => /^##\s+Open questions\s*$/.test(l))
  const end = head < 0 ? -1 : lines.findIndex((l, i) => i > head && /^##\s/.test(l)), stop = head < 0 ? -1 : end < 0 ? lines.length : end
  const at = head < 0 ? -1 : lines.findIndex((l, i) => i > head && i < stop && new RegExp(`^\\s*[-*]\\s*\\**${q}\\b`).test(l)); if (at < 0) fail(`chart answer: no "- ${q}" bullet under ## Open questions in ${target}`)
  let last = at + 1; while (last < stop && /^\s+\S/.test(lines[last] ?? '')) last++ // its indented continuation lines go with it
  lines.splice(at, last - at); if (!lines.slice(head + 1, stop - (last - at)).some(l => /^\s*[-*]\s+\S/.test(l))) lines.splice(at, 0, 'none')
  const row = `- ${q}: ${answer} ${proposed ? '(proposed at chart)' : `(confirmed at chart by ${who})`}`; const r = lines.findIndex(l => /^##\s+Resolved\s*$/.test(l))
  let e = r < 0 ? lines.length : lines.findIndex((l, i) => i > r && /^##\s/.test(l)); if (e < 0) e = lines.length; while (e > r + 1 && e > 0 && !lines[e - 1]!.trim()) e--
  if (r < 0) lines.length = e; lines.splice(e, 0, ...(r < 0 ? ['', '## Resolved', '', row, ''] : [row])); writeAtomic(file, lines.join('\n'))
  out(`${target}: ${q} resolved${proposed ? ' (proposed)' : ` by ${who}`}`)
}

// chart goal <N>: every output of the chart, one line each, then MET or NOT MET (exit 1). Claude Code's /goal judges only what the transcript shows,
// so this is the evidence it reads; --print [--prd <path>] gives the /goal line a person types to run the chart unattended.
const USAGE_GOAL = 'usage: chart goal <sprint> [--print [--prd <path>]]'
function chartGoal(n: number, opt: Record<string, string | true>): void {
  const self = toPosix(path.relative(ROOT, process.argv[1] ?? '')), cmd = `node --disable-warning=ExperimentalWarning ${self.startsWith('..') ? process.argv[1] : self} chart goal ${n}`
  if (opt.print) return out(`/goal Chart sprint ${n} with rig: invoke the rig:chart skill with the arguments "${n}${typeof opt.prd === 'string' ? ` @${opt.prd}` : ''}" and follow it to its last step, asking the person nothing. The goal is met only when the output of \`${cmd}\`, run after your last change, is shown in this conversation and its last line is "chart-${n} goal: MET". That command checks every output of the chart: the PRD, the requirements ledger and the coverage list, the intents, the architecture and ADRs, the implementation plan and build order, the test plan, test cases, test data and holdout tests, no blocking check finding, a review with every finding confirmed, the approval page, and all of it committed on rig/chart-${n}. Fix what a failed line names by the chart skill's own steps; never edit a file only to make a line pass, never weaken or invent a PRD rule, and never run ${skillRef('approve')}: the approval is the person's. Stop and say why if the same line fails three times in a row, or after 60 turns.`)
  const rel = (p: string): string => toPosix(path.relative(ROOT, p)), count = (d: string, keep: (f: string) => boolean = () => true): number => (exists(d) ? fs.readdirSync(d).filter(keep).length : 0)
  const file = (what: string, p: string, more = ''): [string, boolean, string] => [what, exists(p), exists(p) ? rel(p) + more : `missing ${rel(p)}`]
  const casesMd = path.join(testplanDir(n), 'cases.md'), cases = exists(casesMd) ? parseCases(read(casesMd)) : [], want = requiredHoldouts(cases).map(c => c.id), have = new Set(exists(holdoutDir(n)) ? fs.readdirSync(holdoutDir(n)).map(caseId) : [])
  const intents = intentsOf(n), left = chartDone(n), design = designDocOf(n), data = count(path.join(testplanDir(n), 'data')), lacking = want.filter(id => !have.has(id))
  const page = exists(approvalMdPath(n)) && read(approvalMdPath(n)).split('\n').slice(1).join('\n') === approvalPage(n).split('\n').slice(1).join('\n')
  const dirty = (git(['status', '--porcelain', '--', '.rig/product', 'docs']) ?? '?').trim(), branch = git(['branch', '--show-current']) ?? ''
  const rows: [string, boolean, string][] = [file('PRD', prdPath(n)), file('requirements ledger', ledgerPath(n)), file('coverage list', coveragePath(n)), ['intents', intents.length > 0, intents.map(i => i.slug).join(', ') || 'none written'],
    file('architecture', archPath, `, ${adrFilesOf(n).length} ADR(s) of this sprint`), ...(design ? [file('design doc', path.join(ROOT, design))] : []), file('implementation plan', implPlanPath(n)), file('build order', planPath(n)), file('test plan', path.join(testplanDir(n), 'plan.md')),
    ['test cases', cases.length > 0, `${cases.length} in ${rel(casesMd)}`], ['test data', data > 0, `${data} file(s) in ${rel(path.join(testplanDir(n), 'data'))}`], ['holdout tests', !lacking.length, lacking.length ? `no test file for ${lacking.join(', ')}` : `${want.length} holdout case(s), each with its test`],
    ['checks and review', !left.length, left.join('; ') || 'no blocking finding, every review finding confirmed'], ['approval page', page, page ? rel(approvalMdPath(n)) : `missing or out of date: run chart summary ${n}`],
    ['committed', branch === `rig/chart-${n}` && !dirty, branch !== `rig/chart-${n}` ? `on branch ${branch || '?'}, not rig/chart-${n}` : dirty ? `uncommitted: ${dirty.split('\n').map(l => l.slice(3)).join(', ')}` : `on rig/chart-${n}, nothing uncommitted`]]
  const bad = rows.filter(r => !r[1]).length; out([`chart-${n} goal`, ...rows.map(([what, ok, text]) => `  ${ok ? '✓' : '✗'} ${what}: ${text}`), `chart-${n} goal: ${bad ? `NOT MET (${bad} of ${rows.length} lines fail)` : 'MET'}`].join('\n')); if (bad) process.exit(1)
}

export function cmdChartMark(sub: string, pos: string[], opt: Record<string, string | true>): void {
  const [num, ...rest] = pos
  if (!/^\d{1,4}$/.test(num ?? '')) fail(sub === 'finding' ? USAGE_FINDING : sub === 'goal' ? USAGE_GOAL : USAGE_ANSWER)
  return sub === 'goal' ? chartGoal(Number(num), opt) : sub === 'finding' ? markFindings(Number(num), rest) : answerQuestion(Number(num), rest, Boolean(opt.proposed))
}
