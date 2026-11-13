// Frozen tests (C2): the test writer's hand-off is a row of file hashes in .rig/changes/<slug>/tests.freeze.jsonl, appended by
// `tests-freeze` and never rewritten. The check judges file content, not who wrote it, so a Bash write is caught like an Edit.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CHANGES, ROOT, SENSORS_JSON, exists, read, readJson, readJsonl, fail, now, git, checkSlug, optString, sanctionWrites, defaultBase, skillRef, type Args } from './core.ts'
import { isTest, isSource, matchesAny, type Finding } from './model.ts'
import { branchDiff, rangeDiff, showAt } from './diffs.ts'
import { parseRegistry, type Registry } from './registry.ts'
import { behaviourIds, CONFIG_FILE, SNAPSHOT } from './sensors.ts'
import { parse as parseMap } from './intentmap.ts'

export type FreezeRow = { at: string; commit: string; files: { path: string; sha256: string }[]; why: string; dropped?: string[] }
export const freezePath = (slug: string): string => path.join(CHANGES, slug, 'tests.freeze.jsonl')
export const readFreeze = (slug: string): FreezeRow[] => readJsonl<FreezeRow>(freezePath(slug))
const digest = (file: string): string | null => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') } catch { return null } }
// What the test writer hands off: the tests, their support files and fixtures (a stack pack lists its runner config there), snapshots
// (binary too: raw bytes) and any config file named for tests. A runner key inside a shared manifest is not a file of its own.
const TEST_CONFIG = /(?:^|\/)\.?[^/]*(?:test|spec)[^/]*$/i
export const frozenKind = (f: string, paths: Registry['paths']): boolean => isTest(f, paths) || matchesAny(f, [...paths.testSupport, ...paths.fixtures]) || SNAPSHOT.test(f) || (CONFIG_FILE.test(f) && TEST_CONFIG.test(f))
const changeBase = (slug: string): string => readJson<{ base?: string } | null>(path.join(CHANGES, slug, 'verify.json'), null)?.base ?? defaultBase() ?? 'HEAD'
const specHasBehaviours = (slug: string): boolean => behaviourIds(read(path.join(CHANGES, slug, 'spec.md')), 'Behaviours').length > 0

