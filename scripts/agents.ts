// Agent records (proposal 2026-11-14 N5, N6, D2): the Agent hooks append each launch and each agent's last-line report to the change's
// evidence/agents.jsonl, and the launch hook refuses the sixth launch. Nothing here calls a model; a missing field is recorded as null.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, readJsonl } from './core.ts'

export const LAUNCH_BUDGET = 5
export type AgentRow = { id: string; agent: string; model: string | null; at: string; status: 'DONE' | 'DONE_WITH_CONCERNS' | 'BLOCKED' | null; note: string; tokens: number | null; toolUses: number | null; ms: number | null }
type Rec = { kind: 'launch'; id: string; agent: string; model: string | null; at: string } | { kind: 'done'; id: string; status: AgentRow['status']; note: string; tokens: number | null; toolUses: number | null; ms: number | null }
const file = (slug: string, root?: string): string => path.join(root ?? '', root ? '.rig/changes' : CHANGES, slug, 'evidence', 'agents.jsonl')
const append = (slug: string, r: Rec): void => { fs.mkdirSync(path.dirname(file(slug)), { recursive: true }); fs.appendFileSync(file(slug), JSON.stringify(r) + '\n') }
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// The last status line of the answer wins; no line is `null`, which is "no report" and never BLOCKED.
export function parseReport(text: string): { status: AgentRow['status']; note: string } {
  const m = [...String(text).matchAll(/^status:\s*(DONE_WITH_CONCERNS|DONE|BLOCKED)\b[ :—-]*(.*)$/gim)].pop()
  return m ? { status: m[1]!.toUpperCase() as AgentRow['status'], note: m[2]!.trim() } : { status: null, note: '' }
}

export function responseText(resp: unknown): string {
  const c = typeof resp === 'object' && resp !== null ? (resp as { content?: unknown }).content : undefined
  if (typeof c === 'string') return c
  return Array.isArray(c) ? c.flatMap(b => (typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string' ? [(b as { text: string }).text] : [])).join('\n') : ''
}

export const recordLaunch = (slug: string, l: { id: string; agent: string; model: string | null; at: string }): void => append(slug, { kind: 'launch', ...l })
export function recordDone(slug: string, id: string, resp: unknown): void {
  const r = (typeof resp === 'object' && resp !== null ? resp : {}) as Record<string, unknown>
  append(slug, { kind: 'done', id, ...parseReport(responseText(resp)), tokens: num(r.totalTokens), toolUses: num(r.totalToolUseCount), ms: num(r.totalDurationMs) })
}

// Launch rows in launch order, each merged with its done row (the last one wins).
// `root` reads another checkout (the report); by default the current repo.
export function agentRows(slug: string, root?: string): AgentRow[] {
  const recs = readJsonl<Rec>(file(slug, root))
  return recs.flatMap(r => {
    if (r.kind !== 'launch') return []
    const d = recs.filter((x): x is Extract<Rec, { kind: 'done' }> => x.kind === 'done' && x.id === r.id).pop()
    return [{ id: r.id, agent: r.agent, model: r.model, at: r.at, status: d?.status ?? null, note: d?.note ?? '', tokens: d?.tokens ?? null, toolUses: d?.toolUses ?? null, ms: d?.ms ?? null }]
  })
}

export function budgetRefusal(slug: string): string | null {
  if (readJsonl<Rec>(file(slug)).filter(r => r.kind === 'launch').length < LAUNCH_BUDGET) return null
  return `launch budget: ${slug} has had ${LAUNCH_BUDGET} agent launches (the limit per change). Do not retry: open a draft PR with \`S pr ${slug} --draft --message "<type(scope): summary>"\` and say in it what is left`
}
