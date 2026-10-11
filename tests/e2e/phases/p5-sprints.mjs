// P5 sprints: the outer workflow on the onboarded repo. Sprint 0 is charted, approved once, and its intents start in
// dependency order; sprint 1 edits the shared architecture and test plan, which holds sprint 0's unstarted intents until
// chart-1 is approved. Scripted: the fixture files stand in for what /rig:chart's agents write. Live: /rig-chart writes them.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../../integration/lib/checks.mjs'

const FIX = path.resolve(import.meta.dirname, '../fixtures/p5')
const json = (sb, args) => {
  const r = sb.sdlc(args)
  if (r.status !== 0) throw new Error(`sdlc ${args.join(' ')} exited ${r.status}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout)
}
const ready = (sb, n) => json(sb, ['inbox', '--json', '--ready', '--sprint', String(n)]).map(e => e.file).sort()
const start = (sb, name) => sb.sdlc(['new', `${name}-change`, '--type', 'feature', '--tier', 'M', '--source', `.rig/intent/${name}.md`])
const ship = (sb, name) => {
  sb.write(`.rig/changes/${name}-change/ship.json`, '{}\n')
  sb.commitAll(`ship: ${name} (stand-in for its PR merge)`)
}
const gaps = r => Object.entries(r).filter(([k, v]) => Array.isArray(v) && k !== 'changedSinceApproval' && v.length).map(([k, v]) => `${k}: ${v.join(', ')}`)

// The person at the sprint gate, in code: approve, then commit the row with the chart (the PR's last commit).
const approve = (sb, n) => {
  const r = sb.sdlc(['approve', `chart-${n}`, '--by', 'operator'], { human: true })
  if (r.status !== 0) throw new Error(`approve chart-${n}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  sb.commitAll(`chart: approve sprint ${n}`)
  return r.stdout
}

function chart(sb, n, sessions) {
  fs.mkdirSync(sb.file('.rig/product/prd'), { recursive: true })
  fs.copyFileSync(path.join(FIX, `sprint-${n}/.rig/product/prd/sprint-${n}.md`), sb.file(`.rig/product/prd/sprint-${n}.md`))
  if (sessions) sessions.run(`P5-chart-${n}`, `/rig-chart .rig/product/prd/sprint-${n}.md`)
  else fs.cpSync(path.join(FIX, `sprint-${n}`), sb.dir, { recursive: true })
  sb.commitAll(`chart: sprint ${n}`)
}

export async function runSprints(sb, { sessions = null } = {}) {
  const live = Boolean(sessions)
  const c = new Checks(`P5 sprints${live ? ' (live)' : ''}`)
  await c.check('P5: chart routes name a model for both launches', () => {
    const r = json(sb, ['chart', 'routes', '--json'])
    return (r.architect?.model && r.testplan?.model) ? true : JSON.stringify(r)
  })

  // Sprint 0
  chart(sb, 0, sessions)
  await c.check('P5 s0: the chart wrote the architecture, an ADR, intents and the test plan', () => {
    const missing = ['.rig/product/architecture.md', '.rig/product/testplan/cases.md'].filter(f => !sb.exists(f))
    if (!fs.readdirSync(sb.file('.rig/product/adr')).some(f => f.endsWith('.md'))) missing.push('adr/*.md')
    return missing.length ? `missing ${missing.join(', ')}` : true
  })
  const s0 = json(sb, ['inbox', '--json', '--sprint', '0'])
  await c.check('P5 s0: intents carry sprint 0 and a walking-skeleton every other intent reaches', () => {
    const skel = s0.find(e => e.file === 'walking-skeleton.md')
    if (!skel) return `no walking-skeleton.md among ${s0.map(e => e.file).join(', ')}`
    const others = s0.filter(e => e !== skel)
    return others.length && others.every(e => e.depends.length) ? true : 'an intent other than the skeleton has no depends'
  })
  await c.check('P5 s0: the trace report has no gaps', () => {
    const r = json(sb, ['chart', 'check', '0', '--json'])
    return live || !gaps(r).length ? true : gaps(r).join('; ')
  })
  await c.check('P5 s0: before approval no intent starts', () => {
    const r = start(sb, 'walking-skeleton')
    return r.status !== 0 && /chart-0 is not approved/.test(r.stderr) ? true : `exit ${r.status}: ${r.stderr.trim()}`
  })
  await c.check('P5 s0: a model cannot approve the chart', () => sb.sdlc(['approve', 'chart-0']).status === 3 || 'approve without SDLC_HUMAN did not exit 3')
  await c.check('P5 s0: the person approves the chart once', () => /approved chart-0 by operator/.test(approve(sb, 0)) || 'no approval line')
  await c.check('P5 s0: only the walking skeleton is ready', () => {
    const r = ready(sb, 0)
    return JSON.stringify(r) === '["walking-skeleton.md"]' || r.join(', ')
  })
  const dependent = s0.find(e => e.file !== 'walking-skeleton.md')?.file.replace(/\.md$/, '')
  await c.check('P5 s0: a dependent intent is refused while the skeleton has not shipped', () => {
    const r = start(sb, dependent)
    return r.status !== 0 && /blocked by: walking-skeleton/.test(r.stderr) ? true : `exit ${r.status}: ${r.stderr.trim()}`
  })
  await c.check('P5 s0: the skeleton starts', () => {
    const r = start(sb, 'walking-skeleton')
    return r.status === 0 || r.stderr.trim()
  })
  ship(sb, 'walking-skeleton')
  await c.check('P5 s0: once it ships, its dependents are ready (and rig-spec would draft them)', () => {
    const want = s0.filter(e => e.file !== 'walking-skeleton.md' && e.depends.every(d => d === 'walking-skeleton')).map(e => e.file).sort()
    const got = ready(sb, 0)
    const pending = json(sb, ['inbox', '--json', '--pending']).map(e => e.file).sort()
    return JSON.stringify(got) === JSON.stringify(want) && JSON.stringify(pending) === JSON.stringify(want) ? true : `ready ${got} pending ${pending}, want ${want}`
  })
  if (!live) {
    start(sb, 'cart-add')
    ship(sb, 'cart-add')
  }

  // Sprint 1: brownfield. cart-view (sprint 0) is still unstarted.
  chart(sb, 1, sessions)
  if (!live) {
    await c.check('P5 s1: the new chart edits the shared files, so unstarted sprint-0 intents wait for chart-1', () => {
      const r = start(sb, 'cart-view')
      return r.status !== 0 && /chart-0 is stale: .*architecture\.md/.test(r.stderr) ? true : `exit ${r.status}: ${r.stderr.trim()}`
    })
    await c.check('P5 s1: the trace report has no gaps, and earlier cases are not unknown ids', () => {
      const r = json(sb, ['chart', 'check', '1', '--json'])
      return !gaps(r).length || gaps(r).join('; ')
    })
  }
  await c.check('P5 s1: the person approves chart-1', () => /approved chart-1 by operator/.test(approve(sb, 1)) || 'no approval line')
  if (!live) {
    await c.check('P5 s1: carry-over: the sprint-0 intent starts again under chart-1', () => {
      const r = start(sb, 'cart-view')
      return r.status === 0 || r.stderr.trim()
    })
    await c.check('P5 s1: cart-remove is ready (its dependency cart-add shipped in sprint 0)', () => JSON.stringify(ready(sb, 1)) === '["cart-remove.md"]' || ready(sb, 1).join(', '))
    await c.check('P5 s1: editing a sprint-1 intent after approval needs a fresh approval', () => {
      sb.write('.rig/intent/cart-remove.md', sb.read('.rig/intent/cart-remove.md').replace('owner:', 'owner: Sam'))
      const r = json(sb, ['chart', 'check', '1', '--json'])
      const refused = start(sb, 'cart-remove')
      sb.git('checkout', '--', '.rig/intent/cart-remove.md')
      return r.approval === 'stale' && JSON.stringify(r.changedSinceApproval) === '[".rig/intent/cart-remove.md"]' && /chart-1 is stale/.test(refused.stderr) ? true : `${r.approval} ${r.changedSinceApproval} ${refused.stderr.trim()}`
    })
  } else {
    await c.check('P5 s1 (live): some sprint-1 intent is ready or blocked only by depends', () => {
      const s1 = json(sb, ['inbox', '--json', '--sprint', '1'])
      return s1.length && s1.every(e => e.ready || e.blockedBy.every(b => !/^(missing|cycle):/.test(b))) ? true : JSON.stringify(s1.map(e => [e.file, e.blockedBy]))
    })
  }
  return c
}
