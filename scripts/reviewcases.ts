// Reverted changes become review eval cases (proposal 2026-10-27 C3, from the Claude Code team's "incidents become evals"). `learn reverts`
// writes a candidate per reverted merge from git alone; a person who knows the code confirms where the bug was; `learn review-eval` (paid,
// capped) scores the PR reviewer against the confirmed cases, so a change to its brief or model is kept only when the score holds or rises.
import fs from 'node:fs'
import path from 'node:path'
import { gitIn } from './core.ts'
import { changeHistory } from './reverts.ts'
import type { Runner } from './wikigen.ts'

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

export function scoreFindings(_text: string, _d: ReviewCase['defect']): boolean { throw new Error('not built') }
export function casePrompt(_root: string, _c: ReviewCase, _brief: string): string { throw new Error('not built') }
export function reviewEval(_root: string, _opts: { maxUsd: number; model?: string; runner?: Runner }): { scored: number; caught: number; failed: number; usd: number } { throw new Error('not built') }
