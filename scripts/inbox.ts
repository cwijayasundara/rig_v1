// The intent inbox (.rig/intent/*.md): ideas a product owner commits before any change exists. People write `status:`
// (draft | accepted | closed); `shipped` is derived from the change whose intent.md names the file as its `source:`.
// A sprint intent (`sprint: N`, written by /rig:decompose) is accepted by its sprint's chart approval instead of its own
// status; `depends:` names other intents that must ship first (chart.ts holds the chart, this file the dependencies).
import fs from 'node:fs'
import path from 'node:path'
import { SDLC, CHANGES, exists, read, out, frontmatter, listChanges, isShipped, git, optString, type Args, type ChangeType, type Tier } from './core.ts'
import { modelFor, isChangeType, isTier, type ModelAlias } from './graph.ts'
import { chartApproval, changedSinceApproval, listField, sprintOf, type ChartState } from './chart.ts'

export const INBOX = path.join(SDLC, 'intent')
export type InboxEntry = {
  file: string; status: 'draft' | 'accepted' | 'closed' | 'shipped' | 'unknown'; change: string | null; type: ChangeType | null; tier: Tier | null; model: ModelAlias
  sprint: number | null; depends: string[]; prd: string[]; owner: string | null; accepted: boolean; blockedBy: string[]; ready: boolean
}
const DECLARED = ['draft', 'accepted', 'closed'] as const
const KEBAB_MD = /^[a-z0-9][a-z0-9-]{0,60}\.md$/
const nameOf = (file: string): string => file.replace(/\.md$/, '')

// Every intent on a dependency cycle, mapped to the cycle as `a→b→a`.
function cycles(graph: Map<string, string[]>): Map<string, string> {
  const found = new Map<string, string>()
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const visit = (n: string): void => {
    state.set(n, 'open')
    stack.push(n)
    for (const d of graph.get(n) ?? []) {
      if (!graph.has(d)) continue
      if (state.get(d) === 'open') {
        const loop = [...stack.slice(stack.indexOf(d)), d]
        for (const m of loop) if (!found.has(m)) found.set(m, loop.join('→'))
      } else if (!state.has(d)) visit(d)
    }
    stack.pop()
    state.set(n, 'done')
  }
  for (const n of [...graph.keys()].sort()) if (!state.has(n)) visit(n)
  return found
}

export function inboxEntries(): InboxEntry[] {
  if (!exists(INBOX)) return []
  const bySource = new Map<string, string>()
  for (const slug of listChanges()) {
    const source = frontmatter(read(path.join(CHANGES, slug, 'intent.md'))).data.source
    if (source) bySource.set(path.basename(source), slug)
  }
  const charts = new Map<number, ChartState>()
  const chartOf = (n: number): ChartState => charts.get(n) ?? (charts.set(n, chartApproval(n)), charts.get(n) as ChartState)
  const base = fs.readdirSync(INBOX).filter(f => f.endsWith('.md')).sort().map(file => {
    const d = frontmatter(read(path.join(INBOX, file))).data
    const change = bySource.get(file) ?? null
    const declared = (DECLARED as readonly string[]).includes(d.status ?? '') ? (d.status as InboxEntry['status']) : 'unknown'
    const type = isChangeType(d.type) ? d.type : null
    const tier = isTier(d.tier) ? d.tier : null
    const sprint = sprintOf(d.sprint)
    const accepted = sprint !== null ? declared !== 'closed' && chartOf(sprint) === 'approved' : declared === 'accepted'
    // No valid tier is a doubt, and a doubt is Opus (M0's rule).
    return {
      file, status: change && isShipped(change) ? 'shipped' : declared, change, type, tier, model: tier ? modelFor(type ?? 'feature', tier) : 'opus',
      sprint, depends: listField(d.depends), prd: listField(d.prd), owner: d.owner || null, accepted,
    } satisfies Omit<InboxEntry, 'blockedBy' | 'ready'>
  })
  const byName = new Map(base.map(e => [nameOf(e.file), e]))
  const loops = cycles(new Map(base.map(e => [nameOf(e.file), e.depends])))
  return base.map(e => {
    const blockedBy = [
      ...e.depends.filter(d => !byName.has(d)).map(d => `missing:${d}`),
      ...e.depends.filter(d => byName.has(d) && byName.get(d)?.status !== 'shipped'),
      ...(loops.has(nameOf(e.file)) ? [`cycle:${loops.get(nameOf(e.file))}`] : []),
    ]
    return { ...e, blockedBy, ready: e.accepted && !e.change && !blockedBy.length }
  })
}

// Why `new --source` must not start this intent yet, or null. Intents without `sprint:` keep today's rule (no status check).
export function startRefusal(file: string): string | null {
  const e = inboxEntries().find(x => x.file === file)
  if (!e) return null
  if (e.blockedBy.length) return `blocked by: ${e.blockedBy.join(', ')} (each must ship first: its change's ship.json committed here)`
  if (e.sprint === null) return null
  if (e.status === 'closed') return `${file} is closed`
  const state = chartApproval(e.sprint)
  if (state === 'missing') return `chart-${e.sprint} is not approved: a person reviews the sprint and runs /rig:approve chart-${e.sprint}`
  if (state === 'stale') return `chart-${e.sprint} is stale: a person reviews what changed (${changedSinceApproval(e.sprint).join(', ')}) and runs /rig:approve chart-${e.sprint}`
  return null
}

export const specBranch = (file: string): string => `sdlc/intent-${file.replace(/\.md$/, '')}`

// What the rig-spec workflow drafts: ready (accepted, unblocked, no change yet), a plain name, and no draft branch already on the remote.
export const pendingIntents = (): InboxEntry[] => inboxEntries().filter(e =>
  e.ready && KEBAB_MD.test(e.file) && git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${specBranch(e.file)}`]) === null)

export function cmdInbox(args: Args): void {
  let rows = args.opt.pending ? pendingIntents() : inboxEntries()
  if (args.opt.ready) rows = rows.filter(e => e.ready)
  if (args.opt.sprint !== undefined) rows = rows.filter(e => e.sprint !== null && e.sprint === sprintOf(optString(args, 'sprint')))
  const owner = optString(args, 'owner')
  if (owner) rows = rows.filter(e => e.owner === owner)
  if (args.opt.json) return out(JSON.stringify(rows))
  if (!rows.length) return out('intent inbox is empty (.rig/intent/)')
  const sprints = [...new Set(rows.flatMap(e => (e.sprint === null ? [] : [e.sprint])))].sort((a, b) => a - b)
  out([
    ...sprints.map(n => `chart-${n}: ${chartApproval(n)}`),
    ...rows.map(e => `${e.status.padEnd(9)}${e.file}${e.change ? ` → ${e.change}` : ''}${e.blockedBy.length ? `  blocked by ${e.blockedBy.join(', ')}` : ''}`),
  ].join('\n'))
}
