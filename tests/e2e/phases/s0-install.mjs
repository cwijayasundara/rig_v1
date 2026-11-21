import fs from 'node:fs'
import path from 'node:path'
import { Checks, must } from '../lib/checks.mjs'
import { assertOnboarding } from '../assert/onboarding.mjs'

const ROUTING = 'rig is on in this repo: work from the request as usual, and its checks and guides run on every turn; /rig:start is the full workflow (spec, plan, approval), used only when the person asks for it. Use superpowers skills only when an sdlc skill names one.'


// The registry S0 declares: the unit suite, plus the built-ins every registry gets (spec §3).
export const REGISTRY = {
  contracts: {
    files: ['api/openapi.yaml', 'contracts/examples/**'],
    covers: ['src/http/**', 'src/server.js'],
    validate: 'node scripts/contract.mjs validate',
    run: 'node scripts/contract.mjs run',
  },
  sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }

// The shop's own contract tool (Decision 1 of the 5b plan), in both lanes before onboarding.
export function copyContractTool(sb) {
  fs.mkdirSync(sb.file('scripts'), { recursive: true })
  fs.copyFileSync(path.join(import.meta.dirname, '../fixtures/tooling/scripts/contract.mjs'), sb.file('scripts/contract.mjs'))
}

export async function install(sb, { registry = REGISTRY, plugins = [] } = {}) {
  sb.isolate(plugins)
  const scripts = { start: 'node src/server.js', test: 'node --test', 'test-fast': 'node --test', lint: 'node --check src/index.js' }
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  copyContractTool(sb)
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  sb.commitAll('chore: scaffold')
  must(sb.sdlc(['init']), 'init')
  sb.write('.rig/sensors.json', JSON.stringify(registry, null, 2) + '\n')
  // The model writes CLAUDE.md before init --full, which adapts the routing line to the standalone install.
  sb.write('CLAUDE.md', `# shop-app\n\n${ROUTING}\n\n## Map\n- src/\n`)
  must(sb.sdlc(['init', '--full']), 'init --full')
  must(sb.sdlc(['sync']), 'sync')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('S0 install')
  await assertOnboarding(c, sb, { lane: 'greenfield' })
  return c
}
