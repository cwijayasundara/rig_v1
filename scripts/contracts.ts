// Contracts (behavioural harness spec 2026-10-16 §6): frozen per file at plan approval, validated before they run.
// Registry repos only: a legacy `behavioral` repo keeps the approval digest over its contract files (core.ts).
import path from 'node:path'
import { ROOT, SDLC, APPROVALS, behavioralFiles, read, readJsonl, sha, type Approval } from './core.ts'
import { isRegistryShape } from './registry.ts'
import type { Finding } from './model.ts'

const FREEZING = ['spec', 'plan', 'design']
// Trailing whitespace is left out: git's readers (the staged text at commit) return trimmed output.
const digest = (text: string): string => sha(text.replace(/\s+$/, ''))

// The per-file hashes an approval of the spec or plan records, so an edit made after it names the file it touched.
export function freezeRecord(slug: string, stage: string): Record<string, string> | undefined {
  if (!FREEZING.includes(stage) || !isRegistryShape(read(path.join(SDLC, 'sensors.json')))) return undefined
  const files = behavioralFiles(slug)
  return files.length ? Object.fromEntries(files.map(f => [f, digest(read(path.join(ROOT, f)))])) : undefined
}

// The freeze in force: the latest approval row of the change that recorded one.
export const frozenFor = (slug: string): Record<string, string> => readJsonl<Approval>(APPROVALS).filter(a => a.slug === slug && a.contracts).at(-1)?.contracts ?? {}

// A frozen file whose text differs from its approved hash (deleted counts) blocks, until a person waives it or re-approves.
export function frozenFindings(slugs: string[], after: (file: string) => string): Finding[] {
  const out: Finding[] = []
  for (const slug of slugs) for (const [file, hash] of Object.entries(frozenFor(slug))) {
    if (digest(after(file)) === hash || out.some(f => f.file === file)) continue
    out.push({ sensor: 'harness-tamper', severity: 'block', file, message: `${file} is a contract frozen by the approval of ${slug} and has changed since`, fix: `revert it (git checkout -- ${file}); if the contract must change, ask the person to run /rig:waive harness-tamper ${file} <reason> or to re-approve the plan` })
  }
  return out
}
