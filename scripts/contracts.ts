// Contracts (behavioural harness spec 2026-10-16 §6): frozen per file at plan approval, validated before they run.
// Registry repos only: a legacy `behavioral` repo keeps the approval digest over its contract files (core.ts).
import path from 'node:path'
import { ROOT, SDLC, APPROVALS, behavioralFiles, read, readJsonl, sha, type Approval } from './core.ts'
import { isRegistryShape, type Contracts } from './registry.ts'
import { matchesAny, type Finding } from './model.ts'
import { runCommand, type RunRow } from './runs.ts'

const FREEZING = ['spec', 'plan', 'design']
// Trailing whitespace is left out: git's readers (the staged text at commit) return trimmed output.
const digest = (text: string): string => sha(text.replace(/\s+$/, ''))

// The per-file hashes an approval of the spec or plan records, so an edit made after it names the file it touched.
export function freezeRecord(slug: string, stage: string): Record<string, string> | undefined {
  if (!FREEZING.includes(stage) || !isRegistryShape(read(path.join(SDLC, 'sensors.json')))) return undefined
  // Always a record (empty when no contract file is left), so a re-approval can lift an old freeze.
  return Object.fromEntries(behavioralFiles(slug).map(f => [f, digest(read(path.join(ROOT, f)))]))
}

// The freeze in force: the latest approval row of the change that recorded one.
export const frozenFor = (slug: string): Record<string, string> => readJsonl<Approval>(APPROVALS).filter(a => a.slug === slug && a.contracts).at(-1)?.contracts ?? {}

// A frozen file this diff touches whose text differs from its approved hash (deleted counts) blocks, until a person waives it
// or re-approves. Only the diff's files: a frozen file changed on the trunk and merged in is not this change's edit.
export function frozenFindings(slugs: string[], touched: string[], after: (file: string) => string): Finding[] {
  const out: Finding[] = []
  for (const slug of slugs) for (const [file, hash] of Object.entries(frozenFor(slug))) {
    if (!touched.includes(file) || digest(after(file)) === hash || out.some(f => f.file === file)) continue
    out.push({ sensor: 'harness-tamper', severity: 'block', file, message: `${file} is a contract frozen by the approval of ${slug} and has changed since`, fix: `revert it (git checkout -- ${file}); if the contract must change, ask the person to run /rig:waive harness-tamper ${file} <reason> or to re-approve the plan` })
  }
  return out
}

// A turn runs the contract commands only when its diff reaches a contract file or the source a contract covers.
export const contractsTouched = (c: Contracts, files: string[]): boolean => files.some(f => matchesAny(f, [...contractGlobs(c), ...c.covers]))
// The contract files, as the freeze sees them: commands with no files declared default to .rig/contracts/** (core.ts behavioralFiles).
export const contractGlobs = (c: Contracts): string[] => (c.files.length ? c.files : c.validate || c.run ? ['.rig/contracts/**'] : [])

const shown = (r: RunRow): string => r.tail.split('\n').slice(0, 20).join('\n')
const how = (r: RunRow): string => `exited ${r.exit}${r.timedOut ? ', timed out' : ''}`

// Validate gates run: when the examples do not match the specs, the suite's verdict would mean nothing.
export function runContracts(c: { validate?: string; run?: string }, timeoutMs: number): Finding[] {
  if (c.validate) {
    const v = runCommand(c.validate, { timeoutMs })
    if (v.exit !== 0) return [{ sensor: 'behavioral', severity: 'block', message: `examples do not match the specs (validate ${how(v)})\n${shown(v)}`, fix: `fix the examples or the specs; a specs change needs a person to re-approve the plan. Rerun: ${c.validate}` }]
  }
  if (!c.run) return []
  const r = runCommand(c.run, { timeoutMs })
  return r.exit === 0 ? [] : [{ sensor: 'behavioral', severity: 'block', message: `the behavioural suite failed (${how(r)})\n${shown(r)}`, fix: `fix the implementation or the execution setup, never the examples or specs. Rerun: ${c.run}` }]
}
