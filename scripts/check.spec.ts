// Integration: baselines and diffs, sdlc check at each point, ship verdicts. Each test gets a fresh temp repo.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, write, gitIn, fromOld } from './testkit.ts'

let repo: string
beforeEach(() => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, 'src/app.js', 'export const a = 1\n')
  write(repo, 'notes.txt', 'untracked before the turn\n')
  gitIn(repo, 'add', 'src/app.js', '.rig/autonomy.json')
  gitIn(repo, 'commit', '-qm', 'app')
})

const turnFiles = () => JSON.parse(sdlc(repo, ['diff', '--turn', '--json']).stdout).map((d: { file: string; status: string }) => `${d.status} ${d.file}`).sort()

test('the turn diff holds tracked edits, Bash-style writes and new untracked files, not older untracked ones', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 2\n')
  fs.appendFileSync(path.join(repo, 'src/app.js'), '// via sed\n')
  write(repo, 'src/new.js', 'export const b = 1\n')
  assert.deepEqual(turnFiles(), ['A src/new.js', 'M src/app.js'])
})

test('an untracked file changed during the turn counts; a staged-only change counts', () => {
  hook(repo, 'prompt-submit', {})
  fs.appendFileSync(path.join(repo, 'notes.txt'), 'edited\n')
  write(repo, 'src/app.js', 'export const a = 3\n')
  gitIn(repo, 'add', 'src/app.js')
  assert.deepEqual(turnFiles(), ['A notes.txt', 'M src/app.js'])
})

test('an untracked .rig/sensors.json created during the turn appears in the turn diff', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, '.rig/sensors.json', '{"ignore":["**"]}\n')
  assert.ok(turnFiles().includes('A .rig/sensors.json'))
})

test('a diff over 1 MB is parsed, not silently empty', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/big.js', Array.from({ length: 80_000 }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n')
  gitIn(repo, 'add', 'src/big.js')
  const diffs = JSON.parse(sdlc(repo, ['diff', '--turn', '--json']).stdout)
  assert.equal(diffs.find((d: { file: string }) => d.file === 'src/big.js')?.added.length, 80_000)
})

test('the branch diff covers commits since the merge-base plus the working tree', () => {
  gitIn(repo, 'checkout', '-qb', 'feature')
  write(repo, 'src/app.js', 'export const a = 4\n')
  gitIn(repo, 'commit', '-qam', 'wip')
  write(repo, 'src/later.js', 'x\n')
  const files = JSON.parse(sdlc(repo, ['diff', '--base', 'main', '--json']).stdout).map((d: { file: string }) => d.file).filter((f: string) => !f.startsWith('.rig/')).sort()
  assert.deepEqual(files, ['notes.txt', 'src/app.js', 'src/later.js'])
})

test('no commits yet: prompt-submit is silent and writes no baseline', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-bare-'))
  gitIn(bare, 'init', '-q')
  sdlc(bare, ['init'])
  const r = hook(bare, 'prompt-submit', {})
  assert.deepEqual([r.code, r.stdout], [0, ''])
  assert.ok(!fs.existsSync(path.join(bare, '.rig/.baseline')))
})

test('an edit made before the turn is not blamed on it, even with no git identity configured', () => {
  gitIn(repo, 'config', 'user.name', '')
  gitIn(repo, 'config', 'user.email', '')
  const env = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
  write(repo, 'src/app.js', 'export const a = 9\n')
  sdlc(repo, ['hook', 'prompt-submit'], { input: '{}', env })
  write(repo, 'src/other.js', 'y\n')
  const r = sdlc(repo, ['diff', '--turn', '--json'], { env })
  assert.deepEqual(JSON.parse(r.stdout).map((d: { file: string }) => d.file), ['src/other.js'])
})

test('diff --turn without a baseline says so instead of diffing against now', () => {
  const r = sdlc(repo, ['diff', '--turn'])
  assert.deepEqual([r.code, r.stdout.trim()], [0, 'no turn baseline yet (run a prompt first)'])
})

const sensors = (cfg: object) => write(repo, '.rig/sensors.json', fromOld(cfg as Record<string, unknown>) + '\n')
const check = (...args: string[]) => sdlc(repo, ['check', ...args])

test('check is silent-success: one pass line, exit 0', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 5\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /^sdlc check stop: pass/)
})

test('a failing fast command blocks with its output tail; a passing one is silent', () => {
  sensors({ fast: { lint: 'node -e "console.log(\'src/app.js:1 no-var\'); process.exit(1)"', test: 'node -e "process.exit(0)"' } })
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'var a = 5\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[lint\]/)
  assert.doesNotMatch(r.stdout, /\[commands\]/)
  assert.match(r.stdout, /lint failed \(exit 1\)/)
  assert.match(r.stdout, /src\/app\.js:1 no-var/)
  assert.doesNotMatch(r.stdout, /test/)
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/xx/evidence/runs.jsonl'), 'utf8'), /fast|no-var|process\.exit/)
})

test('a hanging command, and a grandchild holding its output, time out inside the budget and count as a failure', () => {
  sensors({ fast: { test: `node -e "require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'inherit' }); setTimeout(() => {}, 20000)"` } })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 6\n')
  const started = Date.now()
  const r = check('--at', 'stop', '--budget-ms', '1500')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /timed out/)
  assert.ok(Date.now() - started < 10_000)
})

