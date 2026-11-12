// The changed-line mutation score (three-gates C4): one report per tool, hand-written from each tool's documented output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseReport, mutscoreReport } from './mutscore.ts'

const TOOLS = ['stryker', 'stryker-net', 'pitest', 'cargo-mutants', 'mutmut', 'go-mutesting']

const m = (status: string, line: number, mutatorName = 'ArithmeticOperator') => ({ mutatorName, status, location: { start: { line, column: 1 }, end: { line, column: 5 } } })
const stryker = JSON.stringify({ schemaVersion: '2', files: { 'src/a.ts': { language: 'typescript', mutants: [m('Killed', 3), m('Survived', 4, 'EqualityOperator'), m('Timeout', 5), m('NoCoverage', 9, 'BlockStatement'), m('CompileError', 6)] }, 'src/b.ts': { mutants: [m('Killed', 1)] } } })
const pit = (rows: [string, string, string, number, string][]) => `<?xml version="1.0" encoding="UTF-8"?>\n<mutations>\n${rows.map(([d, s, cls, line, mut]) => `<mutation detected='${d}' status='${s}' numberOfTestsRun='2'><sourceFile>${cls.split('.').pop()}.java</sourceFile><mutatedClass>${cls}</mutatedClass><mutatedMethod>f</mutatedMethod><methodDescription>()I</methodDescription><lineNumber>${line}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.${mut}</mutator><indexes><index>1</index></indexes><blocks><block>0</block></blocks><killingTest/><description>x</description></mutation>`).join('\n')}\n</mutations>\n`
const pitXml = pit([['true', 'KILLED', 'com.acme.Foo', 10, 'MathMutator'], ['false', 'SURVIVED', 'com.acme.Foo', 11, 'NegateConditionalsMutator'], ['false', 'NO_COVERAGE', 'com.acme.Foo', 30, 'VoidMethodCallMutator'], ['true', 'TIMED_OUT', 'com.acme.Bar', 2, 'MathMutator']])
const cm = (name: string, line: number, summary: string) => ({ scenario: { Mutant: { name: `src/lib.rs:${line}:5: replace f -> i32 with 0`, file: 'src/lib.rs', function: { function_name: 'f' }, span: { start: { line, column: 5 }, end: { line, column: 9 } }, replacement: '0', genre: 'FnValue' } }, summary, log_path: 'log/x.log', diff_path: 'diff/x.diff' })
const cargo = JSON.stringify({ outcomes: [{ scenario: 'Baseline', summary: 'Success' }, cm('a', 3, 'CaughtMutant'), cm('b', 4, 'MissedMutant'), cm('c', 5, 'Timeout'), cm('d', 6, 'Unviable')], total_mutants: 4 })
const tc = (file: string, line: number, extra: string) => `<testcase classname="${file}" file="${file}" line="${line}" name="mutmut ${line}">${extra}</testcase>`
const mutmut = `<?xml version="1.0" ?><testsuites><testsuite name="mutmut" tests="3" errors="0" failures="1" skipped="0">${tc('app/a.py', 3, '')}${tc('app/a.py', 4, '<failure message="Survived mutant: a + b -> a - b"/>')}${tc('app/b.py', 8, '<failure message="Survived mutant"/>')}</testsuite></testsuites>`
const go = `PASS "/tmp/go-mutesting-1/pkg/a.go.0" with checksum aaa\nFAIL "/tmp/go-mutesting-1/pkg/a.go.1" with checksum bbb\n--- /work/pkg/a.go\n+++ /tmp/go-mutesting-1/pkg/a.go.1\n@@ -9,5 +9,5 @@\n func f(a, b int) int {\n \tx := 1\n-\treturn a + b\n+\treturn a - b\n }\nPASS "/tmp/go-mutesting-1/pkg/a.go.2" with checksum ccc\n--- /work/pkg/a.go\n+++ /tmp/go-mutesting-1/pkg/a.go.2\n@@ -20,3 +20,3 @@\n-\tif a > 0 {\n+\tif a >= 0 {\nThe mutation score is 0.666667 (2 passed, 1 failed, 0 duplicated, 0 skipped, total is 3)\n`
const MIN = 0.8

test('stryker: killed = Killed/Timeout, survived = Survived/NoCoverage, CompileError ignored, all files without --lines', () => {
  const r = mutscoreReport('stryker', stryker, undefined, MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /mutation: 3\/5 killed on changed lines \(score 0\.60, min 0\.8\)/)
  assert.match(r.text, /src\/a\.ts:4 EqualityOperator/)
  assert.match(r.text, /src\/a\.ts:9 BlockStatement/)
})

test('the same report format serves the .NET tool', () => assert.equal(mutscoreReport('stryker-net', stryker, undefined, 0.5).exit, 0))

test('only mutants on changed lines count; a lines argument names file:from-to ranges', () => {
  const pass = mutscoreReport('stryker', stryker, 'src/a.ts:3-3,src/a.ts:5-5,src/b.ts:1-1', MIN)
  assert.equal(pass.exit, 0)
  assert.match(pass.text, /mutation: 3\/3 killed on changed lines \(score 1\.00, min 0\.8\)/)
  const fail = mutscoreReport('stryker', stryker, 'src/a.ts:3-4', MIN)
  assert.equal(fail.exit, 1)
  assert.match(fail.text, /mutation: 1\/2 killed/)
  assert.match(fail.text, /^src\/a\.ts:4 EqualityOperator$/m)
  assert.doesNotMatch(fail.text, /a\.ts:9/)
})

