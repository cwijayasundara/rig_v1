// Reverted changes become review eval cases (proposal 2026-10-27 C3, from the Claude Code team's "incidents become evals"). `learn reverts`
// writes a candidate per reverted merge from git alone; a person who knows the code confirms where the bug was; `learn review-eval` (paid,
// capped) scores the PR reviewer against the confirmed cases, so a change to its brief or model is kept only when the score holds or rises.
import fs from 'node:fs'
import path from 'node:path'
import { gitIn, sha, PLUGIN_ROOT } from './core.ts'
import { changeHistory } from './reverts.ts'
import { claudeRunner, type Runner } from './wikigen.ts'

export type ReviewCase = { slug: string; sha: string; base: string; files: string[]; confirmed: boolean; defect: { file: string; pattern: string }; note: string }

const NOTE = 'A person who knows this code confirms the bug: set defect.file (the file the bug was in), defect.pattern (a regex a review finding must match to have caught it) and confirmed: true.'
const dirOf = (root: string): string => path.join(root, '.rig', 'learn', 'review-cases')

export function readCases(root: string): { cases: ReviewCase[]; bad: string[] } {
  const dir = dirOf(root), cases: ReviewCase[] = [], bad: string[] = []
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort() : []) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ReviewCase
      if (typeof c.slug !== 'string' || typeof c.sha !== 'string' || typeof c.base !== 'string' || typeof c.defect?.file !== 'string' || typeof c.defect?.pattern !== 'string') throw new Error('shape')
      cases.push(c)
    } catch { bad.push(f) }
  }
  return { cases, bad }
}

// One candidate per reverted merge, named <slug>-<sha7>.json; an existing file is never rewritten, so a person's confirmation stays.
export function writeCandidates(root: string): { added: string[]; total: number; confirmed: number } {
  const dir = dirOf(root), added: string[] = []
  for (const row of changeHistory(root, [], 'HEAD', true).filter(r => r.reverted)) {
    const name = `${row.slug}-${row.sha.slice(0, 7)}.json`
    if (fs.existsSync(path.join(dir, name))) continue
    const base = gitIn(root, ['rev-parse', `${row.sha}^1`]) ?? ''
    const files = (gitIn(root, ['diff', '--name-only', base, row.sha, '--', '.', ':!.rig']) ?? '').split('\n').filter(Boolean)
    const c: ReviewCase = { slug: row.slug, sha: row.sha, base, files, confirmed: false, defect: { file: '', pattern: '' }, note: NOTE }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), JSON.stringify(c, null, 2) + '\n')
    added.push(name)
  }
  const { cases } = readCases(root)
  return { added, total: cases.length, confirmed: cases.filter(confirmedCase).length }
}

const confirmedCase = (c: ReviewCase): boolean => c.confirmed === true && Boolean(c.defect.file) && Boolean(c.defect.pattern)

// Only `- [severity:` lines under ## Findings count (the rule of eval/review.mjs); no Findings heading means no findings.
export function scoreFindings(text: string, d: ReviewCase['defect']): boolean {
  const section = /^## Findings[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? ''
  let re: RegExp
  try { re = new RegExp(d.pattern, 'i') } catch { return false }
  return section.split('\n').some(l => /^\s*-\s*\[severity:/i.test(l) && l.includes(d.file) && re.test(l))
}

// The brief made tool-less (the reviewer gets everything inline, as in eval/review.mjs), then the change as it merged.
export function casePrompt(root: string, c: ReviewCase, brief: string): string {
  const at = (rel: string): string => gitIn(root, ['show', `${c.sha}:${rel}`]) ?? '(missing)'
  const head = brief.replace(/Inputs\. Read them yourself[\s\S]*?(?=\nReview for)/, 'Everything you may use is below; you have no tools.\n')
    .replace(/You may read files[^\n]*\n/, '').replace(/Before you report a finding, run `git blame[^\n]*\n\n?/, '').replace(/<base>/g, c.base).replace(/<slug>/g, c.slug)
  const rec = (f: string): string => `## ${f}\n${at(`.rig/changes/${c.slug}/${f}`)}`
  return [head, rec('intent.md'), rec('spec.md'), rec('plan.md'),
    `## The delta (git diff ${c.base.slice(0, 7)} ${c.sha.slice(0, 7)})\n\`\`\`diff\n${gitIn(root, ['diff', c.base, c.sha, '--', '.', ':!.rig']) ?? ''}\n\`\`\``,
    '## Files the change touches, as merged', ...c.files.map(f => `### ${f}\n\`\`\`\n${at(f)}\n\`\`\``)].join('\n\n')
}

export const briefPath = (root: string): string => { const vendored = path.join(root, '.rig', 'templates', 'review-brief.md'); return fs.existsSync(vendored) ? vendored : path.join(PLUGIN_ROOT, 'templates', 'review-brief.md') }
export const EVAL_LOG = (root: string): string => path.join(root, '.rig', 'learn', 'review-eval.jsonl')

// Scores the confirmed cases, oldest name first, until the spend reaches the cap; one row per run, so rows for two briefs or models compare.
export function reviewEval(root: string, opts: { maxUsd: number; model?: string; runner?: Runner }): { scored: number; caught: number; failed: number; usd: number } {
  const model = opts.model ?? 'claude-sonnet-5-5', run = opts.runner ?? claudeRunner(model)
  const brief = fs.readFileSync(briefPath(root), 'utf8')
  const r = { scored: 0, caught: 0, failed: 0, usd: 0 }
  for (const c of readCases(root).cases.filter(confirmedCase)) {
    if (r.usd >= opts.maxUsd) break
    try { const a = run({ role: 'review', prompt: casePrompt(root, c, brief) }); r.usd += a.usd; r.scored++; if (scoreFindings(a.text, c.defect)) r.caught++ } catch { r.failed++ }
  }
  r.usd = Math.round(r.usd * 100) / 100
  fs.mkdirSync(path.dirname(EVAL_LOG(root)), { recursive: true })
  fs.appendFileSync(EVAL_LOG(root), JSON.stringify({ at: new Date().toISOString(), model, brief: sha(brief), cases: r.scored + r.failed, caught: r.caught, failed: r.failed, usd: r.usd }) + '\n')
  return r
}