test('known-red commands warn instead of block, and the ratchet removes them once green', () => {
  sensors({ fast: { lint: 'node -e "process.exit(1)"' }, knownRed: ['fast.lint'] })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 7\n')
  const red = check('--at', 'stop')
  assert.equal(red.code, 0)
  assert.match(red.stdout, /warn: \d+ \(.*\blint 1/)
  sensors({ fast: { lint: 'node -e "process.exit(0)"' }, knownRed: ['fast.lint'] })
  check('--at', 'stop')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8')).knownRed, [])
})

test('an invalid sensors.json blocks with the parse error', () => {
  write(repo, '.rig/sensors.json', '{ "sensors": [{ "id": "Bad Id" }] }')
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 8\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[config\][\s\S]*id must be kebab-case/)
})

test('a human waiver for the active change drops the matching finding', () => {
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 9 // eslint-disable-line\n')
  assert.equal(check('--at', 'stop').code, 1)
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'xx', sensor: 'suppression', file: 'src/app.js', reason: 'generated file', by: 'p', at: 'now' }) + '\n')
  assert.equal(check('--at', 'stop').code, 0)
})

test('check-file reports a single file\'s cheap sensors as JSON', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'test/a.test.js', "it.only('x', () => {})\n")
  const r = JSON.parse(sdlc(repo, ['check-file', 'test/a.test.js', '--json']).stdout)
  assert.equal(r[0].sensor, 'test-tamper')
})

test('check-file accepts an absolute path to an untracked test file', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'test/a.test.js', "it.only('x', () => {})\n")
  const r = JSON.parse(sdlc(repo, ['check-file', path.join(repo, 'test/a.test.js'), '--json']).stdout)
  assert.equal(r[0].sensor, 'test-tamper')
})

test('an unknown --config-from ref blocks instead of falling back to defaults', () => {
  const r = check('--at', 'ci', '--base', 'main', '--config-from', 'no-such-ref')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[config\]/)
  assert.match(r.stdout, /does not exist/)
})

test('ci with a base-branch config never ratchets sensors.json or records runs', () => {
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  sensors({ fast: {}, full: { t: 'node -e "process.exit(0)"' }, knownRed: ['full.t'] })
  sdlc(repo, ['sync'])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'cfg')
  const file = path.join(repo, '.rig/sensors.json')
  const before = fs.readFileSync(file, 'utf8')
  const r = check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  assert.equal(r.code, 0, r.stdout + r.stderr)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/xx/evidence/runs.jsonl')), false)
})

test('a known-red command that times out still blocks', () => {
  sensors({ fast: { t: 'node -e "setTimeout(() => {}, 20000)"' }, knownRed: ['fast.t'] })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 11\n')
  assert.equal(check('--at', 'stop', '--budget-ms', '1000').code, 1)
})

test('a non-numeric --budget-ms is a usage error', () => {
  hook(repo, 'prompt-submit', {})
  const r = check('--at', 'stop', '--budget-ms', 'soon')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /budget-ms/)
})

test('approving impact without an impact.json fails', () => {
  sdlc(repo, ['new', 'ev', '--type', 'feature'])
  write(repo, '.rig/changes/ev/plan.md', '## Files\n- a\n')
  assert.notEqual(sdlc(repo, ['approve', 'ev', 'impact'], { env: { SDLC_HUMAN: '1' } }).code, 0)
})

test('check --at ship reports a weakened committed sensors.json as harness-tamper', () => {
  write(repo, '.rig/sensors.json', fromOld({ limits: { diffLines: 500 } }))
  gitIn(repo, 'add', '.rig/sensors.json')
  gitIn(repo, 'commit', '-qm', 'cfg')
  gitIn(repo, 'checkout', '-qb', 'feature')
  write(repo, '.rig/sensors.json', fromOld({ limits: { diffLines: 9000 } }))
  gitIn(repo, 'commit', '-qam', 'loosen')
  const r = check('--at', 'ship', '--base', 'main')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[harness-tamper\]/)
})

