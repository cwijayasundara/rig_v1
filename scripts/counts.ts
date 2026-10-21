// Count ratchets (harness readiness 1.5): a command sensor with "ratchet": "down" | "up" prints a number on its last line (duplication
// percent, lint warnings, coverage), and that number may only move the good way. Baselines live in .rig/ratchets.json. A better or first
// value tightens the baseline on a person's machine; CI reads the baselines from the base branch, so a PR cannot raise its own.
import path from 'node:path'
import { ROOT, read, gitIn, sanctionWrites, writeAtomic } from './core.ts'

export const RATCHET_FILE = '.rig/ratchets.json'
export type Direction = 'down' | 'up'
export type RatchetWrite = 'write' | 'stage' | null

export function lastNumber(text: string): number | null {
  const n = Number(text.trim().split('\n').pop()?.trim())
  return text.trim() && Number.isFinite(n) ? n : null
}

export function loadRatchets(text: string): Record<string, number> {
  try {
    const v = JSON.parse(text) as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number>
  } catch { return {} }
}

// 'worse' only beyond rounding noise.
export function judge(dir: Direction, value: number, base: number): 'worse' | 'better' | 'same' {
  if (Math.abs(value - base) < 1e-9) return 'same'
  return (dir === 'down' ? value > base : value < base) ? 'worse' : 'better'
}

// Records a tightened baseline. It only ever writes a value that is better than the one on disk (or the first one), so it cannot loosen.
export function tighten(id: string, dir: Direction, value: number, mode: Exclude<RatchetWrite, null>): void {
  const file = path.join(ROOT, RATCHET_FILE)
  const all = loadRatchets(read(file))
  if (id in all && judge(dir, value, all[id] as number) !== 'better') return
  all[id] = value
  writeAtomic(file, JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n')
  sanctionWrites([RATCHET_FILE])
  if (mode === 'stage') gitIn(ROOT, ['add', RATCHET_FILE])
}
