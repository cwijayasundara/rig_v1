// A draft PR (the launch budget's way out, or an agent BLOCKED) says so in pr.md; CI fails while any change the PR carries still does.
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, read, frontmatter, scanSecrets } from './core.ts'
import type { Finding } from './model.ts'

const prFile = (slug: string): string => path.join(CHANGES, slug, 'pr.md')
export const draftReason = (slug: string): string => String(frontmatter(read(prFile(slug))).data.draft ?? '')
export const draftLine = (reason: string | null): string => (reason === null ? '' : `draft: ${reason.replace(/\s+/g, ' ').trim() || 'no reason given'}\n`)

// Sets, replaces or (null) removes the `draft:` line of an existing pr.md front matter; no write when nothing changes.
export function setDraft(slug: string, reason: string | null): void {
  const text = read(prFile(slug)), m = /^(---\n)([\s\S]*?\n)(---\n)/.exec(text)
  if (!m) return
  const next = text.replace(m[0], m[1] + m[2]!.replace(/^draft:.*\n/m, '') + draftLine(reason) + m[3])
  if (next !== text) fs.writeFileSync(prFile(slug), next)
}

export const draftFindings = (slugs: string[]): Finding[] => slugs.filter(s => draftReason(s) !== '').map(s => ({
  sensor: 'draft', severity: 'block', file: `.rig/changes/${s}/pr.md`, message: `${s} is a draft PR: fix it, then run S pr ${s} without --draft`, fix: `fix what the draft says is left (${draftReason(s)}), then run S pr ${s} without --draft`,
}))

// A draft skips verify and the AC check, so what it commits is scanned for secrets first.
export const draftSecrets = (files: string[]): string | null => files.find(f => scanSecrets(path.join(ROOT, f)).length > 0) ?? null
