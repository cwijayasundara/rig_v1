// Orchestrates sensors at a firing point (stop, ship, ci): one set of checks everywhere, so local == CI.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  ROOT, SDLC, CHANGES, WAIVERS, exists, read, out, fail, git, toPosix, optString, readJsonl, defaultBase, checkSlug,
  type Args, type Waiver,
} from './core.ts'
import { parseConfig, parseRules, formatFindings, warnLines, matchesAny, isTest, isSource, ghBin, type FileDiff, type Finding, type Rule, type SensorConfig } from './model.ts'
import { withoutFixtures, testTamper, suppressions, layering, size, secretsInDiff, rulesSensor, harnessTamper, isProtected, behaviourIds, behaviourText, missingBehaviours } from './sensors.ts'
import { readBaseline, snapshot, turnDiff, fileDiff, branchDiff, showAt, fileLines, stagedDiff, showStaged } from './diffs.ts'
import { runCommand, recordRun, normCmd } from './runs.ts'
import { selectScopes, resolveCommands } from './scopes.ts'
import { withBaseTree } from './basetree.ts'
import { activeSlug, approvalState, changeType } from './lifecycle.ts'
import { isRegistryShape, parseRegistry, registryConfig, updateKnownRed, type Registry } from './registry.ts'
import { frozenFindings, runContracts } from './contracts.ts'
import { syncFindings } from './sync.ts'

export type Point = 'stop' | 'commit' | 'ship' | 'ci'
export type CheckInput = {
  point: Point
  diffs: FileDiff[]
  config: SensorConfig
  rules: Rule[]
  slugs: string[]
  commands: 'fast' | 'full' | 'none'
  budgetMs: number
  before: (file: string) => string
  toolEdited?: Set<string>
  base: string | null
  ratchet?: boolean
  after?: (file: string) => string // the text being judged; defaults to the working tree (commit passes the index)
  gates?: { plan: boolean } // the plan gate; absent: on
  contracts?: boolean // run the contract commands (validate, then run); absent: at ship and ci only
}
export type CheckResult = { findings: Finding[]; blocks: Finding[]; warns: Finding[]; waived: number }

const SENSORS_JSON = '.rig/sensors.json'
const TAIL_IN_FINDING = 15

// With a ref (CI), config comes from the base branch, so a PR cannot loosen the rules it is judged by.
// A registry-shaped sensors.json (behavioural harness step 2) is read through registryConfig; registry is null otherwise.
export function loadConfig(ref: string | null = null): { config: SensorConfig; rules: Rule[]; errors: string[]; registry: Registry | null } {
  if (ref && git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === null) return { config: parseConfig('').config, rules: [], errors: [`config ref ${ref} does not exist`], registry: null }
  const text = (rel: string): string => (ref ? git(['show', `${ref}:${rel}`]) ?? '' : read(path.join(ROOT, rel)))
  const r = parseRules(text('.rig/rules.json'))
  const ruleErrors = r.errors.map(e => `rules.json: ${e}`)
  const raw = text(SENSORS_JSON)
  if (isRegistryShape(raw)) {
    const p = parseRegistry(raw)
    const v = registryConfig(p.registry)
    return { config: v.config, rules: r.rules, errors: [...p.errors, ...v.errors, ...ruleErrors], registry: p.registry }
  }
  const c = parseConfig(raw)
  return { config: c.config, rules: r.rules, errors: [...c.errors, ...ruleErrors], registry: null }
}

// Once a known-red command passes, it blocks from then on: the only automatic edit to sensors.json, and it only tightens.
function ratchet(cleared: string[]): void {
  const file = path.join(ROOT, SENSORS_JSON)
  if (!exists(file)) return
  try {
    const text = read(file)
    const next = updateKnownRed(text, [], cleared)
    if (JSON.stringify((JSON.parse(next) as { knownRed?: unknown }).knownRed) !== JSON.stringify((JSON.parse(text) as { knownRed?: unknown }).knownRed ?? [])) fs.writeFileSync(file, next)
  } catch { /* unparseable: leave it */ }
}

