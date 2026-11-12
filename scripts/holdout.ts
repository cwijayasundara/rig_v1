// Holdout cases (three-gates C3): black-box acceptance tests written at chart time, one file per test-plan case under
// sprints/sprint-<N>/holdout/, that the builder never sees. They run at verify and in CI; only counts and case ids print.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, skillRef, SENSORS_JSON, CHANGES, exists, read, out, fail, git, defaultBase, frontmatter, optString, type Args, type HookInput } from './core.ts'
import { holdoutDir, sprintRel } from './product.ts'
import { parseRegistry } from './registry.ts'
import { showAt } from './diffs.ts'

export type HoldoutResult = { sprint: number | null; passed: number; total: number; failing: string[]; none: boolean; error?: string }
export const hidden = (): string => `holdout cases are hidden from the builder; run ${skillRef('test')}`
const HOLDOUT_PATH = /\.rig\/product\/sprints\/sprint-[^/]+\/holdout(\/|$)/i

// TC-3.holdout.test.js and test_tc_3_holdout.py both name case TC-3; any other name is its own id.
export const caseId = (file: string): string => { const m = /^(?:test[_-])?tc[-_](\d+)/i.exec(path.basename(file)); return m ? `TC-${m[1]}` : path.basename(file) }

// The change's sprint: its intent.md `sprint:`, else the sprint folder of the charted intent it was started from.
export function sprintOf(slug: string, read_: (f: string) => string = f => read(path.join(CHANGES, slug, f))): number | null {
  const d = frontmatter(read_('intent.md')).data
  const n = /^\d{1,4}$/.test(d.sprint ?? '') ? d.sprint : /sprints\/sprint-(\d{1,4})\//.exec(d.source ?? '')?.[1]
  return n === undefined ? null : Number(n)
}

const quote = (f: string): string => `'${f.replace(/'/g, "'\\''")}'`
// Each file runs alone; its output and its contents are discarded, so no run can leak an expected value to the builder.
function runFiles(files: string[], cmd: string): { passed: number; failing: string[] } {
  const failing = files.filter(f => spawnSync(cmd.replaceAll('{file}', quote(f)), { shell: true, cwd: ROOT, stdio: 'ignore', timeout: 300_000 }).status !== 0).map(caseId)
  return { passed: files.length - failing.length, failing }
}

// At CI the files come from the base ref (a PR cannot edit them) and run against the PR tree.
function baseFiles(base: string, dir: string, into: string): string[] {
  const names = (git(['ls-tree', '-r', '--name-only', base, '--', dir]) ?? '').split('\n').filter(Boolean)
  return names.map(n => { const f = path.join(into, path.basename(n)); fs.writeFileSync(f, showAt(base, n) ?? ''); return f })
}

export function runHoldout(sprint: number, cmd: string, base: string | null): HoldoutResult {
  const rel = `${sprintRel(sprint)}/holdout`
  const none = { sprint, passed: 0, total: 0, failing: [], none: true }
  const tmp = base ? fs.mkdtempSync(path.join(os.tmpdir(), 'rig-holdout-')) : ''
  try {
    const files = base ? baseFiles(base, rel, tmp) : exists(holdoutDir(sprint)) ? fs.readdirSync(holdoutDir(sprint)).filter(n => !n.startsWith('.')).sort().map(n => path.join(holdoutDir(sprint), n)) : []
    if (!files.length) return none
    if (!cmd) return { sprint, passed: 0, total: files.length, failing: files.map(caseId), none: false, error: 'holdout cases exist but .rig/sensors.json has no holdout command' }
    const r = runFiles(files, cmd)
    return { sprint, total: files.length, ...r, none: false }
  } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) }
}

export const holdoutLines = (r: HoldoutResult): string[] => r.none ? [`holdout: none for sprint ${r.sprint}`] : [`holdout: ${r.passed}/${r.total} passed`, ...(r.failing.length ? [`failing: ${r.failing.join(', ')}`] : []), ...(r.error ? [r.error] : [])]
export const holdoutFix = (): string => `fix the code against the requirement the failing case id names in the test plan (cases.md), not to look for the test`

export function cmdHoldout(args: Args): void {
  const ci = args.opt.ci === true
  const base = ci ? (optString(args, 'base') ?? defaultBase() ?? 'HEAD') : null
  const cmd = parseRegistry((base && showAt(base, SENSORS_JSON)) || read(path.join(ROOT, SENSORS_JSON))).registry.holdout
  const given = args.pos[0]
  let slugs: string[]
  if (given) slugs = [given]
  else if (ci) slugs = [...new Set((git(['diff', '--name-only', base ?? 'HEAD']) ?? '').split('\n').flatMap(f => /^\.rig\/changes\/([^/]+)\//.exec(f)?.[1] ?? []))]
  else fail('usage: holdout <slug> [--ci [--base <ref>]]')
  const sprints = [...new Set(slugs.map(s => sprintOf(s)).filter((n): n is number => n !== null))]
  if (!sprints.length) return out(ci ? 'holdout: none for the changes in this diff' : `holdout: none (${slugs[0]} has no sprint)`)
  const rs = sprints.map(n => runHoldout(n, cmd, base))
  out(rs.flatMap(holdoutLines).join('\n'))
  process.exitCode = rs.some(r => r.failing.length) ? 1 : 0
}

// The PreToolUse guard (hook holdout-guard): while the active change is being built or tested, no tool reads, searches or writes a holdout case.
export function holdoutDenied(input: HookInput, building: () => boolean): string | null {
  const t = input.tool_input ?? {}
  const hit = typeof t.command === 'string'
    ? /holdout\//.test(t.command.replace(/sdlc\.ts"? holdout\b[^;&|\n]*/g, ''))
    : [t.file_path, t.notebook_path, t.path, t.pattern, t.glob].some(v => typeof v === 'string' && (HOLDOUT_PATH.test(v.replaceAll('\\', '/')) || /(^|\/)\*+\/holdout(\/|$)/.test(v)))
  return hit && building() ? hidden() : null
}

// A chart PR (branch rig/chart-<N>) is where the cases are written; any other PR changing them is a person's call.
export const onChartBranch = (): boolean => /^rig\/chart-\d+$/.test(process.env.GITHUB_HEAD_REF || (git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? ''))
export const touchesHoldout = (f: string): boolean => HOLDOUT_PATH.test(f)
