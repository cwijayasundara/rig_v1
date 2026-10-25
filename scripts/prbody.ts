// The PR body (proposal 2026-10-25 A1): what a reviewer needs before reading the diff. Built from the change's own files, no model
// call; the pr skill adds the part that takes judgement (special things to note, the change outline) as pr-outline.md.
import { section } from './model.ts'

type PrBodyInput = { intent: string; spec: string; plan: string; verify: { pass: boolean; tree: string | null; blocks: string[] } | null; outline: string }

const firstSentence = (text: string): string => /^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim())?.[0].replace(/\s+/g, ' ') ?? text.trim().replace(/\s+/g, ' ')
const bullets = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => /^[-*]\s+\S/.test(l))

// One-way when the plan edits a contract file (they freeze at approval), else two-way: reverting the merge undoes it.
function door(plan: string): string {
  const contracts = bullets(section(plan, 'Contracts')).map(l => l.replace(/^[-*]\s+/, '').replace(/`/g, ''))
  return contracts.length ? `one-way (contracts: ${contracts.join(', ')})` : 'two-way'
}

export function prBody(i: PrBodyInput): string {
  const why = firstSentence(section(i.intent, 'Intent')) || 'none recorded'
  const behaviours = bullets(section(i.spec, 'Behaviours'))
  const radius = bullets(section(i.spec, 'Blast radius'))
  const evidence = i.verify ? `verify: ${i.verify.pass ? 'pass' : 'fail'} on tree ${i.verify.tree ?? 'unknown'} (${i.verify.blocks.join(', ') || 'no blocking sensors'})` : 'verify: none'
  const parts = [
    `## Why the change\n\n${why}`,
    behaviours.length ? `## Behaviours\n\n${behaviours.join('\n')}` : '',
    `## Blast radius\n\n${radius.length ? radius.join('\n') : 'none recorded'}\n\nDoor: ${door(i.plan)}`,
    `## Evidence\n\n${evidence}`,
    i.outline.trim(),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
