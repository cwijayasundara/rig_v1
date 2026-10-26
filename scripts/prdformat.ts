// The PRD format for coding agents (spec 2026-10-26 PRD format and conversion): every rule a numbered, testable line, so the
// requirements ledger can be generated from it and nothing rides on prose. Pure over text; no repo, no model.
import { normalise, type ChartFinding } from './chartcheck.ts'

export type Criterion = { id: string; parent: string | null; kind: 'rule' | 'answer'; line: number; text: string }

// The template's sections, in order; the strict ones must be present (Data rules, NFRs and Boundaries may hold `none`).
export const PRD_SECTIONS = ['Context and problem', 'Goals and success metrics', 'Non-goals', 'Users and scenarios', 'Functional requirements', 'Data rules',
  'Non-functional requirements', 'Examples', 'Boundaries', 'Integrations and constraints', 'Decisions', 'Open questions']
const REQUIRED = ['Functional requirements', 'Data rules', 'Non-functional requirements', 'Boundaries', 'Open questions']
const FR_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:Need|Priority|Depends on)(?:\*\*)?\s*:/i
const CRITERION = /^\s*[-*]\s+(?:\*\*)?(AC-(\d+)\.\d+|DR-\d+)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/
const SHAPE = (t: string): boolean => /\bwhen\b[\s\S]*\bshall\b/i.test(t) || /\bgiven\b[\s\S]*\bwhen\b[\s\S]*\bthen\b/i.test(t)
const NFR_ROW = /^\s*\|\s*(NFR-\d+)\s*\|/
const cells = (l: string): string[] => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

