// The PR body (proposal 2026-10-25 A1): what a reviewer needs before reading the diff. Built from the change's own files, no model
// call; the pr skill adds the part that takes judgement (special things to note, the change outline) as pr-outline.md.
import { section } from './model.ts'

type PrBodyInput = { intent: string; spec: string; plan: string; verify: { pass: boolean; tree: string | null; blocks: string[] } | null; outline: string; review: string }

const firstSentence = (text: string): string => /^[\s\S]*?[.!?](?=\s|$)/.exec(text.trim())?.[0].replace(/\s+/g, ' ') ?? text.trim().replace(/\s+/g, ' ')
const bullets = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(l => /^[-*]\s+\S/.test(l))

// One-way when the plan edits a contract file (they freeze at approval), else two-way: reverting the merge undoes it.
const contracts = (plan: string): string[] => bullets(section(plan, 'Contracts')).map(l => l.replace(/^[-*]\s+/, '').replace(/`/g, ''))

function door(plan: string): string {
  const c = contracts(plan)
  return c.length ? `one-way (contracts: ${c.join(', ')})` : 'two-way'
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

// What a person should weigh before approving (proposal 2026-10-27 B3). A finding is open unless the confirm pass closed it
// (` → fixed (confirmed)`) or the builder fixed it before any confirm ran (` → fixed`); a reopened one is open.
function risk(plan: string, review: string): string {
  const open = bullets(section(review, 'Findings')).filter(l => !/→\s*fixed(?: \(confirmed\))?\s*$/.test(l)).length
  const dismissed = bullets(section(review, 'Dismissed')).length
  const unverifiable = bullets(section(review, 'Unverifiable')).length
  const signals = [
    contracts(plan).length ? '- one-way door' : '',
    open ? `- ${count(open, 'finding still open', 'findings still open')}` : '',
    dismissed ? `- ${count(dismissed, 'finding dismissed by the builder', 'findings dismissed by the builder')}` : '',
    unverifiable ? `- ${count(unverifiable, 'item the reviewer could not verify', 'items the reviewer could not verify')}` : '',
  ].filter(Boolean)
  return signals.length ? signals.join('\n') : 'none of the signals: two-way door, no open, dismissed or unverifiable findings'
}

function revert(plan: string): string {
  const c = contracts(plan)
  return c.length
    ? `Reverting the code does not undo the contract change to ${c.join(', ')}: ship the previous contract as a new change (expand–migrate–contract).`
    : 'Revert the merge commit: `git revert -m 1 <merge sha>`.'
}

export function prBody(i: PrBodyInput): string {
  const why = firstSentence(section(i.intent, 'Intent')) || 'none recorded'
  const behaviours = bullets(section(i.spec, 'Behaviours'))
  const radius = bullets(section(i.spec, 'Blast radius'))
  const evidence = i.verify ? `verify: ${i.verify.pass ? 'pass' : 'fail'} on tree ${i.verify.tree ?? 'unknown'} (${i.verify.blocks.join(', ') || 'no blocking sensors'})` : 'verify: none'
  const missed = bullets(section(i.review, 'Unverifiable'))
  const parts = [
    `## Why the change\n\n${why}`,
    behaviours.length ? `## Behaviours\n\n${behaviours.join('\n')}` : '',
    `## Blast radius\n\n${radius.length ? radius.join('\n') : 'none recorded'}\n\nDoor: ${door(i.plan)}`,
    `## Risk\n\n${risk(i.plan, i.review)}`,
    `## How to revert\n\n${revert(i.plan)}`,
    `## What the checks would miss\n\n${missed.length ? missed.join('\n') : 'nothing the reviewer named'}`,
    `## Evidence\n\n${evidence}`,
    i.outline.trim(),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
