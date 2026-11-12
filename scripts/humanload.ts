// Human load (readiness doc §2 Step 2: questions and approvals per change, minutes of human attention per merged PR). The hooks append one
// counts-only row per person turn, agent stop and question batch to the active change's evidence/human.jsonl, committed with the change so
// a team pilot can add them up. No prompt or answer text is ever written.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, SDLC, exists, sanctionWrites, type HookInput } from './core.ts'
import { activeSlug } from './lifecycle.ts'

export type HumanRow = { at: string; session: string; kind: 'prompt' | 'stop' | 'question'; n?: number }

export const questionsAsked = (input: HookInput): number => {
  const q = input.tool_input?.questions
  return Array.isArray(q) && q.length > 0 ? q.length : 1
}

export function recordHuman(kind: HumanRow['kind'], input: HookInput, n?: number): void {
  const slug = exists(SDLC) ? activeSlug() : null
  if (!slug || !exists(path.join(CHANGES, slug))) return
  const rel = `.rig/changes/${slug}/evidence/human.jsonl`
  const row: HumanRow = { at: new Date().toISOString(), session: String(input.session_id ?? ''), kind, ...(n === undefined ? {} : { n }) }
  fs.mkdirSync(path.join(CHANGES, slug, 'evidence'), { recursive: true })
  fs.appendFileSync(path.join(CHANGES, slug, 'evidence', 'human.jsonl'), JSON.stringify(row) + '\n')
  sanctionWrites([rel])
}

// Counts and an attention estimate: per session, each prompt that follows a stop adds the gap, capped at idleCapMin so a break does
// not count. A first prompt or a last stop pairs with nothing. Malformed rows are skipped.
export function summarise(rows: HumanRow[], idleCapMin = 10): { prompts: number; questions: number; attentionMin: number } {
  const ok = rows.filter(r => r && typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)) && ['prompt', 'stop', 'question'].includes(r.kind))
  let prompts = 0, questions = 0, minutes = 0
  const sessions = new Map<string, HumanRow[]>()
  for (const r of ok) sessions.set(r.session ?? '', [...(sessions.get(r.session ?? '') ?? []), r])
  for (const list of sessions.values()) {
    let stopAt: number | null = null
    for (const r of [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      if (r.kind === 'question') questions += typeof r.n === 'number' && r.n > 0 ? r.n : 1
      else if (r.kind === 'stop') stopAt = Date.parse(r.at)
      else {
        prompts++
        if (stopAt !== null) minutes += Math.min((Date.parse(r.at) - stopAt) / 60_000, idleCapMin)
        stopAt = null
      }
    }
  }
  return { prompts, questions, attentionMin: Math.round(minutes * 10) / 10 }
}
