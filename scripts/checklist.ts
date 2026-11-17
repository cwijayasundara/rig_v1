// The diff-triggered reliability checklist (the Claude team's verification post: items with a trigger readable from a diff, a check, and
// the incident behind them; the reviewer runs only the ones this diff triggers). Items are rules in .rig/rules.json with a `check`.
import { git, defaultBase, out, optString, type Args } from './core.ts'
import { loadConfig } from './check.ts'
import { branchDiff } from './diffs.ts'
import { matchesAny, type FileDiff, type Rule } from './model.ts'

export type Item = { id: string; check: string; why: string; files: string[] }

export function triggeredChecks(diffs: FileDiff[], rules: Rule[]): Item[] {
  const items: Item[] = []
  for (const rule of rules.filter(r => r.check)) {
    const re = rule.pattern ? new RegExp(rule.pattern) : null
    const files = diffs.filter(d => !d.binary && !d.file.startsWith('.rig/') && (!rule.paths || matchesAny(d.file, rule.paths)) && (!re || [...d.added, ...d.removed].some(l => re.test(l.text)))).map(d => d.file)
    if (files.length) items.push({ id: rule.id, check: rule.check as string, why: rule.why, files })
  }
  return items
}

export const formatChecklist = (items: Item[]): string =>
  items.length ? items.map((i, n) => `${n + 1}. [${i.id}] ${i.check} (why: ${i.why}; triggered by ${i.files.slice(0, 3).join(', ')}${i.files.length > 3 ? ', …' : ''})`).join('\n') : 'no reliability checks triggered by this diff'

export function cmdChecklist(args: Args): void {
  const baseRef = optString(args, 'base')
  const base = baseRef ? git(['merge-base', 'HEAD', baseRef]) : defaultBase()
  const { rules } = loadConfig(null)
  const items = triggeredChecks(branchDiff(base ?? 'HEAD'), rules)
  out(args.opt.json ? JSON.stringify(items) : formatChecklist(items))
}