// A registry can turn a built-in off or make it advisory; secrets and harness-tamper always block (registry.ts).
function builtinsApplied(findings: Finding[], config: SensorConfig): Finding[] {
  const b = config.builtins
  if (!b) return findings
  return findings.filter(f => !b.off.includes(f.sensor)).map(f => (f.severity === 'block' && b.soft.includes(f.sensor) ? { ...f, severity: 'warn' as const } : f))
}

// files: the changed source files select the scopes whose commands run; 'all' runs every scope's; undefined only the top-level ones.
export function runDeclared(prefix: 'fast' | 'full', config: SensorConfig, slug: string | null, budgetMs: number, allowRatchet = false, files?: string[] | 'all', skip?: Set<string>): Finding[] {
  const findings: Finding[] = []
  const cleared: string[] = []
  let left = budgetMs
  const plan = resolveCommands(prefix, config, files, budgetMs, skip)
  left -= plan.ms
  if (plan.affectedFailed) findings.push({ sensor: 'unscoped', severity: 'warn', message: `the affected command failed, so every scope ran: ${config.affected}`, fix: 'run the affected command in .rig/sensors.json and fix it' })
  for (const { key, cmd, dir, error } of plan.commands) {
    const known = config.knownRed.includes(key)
    const advisory = config.advisory?.includes(key) ?? false
    if (error) {
      findings.push({ sensor: 'commands', severity: 'block', message: `${key} not run: ${error}`, fix: `fix the scope's root in .rig/sensors.json` })
      continue
    }
    if (left <= 0) {
      findings.push({ sensor: 'commands', severity: advisory ? 'warn' : 'block', message: `${key} not run: the ${Math.round(budgetMs / 1000)} s budget ran out`, fix: `make the ${prefix} commands in .rig/sensors.json faster` })
      continue
    }
    const row = runCommand(cmd, { timeoutMs: left, cwd: dir })
    left -= row.ms
    if (slug) recordRun(slug, { ...row, source: prefix === 'fast' ? 'gate' : 'ship' })
    if (row.exit === 0) {
      if (known) cleared.push(key)
      continue
    }
    const tail = row.tail.split('\n').slice(-TAIL_IN_FINDING).map(t => '      ' + t).join('\n')
    findings.push({
      sensor: 'commands',
      severity: advisory || (known && !row.timedOut) ? 'warn' : 'block',
      message: `${key} failed (exit ${row.exit}${row.timedOut ? ', timed out' : ''}): ${cmd}\n${tail}`,
      fix: known && !row.timedOut ? 'known red before this change: fix it when you can' : `run \`${cmd}\` and fix what it reports`,
    })
  }
  if (cleared.length && allowRatchet) ratchet(cleared)
  return findings
}

// A "fire" is one rule matching in one check run (deduplicated by rule id); only stop and ship runs count, never ci.
function logRuleFires(findings: Finding[], point: Point): void {
  if (point === 'ci' || !exists(SDLC)) return
  const ids = [...new Set(findings.filter(f => f.sensor === 'rules').map(f => f.labels?.[0]))]
  const rows = ids.map(rule => JSON.stringify({ at: new Date().toISOString(), kind: 'event', event: 'rule-fired', rule }))
  try {
    if (rows.length) fs.appendFileSync(path.join(SDLC, 'usage.jsonl'), rows.join('\n') + '\n')
  } catch {
    // telemetry must never fail a check
  }
}

// At CI only a change the PR adds (its folder is absent in the base) can waive, and only inside its plan's files or its own folder:
// an older change's wildcard waiver must not cover what a later PR does.
function ciScope(slug: string, base: string | null | undefined): ((file: string | undefined) => boolean) | null {
  if (!base || showAt(base, `.rig/changes/${slug}/intent.md`) !== null) return null
  return () => true
}

