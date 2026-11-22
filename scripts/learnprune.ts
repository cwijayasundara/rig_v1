// Rule pruning (the Claude team's verification post: rule files grow unless tidied). A rule or checklist item that fired on none of the
// last N shipped changes is dormant: listed for a person to retire, never removed here (rules.json is a harness file). Lessons already
// retire through lessons-archive.md; this is the same idea for .rig/rules.json.
import { parseRules, type Rule } from './model.ts'
import { replayRule, changeDiff } from './learnreplay.ts'
import { triggeredChecks } from './checklist.ts'
import { shippedChanges } from './learnmine.ts'
import { read } from './core.ts'

type Activity = { id: string; kind: 'rule' | 'check'; fired: string[]; unknown?: string }

// How each rule did over the window (the newest `window` shipped changes with a recoverable diff).
function ruleActivity(root: string, rules: Rule[], slugs: string[]): Activity[] {
  return rules.map(rule => {
    if (rule.check) return { id: rule.id, kind: 'check' as const, fired: slugs.filter(s => { const d = changeDiff(root, s); return d !== null && triggeredChecks(d, [rule]).length > 0 }) }
    const r = replayRule(root, rule, [], slugs)
    return r.error ? { id: rule.id, kind: 'rule' as const, fired: [], unknown: r.error } : { id: rule.id, kind: 'rule' as const, fired: r.firesOn }
  })
}

export function pruneReport(root: string, window: number): { lines: string[]; dormant: string[]; window: number } {
  const slugs = shippedChanges(root).map(s => s.slug).slice(-window)
  const { rules } = parseRules(read(`${root}/.rig/rules.json`))
  if (!rules.length) return { lines: ['learn prune: no rules in .rig/rules.json'], dormant: [], window: slugs.length }
  if (slugs.length < window) return { lines: [`learn prune: only ${slugs.length} shipped change(s), fewer than the window of ${window}; too early to call a rule dormant`], dormant: [], window: slugs.length }
  const acts = ruleActivity(root, rules, slugs)
  const dormant = acts.filter(a => !a.fired.length && !a.unknown).map(a => a.id)
  return {
    lines: [...acts.map(a => `${a.id} (${a.kind}): ${a.unknown ? `unknown, ${a.unknown}` : a.fired.length ? `fired on ${a.fired.length} of ${slugs.length}, last ${a.fired.at(-1)}` : `dormant: fired on none of the last ${slugs.length}`}`),
      dormant.length ? `retire candidates: ${dormant.join(', ')} (a person removes them from .rig/rules.json in a PR; their why stays in git history)` : 'no dormant rules'],
    dormant, window: slugs.length,
  }
}
