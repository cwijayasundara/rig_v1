// Holdout cases (three-gates C3): acceptance tests the builder never sees decide whether a change passes.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { makeRepo, sdlc, hook, write, gitIn, approvedChange } from './testkit.ts'

let repo: string
const H = '.rig/product/sprints/sprint-1/holdout'
const SECRET = 's3cr3t-expected-value-42'
const PASS = "import test from 'node:test'\ntest('ok', () => {})\n"
const FAIL = `import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('wrong', () => assert.equal('${SECRET}', 'nope'))\n`
const intent = (slug: string): string => `---\nslug: ${slug}\ntype: feature\nsprint: 1\n---\n# ${slug}\n\n## Intent\n\n## Open questions\nnone\n`
beforeEach(() => {
  repo = makeRepo(); sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], holdout: 'node --test {file}' }))
  sdlc(repo, ['new', 'demo']); write(repo, '.rig/changes/demo/intent.md', intent('demo'))
})

test('runs each holdout file separately and prints only the counts and the failing case ids', () => {
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  write(repo, `${H}/TC-2.holdout.test.js`, FAIL)
  const r = sdlc(repo, ['holdout', 'demo'])
  assert.equal(r.code, 1)
  assert.equal(r.stdout.trim(), 'holdout: 1/2 passed\nfailing: TC-2')
  assert.equal(r.stderr, '')
  assert.ok(!(r.stdout + r.stderr).includes(SECRET), 'the runner output and the expected value never print')
})

test('all passing prints the count and exits 0; the python naming gives the same case id', () => {
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], holdout: 'node {file}' }))
  write(repo, `${H}/test_tc_7_holdout.js`, 'process.exit(3)\n')
  const r = sdlc(repo, ['holdout', 'demo'])
  assert.equal(r.stdout.trim(), 'holdout: 1/2 passed\nfailing: TC-7')
  fs.rmSync(path.join(repo, `${H}/test_tc_7_holdout.js`))
  write(repo, `${H}/TC-1.holdout.test.js`, 'process.exit(0)\n')
  const ok = sdlc(repo, ['holdout', 'demo'])
  assert.equal(ok.code, 0)
  assert.equal(ok.stdout.trim(), 'holdout: 1/1 passed')
})

test('a sprint with no holdout directory passes', () => {
  const r = sdlc(repo, ['holdout', 'demo'])
  assert.equal(r.code, 0)
  assert.equal(r.stdout.trim(), 'holdout: none for sprint 1')
})

test('files without a holdout command in sensors.json fail closed', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] }))
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  assert.equal(sdlc(repo, ['holdout', 'demo']).code, 1)
})

test('--ci judges the base copy of each file against the PR tree, so a PR cannot edit its way past a case', () => {
  const need = "import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\ntest('feature', () => assert.ok(fs.existsSync('feature.txt')))\n"
  write(repo, `${H}/TC-1.holdout.test.js`, need)
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'chart')
  gitIn(repo, 'checkout', '-qb', 'pr')
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  gitIn(repo, 'commit', '-qam', 'edit the case')
  assert.equal(sdlc(repo, ['holdout', 'demo']).code, 0, 'locally the edited file passes')
  const ci = sdlc(repo, ['holdout', '--ci', '--base', 'main'])
  assert.equal(ci.code, 1)
  assert.equal(ci.stdout.trim(), 'holdout: 0/1 passed\nfailing: TC-1')
  write(repo, 'feature.txt', 'x\n')
  const ok = sdlc(repo, ['holdout', '--ci', '--base', 'main'])
  assert.equal(ok.stdout.trim(), 'holdout: 1/1 passed')
  assert.equal(ok.code, 0)
})

function baseWith(files: Record<string, string>): void {
  for (const [n, c] of Object.entries(files)) write(repo, `${H}/${n}`, c)
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'chart'); gitIn(repo, 'checkout', '-qb', 'pr')
}

test('--ci ignores the PR: every base case runs, whatever slug or sprint the PR names', () => {
  baseWith({ 'TC-1.holdout.test.js': FAIL })
  write(repo, '.rig/changes/demo/intent.md', intent('demo').replace('sprint: 1', 'sprint: 9'))
  write(repo, '.rig/changes/demo/pr.md', 'x\n')
  gitIn(repo, 'add', '-f', '.rig/changes/demo'); gitIn(repo, 'commit', '-qm', 'point the PR at another sprint')
  for (const extra of [[], ['demo']]) {
    const r = sdlc(repo, ['holdout', ...extra, '--ci', '--base', 'main'])
    assert.equal(r.code, 1, extra.join())
    assert.equal(r.stdout.trim(), 'holdout: 0/1 passed\nfailing: TC-1')
  }
})

