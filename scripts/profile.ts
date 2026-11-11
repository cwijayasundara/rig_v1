// Vendor profiles (readiness doc §2 Step 0). `full` copies every skill; `core` copies the one-change flow only, so a client
// team sees no command that is still experimental. The manifest records the profile and upgrade keeps it.
import { fail } from './core.ts'

export type Profile = 'full' | 'core'
export const CORE_SKILLS: readonly string[] = ['start', 'plan', 'approve', 'build', 'test', 'pr', 'waive', 'learn', 'rule']
export const CORE_AGENTS: readonly string[] = ['evaluator'] // plan uses rig:evaluator; architect is chart-only
export const OFF_COMMANDS: readonly string[] = ['chart', 'testplan', 'wiki', 'arch', 'app', 'autonomy', 'init']

export function parseProfile(v: string | boolean | undefined): Profile {
  if (v === undefined) return 'full'
  if (v === 'core' || v === 'full') return v
  return fail(`unknown profile "${v === true ? '' : v}": use core or full`)
}

export const skillIn = (p: Profile, name: string): boolean => p === 'full' || CORE_SKILLS.includes(name)
export const agentIn = (p: Profile, file: string): boolean => p === 'full' || CORE_AGENTS.includes(file.replace(/\.md$/, ''))
