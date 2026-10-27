// Contracts (behavioural harness spec 2026-10-16 §6): frozen per file at plan approval (lifecycle.ts writes the freeze into
// approval.json), validated before they run.
import fs from 'node:fs'
import { skillRef, SENSORS_PATH, exists } from './core.ts'
import { readApproval, digest } from './lifecycle.ts'
import { contractGlobs, type Contracts } from './registry.ts'
import { matchesAny, type Finding } from './model.ts'
import { runCommand, type RunRow } from './runs.ts'

// The `Contract:` and `Example:` files intents declare under ## Interfaces are registered in sensors.json contracts.files when a chart is approved,
// so every change's approval freezes them (shop_app 2026-10-27: declared, never registered). Returns the files added.
export function registerContracts(intents: string[]): string[] {
  const declared = intents.flatMap(t => [...t.matchAll(/^\s*[-*]\s*(?:Contract|Example):\s*`?([^\s`]+)`?\s*$/gim)].map(m => m[1] as string))
  if (!declared.length || !exists(SENSORS_PATH)) return []
  let json: { contracts?: { files?: string[] } }
  try { json = JSON.parse(fs.readFileSync(SENSORS_PATH, 'utf8')) } catch { return [] }
  const have = json.contracts?.files ?? []
  const added = [...new Set(declared)].filter(f => !have.includes(f) && !matchesAny(f, have))
  if (!added.length) return []
  json.contracts = { covers: [], validate: '', run: '', ...json.contracts, files: [...have, ...added] } as typeof json.contracts
  fs.writeFileSync(SENSORS_PATH, JSON.stringify(json, null, 2) + '\n')
  return added
}

// The freeze in force: the contracts the change's approval recorded.
export const frozenFor = (slug: string): Record<string, string> => readApproval(slug)?.contracts ?? {}

// A frozen file this diff touches whose text differs from its approved hash (deleted counts) blocks, until a person waives it
// or re-approves. Only the diff's files: a frozen file changed on the trunk and merged in is not this change's edit.
export function frozenFindings(slugs: string[], touched: string[], after: (file: string) => string): Finding[] {
  const out: Finding[] = []
  for (const slug of slugs) for (const [file, hash] of Object.entries(frozenFor(slug))) {
    if (!touched.includes(file) || digest(after(file)) === hash || out.some(f => f.file === file)) continue
    out.push({ sensor: 'harness-tamper', severity: 'block', file, message: `${file} is a contract frozen by the approval of ${slug} and has changed since`, fix: `revert it (git checkout -- ${file}); if the contract must change, ask the person to run ${skillRef('waive')} harness-tamper ${file} <reason> or to re-approve the plan` })
  }
  return out
}

// A turn runs the contract commands only when its diff reaches a contract file or the source a contract covers.
export const contractsTouched = (c: Contracts, files: string[]): boolean => files.some(f => matchesAny(f, [...contractGlobs(c), ...c.covers]))

const shown = (r: RunRow): string => r.tail.split('\n').slice(0, 20).join('\n')
const how = (r: RunRow): string => `exited ${r.exit}${r.timedOut ? ', timed out' : ''}`

// Validate gates run: when the examples do not match the specs, the suite's verdict would mean nothing.
export function runContracts(c: { validate?: string; run?: string }, timeoutMs: number): Finding[] {
  if (c.validate) {
    const v = runCommand(c.validate, { timeoutMs })
    if (v.exit !== 0) return [{ sensor: 'contracts', severity: 'block', message: `examples do not match the specs (validate ${how(v)})\n${shown(v)}`, fix: `fix the examples or the specs; a specs change needs a person to re-approve the plan. Rerun: ${c.validate}` }]
  }
  if (!c.run) return []
  const r = runCommand(c.run, { timeoutMs })
  return r.exit === 0 ? [] : [{ sensor: 'contracts', severity: 'block', message: `the behavioural suite failed (${how(r)})\n${shown(r)}`, fix: `fix the implementation or the execution setup, never the examples or specs. Rerun: ${c.run}` }]
}
