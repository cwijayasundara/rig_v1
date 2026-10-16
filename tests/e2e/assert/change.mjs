// Per-change evidence on the slim lifecycle (spec §8): intent, spec with B-numbers, a person's approval that still matches,
// red before green, a passing verify on the PR tree, the PR, and what CI will see.
import { createHash } from 'node:crypto'

const json = t => { try { return JSON.parse(t) } catch { return null } }
const digest = t => createHash('sha256').update(t.replace(/\s+$/, '')).digest('hex').slice(0, 16)

export async function assertChange(c, sb, slug, phase) {
  const dir = `.rig/changes/${slug}`
  const id = phase.id
  await c.check(`${id}: intent.md records the type ${phase.type}`, () => new RegExp(`^type: ${phase.type}$`, 'm').test(sb.read(`${dir}/intent.md`)) || 'type missing')
  await c.check(`${id}: spec.md numbers its behaviours`, () => /## Behaviours[\s\S]*\bB\d+\b/.test(sb.read(`${dir}/spec.md`)) || 'no B-numbers')
  const a = json(sb.read(`${dir}/approval.json`))
  await c.check(`${id}: approval.json is the person's (by the operator)`, () => a?.by === 'rig operator' || `by ${a?.by}`)
  await c.check(`${id}: the approval hashes the spec.md and plan.md that shipped`, () =>
    (a?.hashes?.['spec.md'] === digest(sb.read(`${dir}/spec.md`)) && a?.hashes?.['plan.md'] === digest(sb.read(`${dir}/plan.md`))) || JSON.stringify(a?.hashes))
  const runs = sb.read(`${dir}/evidence/runs.jsonl`).trim().split('\n').filter(Boolean).map(json)
  const red = runs.findIndex(r => r?.expectFail && r.exit !== 0)
  const green = runs.findIndex((r, i) => i > red && !r?.expectFail && r?.exit === 0)
  await c.check(`${id}: a failing test run is recorded before a passing one`, () => (red >= 0 && green > red) || `${runs.length} run(s), red at ${red}, green at ${green}`)
  const v = json(sb.read(`${dir}/verify.json`))
  await c.check(`${id}: verify.json passed`, () => v?.pass === true || (v?.blocks ?? ['no verify.json']).join('; '))
  const pr = sb.read(`${dir}/pr.md`)
  await c.check(`${id}: pr.md records an open PR on sdlc/${slug}`, () => (/state: open/.test(pr) && new RegExp(`branch: sdlc/${slug}`).test(pr)) || pr.split('\n').slice(0, 3).join(' | '))
  await c.check(`${id}: the PR was opened through gh, once, with this change's pr.md`, () => {
    const calls = sb.read('../logs/gh.log').split('\n').filter(l => l.startsWith('pr create ') && l.endsWith(`.rig/changes/${slug}/pr.md`))
    return calls.length === 1 || `${calls.length} gh pr create call(s) for ${slug}`
  })
  const st = json(sb.sdlc(['status', '--json']).stdout) ?? {}
  await c.check(`${id}: status reads review and no change is active`, () => (st.changes?.find(x => x.slug === slug)?.status === 'review' && !st.active) || JSON.stringify(st.changes?.find(x => x.slug === slug)))
  await c.check(`${id}: the tree is clean after pr`, () => sb.git('status', '--porcelain') === '' || sb.git('status', '--porcelain').split('\n').join('; '))
  await c.check(`${id}: .rig/state is never committed`, () => !sb.git('ls-files').split('\n').some(f => f.startsWith('.rig/state/')) || 'committed')
  await c.check(`${id}: sync --check has no blocks`, () => { const r = sb.sdlc(['sync', '--check']); return r.status === 0 || r.stdout.trim().split('\n')[0] })
  await sb.inWorktree(async ({ sdlc }) => {
    const ci = json(sdlc(['check', '--at', 'ci', '--base', 'main', '--json']).stdout) ?? {}
    await c.check(`${id}: CI lists the approval as a human row`, () => (ci.humanRows ?? []).some(r => r.startsWith(`approval ${slug}`)) || JSON.stringify(ci.humanRows))
  })
  await c.check(`${id}: npm test passes on the PR commit`, () => { const r = sb.run('npm', ['test', '--silent']); return r.status === 0 || (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ') })
}
