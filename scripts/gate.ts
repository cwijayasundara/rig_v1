// The commit gate's mode and its stamp (the Claude team's verification post: gate commits, starting in observe mode; stamp each
// commit with how it was verified, "none" included). The mode is read from the trunk's copy of the registry, so a change cannot
// loosen the gate that judges it; observe never demotes harness-tamper or a broken config. pre-commit leaves a verdict for the
// tree it judged; commit-msg turns it into a `Rig-Verified:` trailer, or `none` when no verdict matches the tree being committed.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, SENSORS_JSON, git, exists, read, writeAtomic, type Args } from './core.ts'
import { parseRegistry } from './registry.ts'
import { trunkRef } from './off.ts'
import type { Finding } from './model.ts'

const gateMode = (): 'enforce' | 'observe' => {
  const text = git(['show', `${trunkRef()}:${SENSORS_JSON}`])
  return text !== null && parseRegistry(text).registry.risk.gate === 'observe' ? 'observe' : 'enforce'
}

const NEVER_OBSERVED = new Set(['harness-tamper', 'config'])
const splitObserved = (blocks: Finding[]): { held: Finding[]; observed: Finding[] } => ({
  held: blocks.filter(f => NEVER_OBSERVED.has(f.sensor)),
  observed: blocks.filter(f => !NEVER_OBSERVED.has(f.sensor)),
})

// Local evidence for the false-positive review (.rig/gates.jsonl is ignored by git, like the other run evidence).
function logObserved(observed: Finding[]): void {
  if (!observed.length || !exists(SDLC)) return
  const row = { at: new Date().toISOString(), tree: git(['write-tree']), would_block: observed.map(f => ({ sensor: f.sensor, file: f.file, message: f.message })) }
  fs.appendFileSync(path.join(SDLC, 'gates.jsonl'), JSON.stringify(row) + '\n')
}

const stateFile = (): string | null => { const f = git(['rev-parse', '--git-path', 'rig-gate.json']); return f ? path.resolve(ROOT, f) : null }

function writeVerdict(verdict: string): void {
  const file = stateFile(), tree = git(['write-tree'])
  if (file && tree) writeAtomic(file, JSON.stringify({ tree, verdict }))
}

// commit-msg: the verdict only counts for the tree it was written for, and only once.
export function cmdTrailer(args: Args): void {
  const msg = args.pos[0]
  if (!msg || !exists(msg)) return
  const file = stateFile()
  let verdict = 'none'
  try {
    const v = JSON.parse(read(file ?? '') || '{}') as { tree?: string; verdict?: string }
    if (v.tree && v.verdict && v.tree === git(['write-tree'])) verdict = v.verdict
  } catch { /* no verdict: none */ }
  if (file) fs.rmSync(file, { force: true })
  git(['interpret-trailers', '--in-place', '--if-exists', 'replace', '--trailer', `Rig-Verified: ${verdict}`, msg])
}

// Observe mode at commit: demote what would block (tamper and config errors stay), log it, and return how many were let through.
function observeGate(all: { findings: Finding[]; blocks: Finding[] }): number {
  if (!all.blocks.length || gateMode() !== 'observe') return 0
  const { held, observed } = splitObserved(all.blocks)
  logObserved(observed)
  all.blocks = held
  all.findings = all.findings.map(f => (observed.includes(f) ? { ...f, severity: 'warn' as const, message: `observe: would block: ${f.message}` } : f))
  return observed.length
}

// At commit, after the checks: observe mode first, then leave the verdict commit-msg stamps on the commit (only when nothing blocks).
export function gateCommit(all: { findings: Finding[]; blocks: Finding[] }, replaying: boolean): void {
  const observed = observeGate(all)
  if (!all.blocks.length) writeVerdict(replaying ? 'replay' : observed ? `observed-${observed}-would-block` : 'pass')
}
