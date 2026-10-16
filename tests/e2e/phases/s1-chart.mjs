import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { approveChart } from '../lib/operator.mjs'

export const PRD = fs.readFileSync(path.join(import.meta.dirname, '../prd/shop-app-sprint-0.md'), 'utf8')
const FIX = path.resolve(import.meta.dirname, '../fixtures/chart')

const json = (sb, args) => {
  const r = sb.sdlc(args)
  if (r.status !== 0) throw new Error(`sdlc ${args.join(' ')} exited ${r.status}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`)
  return JSON.parse(r.stdout)
}
const gaps = r => Object.entries(r).filter(([k, v]) => Array.isArray(v) && k !== 'changedSinceApproval' && v.length).map(([k, v]) => `${k}: ${v.join(', ')}`)

// Scripted: the fixture tree stands in for what /rig:chart's agents write. Live: /rig-chart writes it.
// Either way the test itself approves the chart — the model never does.
export async function runChart(sb, { sessions = null } = {}) {
  const live = Boolean(sessions)
  sb.write('.rig/product/prd/sprint-0.md', PRD)
  if (live) sessions.run('S1-chart', '/rig-chart .rig/product/prd/sprint-0.md — one sdlc.ts command per Bash call, no pipes, loops or compound commands; do not run any gh command the skill does not name')
  else fs.cpSync(FIX, sb.dir, { recursive: true })
  sb.commitAll('chart: sprint 0')

  const c = new Checks(`S1 chart${live ? ' (live)' : ''}`)
  await c.check('S1: chart routes name a model for both launches', () => {
    const r = json(sb, ['chart', 'routes', '--json'])
    return (r.architect?.model && r.testplan?.model) ? true : JSON.stringify(r)
  })
  await c.check('S1: the chart wrote the architecture, an ADR, intents and the test plan', () => {
    const missing = ['.rig/product/architecture.md', '.rig/product/testplan/cases.md', '.rig/intent/walking-skeleton.md'].filter(f => !sb.exists(f))
    if (!fs.readdirSync(sb.file('.rig/product/adr')).some(f => f.endsWith('.md'))) missing.push('adr/*.md')
    return missing.length ? `missing ${missing.join(', ')}` : true
  })
  await c.check('S1: the PRD in the repo is the fixture PRD, with FR and NFR ids', () =>
    (sb.read('.rig/product/prd/sprint-0.md').includes('FR-4') && sb.read('.rig/product/prd/sprint-0.md').includes('NFR-3')) || 'PRD ids missing')
  await c.check('S1: the trace report has no gaps (every FR/NFR cited and tested)', () => {
    const r = json(sb, ['chart', 'check', '0', '--json'])
    return live || !gaps(r).length ? true : gaps(r).join('; ')
  })
  await c.check('S1: before approval no intent starts', () => {
    const r = sb.sdlc(['new', 'walking-skeleton-change', '--type', 'feature', '--tier', 'M', '--source', '.rig/intent/walking-skeleton.md'])
    return r.status !== 0 && /chart-0 is not approved/.test(r.stderr) ? true : `exit ${r.status}: ${r.stderr.trim()}`
  })
  await c.check('S1: a model cannot approve the chart', () => sb.sdlc(['approve', 'chart-0']).status === 3 || 'approve without SDLC_HUMAN did not exit 3')
  await c.check('S1: the person (this test) approves the chart once', () => /approved chart-0 by operator/.test(approveChart(sb, 0)) || 'no approval line')
  // The person merges the approved chart PR, so the sprint's changes start from a trunk that has the chart (live /rig:chart works on rig/chart-0).
  if (sb.git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') {
    sb.git('checkout', '-q', 'main')
    sb.git('merge', '-q', '--ff-only', 'rig/chart-0')
  }
  await c.check('S1: only the walking skeleton is ready after approval', () => {
    const r = json(sb, ['inbox', '--json', '--ready', '--sprint', '0']).map(e => e.file).sort()
    return JSON.stringify(r) === '["walking-skeleton.md"]' || r.join(', ')
  })
  return c
}