test('--ci without --base fails; an empty case file in the base is a failure, not a pass', () => {
  baseWith({ 'TC-1.holdout.test.js': '' })
  const none = sdlc(repo, ['holdout', '--ci'])
  assert.equal(none.code, 1)
  assert.match(none.stderr, /--base/)
  const r = sdlc(repo, ['holdout', '--ci', '--base', 'main'])
  assert.equal(r.code, 1)
  assert.equal(r.stdout.trim(), 'holdout: 0/1 passed\nfailing: TC-1')
  assert.equal(sdlc(repo, ['holdout', '--ci', '--base', 'nope']).code, 1, 'a base git cannot read fails, never passes')
})

test('--ci: a case that blanks the other base copies cannot change their verdict (fresh dir per file)', () => {
  const blank = "const fs = require('fs'), os = require('os'), path = require('path')\nconst walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else fs.writeFileSync(f, '') } }\nfor (const d of fs.readdirSync(os.tmpdir())) if (d.startsWith('rig-holdout-')) try { walk(path.join(os.tmpdir(), d)) } catch {}\n"
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], holdout: 'node {file}' }))
  baseWith({ 'TC-1.holdout.test.js': blank, 'TC-2.holdout.test.js': 'process.exit(3)\n' })
  const r = sdlc(repo, ['holdout', '--ci', '--base', 'main'])
  assert.equal(r.stdout.trim(), 'holdout: 1/2 passed\nfailing: TC-2')
})

test('a file changed between the write and the run fails its sha256 check', () => {
  const out = holdoutJs(`const r = H.runCases([{ rel: 'a/TC-1.holdout.js', data: Buffer.from('process.exit(0)\\n') }, { rel: 'a/TC-2.holdout.js', data: Buffer.from('process.exit(0)\\n') }], 'node {file}', f => { if (f.includes('TC-2')) fs.writeFileSync(f, '') }); return r`)
  assert.deepEqual(JSON.parse(out), { passed: 1, failing: ['TC-2'] })
})

test('cases run from a temp copy with the CI output variables stripped, in --ci and locally', () => {
  const spy = "const path = require('path')\nconst out = path.relative(process.cwd(), process.argv[1])\nif (!out.startsWith('..') || !path.basename(path.dirname(process.argv[1])).length || ['GITHUB_STEP_SUMMARY', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH'].some(k => process.env[k])) process.exit(1)\n"
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], holdout: 'node {file}' }))
  baseWith({ 'TC-1.holdout.test.js': spy })
  const env = { GITHUB_STEP_SUMMARY: '/x', GITHUB_OUTPUT: '/x', GITHUB_ENV: '/x', GITHUB_PATH: '/x' }
  assert.equal(sdlc(repo, ['holdout', '--ci', '--base', 'main'], { env }).code, 0)
  assert.equal(sdlc(repo, ['holdout', 'demo'], { env }).code, 0)
})

test('case ids: .sh names parse like the others', () => {
  assert.equal(holdoutJs(`return [H.caseId('TC-12.holdout.sh'), H.caseId('test_tc_3_holdout.py')]`), '["TC-12","TC-3"]')
})

test('hook: once the sprint chart is approved, read tools and Bash on holdout paths are denied; Write and the unapproved chart are allowed', () => {
  const denied = (tool: string, input: object) => { const o = hook(repo, 'holdout-guard', { tool_name: tool, tool_input: input }).stdout; return o ? JSON.parse(o).hookSpecificOutput : null }
  const abs = path.join(repo, `${H}/TC-1.holdout.test.js`)
  write(repo, '.rig/product/sprints/sprint-1/prd.md', `---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: thing\n\n## Open questions\nnone\n`)
  write(repo, '.rig/product/architecture.md', '# Arch\n')
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  assert.equal(denied('Read', { file_path: abs }), null, 'charting: the chart is not approved')
  assert.equal(denied('Bash', { command: `cat ${H}/x` }), null)
  chartJs(`C.writeChartApproval(1, 'Pat')`)
  for (const [tool, input] of [['Read', { file_path: abs }], ['Read', { file_path: `${H}/../holdout/./TC-1.holdout.test.js` }], ['Edit', { file_path: `${H}/TC-1.holdout.test.js` }], ['Grep', { pattern: 'x', path: path.join(repo, H) }], ['Grep', { pattern: 'x', path: '.rig' }], ['Grep', { pattern: 'holdout' }], ['Glob', { pattern: '**/holdout/**' }], ['Glob', { pattern: `${H}/*.js` }], ['Glob', { pattern: '**/*.js', path: path.join(repo, '.rig') }], ['Bash', { command: `cat ${H}/TC-1.holdout.test.js` }], ['Bash', { command: 'cat .rig/product/sprints/sprint-1/holdout' }], ['Bash', { command: `node .rig/bin/sdlc.ts holdout x $(cat ${H}/TC-1.holdout.test.js)` }], ['Bash', { command: 'node .rig/bin/sdlc.ts holdout demo | cat' }], ['Bash', { command: 'node .rig/bin/sdlc.ts holdout demo > /tmp/x' }]] as const) {
    const d = denied(tool, input)
    assert.equal(d?.permissionDecision, 'deny', `${tool} ${JSON.stringify(input)}`)
    assert.equal(d?.permissionDecisionReason, 'holdout cases are hidden from the builder; run /rig:test', tool)
  }
  assert.equal(denied('Write', { file_path: abs, content: 'x' }), null, 'a whole-file write leaks nothing')
  assert.equal(denied('Read', { file_path: path.join(repo, 'src/a.ts') }), null)
  assert.equal(denied('Grep', { pattern: 'x' }), null, 'a repo-root Grep is allowed')
  assert.equal(denied('Grep', { pattern: 'x', path: repo }), null)
  assert.equal(denied('Glob', { pattern: '**/*.ts' }), null, 'a repo-root Glob is allowed')
  assert.equal(denied('Bash', { command: 'node .rig/bin/sdlc.ts holdout demo' }), null)
  write(repo, `${H}/TC-1.holdout.test.js`, FAIL)
  assert.equal(denied('Read', { file_path: abs }), null, 'the edit made the chart stale: charting again')
})

