// Frozen tests (C2): the test writer's hand-off is hashed; a later change to a frozen test blocks locally and in CI, however it was written.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, hook } from './testkit.ts'

type F = { sensor: string; severity: string; file?: string; message: string; fix?: string }
const FREEZE = '.rig/changes/demo/tests.freeze.jsonl'
const rows = (r: string) => fs.readFileSync(path.join(r, FREEZE), 'utf8').trim().split('\n').map(l => JSON.parse(l))
const tamper = (r: string, at: string, ...more: string[]) => (JSON.parse(sdlc(r, ['check', '--at', at, '--base', 'main', '--json', ...more]).stdout) as { findings: F[] }).findings.filter(f => f.sensor === 'test-tamper')

function frozenRepo(): string {
  const r = makeRepo()
  sdlc(r, ['init'])
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'base')
  gitIn(r, 'checkout', '-qb', 'work')
  sdlc(r, ['new', 'demo', '--type', 'feature'])
  write(r, 'tests/a.test.js', 'test one B1\n')
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'tests')
  return r
}

test('tests-freeze records the change\'s test files by hash, defaults the first why, and requires --why afterwards', () => {
  const r = frozenRepo()
  assert.equal(sdlc(r, ['tests-freeze', 'demo']).code, 0)
  const [row] = rows(r)
  assert.equal(row.why, 'hand-off')
  assert.equal(row.commit, gitIn(r, 'rev-parse', 'HEAD~1'))
  assert.deepEqual(row.files.map((f: { path: string }) => f.path), ['tests/a.test.js'])
  assert.match(row.files[0].sha256, /^[0-9a-f]{64}$/)
  const second = sdlc(r, ['tests-freeze', 'demo'])
  assert.notEqual(second.code, 0)
  assert.match(second.stdout + second.stderr, /--why/)
  assert.equal(rows(r).length, 1)
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  assert.equal(sdlc(r, ['tests-freeze', 'demo', '--why', 'B1 asserted the wrong value']).code, 0)
  const all = rows(r)
  assert.deepEqual([all.length, all[0].why, all[1].why], [2, 'hand-off', 'B1 asserted the wrong value'])
  assert.notEqual(all[0].files[0].sha256, all[1].files[0].sha256)
})

test('a frozen test changed by Write, by a plain fs write (Bash), or deleted blocks at stop, ship and ci; a new test does not', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  hook(r, 'prompt-submit', {})
  assert.deepEqual(tamper(r, 'ci'), [])
  write(r, 'tests/new.test.js', 'test two\n')
  assert.deepEqual(tamper(r, 'ci'), [])
  fs.writeFileSync(path.join(r, 'tests/a.test.js'), 'test one B1 loosened\n')
  for (const at of ['stop', 'ship', 'ci']) {
    const [f, ...rest] = tamper(r, at)
    assert.deepEqual([rest.length, f?.severity, f?.file, f?.message], [0, 'block', 'tests/a.test.js', 'frozen test changed after the test writer\'s hand-off'], at)
    assert.match(f?.fix ?? '', /relaunch the test writer.*tests-freeze demo --why/)
  }
  fs.rmSync(path.join(r, 'tests/a.test.js'))
  assert.equal(tamper(r, 'ci').length, 1)
})

test('a re-freeze with --why makes the new content the frozen one (the last row wins)', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  assert.equal(tamper(r, 'ci').length, 1)
  sdlc(r, ['tests-freeze', 'demo', '--why', 'wrong value'])
  assert.deepEqual(tamper(r, 'ci'), [])
})

test('a freeze file rewritten instead of appended blocks at ci and ship; an appended one passes', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  sdlc(r, ['tests-freeze', 'demo', '--why', 'wrong value'])
  assert.deepEqual(tamper(r, 'ci'), [])
  // rewrite: drop the first row and re-hash the loosened test as if it were the hand-off
  write(r, 'tests/a.test.js', 'test one B1 loosened\n')
  fs.writeFileSync(path.join(r, FREEZE), '')
  sdlc(r, ['tests-freeze', 'demo'])
  for (const at of ['ship', 'ci']) assert.deepEqual(tamper(r, at).map(f => [f.severity, f.message]), [['block', 'tests.freeze.jsonl was rewritten, not appended']], at)
})

