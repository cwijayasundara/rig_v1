// `init --protect [--dry]`: make rig-check and ai-review required checks on the trunk (proposal 2026-10-27 A1, set up at init). It only adds
// to branch protection that already exists, never creates or replaces it; without protection, gh or a remote it prints the commands instead.
// --dry (the --quick and --defaults lane) never calls a write route.
import { execFileSync } from 'node:child_process'
import { git } from './core.ts'
import { ghBin } from './model.ts'

const CHECKS = ['rig-check', 'ai-review']
const SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']

const gh = (args: string[]): { ok: boolean; out: string } => {
  try { return { ok: true, out: execFileSync(ghBin(), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }) } } catch (e) { return { ok: false, out: String((e as { stderr?: string }).stderr ?? (e as Error).message) } }
}

export function protect(dry: boolean, branch = ['main', 'master'].find(b => git(['rev-parse', '--verify', '--quiet', b]) || git(['rev-parse', '--verify', '--quiet', `origin/${b}`])) ?? 'main'): string[] {
  const route = `repos/{owner}/{repo}/branches/${branch}/protection`
  const add = `gh api -X POST ${route}/required_status_checks/contexts ${CHECKS.map(c => `-f 'contexts[]=${c}'`).join(' ')}`
  const create = `gh api -X PUT ${route} --input - <<'EOF'\n{"required_status_checks":{"strict":true,"contexts":${JSON.stringify(CHECKS)}},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}\nEOF`
  const lines: string[] = []
  const now = gh(['api', `${route}/required_status_checks`])
  if (!now.ok && /404|Not Found|Branch not protected/i.test(now.out)) lines.push(`${branch} has no branch protection; nothing changed. Create it with the checks required (or in Settings > Branches):`, create)
  else if (!now.ok) lines.push(`could not read ${branch}'s branch protection (gh: ${now.out.trim().split('\n')[0] ?? ''}); to require the checks, run:`, add)
  else {
    let have: string[] = []
    try { have = (JSON.parse(now.out) as { contexts?: string[] }).contexts ?? [] } catch { /* unreadable: treat as none */ }
    const missing = CHECKS.filter(c => !have.includes(c))
    if (!missing.length) lines.push(`required checks on ${branch}: ${CHECKS.join(', ')} (already required)`)
    else if (dry) lines.push(`would add required checks on ${branch}: ${CHECKS.join(', ')}; run:`, add)
    else {
      const r = gh(['api', '-X', 'POST', `${route}/required_status_checks/contexts`, ...missing.flatMap(c => ['-f', `contexts[]=${c}`])])
      lines.push(r.ok ? `required checks on ${branch}: ${CHECKS.join(', ')} (added)` : `could not add the required checks (gh: ${r.out.trim().split('\n')[0] ?? ''}); run:`, ...(r.ok ? [] : [add]))
    }
  }
  const secrets = gh(['secret', 'list'])
  if (!secrets.ok || !SECRETS.some(s => new RegExp(`^${s}\\b`, 'm').test(secrets.out))) lines.push(`ai-review needs a Claude credential as a repository secret: gh secret set CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`), or gh secret set ANTHROPIC_API_KEY`)
  return lines
}
