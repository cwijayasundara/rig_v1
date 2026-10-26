// S6: the sprint outer loop (outer-loop spec 2026-10-17). A known-good chart for the shop app is traced, approved by a person,
// and one intent is started from it; editing an intent makes the approval stale, and breaking a citation is caught.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'

const FIXTURE = path.join(import.meta.dirname, '../prd/chart-fixture')
const PROBE = 'chart-probe'
const ROOTS = { product: '.rig/product', repo: '' }
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const intent = 'stock-model'
const SRC = `.rig/product/sprints/sprint-1/intents/${intent}.md`
const json = r => { try { return JSON.parse(r.stdout) } catch { return null } }

// The known-good chart: product/ lands in .rig/product/, repo/ at the repo root. The eval's dry run uses it as a perfect chart.
export function writeFixture(sb) {
  for (const [top, dest] of Object.entries(ROOTS)) {
    for (const f of walk(path.join(FIXTURE, top))) sb.write(path.join(dest, path.relative(path.join(FIXTURE, top), f)), fs.readFileSync(f, 'utf8'))
  }
}

export async function runChart(sb) {
  const c = new Checks('S6 chart')
  const start = sb.git('rev-parse', 'HEAD')
  sb.git('checkout', '-q', '-b', PROBE)
  try {
    writeFixture(sb)
    const found = json(sb.sdlc(['chart', 'check', '1', '--cases', '--json']))
    await c.check('S6: the known-good chart has no blocking finding', () => (Array.isArray(found) && !found.some(f => f.severity === 'block')) || JSON.stringify(found))
    await c.check('S6: approve chart-1 is human-only (exit 3 without SDLC_HUMAN)', () => { const r = sb.sdlc(['approve', 'chart-1']); return r.status === 3 || `exit ${r.status}` })
    await c.check('S6: a person approves chart-1 and the approval file is written', () => { const r = sb.sdlc(['approve', 'chart-1'], { human: true }); return (r.status === 0 && sb.exists('.rig/product/sprints/sprint-1/approval.json')) || `exit ${r.status}: ${r.stderr.trim().split('\n')[0]}` })
    await c.check('S6: only the intent with no dependency is ready', () => { const ready = json(sb.sdlc(['ready', '--json'])); return JSON.stringify((ready ?? []).map(i => i.slug)) === JSON.stringify([intent]) || JSON.stringify(ready) })
    const started = sb.sdlc(['new', intent, '--source', SRC])
    await c.check('S6: new --source starts the change with the intent behaviours in spec.md', () => (started.status === 0 && /- B1 \(FR-1, FR-1\.1\)/.test(sb.read(`.rig/changes/${intent}/spec.md`)) && /- B2 \(NFR-1, NFR-1\.1\)/.test(sb.read(`.rig/changes/${intent}/spec.md`))) || `exit ${started.status}: ${started.stderr.trim().split('\n')[0]}`)
    await c.check('S6: the change records its intent as source', () => new RegExp(`^source: ${SRC.replaceAll('.', '\\.')}$`, 'm').test(sb.read(`.rig/changes/${intent}/intent.md`)) || 'no source line')
    await c.check('S6: a dependent intent is not ready while its dependency is unshipped', () => { const r = sb.sdlc(['new', 'cart-stock-limit', '--source', '.rig/product/sprints/sprint-1/intents/cart-stock-limit.md']); return (r.status === 1 && /blocked by stock-model/.test(r.stderr)) || `exit ${r.status}: ${r.stderr.trim().split('\n')[0]}` })
    sb.write('.rig/product/sprints/sprint-1/intents/stock-endpoint.md', `${sb.read('.rig/product/sprints/sprint-1/intents/stock-endpoint.md')}\nA late edit.\n`)
    await c.check('S6: editing an intent makes the chart stale and names the file', () => { const r = sb.sdlc(['new', 'stock-endpoint', '--source', '.rig/product/sprints/sprint-1/intents/stock-endpoint.md']); return (r.status === 1 && /chart-1 is stale.*stock-endpoint\.md/.test(r.stderr)) || `exit ${r.status}: ${r.stderr.trim().split('\n')[0]}` })
    await c.check('S6: the started change keeps going after the chart went stale', () => { const s = json(sb.sdlc(['status', '--json'])); return Boolean(s?.changes?.some(x => x.slug === intent)) || JSON.stringify(s) })
    sb.write('.rig/product/sprints/sprint-1/intents/cart-stock-limit.md', sb.read('.rig/product/sprints/sprint-1/intents/cart-stock-limit.md').replace('- B1 (FR-2, FR-2.1):', '- B1:'))
    const broken = json(sb.sdlc(['chart', 'check', '1', '--cases', '--json']))
    await c.check('S6: a behaviour that cites no requirement is reported as intent-untraced', () => (broken ?? []).some(f => f.rule === 'intent-untraced' && f.where === 'cart-stock-limit') || JSON.stringify(broken))
    await c.check('S6: approve chart-1 is refused while a blocking finding stands', () => { const r = sb.sdlc(['approve', 'chart-1'], { human: true }); return (r.status === 1 && /intent-untraced/.test(r.stderr)) || `exit ${r.status}: ${r.stderr.trim().split('\n')[0]}` })
    const report = sb.sdlc(['chart', 'report', '1']).stdout
    await c.check('S6: the report shows the chain from requirement to intent to case', () => /FR-3 → stock-endpoint#B1,B2 → TC-5 TC-6/.test(report) || report.split('\n').slice(0, 4).join(' | '))
  } finally {
    sb.git('checkout', '-q', '-f', 'main')
    sb.run('git', ['clean', '-fdq'])
    sb.run('git', ['branch', '-q', '-D', PROBE])
  }
  await c.check('S6: the tree is clean and main is where it was', () => (sb.git('status', '--porcelain') === '' && sb.git('rev-parse', 'HEAD') === start) || `status: ${sb.git('status', '--porcelain').split('\n')[0]}`)
  return c
}