const checkText = (r: string) => sdlc(r, ['check', '--at', 'ci', '--base', 'main']).stdout

test('fixtures, snapshots (binary included) and runner config in the diff are frozen with the tests; other files are not', () => {
  const r = makeRepo()
  sdlc(r, ['init'])
  write(r, '.rig/sensors.json', JSON.stringify({ sensors: [], paths: { fixtures: ['fixtures/**'], testSupport: ['support/**', 'jest.config.*'] } }))
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'base')
  gitIn(r, 'checkout', '-qb', 'work')
  sdlc(r, ['new', 'demo', '--type', 'feature'])
  write(r, 'tests/a.test.js', 'test one B1\n')
  write(r, 'fixtures/data.json', '{"a":1}\n')
  write(r, 'support/helper.js', 'export const h = 1\n')
  write(r, 'jest.config.js', 'module.exports = {}\n')
  write(r, 'package.json', '{"name":"x"}\n')
  write(r, '.testrc', '{}\n')
  write(r, 'app.config.json', '{}\n')
  fs.mkdirSync(path.join(r, 'tests/__snapshots__'), { recursive: true })
  fs.writeFileSync(path.join(r, 'tests/__snapshots__/a.snap'), Buffer.from([0, 1, 2, 255]))
  assert.equal(sdlc(r, ['tests-freeze', 'demo']).code, 0)
  assert.deepEqual(rows(r)[0].files.map((f: { path: string }) => f.path).sort(), ['.testrc', 'fixtures/data.json', 'jest.config.js', 'support/helper.js', 'tests/__snapshots__/a.snap', 'tests/a.test.js'])
  for (const f of ['fixtures/data.json', 'jest.config.js', 'tests/__snapshots__/a.snap']) {
    fs.appendFileSync(path.join(r, f), 'x')
    assert.deepEqual(tamper(r, 'ci').map(x => x.file), [f], f)
    gitIn(r, 'checkout', '--', f)
  }
  write(r, 'package.json', '{"name":"y"}\n')
  assert.deepEqual(tamper(r, 'ci'), [])
})

test('tests-freeze commits what it freezes, and refuses to freeze nothing when the spec has behaviours', () => {
  const r = frozenRepo()
  write(r, 'tests/b.test.js', 'test two B2\n')
  assert.equal(sdlc(r, ['tests-freeze', 'demo']).code, 0)
  assert.equal(gitIn(r, 'status', '--porcelain'), '')
  assert.match(gitIn(r, 'log', '--format=%s', '-3'), /test\(demo\): freeze tests from the test writer/)
  assert.equal(gitIn(r, 'show', `${rows(r)[0].commit}:tests/b.test.js`), 'test two B2')
  const e = makeRepo()
  sdlc(e, ['init'])
  gitIn(e, 'add', '.'); gitIn(e, 'commit', '-qm', 'base')
  gitIn(e, 'checkout', '-qb', 'work')
  sdlc(e, ['new', 'demo', '--type', 'feature'])
  write(e, '.rig/changes/demo/spec.md', '# Spec\n\n## Behaviours\n- B1 it works\n')
  const none = sdlc(e, ['tests-freeze', 'demo'])
  assert.notEqual(none.code, 0)
  assert.match(none.stdout + none.stderr, /no test files/)
})