test('verify runs the holdout after the checks: a failing case blocks, names the case and records counts', () => {
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  write(repo, `${H}/TC-2.holdout.test.js`, FAIL)
  approvedChange(repo, 'demo3'); write(repo, '.rig/changes/demo3/intent.md', intent('demo3'))
  const r = sdlc(repo, ['verify', 'demo3'])
  assert.equal(r.code, 1)
  const v = JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo3/verify.json'), 'utf8'))
  assert.deepEqual(v.holdout, { passed: 1, total: 2 })
  assert.equal(v.pass, false)
  assert.match(v.blocks.join('\n'), /holdout: 1\/2 passed; failing TC-2.*fix the code against the requirement/)
  assert.match(v.blocks.join('\n'), /not to look for the test/)
  assert.ok(!(r.stdout + r.stderr + JSON.stringify(v)).includes(SECRET))
  write(repo, `${H}/TC-2.holdout.test.js`, PASS)
  const again = sdlc(repo, ['verify', 'demo3'])
  assert.match(again.stdout, /holdout: 2\/2 passed/)
  assert.doesNotMatch(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo3/verify.json'), 'utf8')).blocks.join('\n'), /holdout/)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo3/verify.json'), 'utf8')).holdout, { passed: 2, total: 2 })
})

test('the chart approval covers the holdout files: editing one after approval makes it stale', () => {
  const P = '.rig/product'
  write(repo, `${P}/sprints/sprint-1/prd.md`, `---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: thing\n\n## Open questions\nnone\n`)
  write(repo, `${P}/architecture.md`, '# Arch\n')
  write(repo, `${H}/TC-1.holdout.test.js`, PASS)
  const run = (code: string): string => chartJs(code)
  assert.match(run(`C.writeChartApproval(1, 'Pat'); return C.chartFiles(1)`), /TC-1\.holdout\.test\.js/)
  assert.match(run('return C.chartState(1).state'), /approved/)
  write(repo, `${H}/TC-1.holdout.test.js`, FAIL)
  assert.match(run('return C.chartState(1)'), /stale[\s\S]*TC-1\.holdout\.test\.js/)
})

function chartJs(code: string): string {
  const lib = path.resolve(import.meta.dirname, 'chart.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as C from ${JSON.stringify(pathToFileURL(lib).href)}; const v = await (async () => { ${code} })(); console.log(JSON.stringify(v ?? null))`],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, NODE_TEST_CONTEXT: '' } })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

function holdoutJs(code: string): string {
  const lib = path.resolve(import.meta.dirname, 'holdout.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import fs from 'node:fs'; import * as H from ${JSON.stringify(pathToFileURL(lib).href)}; const v = await (async () => { ${code} })(); console.log(JSON.stringify(v ?? null))`],
    { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, NODE_TEST_CONTEXT: '' } })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

test('hook: a guard that throws denies (fails closed)', () => {
  fs.rmSync(path.join(repo, '.rig/product/sprints'), { recursive: true, force: true })
  write(repo, '.rig/product/sprints', 'a file where the sprints folder should be: listing it throws')
  const o = hook(repo, 'holdout-guard', { tool_name: 'Bash', tool_input: { command: 'cat x/holdout/y' } }).stdout
  assert.equal(JSON.parse(o).hookSpecificOutput.permissionDecision, 'deny')
})

test('approving a chart writes .rig/product/.ignore with the holdout line, and .gitignore is untouched', () => {
  write(repo, '.rig/product/sprints/sprint-1/prd.md', `---\nsprint: 1\nengineers: 1\n---\n# Sprint 1\n\n### FR-1: thing\n\n## Open questions\nnone\n`)
  write(repo, '.rig/product/architecture.md', '# Arch\n')
  const gi = fs.existsSync(path.join(repo, '.gitignore')) ? fs.readFileSync(path.join(repo, '.gitignore'), 'utf8') : null
  chartJs(`C.writeChartApproval(1, 'Pat')`)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/product/.ignore'), 'utf8'), 'sprints/*/holdout/\n')
  assert.equal(fs.existsSync(path.join(repo, '.gitignore')) ? fs.readFileSync(path.join(repo, '.gitignore'), 'utf8') : null, gi)
})
