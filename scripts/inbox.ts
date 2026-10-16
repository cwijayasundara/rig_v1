// The intent inbox (.rig/intent/*.md): ideas a product owner commits before any change exists. People write `status:`
// (draft | accepted | closed); `shipped` is derived from the change whose intent.md names the file as its `source:`.
// `depends:` names other intents that must ship first.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, CHANGES, toPosix, exists, read, out, frontmatter, listChanges, isShipped, git, optString, defaultBase, type Args, type ChangeType, type Tier } from './core.ts'
import { modelFor, isChangeType, isTier, type ModelAlias } from './graph.ts'

export const INBOX = path.join(SDLC, 'intent')
export const listField = (v: string | undefined): string[] =>
  (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '').replace(/\.md$/, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
export type InboxEntry = {
  file: string; status: 'draft' | 'accepted' | 'closed' | 'shipped' | 'unknown'; change: string | null; type: ChangeType | null; tier: Tier | null; model: ModelAlias
  depends: string[]; owner: string | null; accepted: boolean; blockedBy: string[]; ready: boolean
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
  const base = fs.readdirSync(INBOX).filter(f => f.endsWith('.md')).sort().map(file => {
    const d = frontmatter(read(path.join(INBOX, file))).data
    const change = bySource.get(file) ?? null
    const declared = (DECLARED as readonly string[]).includes(d.status ?? '') ? (d.status as InboxEntry['status']) : 'unknown'
    const type = isChangeType(d.type) ? d.type : null
    const tier = isTier(d.tier) ? d.tier : null
    const accepted = declared === 'accepted'
    // No valid tier is a doubt, and a doubt is Opus (M0's rule).
    return {
      file, status: change && isShipped(change) ? 'shipped' : declared, change, type, tier, model: tier ? modelFor(type ?? 'feature', tier) : 'opus',
      depends: listField(d.depends), owner: d.owner || null, accepted,
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

// Why `new --source` must not start this intent yet, or null. No status check: a person chose to start it.
export function startRefusal(file: string): string | null {
  const e = inboxEntries().find(x => x.file === file)
  if (!e) return null
  // `depends:` decides the order: an uncommitted or branch-only edit to it is refused until it merges to the trunk through review.
  const ref = defaultBase() ?? 'HEAD'
  const was = frontmatter(git(['show', `${ref}:${toPosix(path.relative(ROOT, path.join(INBOX, file)))}`]) ?? '').data
  const now = frontmatter(read(path.join(INBOX, file))).data
  if (Object.keys(was).length && listField(was.depends).join() !== listField(now.depends).join()) return `its depends: differs from ${ref === 'HEAD' ? 'the last commit' : 'the trunk'}; merge that edit through review first`
  if (e.blockedBy.length) return `blocked by: ${e.blockedBy.join(', ')} (each must ship first: its change's ship.json committed here)`
  return null
}

export const specBranch = (file: string): string => `sdlc/intent-${file.replace(/\.md$/, '')}`

// Intents ready to start: ready (accepted, unblocked, no change yet), a plain name, and no draft branch already on the remote.
export const pendingIntents = (): InboxEntry[] => inboxEntries().filter(e =>
  e.ready && KEBAB_MD.test(e.file) && git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${specBranch(e.file)}`]) === null)

export function cmdInbox(args: Args): void {
  let rows = args.opt.pending ? pendingIntents() : inboxEntries()
  if (args.opt.ready) rows = rows.filter(e => e.ready)
  const owner = optString(args, 'owner')
  if (owner) rows = rows.filter(e => e.owner === owner)
  if (args.opt.json) return out(JSON.stringify(rows))
  if (!rows.length) return out('intent inbox is empty (.rig/intent/)')
  out(rows.map(e => `${e.status.padEnd(9)}${e.file}${e.change ? ` → ${e.change}` : ''}${e.blockedBy.length ? `  blocked by ${e.blockedBy.join(', ')}` : ''}`).join('\n'))
}
