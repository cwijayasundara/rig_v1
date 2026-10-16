// How one eval run's sandbox starts: the same scaffold and brief for every arm; rig arms are onboarded the way S0 and S1 do it.
import fs from 'node:fs'
import path from 'node:path'
import { install, REGISTRY, copyContractTool } from '../tests/e2e/phases/s0-install.mjs'
import { installedPlugins } from '../tests/e2e/lib/sandbox.mjs'
import { runBrief } from '../tests/e2e/phases/s1-brief.mjs'

const BRIEF = path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md')
const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')

export const BARE_PROMPT = 'Build the shop described in BRIEF.md: behaviours B1–B6, in src/, with node --test tests in test/ whose names start with their B-number, `npm test` passing, and `npm start` serving the HTTP API as the brief says. Keep the HTTP contract in api/openapi.yaml and contracts/examples/ (node scripts/contract.mjs validate|run checks it). Work until it is done.'

export function setupBare(sb, { dry = false } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts: { start: 'node src/server.js', test: 'node --test' } }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  copyContractTool(sb)
  sb.write('BRIEF.md', fs.readFileSync(BRIEF, 'utf8'))
  sb.write('CLAUDE.md', '# shop-app\n\nThe product brief is BRIEF.md.\n')
  sb.commitAll('chore: scaffold')
  return sb.git('rev-parse', 'HEAD')
}

// The scaffold commit is the base for tamper scoring; install and brief land on top of it.
export async function setupRig(sb, arm, { dry = false } = {}) {
  const registry = { ...REGISTRY, policy: { haiku: arm.policy, sonnet: 'continuous', opus: 'final', default: 'continuous' } }
  const c = await install(sb, { registry, plugins: dry ? [] : installedPlugins() })
  if (c.failed.length) throw new Error(`install failed: ${c.failed.map(f => f.name).join('; ')}`)
  const base = sb.git('rev-list', '--max-parents=0', 'HEAD')
  const b = await runBrief(sb)
  if (b.failed.length) throw new Error(`brief failed: ${b.failed.map(f => f.name).join('; ')}`)
  return base
}

// Dry bare: what a perfect bare session leaves behind.
export function dryBare(sb) {
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
}
