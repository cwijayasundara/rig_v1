// The PR body (proposal 2026-10-25 A1): what a reviewer needs before reading the diff. Built from the change's own files, no model
// call; the pr skill adds the part that takes judgement (special things to note, the change outline) as pr-outline.md.
import { section, blastRadius } from './model.ts'
import type { Risk } from './risk.ts'

type PrBodyInput = { intent: string; spec: string; plan: string; verify: { pass: boolean; tree: string | null; blocks: string[] } | null; outline: string; review: string; risk: Risk; amendments?: string }

const firstSentence = (text: string): string => /^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim())?.[0].replace(/\s+/g, ' ') ?? text.trim().replace(/\s+/g, ' ')
const bullets = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => /^[-*]\s+\S/.test(l))

// One-way when the plan edits a contract file (they freeze at approval), else two-way: reverting the merge undoes it.
const contracts = (plan: string): string[] => bullets(section(plan, 'Contracts')).map(l => l.replace(/^[-*]\s+/, '').replace(/`/g, ''))

function door(plan: string): string {
  const c = contracts(plan)
  return c.length ? `one-way (contracts: ${c.join(', ')})` : 'two-way'
}

function revert(plan: string): string {
  const c = contracts(plan)
  return c.length
    ? `Reverting the code does not undo the contract change to ${c.join(', ')}: ship the previous contract as a new change (expand–migrate–contract).`
    : 'Revert the change: `git revert <sha>` for a plain commit on the trunk, or `git revert -m 1 <merge sha>` for a merge commit.'
}

export function prBody(i: PrBodyInput): string {
  const why = firstSentence(section(i.intent, 'Intent')) || 'none recorded'
  const behaviours = bullets(section(i.spec, 'Behaviours'))
  const radius = (blastRadius(i.spec) ?? []).map(p => `- ${p}`)
  const amended = bullets(section(i.amendments ?? '', 'Amendments')).filter(l => !/^[-*]\s+none\.?$/i.test(l))
  const evidence = i.verify ? `verify: ${i.verify.pass ? 'pass' : 'fail'} on tree ${i.verify.tree ?? 'unknown'} (${i.verify.blocks.join(', ') || 'no blocking sensors'})` : 'verify: none'
  const missed = bullets(section(i.review, 'Unverifiable'))
  const parts = [
    `## Why the change\n\n${why}`,
    behaviours.length ? `## Behaviours\n\n${behaviours.join('\n')}` : '',
    amended.length ? `## Amendments after approval\n\n${amended.join('\n')}` : '',
    `## Blast radius\n\n${radius.length ? radius.join('\n') : 'none recorded'}\n\nDoor: ${door(i.plan)}`,
    `## Risk\n\n${i.risk.reasons.length ? `Tier ${i.risk.tier}\n\n${i.risk.reasons.map(r => `- ${r}`).join('\n')}` : 'Tier 0: none of the signals'}`,
    `## How to revert\n\n${revert(i.plan)}`,
    `## What the checks would miss\n\n${!i.review.trim() ? 'no review.md' : missed.length ? missed.join('\n') : 'nothing the reviewer named'}`,
    `## Evidence\n\n${evidence}`,
    i.outline.trim(),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
