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
import { shQuote } from './model.ts'
import { parseCases, requiredHoldouts } from './chartcheck.ts'

type HoldoutResult = { sprint: number | null; passed: number; total: number; failing: string[]; none: boolean; error?: string }
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

const sha = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex')
const CI_VARS = ['GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH']
type Case = { rel: string; data: Buffer }
// Shared setup is not a case: it is copied beside every case and never counted or run on its own. That is a conftest.py, and, in a dir
// whose cases are named by id (TC-3.holdout.test.js, test_tc_3_holdout.py), every file not named that way (the QA agent's one helper file).
const CASE_NAME = /^(?:test[_-])?tc[-_]\d+/i
const supportIn = (all: Case[]): ((c: Case) => boolean) => {
  const named = all.some(c => CASE_NAME.test(path.basename(c.rel)))
  return c => path.basename(c.rel) === 'conftest.py' || (named && !CASE_NAME.test(path.basename(c.rel)))
}
type CaseStatus = 'passed' | 'failed' | 'missing'
// Each case runs alone from its own fresh temp dir holding only that file (read-only, sha256 checked just before the run, deleted after),
// so code under test cannot blank or add files for a later case. Output is discarded and the CI output files are not in its env.
// This is no isolation from the same uid: the code under test can still read its caller (see SECURITY.md).
function caseOutcomes(all: Case[], cmd: string, before?: (file: string) => void): { id: string; status: CaseStatus }[] {
  const isSupport = supportIn(all), support = all.filter(isSupport), cases = all.filter(c => !isSupport(c))
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !CI_VARS.includes(k)))
  return cases.map(c => {
    const id = caseId(c.rel)
    if (!cmd || !c.data.length) return { id, status: 'missing' }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-holdout-')), f = path.join(dir, c.rel)
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c.data); fs.chmodSync(f, 0o444)
      for (const s of support) { const sf = path.join(dir, s.rel); fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, s.data); fs.chmodSync(sf, 0o444) }
      before?.(f)
      const now = fs.existsSync(f) ? fs.readFileSync(f) : null
      if (!now || sha(now) !== sha(c.data)) return { id, status: 'missing' }
      const r = spawnSync(cmd.replaceAll('{file}', shQuote(f)), { shell: true, cwd: ROOT, env, stdio: 'ignore', timeout: 300_000 })
      if (r.status === 126 || r.status === 127 || (r.error && !r.pid)) return { id, status: 'missing' }
      return { id, status: r.status === 0 ? 'passed' : 'failed' }
    } catch { return { id, status: 'missing' } } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })
}

export function runCases(cases: Case[], cmd: string, before?: (file: string) => void): { passed: number; failing: string[] } {
  const outcomes = caseOutcomes(cases, cmd, before), failing = outcomes.filter(c => c.status !== 'passed').map(c => c.id)
  return { passed: outcomes.length - failing.length, failing }
}

const gitBuf = (args: string[]): Buffer | null => { try { return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, timeout: 120_000, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return null } }
// At CI every case file comes from the base ref (a PR cannot edit them, nor choose which run) and runs against the PR tree; a git error fails.
function baseFiles(base: string): string[] {
  const list = gitBuf(['ls-tree', '-r', '--name-only', '-z', base, '--', '.rig/product/sprints'])
  if (list === null) fail(`holdout --ci: cannot read ${base} (git ls-tree failed)`)
  return list.toString().split('\0').filter(Boolean)
}
function baseCases(base: string, files: string[]): Case[] {
  return files.filter(n => touchesHoldout(n) && !path.basename(n).startsWith('.')).sort().map(n => {
    const data = gitBuf(['show', `${base}:${n}`])
    if (data === null) fail(`holdout --ci: cannot read ${n} at ${base}`)
    return { rel: n, data }
  })
}
const localCases = (sprint: number): Case[] => exists(holdoutDir(sprint)) ? fs.readdirSync(holdoutDir(sprint)).filter(n => !n.startsWith('.') && fs.statSync(path.join(holdoutDir(sprint), n)).isFile()).sort().map(n => ({ rel: `${sprintRel(sprint)}/holdout/${n}`, data: fs.readFileSync(path.join(holdoutDir(sprint), n)) })) : []
const posixShell = (cmd: string): void => { if (process.platform === 'win32' && /^bash\b/.test(cmd)) fail('holdout runs need a POSIX shell') }

