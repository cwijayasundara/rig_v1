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
