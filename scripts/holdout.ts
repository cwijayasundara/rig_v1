// Holdout cases (three-gates C3): black-box acceptance tests written at chart time, one file per test-plan case under
// sprints/sprint-<N>/holdout/, that the builder never sees. They run at verify and in CI; only counts and case ids print.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'
import { ROOT, skillRef, SENSORS_JSON, CHANGES, exists, read, out, fail, frontmatter, optString, type Args, type HookInput } from './core.ts'
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
const sha = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex')
const CI_VARS = ['GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH']
type Case = { rel: string; data: Buffer }
// Each case runs alone from its own fresh temp dir holding only that file (read-only, sha256 checked just before the run, deleted after),
// so code under test cannot blank or add files for a later case. Output is discarded and the CI output files are not in its env.
// This is no isolation from the same uid: the code under test can still read its caller (see SECURITY.md).
export function runCases(cases: Case[], cmd: string, before?: (file: string) => void): { passed: number; failing: string[] } {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !CI_VARS.includes(k)))
  const failing = cases.filter(c => {
    if (!c.data.length) return true
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-holdout-')), f = path.join(dir, c.rel)
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c.data); fs.chmodSync(f, 0o444)
      before?.(f)
      const now = fs.existsSync(f) ? fs.readFileSync(f) : null
      return !now || sha(now) !== sha(c.data) || spawnSync(cmd.replaceAll('{file}', quote(f)), { shell: true, cwd: ROOT, env, stdio: 'ignore', timeout: 300_000 }).status !== 0
    } catch { return true } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  }).map(c => caseId(c.rel))
  return { passed: cases.length - failing.length, failing }
}

const gitBuf = (args: string[]): Buffer | null => { try { return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
// At CI every case file comes from the base ref (a PR cannot edit them, nor choose which run) and runs against the PR tree; a git error fails.
function baseCases(base: string): Case[] {
  const list = gitBuf(['ls-tree', '-r', '--name-only', '-z', base, '--', '.rig/product/sprints'])
  if (list === null) fail(`holdout --ci: cannot read ${base} (git ls-tree failed)`)
  return list.toString().split('\0').filter(n => touchesHoldout(n) && !path.basename(n).startsWith('.')).sort().map(n => {
    const data = gitBuf(['show', `${base}:${n}`])
    if (data === null) fail(`holdout --ci: cannot read ${n} at ${base}`)
    return { rel: n, data }
  })
}
const localCases = (sprint: number): Case[] => exists(holdoutDir(sprint)) ? fs.readdirSync(holdoutDir(sprint)).filter(n => !n.startsWith('.') && fs.statSync(path.join(holdoutDir(sprint), n)).isFile()).sort().map(n => ({ rel: `${sprintRel(sprint)}/holdout/${n}`, data: fs.readFileSync(path.join(holdoutDir(sprint), n)) })) : []
const posixShell = (cmd: string): void => { if (process.platform === 'win32' && /^bash\b/.test(cmd)) fail('holdout runs need a POSIX shell') }

export function runHoldout(sprint: number, cmd: string, cases: Case[] = localCases(sprint)): HoldoutResult {
  if (!cases.length) return { sprint, passed: 0, total: 0, failing: [], none: true }
  if (!cmd) return { sprint, passed: 0, total: cases.length, failing: cases.map(c => caseId(c.rel)), none: false, error: 'holdout cases exist but .rig/sensors.json has no holdout command' }
  posixShell(cmd)
  return { sprint, total: cases.length, ...runCases(cases, cmd), none: false }
}

export const holdoutLines = (r: HoldoutResult): string[] => r.none ? [`holdout: none for sprint ${r.sprint}`] : [`holdout: ${r.passed}/${r.total} passed`, ...(r.failing.length ? [`failing: ${r.failing.join(', ')}`] : []), ...(r.error ? [r.error] : [])]
export const holdoutFix = (): string => `fix the code against the requirement the failing case id names in the test plan (cases.md), not to look for the test`

export function cmdHoldout(args: Args): void {
  const ci = args.opt.ci === true
  if (!ci) {
    const slug = args.pos[0] ?? fail('usage: holdout <slug> | holdout --ci --base <ref>')
    const sprint = sprintOf(slug)
    if (sprint === null) return out(`holdout: none (${slug} has no sprint)`)
    const r = runHoldout(sprint, parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry.holdout)
    out(holdoutLines(r).join('\n')); process.exitCode = r.failing.length ? 1 : 0
    return
  }
  const base = optString(args, 'base') ?? fail('holdout --ci needs --base <ref>')
  const sensors = showAt(base, SENSORS_JSON)
  const cmd = parseRegistry(sensors ?? '{}').registry.holdout
  const cases = baseCases(base), sprints = [...new Set(cases.map(c => Number(/sprint-(\d+)\//.exec(c.rel)?.[1])))]
  if (!sprints.length) return out(`holdout: none in ${base}`)
  const rs = sprints.map(n => runHoldout(n, cmd, cases.filter(c => c.rel.includes(`/sprint-${n}/`))))
  out(rs.flatMap(holdoutLines).join('\n'))
  process.exitCode = rs.some(r => r.failing.length) ? 1 : 0
}

// The PreToolUse guard (hook holdout-guard): a guardrail, not the check (CI is). Once a sprint's chart is approved no tool reads,
// searches or edits its holdout cases; a whole-file Write leaks nothing, and it makes the approval stale. `locked(n)` is that
// sprint's approved state; null means any sprint.
const META = /[`<>|;&\n]|\$\(/
export function holdoutDenied(input: HookInput, locked: (sprint: number | null) => boolean, holdoutDirs: () => string[] = () => []): string | null {
  const t = input.tool_input ?? {}
  if (input.tool_name === 'Write') return null
  const cwd = input.cwd ?? ROOT
  const posix = (v: string): string => path.resolve(cwd, v).replaceAll('\\', '/')
  const sprintIn = (v: string): number | null => { const m = /sprint-(\d+)/.exec(v); return m ? Number(m[1]) : null }
  let hit: number | null | false = false
  if (typeof t.command === 'string') {
    if (/\bholdout\b/.test(t.command) && !(/sdlc\.ts"? holdout\b/.test(t.command) && !META.test(t.command))) hit = sprintIn(t.command)
  } else {
    for (const v of [t.file_path, t.notebook_path, t.path, t.pattern, t.glob]) if (typeof v === 'string' && hit === false) {
      const p = posix(v)
      if (HOLDOUT_PATH.test(p) || /(^|\/)\*+\/holdout(\/|$)/.test(p)) hit = sprintIn(p)
    }
    if (hit === false && (input.tool_name === 'Grep' || input.tool_name === 'Glob')) {
      const root = posix(t.path ?? cwd)
      const inside = holdoutDirs().find(d => d === root || d.startsWith(`${root.replace(/\/$/, '')}/`))
      if (inside) hit = sprintIn(inside)
    }
  }
  return hit !== false && locked(hit) ? hidden() : null
}

export const touchesHoldout = (f: string): boolean => HOLDOUT_PATH.test(f)
