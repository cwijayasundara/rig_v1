// `readiness --client` (readiness doc R4): the platform controls that turn rig's gates from advisory into binding. All must pass:
// a security control at 80% is not a control. A separate checklist, not a fifth level: level 4 wants the wiki and Maintain, which the
// core profile turns off. Plain `readiness` stays offline; this one reads the trunk's protection through gh.
import { CHECKS } from './protect.ts'

export type Protection = { read: boolean; error: string; contexts: string[]; codeOwners: boolean }
export type ClientInput = { owners: string; managedPath: string; managed: string | null; protection: Protection; secret: boolean }
export type ClientCriterion = { id: string; what: string; fix: string; ok: boolean }

const rules = (owners: string): string[][] => owners.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/))

// A CODEOWNERS rule covers a file when its pattern (leading / stripped) is *, the file, a directory above it, or a * glob matching it.
export function covers(owners: string, file: string): boolean {
  return rules(owners).some(([raw = '']) => {
    const t = raw.replace(/^\//, '')
    if (t === '*' || t === file || (t.endsWith('/') && file.startsWith(t))) return true
    return t.includes('*') && new RegExp(`^${t.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(file)
  })
}

function parse(text: string | null): Record<string, any> | null {
  try { const v = text === null ? null : JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : null } catch { return null }
}

export function clientCriteria(input: ClientInput): ClientCriterion[] {
  const { owners, managedPath, protection: p } = input
  const m = parse(input.managed)
  const why = input.managed === null ? `(${managedPath} is missing)` : m === null ? `(${managedPath} is not a JSON object)` : `(${managedPath})`
  const gh = p.read ? '' : ` (${p.error || 'gh could not read the branch protection'})`
  const sb = m?.sandbox ?? {}
  const allow: unknown[] = Array.isArray(m?.permissions?.allow) ? m.permissions.allow : []
  const all = rules(owners)
  const c = (id: string, what: string, fix: string, ok: boolean): ClientCriterion => ({ id, what, fix, ok })
  return [
    c('protection', `the trunk requires ${CHECKS.join(' and ')}`, `\`sdlc.ts init --protect\`, or add them to the branch rule or ruleset${gh}`, p.read && CHECKS.every(x => p.contexts.includes(x))),
    c('codeowner-review', 'the trunk requires review from code owners', `turn on "Require review from Code Owners" in the branch rule or ruleset${gh}`, p.read && p.codeOwners),
    c('ci-secret', 'ai-review has a Claude credential', '`gh secret set CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `gh secret set ANTHROPIC_API_KEY`', input.secret),
    c('codeowners-rig', 'CODEOWNERS covers .rig/bin/ and .rig/sensors.json', 'copy templates/CODEOWNERS', covers(owners, '.rig/bin/') && covers(owners, '.rig/sensors.json')),
    c('codeowners-claude', 'CODEOWNERS covers .claude/', 'copy templates/CODEOWNERS', covers(owners, '.claude/')),
    c('codeowners-workflows', 'CODEOWNERS covers the rig workflows', 'copy templates/CODEOWNERS', covers(owners, '.github/workflows/rig-check.yml')),
    c('codeowners-owner', 'CODEOWNERS names real owners', 'replace @your-org/platform with the people who own the harness', all.length > 0 && !all.some(r => r.slice(1).some(o => o.startsWith('@your-org/')))),
    c('managed', 'managed settings are deployed', `deploy a tailored templates/managed-settings.json ${why}`, m !== null),
    c('sandbox', 'the sandbox is on, required, and allows no unsandboxed commands', `set sandbox.enabled and sandbox.failIfUnavailable true and sandbox.allowUnsandboxedCommands false ${why}`,
      sb.enabled === true && sb.failIfUnavailable === true && sb.allowUnsandboxedCommands === false),
    c('managed-rules', 'permission rules are managed-only and the platform list carries rig\'s sdlc.ts rule', `set allowManagedPermissionRulesOnly true and decide on the sdlc.ts allow rule (SECURITY.md) ${why}`,
      m?.allowManagedPermissionRulesOnly === true && allow.some(r => typeof r === 'string' && r.includes('.rig/bin/sdlc.ts'))),
  ]
}
