// The sprint trace report (sdlc.ts chart check <N>): PRD requirements without an intent or a test case, intents without a
// requirement, ids nobody defined, cases without an intent or data, dependency problems, and what changed since the
// approval. It informs the reviewers of the chart PR and the /rig:chart fix round; it never blocks.
import path from 'node:path'
import { exists, read, out, fail, type Args } from './core.ts'
import { PRODUCT, prdPath, prdIds, testCases, sprintOf, chartApproval, changedSinceApproval, type ChartState } from './chart.ts'
import { inboxEntries } from './inbox.ts'

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

export function cmdChart(args: Args): void {
  const [sub, num] = args.pos
  const n = sprintOf(num)
  if (sub !== 'check' || n === null) fail('usage: chart check <N> [--json]')
  if (!exists(prdPath(n))) fail(`no PRD for sprint ${n}: write .rig/product/prd/sprint-${n}.md from the prd-format template`)
  const r = chartCheck(n)
  if (args.opt.json) return out(JSON.stringify(r))
  const { sprint: _s, approval, ...gaps } = r
  out([`chart-${n}: ${approval}`, ...Object.entries(gaps).map(([k, v]) => `${k}: ${v.length ? v.join(', ') : 'none'}`)].join('\n'))
}
