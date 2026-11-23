// plan-check (W2 G1): when gates.plan is false no person approves the plan, so these deterministic checks stand in for the approval.
// Contracts unchanged, plan inside the intent, plan committed before code, and the existing approval refusals. Local and CI run the same function.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, CHANGES, SENSORS_PATH, SENSORS_JSON, read, exists, git, gitIn, out, fail, isTrunk, defaultBase, checkSlug, frontmatter, type Args } from './core.ts'
import { formatFindings, warnLines, matchesAny, normPath, planFiles, isSource, ghPages, type Finding, type FileDiff } from './model.ts'
import type { Paths } from './registry.ts'
import { sprintOf } from './holdout.ts'
import { parseRegistry, contractGlobs } from './registry.ts'
import { intentRelOf, sprintRel } from './product.ts'
import { intentScope, expand } from './scope.ts'
import { approvalRefusal, activeSlug } from './lifecycle.ts'
import { showAt } from './diffs.ts'
import { chartState, chartTreeAt } from './chart.ts'
import { intentSpecProblems, parseIntent } from './chartcheck.ts'
import { trunkRef } from './off.ts'

const LEDGER = /\b(?:FR|NFR|AC|UX)-\d+(?:\.\d+)*\b/g
const block = (message: string, fix: string, file?: string): Finding => ({ sensor: 'plan-check', severity: 'block', message, fix, ...(file ? { file } : {}) })
const lines = (args: string[]): string[] => (git(['-c', 'core.quotepath=off', ...args]) ?? '').split('\n').filter(Boolean)
const inRig = (f: string): boolean => f.startsWith('.rig/')

// Paths a diff names, A, M, D and both sides of a rename.
const diffNames = (args: string[]): string[] => (gitIn(ROOT, ['diff', '--name-only', '--no-renames', '-z', ...args], false) ?? '').split('\0').filter(Boolean)

// Commits oldest first with the files each touched; a merge counts by what it brought in against its first parent.
function commitsSince(base: string): { sha: string; subject: string; files: string[] }[] {
  const raw = git(['-c', 'core.quotepath=off', 'log', '--reverse', '--diff-merges=first-parent', '--format=%x01%H%x02%s', '--name-only', `${base}..HEAD`]) ?? ''
  return raw.split('\x01').filter(Boolean).map(c => {
    const [head = '', ...files] = c.split('\n'), [sha = '', subject = ''] = head.split('\x02')
    return { sha, subject, files: files.filter(Boolean) }
  })
}

function contractChanges(base: string | null, ci: boolean, chartRef?: string): string[] {
  const configs = [read(SENSORS_PATH), ...[...new Set([base, chartRef])].flatMap(ref => ref ? [showAt(ref, SENSORS_JSON) ?? ''] : [])]
  const globs = [...new Set(configs.flatMap(text => contractGlobs(parseRegistry(text).registry.contracts)))]
  if (!globs.length) return []
  const touched = [...(base ? diffNames([base, 'HEAD']) : []), ...(ci ? [] : [...diffNames(['HEAD']), ...lines(['ls-files', '--others', '--exclude-standard'])])]
  return [...new Set(touched)].filter(f => matchesAny(f, globs)).sort()
}

// At a pull_request run: a rewritten branch cannot prove plan-before-code, so a force-push in the PR timeline blocks, and an unreadable timeline blocks too.
function forcePushFindings(): Finding[] {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') return []
  const unread = block('could not read the PR timeline to confirm the branch was not force-pushed', 'the job needs pull-requests: read and GH_TOKEN')
  try {
    const ev = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) as { repository?: { full_name?: string }; pull_request?: { number?: number } }
    if (!ev.repository?.full_name || !ev.pull_request?.number) return [unread]
    const pushed = (ghPages(`repos/${ev.repository.full_name}/issues/${ev.pull_request.number}/timeline?per_page=100`) as { event?: string }[]).some(e => e.event === 'head_ref_force_pushed')
    return pushed ? [block('the branch was force-pushed: plan-before-code cannot be vouched for; push the plan commit and later commits without rewriting', 'open a new branch from the trunk and push the plan commit, then later commits, without rewriting history')] : []
  } catch { return [unread] }
}