function featureRepo(): void {
  sensors({ full: { unit: 'node --test test/*.test.js' } })
  write(repo, 'src/add.js', 'export const add = (a, b) => a + b\n')
  write(repo, 'test/add.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('add', () => assert.equal(add(1, 2), 3))\n")
  write(repo, 'package.json', '{ "type": "module" }\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'feature')
  sdlc(repo, ['new', 'sub', '--type', 'feature'])
  approve('sub', '- B1 subtract')
}
// spec.md with these behaviours, a plan, and the person's approval.
function approve(slug: string, behaviours: string): void {
  write(repo, `.rig/changes/${slug}/spec.md`, `# Spec\n\n## Behaviours\n${behaviours}\n\n## Open questions\nnone\n`)
  write(repo, `.rig/changes/${slug}/plan.md`, '## Files\n- src/**\n- test/**\n## Verification\n- node --test test/*.test.js\n')
  sdlc(repo, ['approve', slug], { env: { SDLC_HUMAN: '1' } })
}

test('ship: new tests that fail on the base prove red; tests that already pass there do not', () => {
  featureRepo()
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  write(repo, 'test/sub.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { sub } from '../src/sub.js'\ntest('B1 subtracts', () => assert.equal(sub(3, 1), 2))\n")
  const ok = check('--at', 'ship', '--base', 'main', '--slug', 'sub')
  assert.equal(ok.code, 0, ok.stdout)
  fs.rmSync(path.join(repo, 'test/sub.test.js'))
  write(repo, 'test/add2.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('B1 add again', () => assert.equal(add(2, 2), 4))\n")
  const weak = check('--at', 'ship', '--base', 'main', '--slug', 'sub')
  assert.equal(weak.code, 1)
  assert.match(weak.stdout, /\[red-proof\][\s\S]*already pass on the base/)
})

test('ship: a refactor\'s characterization tests must pass on the base, not fail', () => {
  featureRepo()
  sdlc(repo, ['new', 'tidy', '--type', 'refactor'])
  approve('tidy', '- add keeps working')
  write(repo, 'test/add-char.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('add keeps working', () => assert.equal(add(2, 3), 5))\n")
  assert.equal(check('--at', 'ship', '--base', 'main', '--slug', 'tidy').code, 0)
  write(repo, 'test/add-char.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { add } from '../src/add.js'\ntest('add is now different', () => assert.equal(add(2, 3), 6))\n")
  write(repo, 'src/add.js', 'export const add = (a, b) => a + b + 1\n')
  assert.match(check('--at', 'ship', '--base', 'main', '--slug', 'tidy').stdout, /fail on the base: they do not describe the behaviour/)
})

test('ship: every behaviour needs a test that names it', () => {
  featureRepo()
  write(repo, '.rig/changes/sub/spec.md', '# Spec\n\n## Behaviours\n- B1 subtract, B2 negative\n')
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  write(repo, 'test/sub.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { sub } from '../src/sub.js'\ntest('B1 subtracts', () => assert.equal(sub(3, 1), 2))\n")
  const r = check('--at', 'ship', '--base', 'main', '--slug', 'sub')
  assert.match(r.stdout, /\[traceability\][\s\S]*B2 .*has no test that names it/)
})

test('sdlc run does not inherit NODE_TEST_CONTEXT: a failing node --test records a non-zero exit', () => {
  sdlc(repo, ['new', 'rn', '--type', 'chore'])
  write(repo, 'test/bad.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\ntest('bad', () => assert.equal(1, 2))\n")
  write(repo, 'package.json', '{ "type": "module" }\n')
  sdlc(repo, ['run', '--slug', 'rn', '--', 'node --test test/bad.test.js'], { env: { NODE_TEST_CONTEXT: 'child-v8' } })
  const rows = fs.readFileSync(path.join(repo, '.rig/changes/rn/evidence/runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as { exit: number })
  assert.notEqual(rows.at(-1)?.exit, 0)
})

test('ship: an old committed test naming B2 does not satisfy this change\'s B2', () => {
  write(repo, 'test/old.test.js', "// B2 from long ago\n")
  featureRepo()
  write(repo, '.rig/changes/sub/spec.md', '# Spec\n\n## Behaviours\n- B1 subtract\n- B2 negative numbers\n')
  write(repo, 'src/sub.js', 'export const sub = (a, b) => a - b\n')
  write(repo, 'test/sub.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport { sub } from '../src/sub.js'\ntest('test_B1_subtracts', () => assert.equal(sub(3, 1), 2))\n")
  assert.match(check('--at', 'ship', '--base', 'main', '--slug', 'sub').stdout, /B2 \(negative numbers\) has no test that names it/)
})

test('ship: a fixture added in the branch travels with the tests, so an already-passing test is not a false red', () => {
  featureRepo()
  write(repo, 'test/fixtures/data.json', '{ "n": 3 }\n')
  write(repo, 'test/data.test.js', "import { test } from 'node:test'\nimport assert from 'node:assert'\nimport fs from 'node:fs'\nimport { add } from '../src/add.js'\nconst d = JSON.parse(fs.readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'))\ntest('B1 uses data', () => assert.equal(add(d.n, 1), 4))\n")
  assert.match(check('--at', 'ship', '--base', 'main', '--slug', 'sub').stdout, /already pass on the base/)
})

test('vendor copies a standalone checker that runs without the plugin', () => {
  const v = sdlc(repo, ['vendor'])
  assert.equal(v.code, 0, v.stderr)
  assert.ok(fs.existsSync(path.join(repo, '.rig/bin/VERSION')))
  assert.ok(!fs.existsSync(path.join(repo, '.rig/bin/testkit.ts')))
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '.rig/bin/sdlc.ts', 'check', '--at', 'ship'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('the harness vendoring its own files does not trip the Stop gate', () => {
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  hook(repo, 'prompt-submit', {})
  sdlc(repo, ['vendor'])
  assert.equal(hook(repo, 'stop', {}).stdout, '')
})

test('CI judges a PR by the base branch config, so loosening limits does not help', () => {
  sensors({ limits: { diffLines: 500 } })
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'cfg')
  gitIn(repo, 'checkout', '-qb', 'pr')
  sensors({ limits: { diffLines: 5000 } })
  write(repo, 'src/huge.js', Array.from({ length: 700 }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'big')
  const r = check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[size\][\s\S]*limit 500/)
  assert.match(r.stdout, /\[harness-tamper\][\s\S]*diffLines raised 500 → 5000/)
})

test('CI re-runs the behavioral commands from the base config and blocks on a failing run', () => {
  sensors({ behavioral: { run: 'node -e "process.exit(3)"' } })
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'cfg')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, 'src/app.js', 'export const a = 2\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'change')
  const r = check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  assert.equal(r.code, 1, r.stdout)
  assert.match(r.stdout, /\[contracts\]/)
})

test('CI runs a behavioral command that is also a full command once, not twice', () => {
  const marker = path.join(os.tmpdir(), `rig-ci-once-${process.pid}-${Math.random().toString(36).slice(2)}.txt`)
  const bump = `node -e "require('fs').appendFileSync('${marker}','x')"`
  sensors({ full: { test: bump }, behavioral: { run: bump } })
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'cfg')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, 'src/app.js', 'export const a = 2\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'change')
  check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  assert.equal(fs.readFileSync(marker, 'utf8').length, 1)
})

test('CI lists a sprint chart approval the PR adds, for human review', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/product/sprints/sprint-3/approval.json', JSON.stringify({ by: 'Mallory', at: '2026-10-03T00:00:00Z', digest: 'x', files: [] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['approval chart-3 by Mallory'])
})

test('CI lists each chart waiver row the PR adds, for human review', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/product/sprints/sprint-3/waivers.json', JSON.stringify([{ finding: 2, text_sha: 'x', by: 'Mallory', at: '2026-10-03T00:00:00Z', reason: 'fine' }]))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['chart waiver chart-3 finding 2: "fine" by Mallory'])
})

test('CI lists a PRD approval the PR adds, for human review', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/product/sprints/sprint-3/prd-approval.json', JSON.stringify({ by: 'Mallory', at: '2026-10-03T00:00:00Z', files: [] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['prd approval prd-3 by Mallory'])
})

test('CI treats an autonomy.json a PR edits as a human row', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/autonomy.json', JSON.stringify({ rung: 2, since: 'x', deferred: [], history: [{ at: 'x', by: 'Mallory', from: 1, to: 2, why: 'w' }] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['autonomy by Mallory'])
})

test('CI lists the default autonomy.json when a PR adds it where base has none', () => {
  gitIn(repo, 'rm', '-q', '.rig/autonomy.json')
  gitIn(repo, 'commit', '-qm', 'main without it')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/autonomy.json', JSON.stringify({ rung: 1, since: 'x', deferred: [], history: [] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['autonomy by rig init'])
})

test('CI lists an autonomy.json a PR overwrites with the default, wiping the history', () => {
  write(repo, '.rig/autonomy.json', JSON.stringify({ rung: 0, since: 'x', deferred: [], history: [{ at: 'x', by: 'Alice', from: 1, to: 0, why: 'w' }] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'alice lowers it')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, '.rig/autonomy.json', JSON.stringify({ rung: 1, since: 'x', deferred: [], history: [] }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.deepEqual(json.humanRows, ['autonomy by rig init'])
})

test('I4: CI lists every waiver and approval row the PR adds, for human review', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason: 'trust me', by: 'Mallory', at: '2026-10-03T00:00:00Z' }) + '\n')
  write(repo, '.rig/changes/tiny/approval.json', JSON.stringify({ by: 'Mallory', at: '2026-10-03T00:00:00Z', hashes: {}, contracts: {} }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const summary = path.join(path.dirname(repo), `${path.basename(repo)}-summary.md`)
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { GITHUB_STEP_SUMMARY: summary } })
  for (const text of [r.stdout, fs.readFileSync(summary, 'utf8')]) {
    assert.match(text, /needs human review: 2 waiver\/approval row\(s\) added by this PR/)
    assert.match(text, /waiver tiny: red-proof \* "trust me" by Mallory/)
    assert.match(text, /approval tiny by Mallory/)
  }
  const json = JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main', '--json']).stdout)
  assert.equal(json.humanRows.length, 2)
})

test('I4: PR-controlled waiver fields cannot break out of the review listing', () => {
  gitIn(repo, 'checkout', '-qb', 'pr')
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  const reason = 'ok\n```\n::warning::all clean\n<b>x</b>\u2028more'
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason, by: 'M\r\n::error::x' }) + '\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const summary = path.join(path.dirname(repo), `${path.basename(repo)}-summary.md`)
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { GITHUB_STEP_SUMMARY: summary } })
  for (const text of [r.stdout, fs.readFileSync(summary, 'utf8')]) {
    const rows = text.split('\n').filter(l => l.includes('waiver tiny'))
    assert.equal(rows.length, 1, text)
    assert.doesNotMatch(rows[0] ?? '', /`|<|>|\u2028/)
    assert.ok(!text.split('\n').some(l => l.startsWith('::')), 'no line starts a workflow command')
    assert.equal((text.match(/```/g) ?? []).length % 2, 0, 'fences stay balanced')
  }
})