type Line = { n: number; text: string; h2: string; fr: string | null }
// Lines of the PRD body with their 1-based number, the `##` section and the `### FR-n` they sit under. Comments are blanked
// line for line and fenced blocks dropped, so numbers stay those of prd.md.
function lines(prd: string): Line[] {
  const text = prd.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ''))
  const all = text.split('\n')
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text)
  const out: Line[] = []
  let h2 = ''
  let fr: string | null = null
  let fence = ''
  for (let i = fm ? fm[0].split('\n').length - 1 : 0; i < all.length; i++) {
    const l = all[i]!
    const f = /^\s*(```|~~~)/.exec(l)?.[1]
    if (fence) { if (f === fence) fence = ''; continue }
    if (f) { fence = f; continue }
    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(l)
    if (h && h[1]!.length <= 2) { h2 = h[1] === '##' ? h[2]! : ''; fr = null; continue }
    if (h && h[1] === '###') { fr = /^(FR-\d+)\b/.exec(h[2]!)?.[1] ?? null; if (fr) continue }
    out.push({ n: i + 1, text: l, h2, fr })
  }
  return out
}

// Each criterion with its continuation lines (indented, not a new bullet) joined into one text.
function criteria(ls: Line[]): (Criterion & { shaped: boolean; fr: string | null; num: string | null })[] {
  const out: (Criterion & { shaped: boolean; fr: string | null; num: string | null })[] = []
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]!
    if (l.h2 === 'Non-functional requirements') {
      const m = NFR_ROW.exec(l.text)
      if (m?.[1]) out.push({ id: m[1], parent: m[1], kind: 'rule', line: l.n, text: normalise(cells(l.text).join(' | ')), shaped: true, fr: null, num: null })
      continue
    }
    const m = CRITERION.exec(l.text)
    if (!m || (l.h2 !== 'Functional requirements' && l.h2 !== 'Data rules')) continue
    const parts = [m[3] ?? '']
    while (ls[i + 1] && ls[i + 1]!.n === ls[i]!.n + 1 && /^\s+\S/.test(ls[i + 1]!.text) && !/^\s*[-*]\s/.test(ls[i + 1]!.text)) parts.push(ls[++i]!.text.trim())
    const text = normalise(parts.join(' ').replace(/^\*\*\s*/, ''))
    const id = m[1]!
    out.push({ id, parent: m[2] ? `FR-${m[2]}` : null, kind: /\(answered at chart\)/i.test(parts.join(' ')) ? 'answer' : 'rule', line: l.n, text, shaped: id.startsWith('DR-') || SHAPE(text), fr: l.fr, num: m[2] ?? null })
  }
  return out
}

export const prdCriteria = (prd: string): Criterion[] => criteria(lines(prd)).map(({ id, parent, kind, line, text }) => ({ id, parent, kind, line, text }))

export function prdFormatProblems(prd: string): ChartFinding[] {
  const out: ChartFinding[] = []
  const add = (rule: string, where: string, message: string): number => out.push({ rule, severity: 'block', where, message })
  const ls = lines(prd)
  const heads = new Set(prd.replace(/\r\n/g, '\n').split('\n').flatMap(l => { const m = /^##\s+(.*?)\s*$/.exec(l); return m?.[1] ? [m[1].toLowerCase()] : [] }))
  for (const s of REQUIRED) if (!heads.has(s.toLowerCase())) add('prd-section', 'prd', `the PRD has no "## ${s}" section${s === 'Functional requirements' || s === 'Open questions' ? '' : ' (write "none" under it when there is nothing)'}`)
  const cs = criteria(ls)
  const owned = new Set(cs.map(c => c.line))
  const continued = new Set<number>()
  for (const c of cs) for (let n = c.line + 1; ls.some(l => l.n === n && /^\s+\S/.test(l.text) && !/^\s*[-*]\s/.test(l.text)); n++) continued.add(n)
  const frs = [...new Set(ls.filter(l => l.h2 === 'Functional requirements' && l.fr).map(l => l.fr!))]
  for (const fr of frs) if (!cs.some(c => c.fr === fr && c.id.startsWith('AC-'))) add('prd-criterion', fr, `${fr} has no numbered criterion: add "- AC-${fr.slice(3)}.1: WHEN <trigger> THE SYSTEM SHALL <response>"`)
  for (const c of cs) {
    if (c.num !== null && c.fr !== `FR-${c.num}`) add('prd-criterion', `prd.md:${c.line}`, `${c.id} sits under ${c.fr ?? 'no FR'}; an AC-n.m belongs under ### FR-n`)
    if (!c.shaped) add('prd-criterion', `prd.md:${c.line}`, `${c.id} is not testable as written: use "WHEN <trigger> THE SYSTEM SHALL <response>" or "Given <state>, when <action>, then <result>" with exact values`)
    if (c.id.startsWith('NFR-') && !/\d/.test(cells(ls.find(l => l.n === c.line)!.text)[3] ?? '')) add('prd-nfr', c.id, `${c.id} has no number in its target: give a number and a unit`)
  }
  const seen = new Map<string, number>()
  for (const c of cs) seen.set(c.id, (seen.get(c.id) ?? 0) + 1)
  for (const [id, n] of seen) if (n > 1) add('prd-id', id, `${id} is defined ${n} times`)
  for (const l of ls) {
    if (!l.text.trim() || owned.has(l.n) || continued.has(l.n)) continue
    const strict = (l.h2 === 'Functional requirements' && (l.fr || /^#{3,6}\s/.test(l.text))) || l.h2 === 'Data rules'
    if (!strict || FR_LINE.test(l.text) || /^none\.?$/i.test(l.text.trim())) continue
    add('prd-prose', `prd.md:${l.n}`, `a rule written as prose ("${l.text.trim()}"): make it an AC under its FR or a DR under Data rules`)
  }
  return out
}

// requirements.md generated from the criteria: the ledger line format chart check, the change copy and the PR review read.
export const prdLedger = (prd: string): string => ['# Requirements (generated from prd.md by rig: never edit)', '',
  ...prdCriteria(prd).map(c => `- ${c.id} [${c.kind}] prd.md:${c.line} "${c.text}"`), ''].join('\n')
