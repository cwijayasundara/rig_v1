// The comprehension check (three-gates C6). The PR body asks three questions generated from the change (no model); CI wants the approving review to answer them
// (presence only: the quality of the answers is audited by `sdlc audit`). A commit `audit: seeded defect <id>` in the PR blocks the merge until it is reverted.
import { behaviourIds } from './sensors.ts'
import type { FileDiff, Finding } from './model.ts'
import { git } from './core.ts'

export const TEST = /(^|\/)(tests?|__tests__|spec)\/|\.(spec|test)\.\w+$|_test\.\w+$|(^|\/)test_[^/]*$/
const FN = /(?:function\*?\s+|def\s+|func\s+|fn\s+)([A-Za-z_]\w*)|(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>/

// Q1 the largest changed function (else file) returning early, Q2 which behaviour/intent that file serves, Q3 which test fails if its first changed run of lines is reverted.
export function checkQuestions(diffs: FileDiff[], spec: string): string[] {
  const files = diffs.filter(d => d.status !== 'D' && !d.binary && !d.file.startsWith('.rig/') && d.added.length)
  const pool = files.some(d => !TEST.test(d.file)) ? files.filter(d => !TEST.test(d.file)) : files
  const top = [...pool].sort((a, b) => b.added.length - a.added.length || (a.file < b.file ? -1 : 1))[0]
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
export const ANSWER_FIX = 'the approving review body has three lines: `Q1: <your answer>`, `Q2: <your answer>`, `Q3: <your answer>` (10+ characters each, not skip/n/a/lgtm; the questions are in the PR body under "Check before approving"); approve again with them'
const BLANK = /^(skip|n\/?a|lgtm)\W*$/i
const answered = (body: string, q: number): boolean => { const a = new RegExp(`^\\s*Q${q}:[ \\t]*(.*)$`, 'm').exec(body)?.[1]?.trim() ?? ''; return a.length >= 10 && !BLANK.test(a) }

// null when an approving review of the head commit answers Q1-Q3; the lead-override path (allowAuthor) takes the self-approving author's own review, approval or comment.
export function answersMissing(reviews: Review[], sha: string, author: string, allowAuthor: boolean): string | null {
  const mine = (r: Review): boolean => (r.user?.login ?? '').toLowerCase() === author
  const fit = reviews.filter(r => r.commit_id === sha && (mine(r) ? allowAuthor && (r.state === 'APPROVED' || r.state === 'COMMENTED') : r.state === 'APPROVED' && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.author_association ?? '')))
  const gaps = fit.map(r => [1, 2, 3].filter(q => !answered(r.body ?? '', q)))
  if (gaps.some(g => !g.length)) return null
  const best = gaps.sort((a, b) => a.length - b.length)[0] ?? [1, 2, 3]
  return `the approving review of ${sha.slice(0, 7)} does not answer ${best.map(q => `Q${q}`).join(', ')} from the PR body's "Check before approving"`
}

// The seed commits with no revert of them: a seeded defect is still in the PR.
export function auditOpen(subjects: string[]): string | null {
  const reverted = new Set(subjects.flatMap(s => /^Revert "audit: seeded defect (\S+)"/.exec(s)?.[1] ?? []))
  return subjects.some(s => { const id = /^audit: seeded defect (\S+)/.exec(s)?.[1]; return id !== undefined && !reverted.has(id) }) ? 'audit in progress: a seeded defect is present' : null
}

// The CI finding: the PR's own commits (base..HEAD) are read from git, which the PR cannot rewrite from inside the run.
export const auditBlock = (base: string): Finding[] => {
  const why = auditOpen((git(['log', '--format=%s', `${base}..HEAD`]) ?? '').split('\n'))
  return why ? [{ sensor: 'human-approval', severity: 'block', message: why, fix: 'the auditor runs `sdlc audit reveal <pr>`, which reverts the seed; then push and check again' }] : []
}
