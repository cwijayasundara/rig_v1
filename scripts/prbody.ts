// The PR body (proposal 2026-10-25 A1): what a reviewer needs before reading the diff. Built from the change's own files, no model
// call; the pr skill adds the part that takes judgement (special things to note, the change outline) as pr-outline.md.
import { section, blastRadius } from './model.ts'
import type { Risk } from './risk.ts'
import type { RunRow } from './runs.ts'

type PrBodyInput = { intent: string; spec: string; plan: string; verify: { pass: boolean; tree: string | null; blocks: string[] } | null; outline: string; review: string; risk: Risk; amendments?: string; runs?: RunRow[]; tests?: string }

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

// Evidence, not claims (proposal 2026-10-29 item 2): what the recorded runs show, read from evidence/runs.jsonl, never from the model.
const plain = (l: string): string => l.replace(/\x1b\[[0-9;]*m/g, '').trim()
const FAIL_LINE = /\bFAIL(ED)?\b|\bError\b|error:|✖|not ok|assert|Interrupted|panicked/i
// A red that is only a missing import or a collection error shows the tests need new code, not which behaviour fails without it.
const COLLECTION = /error during collection|ModuleNotFoundError|ImportError|Cannot find module|ERR_MODULE_NOT_FOUND|cannot find symbol|undefined: \w|unresolved import|could not compile|cannot find package/i
const ASSERTION = /AssertionError|\bassert|expected|--- FAIL|not ok|✖ /i

function redProof(runs: RunRow[]): string {
  const red = runs.findLast(r => r.expectFail && r.source === 'ship')
  if (!red) return 'Red proof: no run of the new tests on the base code is recorded.'
  const tail = red.tail.split('\n').map(plain).filter(Boolean), hits = tail.filter(l => FAIL_LINE.test(l)).slice(-6)
  const weak = COLLECTION.test(red.tail) && !ASSERTION.test(red.tail)
    ? '\n\nWeak red: the tests failed on a missing import or a collection error, not an assertion. It shows they need the new code, not which behaviour fails without it.' : ''
  return `Red proof: the change's tests ran on the base code and failed (exit ${red.exit}, \`${red.cmd}\`):\n\n\`\`\`\n${(hits.length ? hits : tail.slice(-3)).map(l => l.slice(0, 200)).join('\n')}\n\`\`\`${weak}`
}

// The latest run of each check on the head tree (a base-tree run has a cwd), in the order they first ran.
function headChecks(runs: RunRow[]): string {
  const last = new Map<string, RunRow>()
  for (const r of runs) if (r.source === 'ship' && !r.cwd && !r.expectFail) last.set(r.sensor ?? r.cmd, r)
  if (!last.size) return ''
  const line = (name: string, r: RunRow): string => { const end = plain(r.tail.split('\n').map(plain).filter(Boolean).at(-1) ?? '').slice(0, 120); return `- ${name.length > 60 ? `${name.slice(0, 57)}...` : name}: ${r.exit === 0 ? 'pass' : `fail (exit ${r.exit})`}${end ? `, ${end}` : ''}` }
  return `Checks on the head tree (the latest run of each):\n\n${[...last].map(([n, r]) => line(n, r)).join('\n')}`
}

// Each behaviour a test the change adds or edits names (test_b3_..., "B3 ..."); the rest are for the reviewer to check by hand.
function behaviourTests(spec: string, tests: string | undefined): string {
  const ids = bullets(section(spec, 'Behaviours')).map(l => /^[-*]\s+\**(B\d+)\b/.exec(l)?.[1]).filter((b): b is string => Boolean(b))
  if (!ids.length || tests === undefined) return ''
  const text = tests.toLowerCase(), named = (b: string): boolean => new RegExp(`(?<![a-z0-9])${b.toLowerCase()}(?!\\d)`).test(text)
  const none = ids.filter(b => !named(b))
  return none.length ? `No test this change adds or edits names ${none.join(', ')}: check those behaviours by hand.` : `Every behaviour (${ids[0]}-${ids.at(-1)}) is named by a test this change adds or edits.`
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
    `## Evidence\n\n${[evidence, redProof(i.runs ?? []), headChecks(i.runs ?? []), behaviourTests(i.spec, i.tests)].filter(Boolean).join('\n\n')}`,
    i.outline.trim(),
  ]
  return parts.filter(Boolean).join('\n\n') + '\n'
}