// The PR supplies its own waivers.jsonl rows, so at CI harness-tamper on harness files and behavioral findings are never waivable: harness changes land on the trunk first, and the behavioural gate stays independent.
function applyWaivers(findings: Finding[], slugs: string[], ci?: { base: string | null | undefined }): CheckResult {
  const scopes = new Map(slugs.map(s => [s, ci ? ciScope(s, ci.base) : () => true] as const))
  const waivers = readJsonl<Waiver>(WAIVERS).filter(w => slugs.includes(w.slug) && scopes.get(w.slug) !== null)
  const waived = (f: Finding): boolean => waivers.some(w => w.sensor === f.sensor && (w.file === '*' || w.file === f.file) && !(ci && ((f.sensor === 'harness-tamper' && (!f.file || isProtected(f.file))) || f.sensor === 'behavioral')) && (scopes.get(w.slug) as (file: string | undefined) => boolean)(f.file))
  const kept = findings.filter(f => !waived(f))
  return { findings: kept, blocks: kept.filter(f => f.severity === 'block'), warns: kept.filter(f => f.severity === 'warn'), waived: findings.length - kept.length }
}

// Only the tests this branch adds or changes can show a behaviour is covered: an old test naming B1 proves nothing new.
function testCorpus(config: SensorConfig, diffs: FileDiff[]): string {
  return diffs.filter(d => d.status !== 'D' && !d.binary && isTest(d.file, config)).map(d => read(path.join(ROOT, d.file))).join('\n')
}

// Proof against the base, recomputed (no log entry can fake it): the branch's changed tests run on top of the base code.
// 'red' (feature, bugfix, incident, greenfield): they must FAIL there, so they prove the change.
// 'green' (refactor): they must PASS there, so they pin the old behaviour the refactor preserves.
function proofOnBase(slug: string, config: SensorConfig, diffs: FileDiff[], base: string, mode: 'red' | 'green', budgetMs: number): Finding[] {
  const block = (message: string, fix: string): Finding[] => [{ sensor: 'red-proof', severity: 'block', message, fix }]
  const cmd = config.full.test ?? config.fast.test
  const tests = diffs.filter(d => d.status !== 'D' && !d.binary && isTest(d.file, config)).map(d => d.file)
  // Support files (fixtures, testdata) travel with the tests, or a test that needs them would fail on the base for the wrong reason.
  const overlay = diffs.filter(d => d.status !== 'D' && !d.binary && (isTest(d.file, config) || matchesAny(d.file, config.testSupport))).map(d => d.file)
  const t0 = Date.now()
  const left = (): number => Math.max(1000, budgetMs - (Date.now() - t0))
  if (!tests.length) return mode === 'red' ? block('no test file changed, so nothing proves this change', 'write the failing test first') : []
  if (!cmd) return block('no test command declared (full.test or fast.test in .rig/sensors.json)', 'declare it so red can be proven')
  const tree = withBaseTree(base, tmp => {
    const sanity = runCommand(cmd, { cwd: tmp, timeoutMs: left() })
    recordRun(slug, { ...sanity, source: 'ship' })
    if (sanity.exit !== 0 || sanity.timedOut) return block("can't establish red: the tests fail on the base even without the new tests", 'make the test command pass from a clean checkout of the base (dependencies, fixtures), or the person waives red-proof')
    for (const t of overlay) {
      fs.mkdirSync(path.dirname(path.join(tmp, t)), { recursive: true })
      fs.copyFileSync(path.join(ROOT, t), path.join(tmp, t))
    }
    const run = runCommand(cmd, { cwd: tmp, timeoutMs: left() })
    if (run.timedOut) return block('proof timed out: the tests did not finish on the base within the budget', 'make the test command faster, or the person waives red-proof')
    recordRun(slug, mode === 'red' ? { ...run, expectFail: true, source: 'ship' } : { ...run, source: 'ship' })
    if (mode === 'red' && run.exit === 0) return block('the new tests already pass on the base: they prove nothing about this change', 'write a test that fails without the change, then make it pass')
    if (mode === 'green' && run.exit !== 0) return block("the refactor's tests fail on the base: they do not describe the behaviour being preserved", 'write characterization tests that pass on the old code first, then refactor under them')
    return []
  }, { prefix: 'rig-red-' })
  return tree.ok ? tree.value : block(tree.error, 'run `git worktree prune` and retry, check permissions for symlinks, or the person waives red-proof')
}

