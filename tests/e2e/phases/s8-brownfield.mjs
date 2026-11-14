// S8: rig on a foreign repo. Two small existing projects are onboarded the way /rig:init does for a brownfield repo (rig is not their
// author, their tests are theirs): a CommonJS package whose own `npm test` collects test files recursively (the two vendor bugs the
// commander.js eval found, 023cf93), and a Python service with a Node subproject. No network: the fixtures are local.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { Checks, must, json } from '../lib/checks.mjs'
import { createSandbox } from '../lib/sandbox.mjs'
import { assertOnboarding } from '../assert/onboarding.mjs'
import { assertChange } from '../assert/change.mjs'
import { runChange } from '../lib/flow.mjs'
import { scriptedDriver } from '../driver/scripted.mjs'
import { archStandinChecks } from './arch-standin.mjs'

const fx = rel => path.join(import.meta.dirname, '../fixtures', rel)
const ROUTING = 'sdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.'
const SESSION = 's8-brownfield'
const hook = (sb, name, payload = {}) => sb.sdlc(['hook', name], { input: JSON.stringify({ session_id: SESSION, ...payload }) })
// Files a test runner collects by name: nothing rig vendors may look like one.
const COLLECTED = /(\.test|\.spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(go|py)$/
const hex = () => crypto.randomBytes(16).toString('hex')
const walk = dir => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : [])

// The repo exists first, with its own history; rig arrives later.
function seed(sb, from, message) {
  sb.isolate([])
  fs.cpSync(from, sb.dir, { recursive: true })
  sb.commitAll(message)
}

// What the init skill does for an existing repo: init, the sensors the model writes, CLAUDE.md, init --full, sync, baseline.
function onboard(sb, registry, claudeMd, { stack = false } = {}) {
  must(sb.sdlc(stack ? ['init', '--stack'] : ['init']), 'init')
  sb.write('.rig/sensors.json', `${JSON.stringify(registry, null, 2)}\n`)
  sb.write('CLAUDE.md', claudeMd)
  must(sb.sdlc(['init', '--full']), 'init --full')
  must(sb.sdlc(['sync']), 'sync')
  const baseline = must(sb.sdlc(['baseline']), 'baseline')
  sb.commitAll('chore: onboard rig')
  return baseline
}

const turn = (sb, prompt, edits) => {
  hook(sb, 'prompt-submit', { prompt })
  for (const [file, text] of Object.entries(edits)) { sb.write(file, text); hook(sb, 'post-edit', { tool_input: { file_path: sb.file(file) } }) }
  const r = hook(sb, 'stop')
  const u = sb.read('.rig/unresolved.json')
  return { out: json(r.stdout.trim().split('\n').pop() ?? '') ?? {}, fired: u ? [...new Set(json(u).findings.map(f => f.sensor))] : [] }
}
const restore = (sb, files) => {
  for (const f of files) sb.run('git', ['checkout', '--', f])
  sb.run('rm', ['-f', sb.file('.rig/unresolved.json')])
  hook(sb, 'prompt-submit', { prompt: 'settle' })
  hook(sb, 'stop')
}

// --- the CommonJS package ---------------------------------------------------------------------------------------------------------------
const REFUND = {
  id: 'S8', slug: 'ledger-refund', type: 'feature', title: 'Refund part of an account balance',
  prompt: '/rig-start A feature: Ledger.refund(account, amount); edit the existing lib/ledger.js, do not rewrite it; put its tests in test/refund.test.js.',
  intent: { problem: 'A ledger cannot reverse an entry.', outcome: 'B1-B2 hold and the existing tests still pass.', nonGoals: 'Refunds across accounts.' },
  spec: '# Spec: refund\n\n## Behaviours\n- B1: a refund reverses part of an account balance.\n- B2: a refund above the balance, or not positive, is refused.\n\n## Out of scope\n- Refunds across accounts.\n\n## Open questions\nnone\n',
  plan: '# Plan: refund\n\n## Files\n- lib/ledger.js\n- test/refund.test.js\n\n## Tests\n- B1-B2: test/refund.test.js (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  contracts: [], tests: [{ src: fx('brownfield-cjs/change/test/refund.test.js'), dest: 'test/refund.test.js' }], impl: [{ src: fx('brownfield-cjs/change/lib/ledger.js'), dest: 'lib/ledger.js' }],
  commit: 'feat(ledger): refund part of a balance',
}
const CJS_REGISTRY = { sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }
const CJS_CLAUDE = `# ledger-lib\n\n${ROUTING}\n\n## Map\n- lib/ money.js (integer cents) and ledger.js (entries and balances)\n- test/ node:test files, one per module\n`

