// Deterministic gates: free checks that run before the inspector, so it only judges what code cannot.
import { assertOnboarding } from '../assert/onboarding.mjs'

const json = t => { try { return JSON.parse(t) } catch { return null } }
const first = r => (r.stderr || r.stdout || '').trim().split('\n')[0]
const globRe = g => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*')}$`)
const findings = (sb, sprint) => json(sb.sdlc(['chart', 'check', String(sprint), '--cases', '--json']).stdout)

export async function gateInit(c, sb) {
  await assertOnboarding(c, sb, { lane: 'journey', testCmd: ['pytest', '-q'] })
}

export async function gateChart(c, sb, sprint) {
  await c.check(`chart ${sprint}: chart check has no blocking finding`, () => {
    const f = findings(sb, sprint)
    if (!Array.isArray(f)) return 'chart check printed no findings JSON'
    const blocks = f.filter(x => x.severity === 'block')
    return blocks.length === 0 || blocks.map(b => `${b.rule}@${b.where}`).join(', ')
  })
}

export async function gateApproved(c, sb, sprint) {
  await c.check(`chart ${sprint}: approval.json exists`, () => sb.read?.(`.rig/product/sprints/sprint-${sprint}/approval.json`) ? true : 'no approval.json')
  await c.check(`chart ${sprint}: the approved chart is not stale`, () => {
    const f = findings(sb, sprint)
    const stale = (f ?? []).filter(x => /stale/.test(x.rule ?? ''))
    return stale.length === 0 || stale.map(s => s.where).join(', ')
  })
}

// baseRef: where the change branched from. allowedPaths: globs the change may touch (the intent's source and its tests).
export async function gateBuilt(c, sb, { slug, allowedPaths, baseRef = 'main' }) {
  await c.check(`${slug}: pytest passes`, () => { const r = sb.run('pytest', ['-q']); return r.status === 0 || (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ') })
  // Merged changes drop out of `status`, so shipped is also read from the repo: the change's pr.md exists and its branch is in HEAD.
  await c.check(`${slug}: the change reached review or shipped`, () => {
    const st = (json(sb.sdlc(['status', '--json']).stdout)?.changes ?? []).find(x => x.slug === slug)?.status
    const merged = sb.run('git', ['merge-base', '--is-ancestor', `sdlc/${slug}`, 'HEAD']).status === 0
    return ['review', 'shipped'].includes(st) || (merged && Boolean(sb.read?.(`.rig/changes/${slug}/pr.md`))) || `status ${st ?? '(no such change)'}; merged ${merged}`
  })
  await c.check(`${slug}: only the intent's files changed`, () => {
    const files = sb.run('git', ['diff', '--name-only', `${baseRef}...HEAD`]).stdout.split('\n').filter(Boolean)
    const res = allowedPaths.map(globRe)
    const stray = files.filter(f => !res.some(re => re.test(f)))
    return stray.length === 0 || `outside the intent: ${stray.join(', ')}`
  })
}

// Tests for ACs the sprint leaves unchanged must be byte-identical to the base, whether or not pytest is green.
export async function gateUnchangedTests(c, sb, { baseRef, files }) {
  await c.check('unchanged sprint 1 tests are byte-identical', () => {
    const changed = files.filter(f => sb.run('git', ['diff', '--quiet', baseRef, '--', f]).status !== 0)
    return changed.length === 0 || `edited: ${changed.join(', ')}`
  })
}
