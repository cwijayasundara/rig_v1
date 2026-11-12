// Human load (readiness doc §2 Step 2: questions and approvals per change, minutes of human attention per merged PR). The hooks append one
// counts-only row per person turn, agent stop and question batch to the active change's evidence/human.jsonl, committed with the change so
// a team pilot can add them up. No prompt or answer text is ever written.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, SDLC, exists, read, type HookInput } from './core.ts'
import { activeSlug } from './lifecycle.ts'

export type HumanRow = { at: string; session: string; kind: 'prompt' | 'stop' | 'asking' | 'question'; n?: number } // asking: a question batch shown, question: answered

export const questionsAsked = (input: HookInput): number => {
  const q = input.tool_input?.questions
  return Array.isArray(q) && q.length > 0 ? q.length : 1
}

// Best effort: a measure must never cost a gate. The hooks call this before their own work, so a throw here (a read-only tree, a
// directory where the file should be) is caught and named in one stderr line; the Stop gate and the prompt reset still run.
const UNION = 'changes/*/evidence/human.jsonl merge=union' // two engineers appending to one change's file merge without a conflict
export function recordHuman(kind: HumanRow['kind'], input: HookInput, n?: number): void {
  try {
    const slug = exists(SDLC) ? activeSlug() : null
    if (!slug) return
    const attrs = path.join(SDLC, '.gitattributes')
    if (!read(attrs).split('\n').includes(UNION)) fs.appendFileSync(attrs, `${read(attrs) && !read(attrs).endsWith('\n') ? '\n' : ''}${UNION}\n`)
    const row: HumanRow = { at: new Date().toISOString(), session: String(input.session_id ?? ''), kind, ...(n === undefined ? {} : { n }) }
    fs.mkdirSync(path.join(CHANGES, slug, 'evidence'), { recursive: true })
    fs.appendFileSync(path.join(CHANGES, slug, 'evidence', 'human.jsonl'), JSON.stringify(row) + '\n')
  } catch (e) { process.stderr.write(`rig: human load not recorded (${(e as Error).message.split('\n')[0]})\n`) }
}

// Counts and an attention estimate: per session, each prompt that follows a stop adds the gap, capped at idleCapMin so a break does
// not count. A first prompt or a last stop pairs with nothing. Malformed rows are skipped.
export function summarise(rows: HumanRow[], idleCapMin = 10): { prompts: number; questions: number; attentionMin: number } {
  const ok = rows.filter(r => r && typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)) && ['prompt', 'stop', 'asking', 'question'].includes(r.kind))
  let prompts = 0, questions = 0, minutes = 0
  const sessions = new Map<string, HumanRow[]>()
  for (const r of ok) sessions.set(r.session ?? '', [...(sessions.get(r.session ?? '') ?? []), r])
  for (const list of sessions.values()) {
    let stopAt: number | null = null, askAt: number | null = null
    for (const r of [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      if (r.kind === 'asking') askAt = Date.parse(r.at)
      else if (r.kind === 'question') {
        questions += typeof r.n === 'number' && r.n > 0 ? r.n : 1
        if (askAt !== null) minutes += Math.min((Date.parse(r.at) - askAt) / 60_000, idleCapMin) // the time spent answering
        askAt = null
      } else if (r.kind === 'stop') stopAt = Date.parse(r.at)
      else {
        prompts++
        if (stopAt !== null) minutes += Math.min((Date.parse(r.at) - stopAt) / 60_000, idleCapMin)
        stopAt = null
      }
    }
  }
  return { prompts, questions, attentionMin: Math.round(minutes * 10) / 10 }
}