// The cases of one change: the sprint's holdout files whose cases.md row names this intent (the other intents' cases cannot pass before
// those intents are built). No cases.md, or a file no row names, keeps every file.
export function holdoutFor(slug: string, sprint: number): Case[] {
  const all = localCases(sprint), plan = path.join(ROOT, sprintRel(sprint), 'testplan', 'cases.md')
  if (!exists(plan)) return all
  const rows = parseCases(read(plan))
  if (!rows.some(r => r.intent === slug)) return all
  const mine = new Set(rows.filter(r => r.intent === slug).map(r => r.id)), known = new Set(rows.map(r => r.id))
  const isSupport = supportIn(all)
  return all.filter(c => isSupport(c) || !known.has(caseId(c.rel)) || mine.has(caseId(c.rel)))
}

export function runHoldout(sprint: number, cmd: string, all: Case[] = localCases(sprint)): HoldoutResult {
  const isSupport = supportIn(all), cases = all.filter(c => !isSupport(c))
  if (!cases.length) return { sprint, passed: 0, total: 0, failing: [], none: true }
  if (!cmd) return { sprint, passed: 0, total: cases.length, failing: cases.map(c => caseId(c.rel)), none: false, error: 'holdout cases exist but .rig/sensors.json has no holdout command' }
  posixShell(cmd)
  return { sprint, total: cases.length, ...runCases(all, cmd), none: false }
}

export const holdoutLines = (r: HoldoutResult): string[] => r.none ? [`holdout: none for sprint ${r.sprint}`] : [`holdout: ${r.passed}/${r.total} passed`, ...(r.failing.length ? [`failing: ${r.failing.join(', ')}`] : []), ...(r.error ? [r.error] : [])]
export const holdoutFix = (): string => `fix the code against the requirement the failing case id names in the test plan (cases.md), not to look for the test`

function requiredCoverage(sprint: number, cmd: string, cases: Case[], required: string[]): { lines: string[]; pass: boolean } {
  if (cmd) posixShell(cmd)
  const outcomes = caseOutcomes(cases, cmd)
  const ids = (status: CaseStatus): string[] => [...new Set(outcomes.filter(c => c.status === status).map(c => c.id))]
  const passed = ids('passed'), failed = ids('failed')
  const missing = [...new Set([...ids('missing'), ...required.filter(id => !outcomes.some(c => c.id === id))])]
  const counts = { required, executed: [...new Set([...passed, ...failed])], passed, failed, missing }
  return {
    pass: !failed.length && !missing.length,
    lines: [`holdout: sprint ${sprint}`, ...Object.entries(counts).map(([label, ids]) => `  ${label} (${ids.length}): ${ids.join(', ') || 'none'}`)],
  }
}

// Charted intents nothing has started on: no .rig/changes/<slug> in the PR tree. Their hidden cases cannot pass yet, so CI leaves them out; an
// intent whose change record is in the tree (merged earlier, or this PR's own) keeps every case. No intent file at the base: nothing is left out.
function unbuiltCases(base: string, files: string[]): Set<string> {
  const started = new Set((gitBuf(['ls-tree', '--name-only', '-z', 'HEAD', '.rig/changes/'])?.toString() ?? '').split('\0').map(n => path.basename(n)))
  const skip = new Set<string>()
  for (const f of files) {
    const m = /^(\.rig\/product\/sprints\/sprint-\d{1,4})\/intents\/([^/]+)\.md$/.exec(f)
    if (!m || started.has(m[2] as string)) continue
    const plan = gitBuf(['show', `${base}:${m[1]}/testplan/cases.md`])
    for (const c of parseCases(plan?.toString() ?? '')) if (c.intent === m[2]) skip.add(`${m[1]}:${c.id}`)
  }
  return skip
}

