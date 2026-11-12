// Frozen tests (C2): the test writer's hand-off is a row of file hashes in .rig/changes/<slug>/tests.freeze.jsonl, appended by
// `tests-freeze` and never rewritten. The check judges file content, not who wrote it, so a Bash write is caught like an Edit.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, SENSORS_JSON, exists, read, readJsonl, fail, now, git, checkSlug, optString, sanctionWrites, defaultBase, skillRef, type Args } from './core.ts'
import { isTest, type Finding } from './model.ts'
import { branchDiff, showAt } from './diffs.ts'
import { parseRegistry, type Registry } from './registry.ts'
import { behaviourIds } from './sensors.ts'

export type FreezeRow = { at: string; commit: string; files: { path: string; sha256: string }[]; why: string }
export const freezePath = (slug: string): string => path.join(CHANGES, slug, 'tests.freeze.jsonl')
export const readFreeze = (slug: string): FreezeRow[] => readJsonl<FreezeRow>(freezePath(slug))
const digest = (file: string): string | null => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') } catch { return null } }

export function cmdTestsFreeze(args: Args): void {
  const given = args.pos[0]
  if (!given) return fail('usage: tests-freeze <slug> [--why "<text>"]')
  const slug = checkSlug(given)
  if (!exists(path.join(CHANGES, slug))) return fail(`unknown change ${slug}`)
  const prior = readFreeze(slug)
  const why = optString(args, 'why')?.trim() || (prior.length ? '' : 'hand-off')
  if (!why) return fail(`${slug} is already frozen: a later freeze needs --why "<reason the test writer changed a frozen test>"`)
  const { paths } = parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry
  const files = branchDiff(defaultBase() ?? 'HEAD').filter(d => d.status !== 'D' && !d.binary && isTest(d.file, paths) && digest(d.file) !== null).map(d => ({ path: d.file, sha256: digest(d.file) as string }))
  const row: FreezeRow = { at: now(), commit: (git(['rev-parse', 'HEAD']) ?? '').trim(), files, why }
  fs.appendFileSync(freezePath(slug), JSON.stringify(row) + '\n')
  sanctionWrites([`.rig/changes/${slug}/tests.freeze.jsonl`])
  process.stdout.write(`${slug}: froze ${files.length} test file(s) at ${row.commit.slice(0, 7)} (${why})\n`)
}

const lines = (t: string): string[] => t.replace(/\r\n/g, '\n').split('\n').filter(Boolean)
const block = (message: string, fix: string, file?: string): Finding => ({ sensor: 'test-tamper', severity: 'block', message, fix, ...(file ? { file } : {}) })

// Every committed version of the freeze file on base..HEAD (and the working tree) must extend the one before it.
function rewritten(slug: string, base: string): boolean {
  const f = `.rig/changes/${slug}/tests.freeze.jsonl`
  const commits = (git(['log', '--reverse', '--format=%H', `${base}..HEAD`, '--', f]) ?? '').split('\n').filter(Boolean)
  const versions = [showAt(base, f), ...commits.map(c => showAt(c, f)), ...(exists(path.join(ROOT, f)) ? [read(path.join(ROOT, f))] : [])]
  let prev: string[] | null = null
  for (const v of versions) {
    if (v === null) { if (prev?.length) return true; continue }
    const cur = lines(v)
    if (prev && !prev.every((l, i) => cur[i] === l)) return true
    prev = cur
  }
  return false
}

export function freezeFindings(slug: string, point: string, base: string | null, config: Registry): Finding[] {
  const rows = readFreeze(slug)
  const out: Finding[] = []
  for (const f of rows.at(-1)?.files ?? []) if (digest(f.path) !== f.sha256) out.push(block('frozen test changed after the test writer\'s hand-off', `relaunch the test writer to change it, then run tests-freeze ${slug} --why "<reason>"; never edit a frozen test in the implementer`, f.path))
  if (point === 'stop') return out
  if (base && rewritten(slug, base)) out.push(block('tests.freeze.jsonl was rewritten, not appended', 'restore the file from the base branch and append a row with tests-freeze; never edit the file'))
  // gates.testWriter: a change with behaviours must have been handed off by the test writer.
  if (config.gates.testWriter && !rows.length && behaviourIds(read(path.join(CHANGES, slug, 'spec.md')), 'Behaviours').length) out.push(block(`${slug} has B-numbered behaviours but no tests.freeze.jsonl row: gates.testWriter is on`, `${skillRef('build')} step 3: launch the test writer, then run tests-freeze ${slug} before writing code`))
  return out
}
