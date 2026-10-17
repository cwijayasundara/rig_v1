// The replay gate (learning loop design 2026-10-17): a proposed rule is presentable only if it fires on every change that earned it
// and on no other shipped change. A shipped change's diff is the commit that added its pr.md against that commit's first parent:
// `pr` commits the change's source and its folder together, so one commit carries the whole change.
import vm from 'node:vm'
import { gitIn } from './core.ts'
import { parseUnifiedDiff, type FileDiff, type Rule } from './model.ts'
import { rulesSensor } from './sensors.ts'

export type Replay = { firesOn: string[]; missed: string[]; extra: string[]; skipped: string[]; pass: boolean; error?: string }

const MAX_PATTERN = 300
const RUN_LIMIT_MS = 1500
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*{]/

export function changeDiff(root: string, slug: string): FileDiff[] | null {
  const added = gitIn(root, ['log', '--diff-filter=A', '--format=%H', '--', `.rig/changes/${slug}/pr.md`])?.split('\n').filter(Boolean).pop()
  if (!added) return null
  const text = gitIn(root, ['diff', '--unified=0', '--no-color', '--no-ext-diff', '-M', `${added}^`, added])
  return text === null ? null : parseUnifiedDiff(text)
}

// Refuse patterns that are too long or that nest quantifiers (catastrophic backtracking), and ones that do not compile.
function patternError(pattern: string): string | undefined {
  if (pattern.length > MAX_PATTERN) return `pattern is longer than ${MAX_PATTERN} characters`
  if (NESTED_QUANTIFIER.test(pattern)) return 'pattern nests quantifiers, which can backtrack without end'
  try { new RegExp(pattern) } catch (e) { return `pattern does not compile: ${e instanceof Error ? e.message : String(e)}` }
  return undefined
}

// The nested-quantifier check above is a first filter only; a regex over a regex cannot be sound, so the match itself runs under a hard time limit.
function fires(diffs: FileDiff[], rule: Rule): boolean | 'timeout' {
  try { return vm.runInNewContext('run()', { run: () => rulesSensor(diffs, [rule]).length > 0 }, { timeout: RUN_LIMIT_MS }) as boolean } catch { return 'timeout' }
}

// pass: the pattern is safe, it fires on every earning change and on no other, every earning change could be replayed, and at least 2 distinct changes earned it.
export function replayRule(root: string, rule: Rule, earned: string[], all: string[]): Replay {
  const result: Replay = { firesOn: [], missed: [], extra: [], skipped: [], pass: false }
  const error = patternError(rule.pattern)
  if (error) return { ...result, error }
  for (const slug of [...new Set([...earned, ...all])]) {
    const diffs = changeDiff(root, slug)
    if (!diffs) { result.skipped.push(slug); continue }
    const hit = fires(diffs, rule)
    if (hit === 'timeout') return { ...result, firesOn: [], error: `pattern timed out after ${RUN_LIMIT_MS} ms on ${slug}: it backtracks without end` }
    if (hit) result.firesOn.push(slug)
    if (earned.includes(slug) && !hit) result.missed.push(slug)
    if (!earned.includes(slug) && hit) result.extra.push(slug)
  }
  result.pass = !result.missed.length && !result.extra.length && !earned.some(s => result.skipped.includes(s)) && new Set(earned).size >= 2
  return result
}
