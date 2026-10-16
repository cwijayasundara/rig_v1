// S1: the product brief (spec §6) replaces the chart. Its behaviours are B-numbered; until tests name them, sync warns.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { PLUGIN } from '../lib/sandbox.mjs'

export async function runBrief(sb) {
  const c = new Checks('S1 brief')
  const tpl = fs.readFileSync(path.join(PLUGIN, 'templates/brief.md'), 'utf8')
  const brief = fs.readFileSync(path.join(import.meta.dirname, '../prd/shop-brief.md'), 'utf8')
  const heads = t => [...t.matchAll(/^## (.+)$/gm)].map(m => m[1])
  await c.check('the brief has the template headings, in order', () => JSON.stringify(heads(brief)) === JSON.stringify(heads(tpl)) || heads(brief).join(', '))
  sb.write('.rig/product/brief.md', brief)
  sb.commitAll('docs: product brief')
  const r = sb.sdlc(['sync', '--check'])
  await c.check('sync --check warns about the untested brief behaviours and does not fail', () => (r.status === 0 && /B1 has no test/.test(r.stdout) && /B6 has no test/.test(r.stdout)) || `exit ${r.status}: ${r.stdout.trim().split('\n')[0]}`)
  const refused = sb.sdlc(['approve', 'nothing-yet'])
  await c.check('approve is human-only: without SDLC_HUMAN it exits 3', () => refused.status === 3 || `exit ${refused.status}`)
  return c
}
