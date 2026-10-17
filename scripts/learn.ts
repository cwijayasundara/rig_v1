// `sdlc.ts learn <mine|replay|check|status>` (learning loop design 2026-10-17). Deterministic and zero tokens: it reads committed evidence
// and writes only under .rig/learn/. The model-facing step is the /rig:learn skill; a person applies every change to the lessons and the rules.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, out, fail, listChanges, readJsonl, writeAtomic, type Args, type Waiver } from './core.ts'
import { parseLessons, checkLessons, type Lesson } from './learnfile.ts'
import { mineCandidates, shippedChanges, lessonStatus } from './learnmine.ts'
import { replayRule } from './learnreplay.ts'
import type { Rule } from './model.ts'

const LESSONS = path.join(SDLC, 'lessons.md')
const ARCHIVE = path.join(SDLC, 'lessons-archive.md')
const LEARN = path.join(SDLC, 'learn')

const readFile = (p: string): string => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const allLessons = (): Lesson[] => [...parseLessons(readFile(LESSONS)).lessons, ...parseLessons(readFile(ARCHIVE)).lessons]

function analyse() {
  const candidates = mineCandidates(ROOT)
  const waivers = readJsonl<Waiver>(path.join(SDLC, 'waivers.jsonl'))
  const status = lessonStatus(allLessons(), shippedChanges(ROOT), waivers)
  return { candidates, ...status }
}

function mine(): void {
  const a = analyse()
  fs.mkdirSync(LEARN, { recursive: true })
  writeAtomic(path.join(LEARN, 'candidates.json'), JSON.stringify(a, null, 2) + '\n')
  out([
    a.candidates.length ? `${a.candidates.length} candidate(s):` : 'no candidates: nothing recurs in two changes yet',
    ...a.candidates.map(c => `- ${c.kind} ${c.key}: ${c.changes.length} changes (${c.changes.join(', ')}), ${c.count} occurrence(s)\n    ${c.sample}`),
    ...a.retire.map(r => `retire ${r.id}: ${r.why}`),
    'written: .rig/learn/candidates.json',
  ].join('\n'))
}

function check(): void {
  const slugs = listChanges()
  const problems = [
    ...checkLessons(readFile(LESSONS), slugs),
    ...checkLessons(readFile(ARCHIVE), slugs),
    ...parseLessons(readFile(LESSONS)).lessons.filter(l => l.status !== 'active').map(l => `${l.id}: ${l.status} lessons belong in .rig/lessons-archive.md`),
    ...parseLessons(readFile(ARCHIVE)).lessons.filter(l => l.status === 'active').map(l => `${l.id}: active lessons belong in .rig/lessons.md`),
  ]
  out(problems.length ? problems.map(p => `[learn] ${p}`).join('\n') : 'learn check: lessons are well formed')
  process.exitCode = problems.length ? 1 : 0
}

function readRule(file: string | undefined): Rule {
  const abs = file ? path.resolve(ROOT, file) : ''
  let v: Partial<Rule>
  try { v = JSON.parse(fs.readFileSync(abs, 'utf8')) as Partial<Rule> } catch { return fail(`cannot read the rule file ${file ?? '(none given)'}: pass a JSON rule {id, pattern, message, why, action}`) }
  if (!v.id || !v.pattern || !v.message || !v.why || (v.action !== 'warn' && v.action !== 'block')) fail('the rule file needs id, pattern, message, why and action ("warn" or "block")')
  return v as Rule
}

function replay(args: Args): void {
  const rule = readRule(args.pos[1])
  const earned = String(args.opt.earned ?? '').split(',').filter(Boolean)
  if (earned.length < 2) fail('replay needs --earned <slug>,<slug>: the (at least 2) changes that earned the rule')
  const r = replayRule(ROOT, rule, earned, listChanges())
  const pass = r.pass
  out([
    r.error ? `error: ${r.error}` : `fires on: ${r.firesOn.join(', ') || 'none'}`,
    r.missed.length ? `does not fire on an earning change: ${r.missed.join(', ')}` : '',
    r.extra.length ? `also fires on: ${r.extra.join(', ')}` : '',
    r.skipped.length ? `skipped (diff not recoverable${earned.some(e => r.skipped.includes(e)) ? ', and an earning change cannot be replayed' : ''}): ${r.skipped.join(', ')}` : '',
    pass ? 'replay: pass' : 'replay: fail',
  ].filter(Boolean).join('\n'))
  process.exitCode = pass ? 0 : 1
}

function status(): void {
  const a = analyse()
  const active = parseLessons(readFile(LESSONS)).lessons.filter(l => l.status === 'active').length
  out(`learn: active ${active}, eligible ${a.candidates.length}, flagged ${a.retire.length}`)
}

export function cmdLearn(args: Args): void {
  const sub = args.pos[0]
  if (sub === 'mine') return mine()
  if (sub === 'check') return check()
  if (sub === 'replay') return replay(args)
  if (sub === 'status') return status()
  fail('usage: learn <mine|replay <rule.json> --earned a,b|check|status>')
}