async function cjs(out) {
  const sb = createSandbox({ name: 'brownfield-cjs', out })
  const c = new Checks('S8 brownfield cjs')
  seed(sb, fx('brownfield-cjs/base'), 'chore: existing ledger-lib')
  const before = sb.git('ls-files').split('\n').filter(f => f.startsWith('lib/') || f.startsWith('test/'))
  // A vendored checker that cannot load in a commonjs repo fails here, at its first run: record it as the check it is.
  try { onboard(sb, CJS_REGISTRY, CJS_CLAUDE) } catch (err) {
    await c.check('S8 cjs: the vendored checker runs in a commonjs repo (.rig/bin marks itself as ES modules)', () => { throw err })
    return c
  }
  await assertOnboarding(c, sb, { lane: 'brownfield', modules: ['lib/', 'test/'] })
  await c.check('S8 cjs: the vendored checker runs in a commonjs repo (.rig/bin marks itself as ES modules)', () => {
    const marker = json(sb.read('.rig/bin/package.json'))?.type
    const r = sb.sdlc(['status', '--json'])
    return (marker === 'module' && r.status === 0 && json(r.stdout) !== null) || `.rig/bin type ${marker}; exit ${r.status}: ${(r.stderr || r.stdout).trim().split('\n')[0]}`
  })
  await c.check("S8 cjs: the repo's own npm test is green after onboarding and runs only its own tests", () => {
    const r = sb.run('npm', ['test'])
    const ran = /ℹ tests (\d+)/.exec(r.stdout)?.[1]
    return (r.status === 0 && ran === '5') || `exit ${r.status}; ${ran ?? 'no'} tests ran: ${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ')}`
  })
  await c.check('S8 cjs: no vendored template is a file a test runner collects (slice files end in .tmpl)', () => {
    const files = walk(sb.file('.rig/templates')).map(f => path.relative(sb.dir, f))
    const loose = files.filter(f => COLLECTED.test(f))
    return (files.some(f => f.includes('/slices/')) && loose.length === 0) || `${files.length} vendored template files; collected by name: ${loose.slice(0, 3).join(', ')}`
  })

  const ledger = sb.read('lib/ledger.js')
  const broke = turn(sb, 'make balance cheaper', { 'lib/ledger.js': ledger.replace('sum + e.amount', 'sum - e.amount') })
  await c.check('S8 cjs: a freeform edit with rig on gets its sensors (the repo\'s own suite blocks the Stop gate)', () => (broke.out.decision === 'block' && broke.fired.includes('unit')) || `decision ${broke.out.decision}; fired ${broke.fired.join(', ') || 'none'}`)
  restore(sb, ['lib/ledger.js'])
  const leak = turn(sb, 'add a key', { 'lib/leak.js': `${['export const apiKey', '=', JSON.stringify(hex())].join(' ')}\n` })
  await c.check('S8 cjs: a freeform secret is caught in a foreign repo too', () => (leak.out.decision === 'block' && leak.fired.includes('secrets')) || `decision ${leak.out.decision}; fired ${leak.fired.join(', ') || 'none'}`)
  sb.run('rm', ['-f', sb.file('lib/leak.js'), sb.file('.rig/unresolved.json')])
  hook(sb, 'prompt-submit', { prompt: 'settle' }); hook(sb, 'stop')

  // One scripted /rig-start change on the existing code, to ship.
  const driver = scriptedDriver(sb, REFUND)
  const { slug, notes } = await runChange(sb, REFUND, driver)
  for (const n of notes) await c.check(n.title, () => n.ok || n.why)
  await assertChange(c, sb, slug, REFUND)
  await c.check('S8 cjs: the change adds only its own test and edits only lib/ledger.js; the existing tests are unchanged', () => {
    const diff = sb.git('diff', '--name-status', 'main...HEAD').split('\n').filter(l => !/\t\.rig\/|\t\.claude\//.test(l)).sort()
    const want = ['A\ttest/refund.test.js', 'M\tlib/ledger.js']
    return (JSON.stringify(diff) === JSON.stringify(want) && before.filter(f => f.startsWith('test/')).every(f => sb.git('diff', 'main...HEAD', '--', f) === '')) || diff.join(' | ')
  })
  await c.check('S8 cjs: the existing code was edited, not rewritten', () => {
    const del = Number(sb.git('diff', '--numstat', 'main...HEAD', '--', 'lib/ledger.js').split('\t')[1])
    return del <= 2 || `${del} lines deleted from lib/ledger.js`
  })
  sb.sdlc(['tests-freeze', slug])
  fs.appendFileSync(sb.file('test/refund.test.js'), "test('B3: a weakened frozen test', () => {})\n")
  const frozen = json(sb.sdlc(['check', '--at', 'ci', '--base', 'main', '--json']).stdout)
  await c.check('S8 cjs: the change tests are frozen: editing one afterwards is a test-tamper block', () => (frozen?.findings ?? []).some(f => f.sensor === 'test-tamper' && f.severity === 'block') || JSON.stringify((frozen?.findings ?? []).map(f => `${f.sensor}:${f.severity}`)))
  sb.run('git', ['checkout', '--', 'test/refund.test.js'])
  return c
}

// --- the Python service with a Node subproject --------------------------------------------------------------------------------------
const havePytest = () => spawnSync('python3', ['-m', 'pytest', '--version'], { stdio: 'ignore' }).status === 0
const PY_CLAUDE = `# shopsvc\n\n${ROUTING}\n\n## Map\n- src/shopsvc/ pricing, the LLM adapter and the order summary\n- tests/ pytest tests; test_integration_db.py needs a database\n- dashboard/ a Node subproject with its own node --test suite\n`
// The pack's sensors need ruff, mypy and a duplication scanner; the person trims them to what this repo runs. The integration test
// is its own sensor so the baseline records it as known red without hiding the rest of the suite; the second stack is a custom sensor.
const PY_SENSORS = [
  { id: 'unit', cmd: 'python3 -m pytest -q --deselect tests/test_integration_db.py', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run pytest before claiming done; fix the code, never the tests.' },
  { id: 'integration', cmd: 'python3 -m pytest -q tests/test_integration_db.py', cadence: 'commit', blocks: true, count: 'exit', guide: 'Needs DATABASE_URL: red on a machine with no database.' },
  { id: 'dashboard', cmd: 'npm --prefix dashboard test --silent', cadence: 'turn', blocks: true, count: 'exit', guide: 'The dashboard suite (Node) must pass before the turn ends.' },
]

async function py(out) {
  const sb = createSandbox({ name: 'brownfield-py', out })
  const c = new Checks('S8 brownfield py')
  seed(sb, fx('brownfield-py'), 'chore: existing shopsvc')
  const pytest = havePytest()
  must(sb.sdlc(['init', '--stack']), 'init --stack')
  const picked = json(sb.read('.rig/sensors.json'))
  await c.check('S8 py: onboarding detects the stack python from pyproject.toml', () => picked?.stack === 'python' || `stack ${picked?.stack}`)
  const skipped = []
  const registry = { ...picked, sensors: PY_SENSORS }
  let baseline
  try { baseline = onboardPy(sb, registry, pytest) } catch (err) {
    await c.check('S8 py: the vendored checker runs and onboarding completes', () => { throw err })
    return c
  }
  await assertOnboarding(c, sb, { lane: 'brownfield', modules: ['src/shopsvc/', 'tests/', 'dashboard/'], testCmd: pytest ? ['python3', '-m', 'pytest', '-q', '--deselect', 'tests/test_integration_db.py'] : ['npm', '--prefix', 'dashboard', 'test', '--silent'] })
  const skip = (name, why) => { skipped.push(name); c.skip(`S8 py: ${name}`, why) }
  await c.check('S8 py: the registry keeps a single stack; the Node subproject is a custom sensor that runs', () => {
    const reg = json(sb.read('.rig/sensors.json'))
    const dash = reg.sensors.find(s => s.id === 'dashboard')
    const r = sb.run('npm', ['--prefix', 'dashboard', 'test', '--silent'])
    return (reg.stack === 'python' && dash?.blocks === true && r.status === 0) || `stack ${reg.stack}; dashboard sensor ${JSON.stringify(dash)}; exit ${r.status}`
  })
  await c.check('S8 py: no vendored template is a file pytest or node --test collects (slice files end in .tmpl)', () => {
    const loose = walk(sb.file('.rig/templates')).map(f => path.relative(sb.dir, f)).filter(f => COLLECTED.test(f))
    return loose.length === 0 || loose.slice(0, 3).join(', ')
  })
  if (pytest) {
    await c.check("S8 py: the repo's own pytest suite (minus the service-bound test) stays green after onboarding", () => { const r = sb.run('python3', ['-m', 'pytest', '-q', '--deselect', 'tests/test_integration_db.py']); return r.status === 0 || (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ') })
    await c.check('S8 py: knownRed lists the service-bound integration test and only it', () => { const k = json(sb.read('.rig/sensors.json'))?.knownRed; return (JSON.stringify(k) === '["integration"]') || `knownRed ${JSON.stringify(k)}; ${baseline.split('\n').slice(0, 3).join(' | ')}` })
  } else {
    await skip('the own pytest suite stays green and knownRed lists the service-bound test', 'pytest is not installed on this machine (python3 -m pytest)')
  }
  const broke = turn(sb, 'break pricing', { 'src/shopsvc/pricing.py': `${sb.read('src/shopsvc/pricing.py')}\nAPI_KEY = "${hex()}"\n`, 'dashboard/src/format.js': 'export const dollars = cents => `$${cents}`\n' })
  await c.check('S8 py: a freeform edit gets sensors: the secret and the Node subproject suite both block the Stop gate', () => (broke.out.decision === 'block' && broke.fired.includes('secrets') && broke.fired.includes('dashboard')) || `decision ${broke.out.decision}; fired ${broke.fired.join(', ') || 'none'}`)
  restore(sb, ['src/shopsvc/pricing.py', 'dashboard/src/format.js'])
  sb.write('.rig/product/sprints/sprint-1/prd.md', '---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: summaries\n\n## Open questions\nnone\n')
  await archStandinChecks(c, sb, 'S8 py', '---\nsprint: 1\nupdated: 2026-11-14\n---\n# Architecture\n\n## Context\n\nshopsvc writes order summaries through an LLM provider, behind src/shopsvc/llm_adapter.py.\n', 'llm-provider')
  c.skipped = skipped
  return c
}
function onboardPy(sb, registry, pytest) {
  sb.write('.rig/sensors.json', `${JSON.stringify(registry, null, 2)}\n`)
  sb.write('CLAUDE.md', PY_CLAUDE)
  must(sb.sdlc(['init', '--full']), 'init --full')
  must(sb.sdlc(['sync']), 'sync')
  const baseline = pytest ? must(sb.sdlc(['baseline']), 'baseline') : ''
  sb.commitAll('chore: onboard rig')
  return baseline
}

export async function runBrownfield(out) {
  return [await cjs(out), await py(out)]
}