test('a big diff blocks in CI unless the person approved the change plan; then it only warns', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', fromOld({ limits: { diffLines: 50 } }))
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'big')
  sdlc(repo, ['new', 'big-change', '--type', 'refactor'])
  write(repo, '.rig/changes/big-change/spec.md', '# Spec\n\n## Behaviours\n- none\n')
  write(repo, '.rig/changes/big-change/plan.md', '# Plan\n\n## Files\n- src/**\n\n## Verification\n- `node -e 0`\n')
  write(repo, 'src/a.js', Array.from({ length: 80 }, (_, i) => `export const v${i} = ${i}`).join('\n') + '\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'work')
  const size = () => (JSON.parse(sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--json']).stdout) as { findings: { sensor: string; severity: string; file?: string }[] })
    .findings.filter(f => f.sensor === 'size' && !f.file).map(f => f.severity)
  assert.deepEqual(size(), ['block'])
  sdlc(repo, ['approve', 'big-change'], { env: { SDLC_HUMAN: '1' } })
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'approved')
  assert.deepEqual(size(), ['warn'])
})

test('CI waivers apply only to changes the PR adds, to any file of that change', () => {
  const waiver = (slug: string, file: string) => JSON.stringify({ slug, sensor: 'suppression', file, reason: 'ok', by: 'p', at: 'now' }) + '\n'
  const ci = () => check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  sdlc(repo, ['new', 'old-one', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', waiver('old-one', '*'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'old change with a wildcard waiver')
  gitIn(repo, 'checkout', '-qb', 'pr')
  fs.appendFileSync(path.join(repo, '.rig/changes/old-one/intent.md'), '\ntouched\n')
  write(repo, 'src/app.js', 'export const a = 9 // eslint-disable-line\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'touch the old change folder')
  const touched = ci()
  assert.equal(touched.code, 1, 'an older change\'s * waiver is not inherited by touching its folder\n' + touched.stdout)
  assert.match(touched.stdout, /suppression/)
  // A change the PR adds: its waiver applies to its findings in its plan's ## Files (or its own folder) only.
  sdlc(repo, ['new', 'fresh-one', '--type', 'chore'])
  write(repo, '.rig/changes/fresh-one/plan.md', '# Plan\n## Files\n- Modify: `src/app.js`\n') // a labelled bullet, as planFiles reads it
  write(repo, '.rig/waivers.jsonl', waiver('old-one', '*') + waiver('fresh-one', '*'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'add fresh change')
  const inPlan = ci()
  assert.doesNotMatch(inPlan.stdout, /\[suppression\]/, inPlan.stdout)
  write(repo, 'src/other.js', 'export const b = 1 // eslint-disable-line\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'file outside the plan')
  assert.match(ci().stdout, /\[suppression\][\s\S]*src\/other\.js/)
})

test('at CI a harness-tamper waiver in the PR never waives, exact file or *; other waivers on an added change still do', () => {
  const ci = () => check('--at', 'ci', '--base', 'main', '--config-from', 'main')
  const waiver = (sensor: string, file: string) => JSON.stringify({ slug: 'lvl', sensor, file, reason: 'r', by: 'p', at: 'now' }) + '\n'
  gitIn(repo, 'checkout', '-qb', 'pr')
  sdlc(repo, ['new', 'lvl', '--type', 'chore'])
  write(repo, '.rig/changes/lvl/plan.md', '## Files\n- src/**\n')
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'size', builtin: true, options: { diffLines: 9000 } }] })) // a weakening harness edit
  write(repo, 'src/app.js', 'export const a = 9 // eslint-disable-line\n')
  for (const file of ['*', '.rig/sensors.json']) {
    write(repo, '.rig/waivers.jsonl', waiver('harness-tamper', file))
    gitIn(repo, 'add', '-A')
    gitIn(repo, 'commit', '-qm', `waiver ${file}`)
    const r = ci()
    assert.equal(r.code, 1, r.stdout)
    assert.match(r.stdout, /\[harness-tamper\]/, file)
    assert.match(r.stdout, /declare it on the trunk first/)
    assert.doesNotMatch(r.stderr, /TypeError/)
  }
  write(repo, '.rig/waivers.jsonl', waiver('suppression', 'src/app.js'))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'suppression waiver')
  const r = ci()
  assert.doesNotMatch(r.stdout, /\[suppression\]/, r.stdout)
  assert.match(r.stdout, /\[harness-tamper\]/)
})

