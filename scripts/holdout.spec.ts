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
  const ci = sdlc(repo, ['holdout', 'demo', '--ci', '--base', 'main'])
  assert.equal(ci.code, 1)
  assert.equal(ci.stdout.trim(), 'holdout: 0/1 passed\nfailing: TC-1')
  write(repo, 'feature.txt', 'x\n')
  const ok = sdlc(repo, ['holdout', 'demo', '--ci', '--base', 'main'])
  assert.equal(ok.stdout.trim(), 'holdout: 1/1 passed')
  assert.equal(ok.code, 0)
})

test('--ci with no slug runs the sprints of the changes the PR carries', () => {
  write(repo, `${H}/TC-1.holdout.test.js`, FAIL)
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'chart')
  gitIn(repo, 'checkout', '-qb', 'pr')
  assert.equal(sdlc(repo, ['holdout', '--ci', '--base', 'main']).stdout.trim(), 'holdout: none for the changes in this diff')
  write(repo, '.rig/changes/demo/pr.md', 'x\n')
  gitIn(repo, 'add', '-f', '.rig/changes/demo'); gitIn(repo, 'commit', '-qm', 'change')
  const r = sdlc(repo, ['holdout', '--ci', '--base', 'main'])
  assert.equal(r.code, 1)
  assert.equal(r.stdout.trim(), 'holdout: 0/1 passed\nfailing: TC-1')
})

test('hook: build and test deny Read, Grep, Glob, Write and Bash on holdout paths with the fixed message; chart allows', () => {
  approvedChange(repo, 'demo2')
  write(repo, '.rig/changes/demo2/intent.md', intent('demo2'))
  const denied = (tool: string, input: object) => { const o = hook(repo, 'holdout-guard', { tool_name: tool, tool_input: input }).stdout; return o ? JSON.parse(o).hookSpecificOutput : null }
  const abs = path.join(repo, `${H}/TC-1.holdout.test.js`)
  for (const [tool, input] of [['Read', { file_path: abs }], ['Write', { file_path: abs, content: 'x' }], ['Edit', { file_path: `${H}/TC-1.holdout.test.js` }], ['Grep', { pattern: 'x', path: path.join(repo, H) }], ['Glob', { pattern: `${H}/*.js` }], ['Bash', { command: `cat ${H}/TC-1.holdout.test.js` }]] as const) {
    const d = denied(tool, input)
    assert.equal(d?.permissionDecision, 'deny', tool)
    assert.equal(d?.permissionDecisionReason, 'holdout cases are hidden from the builder; run /rig:test', tool)
  }
  assert.equal(denied('Read', { file_path: path.join(repo, 'src/a.ts') }), null)
  assert.equal(denied('Bash', { command: 'node .rig/bin/sdlc.ts holdout demo2' }), null)
  assert.equal(denied('Bash', { command: `node .rig/bin/sdlc.ts holdout demo2; cat ${H}/x` })?.permissionDecision, 'deny')
  fs.rmSync(path.join(repo, '.rig/state/active'))
  assert.equal(denied('Read', { file_path: abs }), null, 'no change in build: chart, testplan and review may read them')
  assert.equal(denied('Bash', { command: `cat ${H}/x` }), null)
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
