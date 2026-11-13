// The comprehension check (three-gates C6). The PR body asks three questions generated from the change (no model); CI wants the approving review to answer them
// (presence only: the quality of the answers is audited by `sdlc audit`). While the PR carries the label `rig-hold` (set by the auditor, read through gh) the merge is blocked.
import { behaviourIds } from './sensors.ts'
import { ghPages, type FileDiff, type Finding } from './model.ts'

export const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(spec|test)\.\w+$|_test\.\w+$|(^|\/)test_[^/]*$/
export const isSrc = (f: string): boolean => /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|kt|rb|php|c|cpp)$/.test(f) && !TEST.test(f) && !f.startsWith('.rig/')
const FN = /(?:function\*?\s+|def\s+|func\s+|fn\s+)([A-Za-z_]\w*)|(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/

// Q1 the largest changed function (else file) returning early, Q2 which behaviour/intent that file serves, Q3 which test fails if its first changed run of lines is reverted.
export function checkQuestions(diffs: FileDiff[], spec: string): string[] {
  const top = [...diffs.filter(d => d.status !== 'D' && !d.binary && isSrc(d.file) && d.added.length)].sort((a, b) => b.added.length - a.added.length || (a.file < b.file ? -1 : 1))[0]
  const ids = behaviourIds(spec, 'Behaviours')
  const serves = ids.length ? `behaviour (${ids.join(', ')})` : 'intent'
  if (!top) return ['Q1: What breaks if the change\'s main function returns early?', `Q2: Which ${serves} does the change serve?`, 'Q3: Which test fails if the changed lines are reverted?']
  const fn = top.added.map(l => FN.exec(l.text)).find(Boolean), name = fn?.[1] ?? fn?.[2]
  let end = 0
  while (top.added[end + 1] && top.added[end + 1]!.n === top.added[end]!.n + 1) end++
  const range = top.added[0]!.n === top.added[end]!.n ? `line ${top.added[0]!.n}` : `lines ${top.added[0]!.n}-${top.added[end]!.n}`
  return [`Q1: What breaks if ${name ? `\`${name}\` in ` : ''}${top.file} returns early?`, `Q2: Which ${serves} does ${top.file} serve?`, `Q3: Which test fails if ${top.file} ${range} are reverted?`]
}

type Review = { user?: { login?: string }; state?: string; commit_id?: string; author_association?: string; body?: string | null }
export const ANSWER_FIX = 'the approving review body has three lines: `Q1: <your answer>`, `Q2: <your answer>`, `Q3: <your answer>` (10+ characters each, not skip/n/a/lgtm, not the question repeated; the questions are in the PR body under "Check before approving"); approve again with them'
const BLANK = /^(skip|n\/?a|lgtm)\W*$/i
const reply = (body: string, q: number): string => new RegExp(`^\\s*Q${q}:[ \\t]*(.*)$`, 'm').exec(body)?.[1]?.trim() ?? ''

// null when an approving review of the head commit answers Q1-Q3; each person's latest non-comment review is the one that counts (as approvedBySomeoneElse reads it).
// The lead-override path (allowAuthor) also takes the self-approving author's own review, approval or comment. `qs` are the PR body's question lines: an answer must differ from the others and not repeat its question.
export function answersMissing(reviews: Review[], sha: string, author: string, allowAuthor: boolean, qs: string[] = []): string | null {
  const mine = (r: Review): boolean => (r.user?.login ?? '').toLowerCase() === author
  const latest = new Map<string, Review>()
  for (const r of reviews) if (r.user?.login && r.state !== 'COMMENTED' && !mine(r)) latest.set(r.user.login, r)
  const fit = [...latest.values(), ...reviews.filter(r => allowAuthor && mine(r) && (r.state === 'APPROVED' || r.state === 'COMMENTED'))].filter(r => r.commit_id === sha && (mine(r) || (r.state === 'APPROVED' && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.author_association ?? ''))))
  const gaps = fit.map(r => {
    const a = [1, 2, 3].map(q => reply(r.body ?? '', q)), ask = (q: number): string => (qs.find(x => x.startsWith(`Q${q}:`)) ?? '').slice(3).trim().toLowerCase()
    return [1, 2, 3].filter(q => { const x = a[q - 1]!; return x.length < 10 || BLANK.test(x) || a.findIndex(y => y.toLowerCase() === x.toLowerCase()) !== q - 1 || (ask(q) !== '' && x.toLowerCase().includes(ask(q))) })
  })
  if (gaps.some(g => !g.length)) return null
  const best = gaps.sort((a, b) => a.length - b.length)[0] ?? [1, 2, 3]
  return `the approving review of ${sha.slice(0, 7)} does not answer ${best.map(q => `Q${q}`).join(', ')} from the PR body's "Check before approving"${allowAuthor ? ' (lead override: post a COMMENTED review on the head commit with the answers)' : ''}`
}

export const HOLD = 'rig-hold'
// The auditor holds a PR with the label rig-hold (a per-PR hold a commit cannot clear); the message names nothing about why. An unreadable label list blocks.
export function auditBlock(labels: () => { name?: string }[]): Finding[] {
  const block = (message: string, fix: string): Finding[] => [{ sensor: 'human-approval', severity: 'block', message, fix }]
  try { return labels().some(l => l.name === HOLD) ? block('merge held by the auditor (rig-hold)', 'ask the person who holds it; it is lifted from their side') : [] } catch { return block('could not read the PR labels (the job needs pull-requests: read and GH_TOKEN)', 'rerun the check') }
}
export const heldFindings = (who: { repo: string; number: number } | null): Finding[] => (who ? auditBlock(() => ghPages(`repos/${who.repo}/issues/${who.number}/labels?per_page=100`) as { name?: string }[]) : [])