export function shipVerdicts(slug: string, config: SensorConfig, diffs: FileDiff[], base: string | null, budgetMs: number, planGate: boolean): Finding[] {
  const dir = path.join(CHANGES, slug)
  if (!exists(dir)) return [{ sensor: 'traceability', severity: 'block', message: `unknown change ${slug}`, fix: 'pass a slug that exists under .rig/changes/' }]
  const findings: Finding[] = []
  const state = approvalState(slug)
  if (planGate && state !== 'approved') findings.push({ sensor: 'plan-gate', severity: 'block', message: `${slug}: the plan is ${state === 'missing' ? 'not approved' : 'changed since it was approved'}`, fix: `a person reviews spec.md and plan.md and runs /rig:approve ${slug}` })
  const spec = read(path.join(dir, 'spec.md'))
  const ids = behaviourIds(spec, 'Behaviours')
  for (const id of missingBehaviours(ids, ids.length ? testCorpus(config, diffs) : '')) {
    const what = behaviourText(spec, 'Behaviours', id)
    findings.push({ sensor: 'traceability', severity: 'block', message: `${id}${what ? ` (${what})` : ''} has no test that names it`, fix: `add a test whose name or comment says ${id} and proves it` })
  }
  // Red for new behaviour, green-on-base for a refactor, nothing extra for a chore (its full suite already ran).
  const type = changeType(slug)
  const mode = type === 'feature' || type === 'bugfix' ? 'red' : type === 'refactor' ? 'green' : null
  if (mode && !base) findings.push({ sensor: 'red-proof', severity: 'warn', message: 'no base branch found; proof against the base skipped', fix: 'pass --base <branch>' })
  else if (mode && base) findings.push(...proofOnBase(slug, config, diffs, base, mode, budgetMs))
  return findings
}

export function runChecks(i: CheckInput): CheckResult {
  const { diffs, config } = i
  // A commit judges a partial diff, like Stop: same severities, same sensors. Only its text source differs.
  const point = i.point === 'commit' ? 'stop' : i.point
  const after = i.after ?? ((f: string) => read(path.join(ROOT, f)))
  const pattern = withoutFixtures(diffs, config)
  const findings: Finding[] = [
    ...testTamper(pattern, config),
    ...suppressions(pattern, config),
    ...layering(pattern, config),
    ...size(diffs, config, fileLines(diffs.filter(d => d.status !== 'D').map(d => d.file), after), point),
    ...secretsInDiff(pattern),
    ...rulesSensor(pattern, i.rules),
    ...harnessTamper(diffs, { point, toolEdited: i.toolEdited, before: i.before, after }),
    ...frozenFindings(i.slugs, diffs.map(d => d.file), after),
  ]
  // A diff whose plan the person approved is big by design: the diff-size limit warns instead of blocking.
  if (i.slugs.length && i.slugs.every(s => approvalState(s) === 'approved')) {
    for (const f of findings) if (f.sensor === 'size' && !f.file) f.severity = 'warn'
  }
  if (point !== 'stop') for (const slug of i.slugs) findings.push(...shipVerdicts(slug, config, diffs, i.base, i.budgetMs, i.gates?.plan ?? true))
  if (Object.keys(config.scopes).length) {
    const unscoped = selectScopes(diffs.filter(d => isSource(d.file, config)).map(d => d.file), config).unscoped
    if (unscoped.length) findings.push({ sensor: 'unscoped', severity: 'warn', message: `${unscoped.length} changed file(s) match no scope, so the top-level commands run for them: ${unscoped.slice(0, 5).join(', ')}`, fix: 'add a scope glob that covers them in .rig/sensors.json scopes' })
  }
  // Contracts (spec §6): ship and CI always, commit for a registry, a turn only when it reaches a contract. Validate gates run.
  if ((i.contracts ?? (i.point === 'ship' || i.point === 'ci')) && config.behavioral) findings.push(...runContracts(config.behavioral, i.point === 'stop' ? i.budgetMs : Math.max(i.budgetMs, 600_000)))
  if (i.commands !== 'none') findings.push(...runDeclared(i.commands, config, i.point === 'ci' ? null : i.slugs[0] ?? null, i.budgetMs, Boolean(i.ratchet) && i.point !== 'ci', i.point === 'ci' && config.ci.scope === 'all' ? 'all' : diffs.map(d => d.file).filter(f => isSource(f, config)), config.behavioral ? new Set([config.behavioral.validate ?? '', config.behavioral.run ?? ''].filter(Boolean).map(normCmd)) : undefined))
  const result = applyWaivers(builtinsApplied(findings, config), i.slugs, i.point === 'ci' ? { base: i.base } : undefined)
  logRuleFires(result.findings, i.point)
  return result
}