test('the threshold decides: a score at the minimum passes, below it fails, survivors still print on a pass', () => {
  assert.equal(mutscoreReport('stryker', stryker, 'src/a.ts:3-5', 0.66).exit, 0)
  assert.equal(mutscoreReport('stryker', stryker, 'src/a.ts:3-5', 0.67).exit, 1)
  const ok = mutscoreReport('stryker', stryker, 'src/a.ts:3-5', 0.5)
  assert.match(ok.text, /src\/a\.ts:4 EqualityOperator/)
})

test('no mutants on changed lines passes', () => {
  const r = mutscoreReport('stryker', stryker, 'src/a.ts:100-120', MIN)
  assert.deepEqual(r, { exit: 0, text: 'mutation: no mutants on changed lines' })
  assert.equal(mutscoreReport('stryker', JSON.stringify({ files: {} }), undefined, MIN).exit, 0)
})

test('pitest: detected/status, file from the package and source file, matched to the changed path by suffix', () => {
  const ms = parseReport('pitest', pitXml)
  assert.deepEqual(ms.map(x => [x.file, x.line, x.killed]), [['com/acme/Foo.java', 10, true], ['com/acme/Foo.java', 11, false], ['com/acme/Foo.java', 30, false], ['com/acme/Bar.java', 2, true]])
  const r = mutscoreReport('pitest', pitXml, 'src/main/java/com/acme/Foo.java:10-11', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /mutation: 1\/2 killed on changed lines \(score 0\.50, min 0\.8\)/)
  assert.match(r.text, /^src\/main\/java\/com\/acme\/Foo\.java:11 NegateConditionalsMutator$/m)
  assert.equal(mutscoreReport('pitest', pit([]), undefined, MIN).text, 'mutation: no mutants on changed lines')
})

test('cargo-mutants outcomes.json: CaughtMutant/Timeout killed, MissedMutant survived, Unviable and the baseline ignored', () => {
  const r = mutscoreReport('cargo-mutants', cargo, 'src/lib.rs:3-5', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /mutation: 2\/3 killed on changed lines \(score 0\.67, min 0\.8\)/)
  assert.match(r.text, /^src\/lib\.rs:4 FnValue$/m)
  assert.equal(mutscoreReport('cargo-mutants', cargo, 'src/lib.rs:3-3,src/lib.rs:5-5', MIN).exit, 0)
})

test('mutmut junit xml (`mutmut junitxml`): a failure element is a survivor', () => {
  const r = mutscoreReport('mutmut', mutmut, 'app/a.py:1-10', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /mutation: 1\/2 killed on changed lines/)
  assert.match(r.text, /^app\/a\.py:4 /m)
  assert.equal(mutscoreReport('mutmut', mutmut, 'app/a.py:3-3', MIN).exit, 0)
})

test('go-mutesting stdout: PASS is killed, FAIL is a survivor; the line comes from the diff hunk, a mutant without one counts for a changed file', () => {
  const ms = parseReport('go-mutesting', go)
  assert.deepEqual(ms.map(x => [x.file, x.line, x.killed]), [['pkg/a.go', 0, true], ['pkg/a.go', 11, false], ['pkg/a.go', 20, true]])
  const r = mutscoreReport('go-mutesting', go, 'pkg/a.go:11-12', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /mutation: 1\/2 killed on changed lines/)
  assert.match(r.text, /^pkg\/a\.go:11 /m)
  assert.equal(mutscoreReport('go-mutesting', go, 'pkg/a.go:20-20', MIN).exit, 0)
})

test('a missing, empty or unparseable report fails closed, and so does an unknown tool', () => {
  for (const t of TOOLS) {
    const r = mutscoreReport(t, 'not a report', undefined, MIN)
    assert.equal(r.exit, 1, t)
    assert.match(r.text, /^mutation: cannot read the report/, t)
    assert.equal(mutscoreReport(t, '', undefined, MIN).exit, 1, t)
  }
  assert.equal(mutscoreReport('nope', stryker, undefined, MIN).exit, 1)
  assert.equal(mutscoreReport('stryker', '{"files":', undefined, MIN).exit, 1)
})

test('the command reads the report file and the registry minScore, and exits 1 on a missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-mut-'))
  fs.mkdirSync(path.join(dir, '.rig'))
  fs.writeFileSync(path.join(dir, 'r.json'), stryker)
  const run = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(import.meta.dirname, 'sdlc.ts'), 'mutscore', ...a], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' })
  const strict = run('--tool', 'stryker', '--report', 'r.json', '--lines', 'src/a.ts:3-5')
  assert.equal(strict.status, 1, strict.stderr)
  assert.match(strict.stdout, /score 0\.67, min 0\.8\)/)
  fs.writeFileSync(path.join(dir, '.rig', 'sensors.json'), JSON.stringify({ sensors: [], mutation: { minScore: 0.5 } }))
  assert.equal(run('--tool', 'stryker', '--report', 'r.json', '--lines', 'src/a.ts:3-5').status, 0)
  const gone = run('--tool', 'stryker', '--report', 'missing.json')
  assert.equal(gone.status, 1)
  assert.match(gone.stdout + gone.stderr, /mutation: cannot read the report/)
  assert.equal(run('--report', 'r.json').status, 1)
})
