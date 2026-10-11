// The sprint chart's commands. `chart check <N>`, the trace report: PRD requirements without an intent or a test case,
// intents without a requirement, ids nobody defined, cases without an intent or data, dependency problems, and what
// changed since the approval; it informs the reviewers of the chart PR and the /rig:chart fix round and never blocks.
// `chart routes`: the model and effort of the chart's two launches. `approve chart-<N>`: the sprint's one human gate.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, APPROVALS, exists, read, out, fail, now, type Args } from './core.ts'
import { openQuestions, unresolvedConcerns } from './model.ts'
import { PRODUCT, prdPath, prdIds, testCases, sprintOf, chartApproval, changedSinceApproval, chartManifest, chartDigest, chartRows, type ChartState, type ChartApproval } from './chart.ts'
import { inboxEntries } from './inbox.ts'
import { loadConfig } from './check.ts'
import { route, type Route } from './routing.ts'

export type ChartReport = {
  sprint: number; approval: ChartState; uncovered: string[]; untested: string[]; unreferenced: string[]; unknownIds: string[]
  orphanCases: string[]; missingData: string[]; deps: string[]; changedSinceApproval: string[]
}

export function chartCheck(n: number): ChartReport {
  const ids = prdIds(read(prdPath(n)))
  const known = new Set(ids)
  const entries = inboxEntries()
  const sprint = entries.filter(e => e.sprint === n)
  const cited = new Set(sprint.flatMap(e => e.prd))
  const testplan = path.join(PRODUCT, 'testplan')
  const cases = testCases(read(path.join(testplan, 'cases.md')))
  const tested = new Set(cases.flatMap(c => c.reqs))
  const names = new Set(entries.map(e => e.file.replace(/\.md$/, '')))
  return {
    sprint: n,
    approval: chartApproval(n),
    uncovered: ids.filter(i => !cited.has(i)),
    untested: ids.filter(i => !tested.has(i)),
    unreferenced: sprint.filter(e => !e.prd.length).map(e => e.file),
    unknownIds: [...new Set([...cited, ...tested])].filter(i => !known.has(i)).sort(),
    orphanCases: cases.filter(c => !names.has(c.intent)).map(c => `${c.id} → ${c.intent || '(none)'}`),
    missingData: cases.filter(c => c.data !== '-' && !exists(path.join(testplan, c.data))).map(c => `${c.id} → ${c.data}`),
    deps: sprint.flatMap(e => e.blockedBy.filter(b => /^(missing|cycle):/.test(b)).map(b => `${e.file}: ${b}`)),
    changedSinceApproval: changedSinceApproval(n),
  }
}

// Chart work has no change, so no tier: the architecture and intents are design work at its highest route (architect,
// tier L), the test plan is writing at the implementer's tier M route. sensors.json `routing` overrides apply as usual.
export function chartRoutes(): { architect: Route; testplan: Route } {
  const override = loadConfig().config.routing
  return { architect: route('architect', 'feature', 'L', 0, override).route, testplan: route('implementer', 'feature', 'M', 0, override).route }
}

// One approval per sprint covers its PRD, architecture, ADRs, test plan and intents (chart.ts). Recorded with the file
// hashes, so a re-review after an edit can read only what changed. No change folder exists, so it never reaches checkSlug.
export function approveChart(n: number, stage: string | undefined, by: string): void {
  if (stage !== undefined && stage !== 'chart') fail(`usage: approve chart-${n}`)
  if (!exists(prdPath(n))) fail(`nothing to approve: .rig/product/prd/sprint-${n}.md does not exist`)
  const files = chartManifest(n)
  const text = (p: string): string => read(path.join(ROOT, p))
  const md = files.map(f => f.path).filter(p => p.endsWith('.md'))
  const asked = md.filter(p => p.startsWith('.rig/product/prd/') || p === '.rig/product/architecture.md' || p.startsWith('.rig/product/adr/'))
  const open = asked.flatMap(p => openQuestions(text(p)).map(q => `${p}: ${q}`))
  if (open.length) fail(`resolve the open question(s) before approving chart-${n}: answer each, or record the default under ## Decisions, and leave "## Open questions" as none:\n${open.map(q => `  - ${q}`).join('\n')}`)
  const concerns = md.flatMap(p => unresolvedConcerns(text(p)).map(c => `${p}: ${c}`))
  if (concerns.length) fail(`resolve the concern(s) with their owners before approving chart-${n}: add " → resolved: <decision> (<owner>)" to each:\n${concerns.map(c => `  - ${c}`).join('\n')}`)
  const digest = chartDigest(n)
  if (chartRows(n).at(-1)?.digest === digest) return out(`chart-${n} is already approved (digest ${digest})`)
  const row: ChartApproval = { slug: `chart-${n}`, stage: 'chart', by, at: now(), digest, files }
  fs.appendFileSync(APPROVALS, JSON.stringify(row) + '\n')
  out(`approved chart-${n} by ${by} (digest ${digest}, ${files.length} files). Next: engineers pick from sdlc.ts inbox --ready --sprint ${n}`)
}

export function cmdChart(args: Args): void {
  const [sub, num] = args.pos
  if (sub === 'routes') return out(args.opt.json ? JSON.stringify(chartRoutes()) : Object.entries(chartRoutes()).map(([k, r]) => `${k}: ${typeof r === 'string' ? r : `${r.model} ${r.effort}`}`).join('\n'))
  const n = sprintOf(num)
  if (sub !== 'check' || n === null) fail('usage: chart check <N> [--json] | chart routes [--json]')
  if (!exists(prdPath(n))) fail(`no PRD for sprint ${n}: write .rig/product/prd/sprint-${n}.md from the prd-format template`)
  const r = chartCheck(n)
  if (args.opt.json) return out(JSON.stringify(r))
  const { sprint: _s, approval, ...gaps } = r
  out([`chart-${n}: ${approval}`, ...Object.entries(gaps).map(([k, v]) => `${k}: ${v.length ? v.join(', ') : 'none'}`)].join('\n'))
}
