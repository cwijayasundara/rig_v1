import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { assertOnboarding } from '../assert/onboarding.mjs'

export const ROUTING = 'sdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.'

// The live S0 prompt describes the project, not the feature: the shop arrives later, as its own change from the brief.
export const SCAFFOLD_PROMPT = 'Node.js 22 ESM project named shop-app, no dependencies, tests with node --test, an npm start script that runs src/server.js. Scaffold ONLY the empty skeleton and one passing smoke test. Do not implement any shop behaviour: that arrives later as its own change. Copy nothing into scripts/; the contract tool is provided.'

const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | ')}`)
  return r.stdout
}

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
  must(sb.sdlc(['init', '--full']), 'init --full')
  sb.write('CLAUDE.md', `# shop-app\n\n${ROUTING}\n\n## Map\n- src/\n`)
  must(sb.sdlc(['sync']), 'sync')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('S0 install')
  await assertOnboarding(c, sb, { lane: 'greenfield' })
  return c
}