// A fake gh answers the reviews lookup; the event payload says who opened the PR and which commit is its head.
let prN = 0
// reviews may use the commit id 'HEAD', replaced by the real checked-out commit; a fake gh answers the lookup.
const prRun = (reviews: unknown[], head = 'HEAD') => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  gitIn(repo, 'checkout', '-q', 'main')
  gitIn(repo, 'checkout', '-qb', `pr${++prN}`)
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason: 'forged', by: 'dev', at: '2026-10-03T00:00:00Z' }) + '\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const real = (x: string): string => (x === 'HEAD' ? sha : x)
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho '${JSON.stringify([reviews.map(r => ({ ...(r as object), commit_id: real(String((r as { commit_id?: string }).commit_id)) }))])}'\n`, { mode: 0o755 })
  const ev = path.join(bin, 'event.json')
  fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, pull_request: { number: 5, user: { login: 'dev' }, head: { sha: real(head) } } }))
  return sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_PATH: ev } })
}
const posix = process.platform !== 'win32'

test('CI blocks added approval/waiver rows with no independent review of the head commit', { skip: !posix }, () => {
  const none = prRun([])
  assert.equal(none.code, 1, none.stdout)
  assert.match(none.stdout, /\[human-approval\][\s\S]*no approving review of [0-9a-f]{7} from someone other than dev/)
  const self = prRun([{ user: { login: 'dev' }, state: 'APPROVED', author_association: 'MEMBER', commit_id: 'HEAD' }])
  assert.match(self.stdout, /human-approval/, 'the author cannot approve their own rows')
})

test('CI rejects a stale approval, a later change-request, a drive-by reviewer, and a run outside GitHub', { skip: !posix }, () => {
  assert.match(prRun([{ user: { login: 'lead' }, state: 'APPROVED', commit_id: 'old0000' }]).stdout, /human-approval/)
  const flipped = prRun([{ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER', commit_id: 'HEAD' }, { user: { login: 'lead' }, state: 'CHANGES_REQUESTED', commit_id: 'HEAD' }])
  assert.match(flipped.stdout, /human-approval/)
  assert.match(prRun([{ user: { login: 'rando' }, state: 'APPROVED', author_association: 'NONE', commit_id: 'HEAD' }]).stdout, /human-approval/, 'a reviewer without write access does not count')
  const offline = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.match(offline.stdout, /cannot verify a reviewer outside a GitHub pull_request run/)
})

test('CI passes the human-approval gate when a different person approved the head commit', { skip: !posix }, () => {
  const r = prRun([{ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER', commit_id: 'HEAD' }])
  assert.doesNotMatch(r.stdout, /\[human-approval\]/, r.stdout)
  assert.match(r.stdout, /needs human review: 1 waiver\/approval row/)
})

test('the reviewer lookup happens before any PR test command runs', { skip: !posix }, () => {
  // A declared full command that plants a fake gh and rewrites the event file must not be able to fake an approval.
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  const planted = path.join(bin, 'planted')
  fs.mkdirSync(planted)
  fs.writeFileSync(path.join(bin, 'gh'), "#!/bin/sh\necho '[[]]'\n", { mode: 0o755 })
  gitIn(repo, 'checkout', '-q', 'main')
  write(repo, '.rig/sensors.json', fromOld({ full: { plant: `cp ${planted}/gh ${bin}/gh` } }))
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'config')
  gitIn(repo, 'checkout', '-qb', 'prx')
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason: 'forged', by: 'dev' }) + '\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const ev = path.join(bin, 'event.json')
  fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, pull_request: { number: 5, user: { login: 'dev' }, head: { sha } } }))
  fs.writeFileSync(path.join(planted, 'gh'), `#!/bin/sh\necho '[[{"user":{"login":"lead"},"state":"APPROVED","author_association":"MEMBER","commit_id":"${sha}"}]]'\n`, { mode: 0o755 })
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_PATH: ev } })
  assert.match(r.stdout, /human-approval/, r.stdout)
  assert.equal(r.code, 1)
})

