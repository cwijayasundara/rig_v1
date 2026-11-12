// `readiness --client` (readiness doc R4): the platform controls that turn rig's gates from advisory into binding. All must pass:
// a security control at 80% is not a control. A separate checklist, not a fifth level: level 4 wants the wiki and Maintain, which the
// core profile turns off. Plain `readiness` stays offline; this one reads the trunk's protection through gh.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, out, read, type Args } from './core.ts'
import { gh } from './model.ts'
import { parseRegistry } from './registry.ts'
import { CHECKS, SECRETS, trunk } from './protect.ts'

export type Protection = { branch: string; read: boolean; error: string; contexts: string[]; codeOwners: boolean }
export type ClientInput = { owners: string; ownersPath: string; managedPath: string; managed: string | null; protection: Protection; secret: boolean; secretError?: string; everyTier: boolean; hardCap: boolean }
export type ClientCriterion = { id: string; what: string; fix: string; ok: boolean }

const rules = (owners: string): string[][] => owners.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/))

// GitHub's CODEOWNERS patterns (gitignore rules): a leading or inner / anchors at the root, a trailing / means a directory, ** spans
// directories, * and ? stay inside one; a pattern that names a directory owns everything under it.
function matches(pattern: string, file: string): boolean {
  const dirOnly = pattern.endsWith('/')
  const p = dirOnly ? pattern.slice(0, -1) : pattern
  const anchored = p.slice(0, -1).includes('/')
  const body = p.replace(/^\//, '').split('**').map(part => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*').replaceAll('?', '[^/]')).join('.*')
  return new RegExp(`${anchored ? '^' : '(^|/)'}${body}${dirOnly ? '/.*' : '(/.*)?'}$`).test(file)
}

// A file is owned when the last rule matching it names at least one owner (a later rule with no owner un-owns it, as on GitHub).
export function covers(owners: string, file: string): boolean {
  const last = rules(owners).filter(([pattern = '']) => matches(pattern, file)).pop()
  return Boolean(last && last.length > 1)
}

function parse(text: string | null): Record<string, any> | null {
  try { const v = text === null ? null : JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { return null }
}

export function clientCriteria(input: ClientInput): ClientCriterion[] {
  const { owners, managedPath, protection: p } = input
  const m = parse(input.managed)
  const why = input.managed === null ? `(${managedPath} is missing; settings from the admin console are not on disk: pass --managed <an exported copy>)` : m === null ? `(${managedPath} is not a JSON object)` : `(${managedPath})`
  const gh = p.read ? '' : ` (${p.error || 'gh could not read the branch protection'})`
  const sb = m?.sandbox ?? {}
  const all = rules(owners)
  const owned = (...files: string[]): boolean => files.every(f => covers(owners, f))
  const c = (id: string, what: string, fix: string, ok: boolean): ClientCriterion => ({ id, what, fix, ok })
  return [
    c('protection', `${p.branch} requires ${CHECKS.join(' and ')}`, `\`sdlc.ts init --protect\`, or add them to the branch rule or ruleset${gh}`, p.read && CHECKS.every(x => p.contexts.includes(x))),
    c('codeowner-review', `${p.branch} requires review from code owners`, `turn on "Require review from Code Owners" in the branch rule or ruleset${gh}`, p.read && p.codeOwners),
    c('ci-secret', 'ai-review has a Claude credential', `\`gh secret set CLAUDE_CODE_OAUTH_TOKEN\` (from \`claude setup-token\`) or \`gh secret set ANTHROPIC_API_KEY\`; an environment secret is not visible here${input.secretError ? ` (${input.secretError})` : ''}`, input.secret),
    c('codeowners-rig', `${input.ownersPath || 'CODEOWNERS'} owns .rig/bin/, .rig/sensors.json, CLAUDE.md and itself`, 'copy templates/CODEOWNERS',
      owned('.rig/bin/sdlc.ts', '.rig/sensors.json', 'CLAUDE.md') && Boolean(input.ownersPath) && owned(input.ownersPath)),
    c('codeowners-claude', 'CODEOWNERS owns .claude/', 'copy templates/CODEOWNERS', owned('.claude/settings.json')),
    c('codeowners-workflows', 'CODEOWNERS owns the rig workflows', 'copy templates/CODEOWNERS', owned('.github/workflows/rig-check.yml')),
    c('codeowners-owner', 'CODEOWNERS names real owners', 'replace @your-org/platform with the people who own the harness', all.some(r => r.length > 1) && !all.some(r => r.slice(1).some(o => o.startsWith('@your-org/')))),
    c('managed', 'managed settings are present', `deploy a tailored templates/managed-settings.json ${why}`, m !== null),
    c('sandbox', 'the sandbox is on, required, and allows no unsandboxed commands', `set sandbox.enabled and sandbox.failIfUnavailable true and sandbox.allowUnsandboxedCommands false ${why}`,
      sb.enabled === true && sb.failIfUnavailable === true && sb.allowUnsandboxedCommands === false),
    // Whether rig's sdlc.ts allow rule stays is the platform's call (SECURITY.md lists it as a trade-off); managed-only rules make it theirs.
    c('managed-rules', 'permission rules are managed-only', `set allowManagedPermissionRulesOnly true, then keep or drop rig's sdlc.ts allow rule (SECURITY.md) ${why}`, m?.allowManagedPermissionRulesOnly === true),
    c('every-tier', 'the base .rig/sensors.json makes every PR need a person', 'in .rig/sensors.json set risk.enforce true and humanApproval.everyTier true (then rung 3 is inert)', input.everyTier),
    c('size-cap', 'the base .rig/sensors.json refuses oversize PRs', 'in .rig/sensors.json set risk.hardCap true (the limit is risk.maxLines)', input.hardCap),
  ]
}

const MANAGED: Record<string, string> = {
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
  win32: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
}

// One gh call: its JSON, or the first line of what went wrong (gh missing, logged out, offline, 403, 404).
function ghJson(argv: string[]): { ok: true; v: any } | { ok: false; error: string } {
  try { return { ok: true, v: JSON.parse(gh(['api', ...argv])) } } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, error: `gh: ${(err.stderr || err.message || 'failed').trim().split('\n')[0]?.replace(/^gh: /, '')}` }
  }
}