function baseRequirements(base: string, files: string[], skip: Set<string>): Map<number, string[]> {
  const plans = new Map<number, string[]>()
  for (const name of files) {
    const m = /^\.rig\/product\/sprints\/sprint-(\d{1,4})\/testplan\/cases\.md$/.exec(name)
    if (!m) continue
    const data = gitBuf(['show', `${base}:${name}`])
    if (data === null) fail(`holdout --ci: cannot read ${name} at ${base}`)
    plans.set(Number(m[1]), [...new Set(requiredHoldouts(parseCases(data.toString())).map(c => c.id).filter(id => !skip.has(`${sprintRel(Number(m[1]))}:${id}`)))])
  }
  return plans
}

export function cmdHoldout(args: Args): void {
  const ci = args.opt.ci === true
  if (!ci) {
    const slug = args.pos[0] ?? fail('usage: holdout <slug> | holdout --ci --base <ref>')
    const sprint = sprintOf(slug)
    if (sprint === null) return out(`holdout: none (${slug} has no sprint)`)
    const r = runHoldout(sprint, parseRegistry(read(path.join(ROOT, SENSORS_JSON))).registry.holdout, holdoutFor(slug, sprint))
    out(holdoutLines(r).join('\n')); process.exitCode = r.failing.length ? 1 : 0
    return
  }
  const base = optString(args, 'base') ?? fail('holdout --ci needs --base <ref>')
  const sensors = showAt(base, SENSORS_JSON)
  const { gates, holdout: cmd } = parseRegistry(sensors ?? '{}').registry
  const files = baseFiles(base), skip = unbuiltCases(base, files), cases = baseCases(base, files)
  const bySprint = (n: number): Case[] => cases.filter(c => c.rel.startsWith(`${sprintRel(n)}/holdout/`) && !skip.has(`${sprintRel(n)}:${caseId(c.rel)}`))
  const sprints = [...new Set(cases.map(c => Number(/sprint-(\d+)\//.exec(c.rel)?.[1])))]
  if (!gates.plan && gates.requireChart) {
    const plans = baseRequirements(base, files, skip)
    const numbers = [...new Set([...plans.keys(), ...sprints])].sort((a, b) => a - b)
    const runs = numbers.map(n => requiredCoverage(n, cmd, bySprint(n), plans.get(n) ?? []))
    const report = runs.length ? runs.flatMap(r => r.lines).join('\n') : `holdout: no required or executable cases in ${base}`
    out(report)
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Independent holdout evidence\n\n' + report.split('\n').map(line => '    ' + line).join('\n') + '\n')
    process.exitCode = runs.every(r => r.pass) ? 0 : 1
    return
  }
  if (!sprints.length) return out(`holdout: none in ${base}`)
  const rs = sprints.map(n => runHoldout(n, cmd, bySprint(n)))
  out(rs.flatMap(holdoutLines).join('\n'))
  process.exitCode = rs.some(r => r.failing.length) ? 1 : 0
}

// The PreToolUse guard (hook holdout-guard): a guardrail, not the check (CI is). Once a sprint's chart is approved no tool reads,
// searches or edits its holdout cases; a whole-file Write leaks nothing, and it makes the approval stale. `locked(n)` is that
// sprint's approved state; null means any sprint.
const META = /[`<>|;&\n]|\$\(/
export function holdoutDenied(input: HookInput, locked: (sprint: number | null) => boolean): string | null {
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
    // A repo-root search is allowed (the harness's .rig/product/.ignore keeps holdouts out of rg); a root inside .rig, or text naming holdout, is not.
    if (hit === false && (input.tool_name === 'Grep' || input.tool_name === 'Glob')) {
      const root = posix(t.path ?? cwd), rig = `${ROOT.replaceAll('\\', '/')}/.rig`
      if (root === rig || root.startsWith(`${rig}/`) || [t.pattern, t.glob].some(v => typeof v === 'string' && /holdout/i.test(v))) hit = null
    }
  }
  return hit !== false && locked(hit) ? hidden() : null
}

export const touchesHoldout = (f: string): boolean => HOLDOUT_PATH.test(f)