test('CI rejects an approval when the event names a commit that is not the one checked out (stale re-run)', { skip: !posix }, () => {
  const r = prRun([{ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER', commit_id: 'oldsha1' }], 'oldsha1')
  assert.match(r.stdout, /not the checked-out commit/, r.stdout)
  assert.equal(r.code, 1)
})

// The lead override: the base config names the PR author a self-approver; a fake gh answers the reviews route with none and the run's jobs route with `jobs`.
const overrideRun = (jobs: { name: string; conclusion: string; head_sha?: string }[], selfApprovers = ['dev'], approvals: unknown[] = [{ state: 'approved', user: { login: 'Dev' }, environments: [{ name: 'rig-lead-override' }] }], editWorkflow = false) => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  gitIn(repo, 'checkout', '-q', 'main')
  write(repo, '.rig/sensors.json', JSON.stringify({ ...JSON.parse(fromOld({})), humanApproval: { selfApprovers } }) + '\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-q', '--allow-empty', '-m', `approvers ${++prN}`)
  gitIn(repo, 'checkout', '-qb', `pr${++prN}`)
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason: 'forged', by: 'dev', at: '2026-10-03T00:00:00Z' }) + '\n')
  if (editWorkflow) write(repo, '.github/workflows/rig-check.yml', 'name: rig-check\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const body = JSON.stringify([{ jobs: jobs.map(j => ({ head_sha: sha, ...j })) }])
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\ncase "$*" in *approvals*) echo '${JSON.stringify([approvals])}' ;; *actions/runs*) echo '${body}' ;; *) echo '[[]]' ;; esac\n`, { mode: 0o755 })
  const ev = path.join(bin, 'event.json')
  fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, pull_request: { number: 5, user: { login: 'dev' }, head: { sha } } }))
  return sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_PATH: ev, GITHUB_RUN_ID: '77' } })
}
const ok = (name: string) => ({ name, conclusion: 'success' })

test('the lead override passes when a named self-approver\'s run has ai-review and lead-override succeeded on the head commit', { skip: !posix }, () => {
  const r = overrideRun([ok('ai-review'), ok('lead-override')])
  assert.doesNotMatch(r.stdout, /\[human-approval\]/, r.stdout)
})

test('the lead override needs both jobs on the head commit, a recorded Environment approval, an unedited workflow, and an author named in the base config', { skip: !posix }, () => {
  assert.match(overrideRun([ok('ai-review')]).stdout, /needs the "lead-override" job to succeed/)
  assert.match(overrideRun([ok('lead-override')]).stdout, /needs the "ai-review" job to succeed/)
  assert.match(overrideRun([ok('ai-review'), { name: 'lead-override', conclusion: 'failure' }]).stdout, /human-approval/, 'a failed environment approval does not count')
  assert.match(overrideRun([ok('ai-review'), { ...ok('lead-override'), head_sha: 'old0000' }]).stdout, /human-approval/, 'a job on another commit does not count')
  assert.match(overrideRun([ok('ai-review'), ok('lead-override')], ['dev'], []).stdout, /no approval by a listed self-approver/, 'a job that ran with no recorded click (unprotected Environment) does not count')
  assert.match(overrideRun([ok('ai-review'), ok('lead-override')], ['dev'], [{ state: 'approved', user: { login: 'bot' }, environments: [{ name: 'rig-lead-override' }] }]).stdout, /no approval by a listed self-approver/)
  assert.match(overrideRun([ok('ai-review'), ok('lead-override')], ['dev'], [{ state: 'approved', user: { login: 'dev' }, environments: [{ name: 'other' }] }]).stdout, /no approval by a listed self-approver/)
  assert.match(overrideRun([ok('ai-review'), ok('lead-override')], ['dev'], undefined, true).stdout, /edits \.github\/workflows/, 'a PR that edits the workflow gets no override')
  const stranger = overrideRun([ok('ai-review'), ok('lead-override')], ['someone-else'])
  assert.match(stranger.stdout, /human-approval/, 'an author not in selfApprovers gets no override')
  assert.doesNotMatch(stranger.stdout, /lead override/)
})

test('a timed-out command at commit warns under its own id', () => {
  sensors({ fast: { test: `node -e "setTimeout(() => {}, 20000)"` } })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 8\n')
  gitIn(repo, 'add', 'src/app.js')
  const r = check('--at', 'commit', '--budget-ms', '1500', '--json')
  const out = JSON.parse(r.stdout) as { findings: { sensor: string; severity: string; outOfTime?: boolean }[] }
  // (This bare repo has no guides block, so sync blocks; only the command sensor's own finding matters here.)
  assert.ok(!out.findings.some(f => f.sensor === 'test' && f.severity === 'block'), JSON.stringify(out.findings))
  assert.ok(out.findings.some(f => f.sensor === 'test' && f.severity === 'warn' && f.outOfTime === true), JSON.stringify(out.findings))
})

test('waiving lint leaves unit blocking', () => {
  sensors({ fast: { lint: 'node -e "process.exit(1)"', unit: 'node -e "process.exit(1)"' } })
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  sdlc(repo, ['waive', 'lint', '*', 'style debt'], { env: { SDLC_HUMAN: '1' } })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 9\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[unit\]/)
  assert.doesNotMatch(r.stdout, /\[lint\]/)
})

test('an old commands waiver no longer silences a command sensor', () => {
  sensors({ fast: { unit: 'node -e "process.exit(1)"' } })
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  fs.appendFileSync(path.join(repo, '.rig/waivers.jsonl'), JSON.stringify({ slug: 'xx', sensor: 'commands', file: '*', reason: 'before per-sensor ids', by: 'someone', at: '2026-10-01T00:00:00Z' }) + '\n')
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 10\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[unit\]/)
})

// Risk tiers in CI (proposal 2026-10-27 B1, B2): the base config sets the knobs, the PR's diff and change record set the signals.
const riskRun = (o: { enforce?: boolean; reviews?: unknown[]; files?: Record<string, string>; baseFiles?: Record<string, string>; remove?: string[]; sensors?: object; history?: (sha: () => string) => void; aiReview?: string; searchFails?: boolean; sender?: string; fork?: boolean; queue?: { baseFiles?: Record<string, string> } } = {}) => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  gitIn(repo, 'checkout', '-q', 'main')
  o.history?.(() => spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim())
  write(repo, '.rig/sensors.json', JSON.stringify({ ...JSON.parse(fromOld({})), risk: { enforce: Boolean(o.enforce) }, ...o.sensors }) + '\n')
  for (const [f, t] of Object.entries(o.baseFiles ?? {})) write(repo, f, t)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-q', '--allow-empty', '-m', `risk base ${++prN}`)
  gitIn(repo, 'checkout', '-qb', `pr${++prN}`)
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  for (const [f, t] of Object.entries(o.files ?? {})) write(repo, f, t)
  for (const f of o.remove ?? []) fs.rmSync(path.join(repo, f), { force: true })
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr')
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
  const reviews = (o.reviews ?? []).map(r => ({ ...(r as object), commit_id: sha }))
  // the fake gh answers each route the check asks: revert-labelled PRs, the ai-review check run, the PR itself and its reviews
  const runs = [{ check_runs: [{ name: 'ai-review', conclusion: o.aiReview ?? 'success', head_sha: sha }] }]
  const pull = [{ number: 5, user: { login: 'dev' }, head: { sha, repo: { full_name: 'o/r' } } }]
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *search/issues*) ${o.searchFails ? 'exit 1' : `echo '[{"items":[]}]'`} ;;\n  *check-runs*) echo '${JSON.stringify(runs)}' ;;\n  *pulls/5/reviews*) echo '${JSON.stringify([reviews])}' ;;\n  *pulls/5*) echo '${JSON.stringify(pull)}' ;;\n  *) echo '${JSON.stringify([reviews])}' ;;\nesac\n`, { mode: 0o755 })
  const ev = path.join(bin, 'event.json')
  const sender = { login: o.sender ?? 'dev' }
  if (o.queue) {
    gitIn(repo, 'checkout', '-q', 'main')
    for (const [f, t] of Object.entries(o.queue.baseFiles ?? {})) write(repo, f, t)
    gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-q', '--allow-empty', '-m', `queue base ${++prN}`)
    gitIn(repo, 'checkout', '-q', '-'); gitIn(repo, 'merge', '-q', '--no-edit', 'main')
    fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, sender, merge_group: { head_ref: `refs/heads/gh-readonly-queue/main/pr-5-${sha}`, base_ref: 'refs/heads/main' } }))
    return sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_PATH: ev, GITHUB_EVENT_NAME: 'merge_group' } })
  }
  fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, sender, pull_request: { number: 5, user: { login: 'dev' }, head: { sha, repo: { full_name: o.fork ? 'someone/fork' : 'o/r' } } } }))
  return sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_PATH: ev } })
}
const ACCESS = '# Architecture\n\n## Access\n\n| Action | Allowed | Interfaces | Intent |\n|---|---|---|---|\n| refund an order | admin | api | tiny |\n'