// The default branch as GitHub has it (origin/HEAD is often unset), else the local guess.
function defaultBranch(): string {
  const r = ghJson(['repos/{owner}/{repo}', '--jq', '{default_branch}'])
  return r.ok && typeof r.v?.default_branch === 'string' ? r.v.default_branch : trunk()
}

// The trunk's protection from both sources GitHub has: classic branch protection and repository rulesets (a branch protected only by
// rulesets answers "Branch not protected" on the classic route). Any other classic error (403 without admin rights) leaves it unread.
function protection(): Protection {
  const branch = defaultBranch()
  const classic = ghJson([`repos/{owner}/{repo}/branches/${branch}/protection`])
  const rulesets = ghJson([`repos/{owner}/{repo}/rules/branches/${branch}`])
  const absent = !classic.ok && /Branch not protected/i.test(classic.error)
  const c = classic.ok ? classic.v : {}
  const r: any[] = rulesets.ok && Array.isArray(rulesets.v) ? rulesets.v : []
  const contexts = [
    ...(c.required_status_checks?.contexts ?? []), ...(c.required_status_checks?.checks ?? []).map((x: { context?: string }) => x.context),
    ...r.filter(x => x?.type === 'required_status_checks').flatMap(x => (x.parameters?.required_status_checks ?? []).map((y: { context?: string }) => y.context)),
  ].filter((x): x is string => typeof x === 'string')
  const codeOwners = c.required_pull_request_reviews?.require_code_owner_reviews === true || r.some(x => x?.type === 'pull_request' && x.parameters?.require_code_owner_review === true)
  const read = classic.ok || (absent && rulesets.ok)
  const error = read ? '' : !classic.ok && !absent ? classic.error : rulesets.ok ? '' : rulesets.error
  return { branch, read, error, contexts, codeOwners }
}

// A repository secret, or an organisation secret shared with this repo; an environment secret is not visible to either.
function secret(): { secret: boolean; secretError?: string } {
  const named = (text: string): boolean => SECRETS.some(s => new RegExp(`^${s}\\b`, 'm').test(text))
  let repo = ''
  let error: string | undefined
  try { repo = gh(['secret', 'list']) } catch (e) { error = `gh: ${String((e as { stderr?: string }).stderr ?? (e as Error).message).trim().split('\n')[0]}` }
  if (named(repo)) return { secret: true }
  const org = ghJson(['repos/{owner}/{repo}/actions/organization-secrets'])
  if (org.ok && named(((org.v?.secrets ?? []) as { name?: string }[]).map(s => s.name ?? '').join('\n'))) return { secret: true }
  return { secret: false, secretError: error ?? (org.ok ? undefined : org.error) }
}

// GitHub reads only the first CODEOWNERS it finds, in this order.
const OWNERS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']

export function gatherClient(opts: { managed?: string }): ClientInput {
  const managedPath = opts.managed ?? MANAGED[process.platform] ?? MANAGED.linux as string
  const reg = parseRegistry(read(path.join(ROOT, '.rig', 'sensors.json'))).registry
  const ownersPath = OWNERS.find(f => fs.existsSync(path.join(ROOT, f))) ?? ''
  return {
    owners: ownersPath ? read(path.join(ROOT, ownersPath)) : '',
    ownersPath,
    managedPath,
    managed: fs.existsSync(managedPath) ? fs.readFileSync(managedPath, 'utf8') : null,
    protection: protection(),
    ...secret(),
    everyTier: reg.risk.enforce && reg.humanApproval.everyTier,
    hardCap: reg.risk.hardCap,
  }
}

export function cmdReadinessClient(args: Args): void {
  const list = clientCriteria(gatherClient({ managed: typeof args.opt.managed === 'string' ? args.opt.managed : undefined }))
  const bad = list.filter(c => !c.ok)
  if (args.opt.json) out(JSON.stringify({ ok: !bad.length, criteria: list }))
  else out([`client readiness: ${list.length - bad.length}/${list.length} (every control must pass)`, ...(bad.length ? ['to fix:', ...bad.map(c => `  ${c.id}: ${c.what}: ${c.fix}`)] : [])].join('\n'))
  if (bad.length) process.exitCode = 1
}