// The cheap per-file subset, for PostToolUse and the mod's per-edit notices.
export function editFindings(rel: string): Finding[] {
  const snap = readBaseline()
  if (!snap) return []
  const { config, rules } = loadConfig()
  const diffs = fileDiff(snap, rel)
  const pattern = withoutFixtures(diffs, config)
  const slug = activeSlug()
  return applyWaivers(builtinsApplied([...testTamper(pattern, config), ...suppressions(pattern, config), ...layering(pattern, config), ...size(diffs, config, fileLines([rel]), 'edit'), ...secretsInDiff(pattern), ...rulesSensor(pattern, rules), ...frozenFindings(slug ? [slug] : [], [rel], f => read(path.join(ROOT, f)))], config), slug ? [slug] : []).findings
}

// The changes a diff carries evidence for, as CI reads them.
export const slugsIn = (diffs: FileDiff[]): string[] => [...new Set(diffs.map(d => /^\.rig\/changes\/([^/]+)\//.exec(d.file)?.[1]).filter((s): s is string => Boolean(s)))]

// Waivers and approvals are trusted, not recomputed, so CI shows each row a PR adds for a person to review.
const HUMAN_FILES = [['.rig/waivers.jsonl', 'waiver']] as const
// PR-controlled text: one line, no backticks or angle brackets (it cannot close the summary fence or start a
// `::` workflow command, since every row is printed after "  - "), and capped.
const clean = (v: unknown): string => String(v).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/`/g, "'").replace(/[<>]/g, '_').replace(/"/g, "'").slice(0, 200)
export function humanRowsAdded(base: string): string[] {
  const rows: string[] = []
  for (const [rel, kind] of HUMAN_FILES) {
    const before = new Set((showAt(base, rel) ?? '').replace(/\r\n/g, '\n').split('\n').filter(Boolean))
    for (const line of read(path.join(ROOT, rel)).split('\n').filter(l => l && !before.has(l))) {
      let r: Record<string, unknown> = {}
      try { r = JSON.parse(line) as Record<string, unknown> } catch { /* shown raw below */ }
      const s = (k: string): string => clean(r[k] ?? '?')
      rows.push(!Object.keys(r).length ? `${kind} (unparseable): ${clean(line)}` : `waiver ${s('slug')}: ${s('sensor')} ${s('file')} "${s('reason')}" by ${s('by')}`)
    }
  }
  // approval.json: every one the PR adds or edits is a person's decision CI cannot verify from the file alone.
  for (const f of (git(['diff', '--name-only', base, 'HEAD', '--', '.rig/changes']) ?? '').split('\n').filter(f => /^\.rig\/changes\/[^/]+\/approval\.json$/.test(f))) {
    let by = '?'
    try { by = String((JSON.parse(read(path.join(ROOT, f))) as { by?: unknown }).by ?? '?') } catch { /* deleted or unreadable: still a row */ }
    rows.push(`approval ${f.split('/')[2]} by ${clean(by)}`)
  }
  return rows
}

// A PR file cannot prove who wrote an approval row (the model commits as the developer): CI asks GitHub for an approving review of the head commit by someone other than the author.
export function independentApproval(): string | null {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath || !fs.existsSync(eventPath)) return 'cannot verify a reviewer outside a GitHub pull_request run'
  let pr: { number?: number; user?: { login?: string }; head?: { sha?: string } } = {}, repo = ''
  try { const ev = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as { pull_request?: typeof pr; repository?: { full_name?: string } }; pr = ev.pull_request ?? {}; repo = ev.repository?.full_name ?? '' } catch { return 'the pull_request event payload is unreadable' }
  if (!pr.number || !repo || !pr.head?.sha) return 'the pull_request event has no number, repository or head commit'
  let reviews: { user?: { login?: string }; state?: string; commit_id?: string; author_association?: string }[]
  try { reviews = (JSON.parse(execFileSync(ghBin(), ['api', '--paginate', '--slurp', `repos/${repo}/pulls/${pr.number}/reviews?per_page=100`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })) as unknown[]).flat() as typeof reviews } catch { return 'could not read the PR reviews (the job needs pull-requests: read and GH_TOKEN)' }
  // a pull_request checkout is a merge commit (head is its 2nd parent); a workflow re-run reuses an old event
  if (![git(['rev-parse', 'HEAD']), git(['rev-parse', 'HEAD^2'])].includes(pr.head.sha)) return `the event's head ${pr.head.sha.slice(0, 7)} is not the checked-out commit (a re-run on a stale event?)`
  const latest = new Map<string, (typeof reviews)[number]>()
  for (const r of reviews) if (r.user?.login && r.state !== 'COMMENTED') latest.set(r.user.login, r)
  const ok = [...latest].some(([login, r]) => login !== pr.user?.login && r.state === 'APPROVED' && r.commit_id === pr.head?.sha && ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.author_association ?? ''))
  return ok ? null : `no approving review of ${pr.head.sha.slice(0, 7)} from someone other than ${pr.user?.login ?? 'the author'}`
}

function report(point: string, result: CheckResult, count: number, json: boolean, humanRows: string[] = []): void {
  if (json) return out(JSON.stringify({ ...result, humanRows }))
  // A commit hook and the CI log are read by a person, so they list each warning with its fix, not just a count.
  const text = [formatFindings(result.findings), ...(point === 'commit' || point === 'ci' ? warnLines(result.findings) : [])].filter(Boolean).join('\n')
  const human = humanRows.length ? `needs human review: ${humanRows.length} waiver/approval row(s) added by this PR\n${humanRows.map(r => `  - ${r}`).join('\n')}` : ''
  out([text || `sdlc check ${point}: pass (${count} file(s) checked${result.waived ? `, ${result.waived} waived` : ''})`, human].filter(Boolean).join('\n'))
  const summary = process.env.GITHUB_STEP_SUMMARY
  // Backticks in a file name or message must not close the summary's code fence.
  const fenced = (t: string): string => '```\n' + t.replace(/`/g, "'") + '\n```'
  if (summary) fs.appendFileSync(summary, `## sdlc check (${point})\n\n${text ? fenced(text) : 'pass'}\n${human ? '\n' + fenced(human) + '\n' : ''}`)
}

export function cmdCheck(args: Args): void {
  const at = optString(args, 'at')
  if (at !== 'stop' && at !== 'commit' && at !== 'ship' && at !== 'ci') fail('usage: check --at stop|commit|ship|ci [--base <ref>] [--config-from <ref>] [--slug <s>] [--budget-ms <n>] [--json]')
  const { config, rules, errors, registry } = loadConfig(optString(args, 'config-from') ?? null)
  const baseRef = optString(args, 'base')
  const base = baseRef ? git(['merge-base', 'HEAD', baseRef]) : defaultBase()
  if (at === 'ci' && !base) fail('check --at ci needs --base <ref> with a merge-base (fetch with fetch-depth: 0)')
  const partial = at === 'stop' || at === 'commit'
  let diffs: FileDiff[]
  let before: (f: string) => string
  let after: ((f: string) => string) | undefined
  let replaying = false
  if (at === 'commit') {
    diffs = stagedDiff()
    if (!diffs.length) return out('sdlc check commit: nothing staged')
    // A merge or rebase replays commits: the sensors still judge them, but the fast commands are left to CI.
    // Read from git state only (an environment variable is the model's to set).
    const marker = (p: string): boolean => { const f = git(['rev-parse', '--git-path', p]); return f !== null && exists(path.resolve(ROOT, f)) }
    replaying = marker('rebase-merge/head-name') || marker('rebase-apply/rebasing') || git(['rev-parse', '-q', '--verify', 'MERGE_HEAD^{commit}']) !== null
    if (replaying) out('sdlc check commit: merge/rebase in progress, fast commands skipped; CI judges the result')
    before = f => showAt('HEAD', f) ?? ''
    after = f => showStaged(f) ?? ''
    if (git(['diff', '--name-only'])) process.stderr.write('rig: the fast commands run against your working tree, which has unstaged changes\n')
  } else if (at === 'stop') {
    const snap = readBaseline() ?? snapshot()
    if (!snap) return out('sdlc check stop: nothing to compare against (no commits yet)')
    diffs = turnDiff(snap)
    before = f => showAt(snap.sha, f) ?? ''
  } else {
    diffs = branchDiff(base ?? 'HEAD')
    before = f => showAt(base ?? 'HEAD', f) ?? ''
  }
  const slugArg = optString(args, 'slug')
  if (slugArg) checkSlug(slugArg)
  const slugs = slugArg ? [slugArg] : at === 'ci' ? slugsIn(diffs) : [activeSlug()].filter((s): s is string => Boolean(s))
  const budgetMs = Number(optString(args, 'budget-ms') ?? (partial ? 60_000 : 1_800_000))
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) fail('--budget-ms must be a positive number')
  const humanRows = at === 'ci' && base ? humanRowsAdded(base) : []
  const why = humanRows.length ? independentApproval() : null // before runChecks: the PR's test commands could rewrite the event file or shadow gh
  const result = runChecks({ point: at, diffs, config, rules, slugs, commands: replaying ? 'none' : partial ? 'fast' : 'full', budgetMs, before, after, base, ratchet: !optString(args, 'config-from') && at !== 'commit', contracts: at === 'commit' ? registry !== null && !replaying : undefined, gates: registry?.gates })
  const configFindings: Finding[] = errors.map(e => ({ sensor: 'config', severity: 'block', file: SENSORS_JSON, message: e, fix: 'fix the file; see the sdlc README for its format' }))
  const humanFindings: Finding[] = why ? [{ sensor: 'human-approval', severity: 'block', message: `this PR adds ${humanRows.length} approval/waiver row(s): ${why}`, fix: 'a code owner other than the PR author reviews the rows below and approves the current head commit; pushing again needs a fresh approval' }] : []
  const syncBlocks = registry && (at === 'commit' || at === 'ci') ? syncFindings(registry, [], 'block') : [] // config errors already block above
  const all = { ...result, findings: [...humanFindings, ...configFindings, ...syncBlocks, ...result.findings], blocks: [...humanFindings, ...configFindings, ...syncBlocks, ...result.blocks] }
  report(at, all, diffs.length, Boolean(args.opt.json), humanRows)
  process.exitCode = all.blocks.length ? 1 : 0
}

export function cmdCheckFile(args: Args): void {
  const arg = args.pos[0]
  if (!arg || !exists(SDLC)) fail('usage: check-file <path> [--json]  (in an sdlc repo)')
  const rel = toPosix(path.relative(ROOT, path.resolve(ROOT, arg)))
  const findings = editFindings(rel)
  if (args.opt.json) return out(JSON.stringify(findings))
  out(formatFindings(findings) || `${rel}: ok`)
}