test('CI reports the risk tier; a workflow edit is tier 2 with the two-reviewer suggestion, and no approval is required while risk.enforce is off', { skip: !posix }, () => {
  const r = riskRun({ files: { '.github/workflows/deploy.yml': 'name: deploy\n' } })
  assert.match(r.stdout, /risk: tier 2/)
  assert.match(r.stdout, /always-human path: \.github\/workflows\/deploy\.yml/)
  assert.match(r.stdout, /two reviewers, one a code owner, recommended/)
  assert.doesNotMatch(r.stdout, /human-approval/)
})

test('a PR that deletes the base Access row for its own change is still tier 2', { skip: !posix }, () => {
  const r = riskRun({ baseFiles: { '.rig/product/architecture.md': ACCESS }, files: { '.rig/product/architecture.md': '# Architecture\n' } })
  assert.match(r.stdout, /risk: tier 2/)
  assert.match(r.stdout, /access: tiny builds "refund an order"/)
})

test('with risk.enforce on the base, a PR needs an approval of its head commit from someone else, and the block names the tier', { skip: !posix }, () => {
  const none = riskRun({ enforce: true })
  assert.match(none.stdout, /\[human-approval\]\n\s*✗ risk\.enforce: this PR is tier 1 and needs a person[^\n]*→ someone other than the PR author approves the current head commit/)
  assert.notEqual(none.code, 0)
  const approved = riskRun({ enforce: true, reviews: [{ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER' }] })
  assert.doesNotMatch(approved.stdout, /human-approval/)
})

test('a merge queue run never re-checks the approval and waiver rows: they were checked on the PR', { skip: !posix }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-gh-'))
  gitIn(repo, 'checkout', '-q', 'main')
  write(repo, '.rig/sensors.json', JSON.stringify({ ...JSON.parse(fromOld({})), risk: { enforce: false } }) + '\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-q', '--allow-empty', '-m', `queue base ${++prN}`)
  gitIn(repo, 'checkout', '-qb', `pr${++prN}`)
  sdlc(repo, ['new', 'tiny', '--type', 'chore'])
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'tiny', sensor: 'red-proof', file: '*', reason: 'r', by: 'dev', at: '2026-10-03T00:00:00Z' }) + '\n')
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'pr')
  const ev = path.join(bin, 'event.json')
  fs.writeFileSync(ev, JSON.stringify({ repository: { full_name: 'o/r' }, merge_group: { base_ref: 'refs/heads/main', head_sha: 'x' } }))
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'], { env: { GITHUB_EVENT_PATH: ev, GITHUB_EVENT_NAME: 'merge_group' } })
  assert.doesNotMatch(r.stdout, /human-approval/)
  assert.match(r.stdout, /risk: tier/)
})