export function cmdTestsFreeze(args: Args): void {
  const given = args.pos[0]
  if (!given) return fail('usage: tests-freeze <slug> [--why "<text>"] [--drop <file>]...')
  const slug = checkSlug(given)
  if (!exists(path.join(CHANGES, slug))) return fail(`unknown change ${slug}`)
  const prior = readFreeze(slug)
  const why = optString(args, 'why')?.trim() || (prior.length ? '' : 'hand-off')
  if (!why) return fail(`${slug} is already frozen: a later freeze needs --why "<reason the test writer changed a frozen test>"`)
  const drops = process.argv.flatMap((a, i, v) => a === '--drop' && v[i + 1] ? [v[i + 1] as string] : [])
  const held = new Set(prior.flatMap(r => r.files.map(f => f.path)))
  const gone = [...held].filter(f => !drops.includes(f) && digest(f) === null)
  if (gone.length) return fail(`frozen test(s) missing: ${gone.join(', ')}; restore them, or let the test writer drop them on purpose: tests-freeze ${slug} --why "<reason>" ${gone.map(f => `--drop ${f}`).join(' ')}`)
  const { paths } = parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry
  const base = changeBase(slug)
  // The formal checker is the first script the map's ## Formal command names; it is frozen wherever it lives.
  const checker = parseMap(read(path.join(CHANGES, slug, 'intent-map.md'))).formalCommand.split(/\s+/).map(w => w.replace(/^["']|["']$/g, '').replace(/^\.\//, '')).find(w => /\.(?:py|mjs|cjs|js|ts|sh|rb)$/.test(w) && exists(path.join(ROOT, w)))
  const names = [...new Set([...(checker ? [checker] : []), ...branchDiff(base).filter(d => d.status !== 'D' && frozenKind(d.file, paths)).map(d => d.file), ...held])].filter(f => !drops.includes(f) && digest(f) !== null)
  if (!names.length && specHasBehaviours(slug)) return fail(`no test files in the diff against ${base}, but spec.md has B-numbered behaviours: write the tests first`)
  // The files go into a commit of their own, so the row's commit contains them; the row follows in a second commit.
  const sub = (msg: string, files: string[]): boolean => !(git(['status', '--porcelain', '--', ...files]) ?? '').trim() || (git(['add', '--', ...files]) !== null && git(['commit', '-q', '-m', msg, '--', ...files]) !== null)
  if (names.length && !sub(`test(${slug}): freeze tests from the test writer`, names)) return fail('could not commit the frozen tests: fix the git error shown by `git commit`, then run tests-freeze again')
  const files = names.map(f => ({ path: f, sha256: digest(f) as string }))
  const row: FreezeRow = { at: now(), commit: (git(['rev-parse', 'HEAD']) ?? '').trim(), files, why, ...(drops.length ? { dropped: drops } : {}) }
  fs.appendFileSync(freezePath(slug), JSON.stringify(row) + '\n')
  sanctionWrites([`.rig/changes/${slug}/tests.freeze.jsonl`])
  sub(`test(${slug}): record the test freeze`, [`.rig/changes/${slug}/tests.freeze.jsonl`])
  process.stdout.write(`${slug}: froze ${files.length} file(s) at ${row.commit.slice(0, 7)} (${why})${drops.length ? `, dropped ${drops.join(', ')}` : ''}\n`)
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
  // Every file any row froze stays frozen at its latest hash; it leaves the set only through a row's `dropped`.
  const held = new Map<string, string>()
  for (const r of rows) {
    const have = new Set(r.files.map(f => f.path))
    for (const p of [...held.keys()]) if (!have.has(p)) {
      if (!r.dropped?.includes(p)) out.push(block('a frozen file left the freeze without --drop', `restore it and run tests-freeze ${slug} --why "<reason>" again; a file leaves the set only with --drop <file>`, p))
      held.delete(p)
    }
    for (const f of r.files) held.set(f.path, f.sha256)
  }
  // The hash check is not run at a commit: tests-freeze commits the changed tests before it records them.
  if (point !== 'commit') for (const [p, sha] of held) if (digest(p) !== sha) out.push(block('frozen test changed after the test writer\'s hand-off', `relaunch the test writer to change it, then run tests-freeze ${slug} --why "<reason>"; never edit a frozen test in the implementer`, p))
  if (point === 'stop') return out
  if (base && rewritten(slug, base)) out.push(block('tests.freeze.jsonl was rewritten, not appended', 'restore the file from the base branch and append a row with tests-freeze; never edit the file'))
  // The hand-off commit holds tests only: code already on the branch then was not written against the tests (a from-diff change starts with its code).
  const first = rows[0]?.commit
  if ((point === 'ship' || point === 'ci') && base && first && git(['cat-file', '-e', `${first}^{commit}`]) !== null && !/^from-diff:/m.test(read(path.join(CHANGES, slug, 'intent.md')))) {
    for (const d of rangeDiff(git(['merge-base', base, first])?.trim() || base, first)) if (isSource(d.file, config.paths) && !frozenKind(d.file, config.paths) && !CONFIG_FILE.test(d.file)) out.push(block(`code was written before the test writer's hand-off: ${d.file}`, `the code belongs after tests-freeze ${slug}: relaunch the test writer from a branch where the tests come first`, d.file))
  }
  // gates.testWriter: a change with behaviours must have been handed off by the test writer; not at a commit, which tests-freeze makes itself.
  if (point !== 'commit' && config.gates.testWriter && !rows.length && specHasBehaviours(slug)) out.push(block(`${slug} has B-numbered behaviours but no tests.freeze.jsonl row: gates.testWriter is on`, `${skillRef('build')} step 3: launch the test writer, then run tests-freeze ${slug} before writing code`))
  return out
}

// CI shows each re-freeze and drop a PR adds (a lone hand-off row is not listed): the implementer-side loophole must be read by a person.
export function freezeRowsAdded(base: string, clean: (v: unknown) => string): string[] {
  return (git(['diff', '--name-only', base, 'HEAD', '--', '.rig/changes']) ?? '').split('\n').flatMap(f => {
    const slug = /^\.rig\/changes\/([^/]+)\/tests\.freeze\.jsonl$/.exec(f)?.[1]
    const before = slug ? lines(showAt(base, f) ?? '').length : 0
    return slug ? readFreeze(slug).slice(before).filter((r, i) => before || i || r.why !== 'hand-off' || r.dropped?.length).map(r => `${slug}: re-frozen "${clean(r.why)}"${r.dropped?.length ? ` dropped ${r.dropped.map(clean).join(', ')}` : ''}`) : []
  })
}