test('code written before the test writer\'s hand-off blocks at ship and ci, unless the change is from-diff', () => {
  const r = frozenRepo()
  write(r, 'src/a.js', 'export const a = 1\n')
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'code first')
  sdlc(r, ['tests-freeze', 'demo'])
  for (const at of ['ship', 'ci']) assert.deepEqual(tamper(r, at).map(f => f.message), ['code was written before the test writer\'s hand-off: src/a.js'], at)
  assert.deepEqual(tamper(r, 'stop'), [])
  const intent = path.join(r, '.rig/changes/demo/intent.md')
  fs.writeFileSync(intent, fs.readFileSync(intent, 'utf8').replace('\n---\n# ', '\nfrom-diff: main\n---\n# '))
  assert.deepEqual(tamper(r, 'ci'), [])
})

test('a re-freeze cannot drop a frozen test: only --drop does, and the row, CI output and the PR record it', () => {
  const r = frozenRepo()
  write(r, 'tests/b.test.js', 'test two B2\n')
  sdlc(r, ['tests-freeze', 'demo'])
  fs.rmSync(path.join(r, 'tests/b.test.js'))
  const no = sdlc(r, ['tests-freeze', 'demo', '--why', 'b is obsolete'])
  assert.notEqual(no.code, 0)
  assert.match(no.stdout + no.stderr, /--drop tests\/b\.test\.js/)
  assert.equal(rows(r).length, 1)
  assert.equal(sdlc(r, ['tests-freeze', 'demo', '--why', 'b is obsolete', '--drop', 'tests/b.test.js']).code, 0)
  assert.deepEqual(rows(r)[1].dropped, ['tests/b.test.js'])
  assert.deepEqual(tamper(r, 'ci'), [])
  assert.match(checkText(r), /dropped tests\/b\.test\.js/)
  // a row written by hand that omits a frozen file, without dropping it
  write(r, 'tests/c.test.js', 'test three\n')
  sdlc(r, ['tests-freeze', 'demo', '--why', 'add c'])
  const hand = rows(r).map(x => JSON.stringify(x))
  const last = { ...rows(r).at(-1), files: rows(r).at(-1).files.filter((f: { path: string }) => f.path !== 'tests/a.test.js') }
  fs.writeFileSync(path.join(r, FREEZE), [...hand, JSON.stringify(last)].join('\n') + '\n')
  assert.ok(tamper(r, 'stop').some(f => /dropped|left the freeze/.test(f.message) && f.file === 'tests/a.test.js'))
})

test('CI output lists every re-freeze row with its why; a lone hand-off row is not listed', () => {
  const r = frozenRepo()
  sdlc(r, ['tests-freeze', 'demo'])
  assert.doesNotMatch(checkText(r), /re-frozen/)
  write(r, 'tests/a.test.js', 'test one B1 fixed\n')
  sdlc(r, ['tests-freeze', 'demo', '--why', 'B1 asserted the wrong value'])
  assert.match(checkText(r), /demo: re-frozen "B1 asserted the wrong value"/)
})

test('the formal checker named by intent-map.md ## Formal command is frozen even when it lives outside the test paths', () => {
  const r = frozenRepo()
  write(r, 'formal/check.mjs', 'console.log("{}")\n')
  gitIn(r, 'add', '.'); gitIn(r, 'commit', '-qm', 'checker')
  write(r, '.rig/changes/demo/intent-map.md', '# Map\n\n## Formal command\nnode formal/check.mjs\n\n## Not promised\n')
  sdlc(r, ['tests-freeze', 'demo'])
  assert.ok(rows(r)[0].files.some((f: { path: string }) => f.path === 'formal/check.mjs'))
  fs.appendFileSync(path.join(r, 'formal/check.mjs'), '// loosened\n')
  assert.deepEqual(tamper(r, 'stop').map(f => f.file), ['formal/check.mjs'])
})

test('the stack packs list the runner config as test support, so a pack-initialised repo freezes it', () => {
  const globs = (n: string) => (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../templates/stacks', n), 'utf8')) as { paths: { testSupport: string[] } }).paths.testSupport
  assert.ok(globs('node.json').includes('**/jest.config.*') && globs('python.json').includes('**/pytest.ini'))
})