// A tier-0 PR: reviewed clean, two-way, small. Rung 3 and trusted authors come from the base.
const rung = (n: number) => ({ '.rig/autonomy.json': JSON.stringify({ rung: n, since: 'x', deferred: [], history: [] }) })
const tier0 = { '.rig/changes/tiny/review.md': 'verdict: pass\n## Findings\n' }
const trusted = { risk: { enforce: true }, humanApproval: { trusted: ['dev'] } }

test('at rung 3 a tier-0 PR by a trusted author passes with no person', { skip: !posix }, () => {
  const r = riskRun({ sensors: trusted, baseFiles: rung(3), files: tier0 })
  assert.match(r.stdout, /risk: tier 0/)
  assert.match(r.stdout, /tier 0: merges without a person \(rung 3, trusted author\)/)
  assert.doesNotMatch(r.stdout, /human-approval/)
})

test('the tier-0 path needs rung 3 on the base, a trusted author and a holding breaker, and names what is missing', { skip: !posix }, () => {
  const selfPromoted = riskRun({ sensors: trusted, baseFiles: rung(2), files: { ...tier0, ...rung(3) } })
  assert.match(selfPromoted.stdout, /\[human-approval\]/, 'editing autonomy.json is a human row: a PR never promotes itself')
  assert.doesNotMatch(selfPromoted.stdout, /merges without a person/)
  const atTwo = riskRun({ sensors: trusted, baseFiles: rung(2), files: tier0 })
  assert.match(atTwo.stdout, /\[human-approval\]\n\s*✗ risk\.enforce: this PR is tier 0 and needs a person: rung 2, not 3/)
  const untrusted = riskRun({ sensors: { risk: { enforce: true } }, baseFiles: rung(3), files: tier0 })
  assert.match(untrusted.stdout, /\[human-approval\][\s\S]*author not trusted/)
  const history = (sha: () => string) => {
    write(repo, '.rig/changes/old/pr.md', 'pr\n'); write(repo, '.rig/changes/old/pr-body.md', '## Risk\n\nTier 0: none of the signals\n')
    gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'ship old')
    gitIn(repo, 'revert', '--no-edit', sha())
  }
  const tripped = riskRun({ sensors: { ...trusted, risk: { enforce: true, window: 2 } }, baseFiles: rung(3), files: tier0, history })
  assert.match(tripped.stdout, /\[human-approval\][\s\S]*tier-0 merges reverted: 1 of 1 in the last 2/)
})

test('the unattended path fails closed: a fork, an untrusted pusher, an ai-review that did not pass, or an unreadable revert list each need a person', { skip: !posix }, () => {
  const base = { sensors: trusted, baseFiles: rung(3), files: tier0 }
  assert.match(riskRun({ ...base, fork: true }).stdout, /\[human-approval\][\s\S]*a fork PR never merges without a person/)
  assert.match(riskRun({ ...base, sender: 'mallory' }).stdout, /\[human-approval\][\s\S]*mallory \(who triggered this run\) is not trusted/)
  assert.match(riskRun({ ...base, aiReview: 'failure' }).stdout, /\[human-approval\][\s\S]*ai-review has not passed on/)
  assert.match(riskRun({ ...base, searchFails: true }).stdout, /\[human-approval\][\s\S]*could not list revert-labelled PRs/)
})

test('the merge queue re-checks the unattended path against the live base: lowering the rung stops a PR that was green', { skip: !posix }, () => {
  const queued = (o: object) => riskRun({ sensors: trusted, baseFiles: rung(3), files: tier0, ...o })
  assert.doesNotMatch(queued({ queue: {} }).stdout, /human-approval/, 'nothing changed: the tier-0 path still holds')
  const lowered = queued({ queue: { baseFiles: rung(0) } })
  assert.match(lowered.stdout, /\[human-approval\]\n\s*✗ merge queue: this PR needs a person: rung 0, not 3/)
  assert.doesNotMatch(queued({ queue: { baseFiles: rung(0) }, reviews: [{ user: { login: 'lead' }, state: 'APPROVED', author_association: 'MEMBER' }] }).stdout, /human-approval/, 'a person approved it on the PR')
})