// A PR that changes source with no .rig/changes/<slug>/ has no plan to check. Blocks only under gates.requireChart: otherwise it is explored work, tier 1 at CI, and the PR's person reviews it.
export function untrackedFindings(diffs: FileDiff[], paths: Paths): Finding[] {
  if (diffs.some(d => d.file.startsWith('.rig/changes/'))) return []
  return diffs.some(d => [d.file, ...(d.from ? [d.from] : [])].some(f => isSource(f, paths))) ? [block('source changed with no change record: a change needs .rig/changes/<slug>/ and a plan commit (S plan-check <slug> --commit)', 'start the change (S new <slug>), write spec.md and plan.md, and commit them first')] : []
}

function chartBinding(rel: string, ref: string, planParent: string, ci: boolean): Finding[] {
  const n = Number(/\/sprint-(\d+)\//.exec(rel)?.[1])
  const fix = 'approve the chart on the trunk and start a new implementation branch from that revision'
  try {
    const tree = chartTreeAt(ref)
    if (!tree) return [block(`could not read the chart at ${ref}`, fix)]
    if (!tree.exists(path.join(ROOT, rel))) return [block(`the chart intent ${rel} is not a regular file at ${ref}`, fix, rel)]
    const approved = chartState(n, tree)
    if (approved.state !== 'approved') return [block(`chart-${n} approval on ${ref} is ${approved.state}${approved.changed.length && approved.state === 'stale' ? ` (changed: ${approved.changed.join(', ')})` : ''}`, fix)]
    const original = planParent === ref ? tree : chartTreeAt(planParent)
    if (!original || chartState(n, original).digest !== approved.digest) return [block(`the plan did not start from the current approval of chart-${n} (${approved.digest})`, fix)]
    const candidate = ci ? chartTreeAt('HEAD') : undefined
    const sealFile = `${sprintRel(n)}/approval.json`
    const seal = ci ? candidate?.read(path.join(ROOT, sealFile)) : read(path.join(ROOT, sealFile))
    if ((ci && !candidate) || chartState(n, candidate ?? undefined).digest !== approved.digest || seal !== tree.read(path.join(ROOT, sealFile))) {
      return [block(`the implementation changes chart-${n} or its approval`, 'restore the approved chart files, or submit the changes on a chart PR', rel)]
    }
  } catch (e) { return [block(`could not verify chart-${n}: ${(e as Error).message}`, fix)] }
  return []
}

export function localPlanCheck(slug: string): Finding[] {
  const ref = trunkRef()
  const gates = parseRegistry(showAt(ref, SENSORS_JSON) ?? read(SENSORS_PATH)).registry.gates
  return planCheck(slug, { base: defaultBase(), ci: false, chartRef: !gates.plan && gates.requireChart ? ref : undefined })
}

export function planCheck(slug: string, o: { base: string | null; ci: boolean; chartRef?: string }): Finding[] {
  const found: Finding[] = []
  const { base, ci, chartRef } = o
  if (!base) found.push(ci ? block('no merge-base: fetch with fetch-depth: 0', 'check out the full history (fetch-depth: 0) so the PR can be compared with the trunk') : { sensor: 'plan-check', severity: 'warn', message: 'no merge-base with the trunk: the order and contract checks are skipped locally', fix: 'CI judges them' })
  for (const f of contractChanges(base, ci, chartRef)) found.push(block(`contract ${f} changed on a change branch: a contract change goes back to the chart`, 'revert the contract edit, or go back to the chart to change it', f))
  const intentRef = chartRef ?? (ci ? base : null)
  const files = intentRef ? (git(['ls-tree', '-r', '--name-only', intentRef, '--', '.rig/product/sprints']) ?? '').split('\n') : undefined
  // At CI the intent is read from the base only, so a PR cannot widen its own scope or chart itself; locally the working tree counts.
  const baseRel = files ? intentRelOf(slug, files) : null
  const onTrunkOnly = Boolean(files) && !baseRel && (chartRef || intentRelOf(slug) !== null || sprintOf(slug) !== null)
  const rel = baseRel ?? (files ? null : intentRelOf(slug))
  if (onTrunkOnly) found.push(block(`intent ${slug} is not on the trunk: chart it first`, 'chart the intent on the trunk (a person approves it there) before the change that builds it'))
  else if (!rel) found.push({ sensor: 'plan-check', severity: 'warn', message: 'not charted: scope and ledger checks skipped', fix: 'a charted change has a sprint intent; an ad hoc change has none' })
  if (rel) {
    const intent = intentRef ? (showAt(intentRef, rel) ?? '') : read(path.join(ROOT, rel))
    const sc = intentScope(slug, () => intent, [rel])
    const planPath = path.join(CHANGES, slug, 'plan.md'), specPath = path.join(CHANGES, slug, 'spec.md')
    const allowed = sc ? expand([...sc.scope, ...sc.touches]) : []
    const spec = read(specPath)
    if (chartRef) {
      const source = frontmatter(read(path.join(CHANGES, slug, 'intent.md'))).data.source
      if (source && source !== rel) found.push(block(`intent ${slug} points to ${source}; the approved chart uses ${rel}`, 'start the change from the approved intent', rel))
      if (!sc) found.push(block(`intent ${slug} has no approved scope`, 'add its allowed paths on the chart PR', rel))
      for (const problem of intentSpecProblems(parseIntent(slug, intent), spec)) found.push(block(problem, 'restore the approved behaviour or take it back to the chart'))
    }
    for (const f of sc && exists(planPath) ? planFiles(read(planPath)).map(normPath).filter(f => !inRig(f) && !matchesAny(f, allowed)) : []) found.push(block(`scope change: ${f} is outside intent ${slug}; it goes back to the chart`, 'drop the file from plan.md, or go back to the chart to widen the intent scope', f))
    for (const id of [...new Set(spec.match(LEDGER) ?? [])].filter(id => !new RegExp(`\\b${id.replace(/\./g, '\\.')}\\b`).test(intent))) found.push(block(`scope change: ${id} is outside intent ${slug}; it goes back to the chart`, 'drop the id from spec.md, or go back to the chart to add it to the intent'))
  }
  const queued = process.env.GITHUB_EVENT_NAME === 'merge_group'
  let planParent = base ?? 'HEAD'
  if (base && !queued) { // the merge queue run is judged on the PR
    const commits = commitsSince(base), planAt = commits.findIndex(c => c.files.includes(`.rig/changes/${slug}/plan.md`)), srcAt = commits.findIndex(c => c.files.some(f => !inRig(f)))
    if (planAt >= 0) planParent = `${commits[planAt]?.sha}^1`
    if (srcAt >= 0 ? planAt < 0 || planAt >= srcAt : ci && planAt < 0) found.push(block(`source committed before the plan (commit ${(commits[srcAt]?.sha ?? 'none').slice(0, 7)}): run S plan-check ${slug} --commit before building`, `commit the spec and plan first: S plan-check ${slug} --commit`))
  }
  if (chartRef && rel) found.push(...chartBinding(rel, chartRef, planParent, ci))
  if (ci) found.push(...forcePushFindings())
  const refusal = approvalRefusal(slug)
  if (refusal) found.push(block(refusal, 'fix spec.md and plan.md until `S approve <slug> --check` prints ok'))
  return found
}

// The spec or plan commits that landed after the first source commit: the person reads these in the PR.
export function planChangesAfterBuild(slug: string, base: string): string[] {
  const commits = commitsSince(base), srcAt = commits.findIndex(c => c.files.some(f => !inRig(f)))
  if (srcAt < 0) return []
  const mine = [`.rig/changes/${slug}/spec.md`, `.rig/changes/${slug}/plan.md`]
  return commits.slice(srcAt + 1).filter(c => c.files.some(f => mine.includes(f))).map(c => `- ${c.sha.slice(0, 7)} ${c.subject}`)
}

export function cmdPlanCheck(args: Args): void {
  const slug = checkSlug(args.pos[0] ?? activeSlug() ?? fail('usage: plan-check <slug> [--commit] [--json]'))
  const found = localPlanCheck(slug)
  const blocks = found.filter(f => f.severity === 'block')
  out(args.opt.json ? JSON.stringify(found, null, 2) : [blocks.length ? formatFindings(found) : '', ...warnLines(found)].filter(Boolean).join('\n') || `plan-check ${slug}: ok`)
  if (blocks.length) { process.exitCode = 1; return }
  if (!args.opt.commit) return
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? ''
  if (isTrunk(head) && git(['checkout', '-q', '-b', `sdlc/${slug}`]) === null) fail(`could not create branch sdlc/${slug}`)
  const names = ['intent.md', 'spec.md', 'plan.md', 'requirements.md', 'intent-map.md'].map(n => `.rig/changes/${slug}/${n}`).filter(f => exists(path.join(ROOT, f)))
  if (git(['add', '--', ...names]) === null || git(['commit', '-q', '-m', `plan(${slug}): spec and plan`, '--', ...names]) === null) fail('could not commit the plan: fix what the commit hook says, then rerun')
  out(git(['rev-parse', '--short=7', 'HEAD']) ?? '')
}
