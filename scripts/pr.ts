// `pr` (behavioural harness spec 2026-10-16 §8): a change whose plan a person approved and whose verify.json is fresh for
// this tree is committed on sdlc/<slug>, pushed, and gets a PR, or stays local-only without a remote.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ROOT, CHANGES, WAIVERS, exists, read, readJsonl, out, fail, git, checkSlug, optString, ensureGitignore, type Args, type Waiver } from './core.ts'
import { frozenFindings, frozenFor } from './contracts.ts'
import { loadConfig } from './check.ts'
import { ghBin } from './model.ts'
import { treeStamp } from './stamp.ts'
import { activeSlug, setActive, approvalState, verifyFresh } from './lifecycle.ts'

const ghLast = (text: string): string => text.trim().split('\n').at(-1) ?? ''
const URL_RE = /^https?:\/\//

function openPr(slug: string, branch: string, title: string): string | null {
  const body = path.join(CHANGES, slug, 'pr.md')
  const gh = (argv: string[]): string => execFileSync(ghBin(), argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
  try { return URL_RE.test(ghLast(gh(['pr', 'create', '--title', title, '--body-file', body]))) ? ghLast(gh(['pr', 'view', branch, '--json', 'url', '-q', '.url'])) : null } catch (e) {
    const x = e as { stdout?: unknown; stderr?: unknown }
    // The PR already exists (a rerun, or opened by hand): report its url.
    if (!/already exists/i.test(`${String(x.stdout ?? '')}${String(x.stderr ?? '')}`)) return null
    try { const url = ghLast(gh(['pr', 'view', branch, '--json', 'url', '-q', '.url'])); return URL_RE.test(url) ? url : null } catch { return null }
  }
}

// The files a change's commit carries: its own folder, source outside .rig/, and the harness files a change may touch.
// Another change's folder never rides along, so its own gate cannot fail this PR.
const SHARED = ['.rig/waivers.jsonl', '.rig/.gitignore', '.rig/sensors.json', '.rig/rules.json', '.rig/product/brief.md']
function changeFiles(slug: string): string[] {
  const dirty = [...(git(['diff', '--name-only', 'HEAD']) ?? '').split('\n'), ...(git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n')].filter(Boolean)
  return [...new Set(dirty)].filter(f => !f.startsWith('.rig/') || f.startsWith(`.rig/changes/${slug}/`) || f.startsWith('.rig/guides/') || SHARED.includes(f))
}

export function cmdPr(args: Args): void {
  const given = args.pos[0]
  const slug = given ? checkSlug(given) : activeSlug()
  const message = optString(args, 'message')
  if (!slug || !message) fail('usage: pr [<slug>] --message "<type(scope): summary>"')
  if (!exists(path.join(CHANGES, slug))) fail(`no such change: ${slug}`)
  const followUp = exists(path.join(CHANGES, slug, 'pr.md'))
  const branch = `sdlc/${slug}`
  const head = git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? ''
  if (head !== branch) {
    if (followUp) fail(`not pushing: ${slug} already has a PR on ${branch}; check it out first (HEAD is ${head})`)
    if (!['main', 'master'].includes(head)) fail(`not shipping: HEAD is ${head}; a change ships from the trunk or from ${branch}, never on top of another branch`)
  }
  const gates = loadConfig().registry.gates
  if (gates.plan && approvalState(slug) !== 'approved') fail(`not shipping: ${slug}'s plan is not approved (a person runs /rig:approve ${slug})`)
  if (!verifyFresh(slug, treeStamp())) fail(`not shipping: verify.json is missing, failing or from another tree; run /rig:test ${slug}`)
  // Contract files can sit under .rig/, which the tree stamp leaves out: judge the freeze here, with the person's waivers.
  const waived = readJsonl<Waiver>(WAIVERS).filter(w => w.slug === slug && w.sensor === 'harness-tamper')
  const frozen = frozenFindings([slug], Object.keys(frozenFor(slug)), f => read(path.join(ROOT, f))).filter(f => !waived.some(w => w.file === '*' || w.file === f.file))
  if (frozen.length) fail(`not shipping: ${frozen.map(f => f.message).join('; ')}. Revert it, or a person re-approves or waives it`)
  if (head !== branch) {
    if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) !== null) fail(`not shipping: branch ${branch} already exists; check it out first`)
    if (git(['checkout', '-b', branch]) === null) fail(`could not create branch ${branch}`)
  }
  const remote = git(['remote', 'get-url', 'origin']) !== null
  const title = (message.split('\n')[0] ?? slug).slice(0, 200)
  if (!followUp) {
    fs.writeFileSync(path.join(CHANGES, slug, 'pr.md'), `---\nstate: ${remote ? 'open' : 'local-only'}\nbranch: ${branch}\n---\n${title}\n`)
    ensureGitignore()
  }
  const files = changeFiles(slug)
  if (!files.length) return out(followUp ? `${slug} already has a PR (.rig/changes/${slug}/pr.md); nothing new to commit` : 'not shipping: nothing to commit')
  if (git(['add', '--', ...files]) === null) fail('git add failed')
  // verify judged this tree with waivers applied: the git hooks would only run the same checks again.
  if (git(['commit', '-q', '--no-verify', '-m', message]) === null) fail('git commit failed')
  if (!followUp) setActive(null)
  if (!remote) return out(`pr ${slug}: committed on ${branch}${followUp ? ' (follow-up)' : ''}; no origin remote, local only`)
  const retry = `gh pr create --title ${JSON.stringify(title)} --body-file .rig/changes/${slug}/pr.md`
  if (git(['push', '--no-verify', '-u', 'origin', branch]) === null) fail(`committed on ${branch} but git push failed: push it${followUp ? '' : `, then run ${retry}`}`)
  if (followUp) return out(`pr ${slug}: follow-up pushed to ${branch}`)
  const url = openPr(slug, branch, title)
  if (!url) fail(`pushed ${branch} but gh pr create printed no PR url: run ${retry}`)
  out(`pr ${slug}: ${url}`)
}
