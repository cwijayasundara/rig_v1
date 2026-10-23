// The person's own corrections, read from this repo's Claude Code transcripts (proposal 2026-10-23 §3): a correction typed mid-session
// ("no, don't mock the DB") reaches the learning ladder even when no reviewer repeats it. Local only: the output stays under .rig/learn/
// (gitignored) and is never sent anywhere. Zero tokens; the /rig:learn skill groups paraphrases.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type Correction = { text: string; session: string; date: string }

const MAX_CHARS = 400
const MIN_SESSIONS = 2
const SECRETS = [/sk-[A-Za-z0-9_-]{16,}/g, /AKIA[0-9A-Z]{16}/g, /gh[pousr]_[A-Za-z0-9]{20,}/g, /xox[abprs]-[A-Za-z0-9-]{10,}/g, /eyJ[\w-]+\.[\w-]+\.[\w-]+/g]
const NAMED_SECRET = /\b(api[_-]?key|token|secret|password)(\s*[:=]\s*)\S+/gi
const BLOCKS = /<(pasted_content|system-reminder)\b[^>]*>[\s\S]*?<\/\1>/g

// Claude Code names a project's transcript folder after its path, every character outside [A-Za-z0-9] turned into `-`.
export const projectDir = (root: string, home = os.homedir()): string => path.join(home, '.claude', 'projects', root.replace(/[^A-Za-z0-9]/g, '-'))

export const redact = (text: string): string => SECRETS.reduce((t, re) => t.replace(re, '[redacted]'), text).replace(NAMED_SECRET, '$1$2[redacted]')

type Line = { type?: string; isMeta?: boolean; isSidechain?: boolean; toolUseResult?: unknown; origin?: { kind?: string }; sessionId?: string; timestamp?: string; message?: { content?: unknown } }

// Text of a turn the person typed, or null: a string, or text blocks only (a tool result, an image or any other block is not typed text).
function typedText(l: Line): string | null {
  if (l.type !== 'user' || l.isMeta || l.isSidechain || l.toolUseResult !== undefined) return null
  if (l.origin && l.origin.kind !== 'human') return null
  const c = l.message?.content
  const raw = typeof c === 'string' ? c : Array.isArray(c) && c.every(b => b?.type === 'text') ? c.map(b => String(b.text ?? '')).join('\n') : null
  if (raw === null || (!l.origin && raw.trimStart().startsWith('<'))) return null
  const text = raw.replace(BLOCKS, '').trim()
  return !text || text.startsWith('<') || text.startsWith('/') || text.length > MAX_CHARS ? null : redact(text)
}

export function typedTurns(jsonl: string): Correction[] {
  return jsonl.split('\n').flatMap((s): Correction[] => {
    let l: Line
    try { l = JSON.parse(s) as Line } catch { return [] }
    const text = l && typeof l === 'object' ? typedText(l) : null
    return text ? [{ text, session: (l.sessionId ?? '').slice(0, 8), date: (l.timestamp ?? '').slice(0, 10) }] : []
  })
}

// Exact repeats across sessions (case, spacing and trailing punctuation ignored); the first wording seen is kept.
export function repeated(cs: Correction[]): { text: string; sessions: string[] }[] {
  const by = new Map<string, { text: string; sessions: string[] }>()
  for (const c of cs) {
    const key = c.text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!?\s]+$/, '')
    const g = by.get(key) ?? { text: c.text, sessions: [] }
    if (!g.sessions.includes(c.session)) g.sessions.push(c.session)
    by.set(key, g)
  }
  return [...by.values()].filter(g => g.sessions.length >= MIN_SESSIONS)
}

// The *.jsonl files directly in the folder; subagent transcripts live in subfolders and are not the person's words.
export function mineTranscripts(dir: string): Correction[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile() && d.name.endsWith('.jsonl')).map(d => d.name).sort()
    .flatMap(n => typedTurns(fs.readFileSync(path.join(dir, n), 'utf8')))
}
