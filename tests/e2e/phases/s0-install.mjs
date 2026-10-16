import { Checks } from '../lib/checks.mjs'
import { assertOnboarding } from '../assert/onboarding.mjs'

export const ROUTING = 'sdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.'

// The live S0 prompt describes the project, not the feature: the shop arrives later, charted from the PRD.
export const SCAFFOLD_PROMPT = 'Node.js 22 ESM project named shop-app, no dependencies, tests with node --test. Scaffold ONLY the empty skeleton and one passing smoke test. Do not implement any shop behaviour: that arrives later as its own charted change.'

const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | ')}`)
  return r.stdout
}

// The registry S0 declares: the unit suite, plus the built-ins every registry gets (spec §3).
export const REGISTRY = { sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }

export async function install(sb) {
  sb.isolate([])
  const scripts = { start: 'node src/server.js', test: 'node --test', 'test-fast': 'node --test', lint: 'node --check src/index.js' }
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  sb.commitAll('chore: scaffold')
  must(sb.sdlc(['init']), 'init')
  sb.write('.rig/sensors.json', JSON.stringify(REGISTRY, null, 2) + '\n')
  must(sb.sdlc(['init', '--full']), 'init --full')
  sb.write('CLAUDE.md', `# shop-app\n\n${ROUTING}\n\n## Map\n- src/\n`)
  must(sb.sdlc(['sync']), 'sync')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('S0 install')
  await assertOnboarding(c, sb, { lane: 'greenfield' })
  return c
}
