// The changed-line mutation score (three-gates C4): one report per tool, hand-written from each tool's documented output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseReport, mutscoreReport } from './mutscore.ts'
import * as mut from './mutscore.ts'

const TOOLS = ['stryker', 'stryker-net', 'pitest', 'cargo-mutants', 'mutmut', 'go-mutesting']

const m = (status: string, line: number, mutatorName = 'ArithmeticOperator') => ({ mutatorName, status, location: { start: { line, column: 1 }, end: { line, column: 5 } } })
const stryker = JSON.stringify({ schemaVersion: '2', files: { 'src/a.ts': { language: 'typescript', mutants: [m('Killed', 3), m('Survived', 4, 'EqualityOperator'), m('Timeout', 5), m('NoCoverage', 9, 'BlockStatement'), m('CompileError', 6)] }, 'src/b.ts': { mutants: [m('Killed', 1)] } } })
const pit = (rows: [string, string, string, number, string][]) => `<?xml version="1.0" encoding="UTF-8"?>\n<mutations>\n${rows.map(([d, s, cls, line, mut]) => `<mutation detected='${d}' status='${s}' numberOfTestsRun='2'><sourceFile>${cls.split('.').pop()}.java</sourceFile><mutatedClass>${cls}</mutatedClass><mutatedMethod>f</mutatedMethod><methodDescription>()I</methodDescription><lineNumber>${line}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.${mut}</mutator><indexes><index>1</index></indexes><blocks><block>0</block></blocks><killingTest/><description>x</description></mutation>`).join('\n')}\n</mutations>\n`
const pitXml = pit([['true', 'KILLED', 'com.acme.Foo', 10, 'MathMutator'], ['false', 'SURVIVED', 'com.acme.Foo', 11, 'NegateConditionalsMutator'], ['false', 'NO_COVERAGE', 'com.acme.Foo', 30, 'VoidMethodCallMutator'], ['true', 'TIMED_OUT', 'com.acme.Bar', 2, 'MathMutator']])
const cm = (name: string, line: number, summary: string) => ({ scenario: { Mutant: { name: `src/lib.rs:${line}:5: replace f -> i32 with 0`, file: 'src/lib.rs', function: { function_name: 'f' }, span: { start: { line, column: 5 }, end: { line, column: 9 } }, replacement: '0', genre: 'FnValue' } }, summary, log_path: 'log/x.log', diff_path: 'diff/x.diff' })
const cargo = JSON.stringify({ outcomes: [{ scenario: 'Baseline', summary: 'Success' }, cm('a', 3, 'CaughtMutant'), cm('b', 4, 'MissedMutant'), cm('c', 5, 'Timeout'), cm('d', 6, 'Unviable')], total_mutants: 4 })
const tc = (file: string, line: number, extra: string) => `<testcase classname="${file}" file="${file}" line="${line}" name="mutmut ${line}">${extra}</testcase>`
const mutmut = `<?xml version="1.0" ?><testsuites><testsuite name="mutmut" tests="3" errors="0" failures="1" skipped="0">${tc('app/a.py', 3, '')}${tc('app/a.py', 4, '<failure message="Survived mutant: a + b -> a - b"/>')}${tc('app/b.py', 8, '<failure message="Survived mutant"/>')}</testsuite></testsuites>`
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

const goDiff = (n: number, from: number, ctx: number, a: string, b: string) => `--- /work/pkg/a.go\n+++ /tmp/go-mutesting-1/pkg/a.go.${n}\n@@ -${from},5 +${from},5 @@\n${' \tctx\n'.repeat(ctx)}-${a}\n+${b}\n`
test('go-mutesting stdout (--debug): PASS is killed, FAIL a survivor; the line is the first changed line of the mutant\'s own diff, whether the diff comes before or after its verdict', () => {
  const after = `PASS "/tmp/go-mutesting-1/pkg/a.go.0" with checksum a\n${goDiff(0, 5, 0, '\treturn 1', '\treturn 0')}FAIL "/tmp/go-mutesting-1/pkg/a.go.1" with checksum b\n${goDiff(1, 9, 2, '\treturn a + b', '\treturn a - b')}The mutation score is 0.5 (1 passed, 1 failed, total is 2)\n`
  const before = `${goDiff(0, 5, 0, '\treturn 1', '\treturn 0')}PASS "/tmp/go-mutesting-1/pkg/a.go.0" with checksum a\n${goDiff(1, 9, 2, '\treturn a + b', '\treturn a - b')}FAIL "/tmp/go-mutesting-1/pkg/a.go.1" with checksum b\nThe mutation score is 0.5\n`
  const swapped = `${goDiff(1, 9, 2, '\treturn a + b', '\treturn a - b')}${goDiff(0, 5, 0, '\treturn 1', '\treturn 0')}PASS "/tmp/go-mutesting-1/pkg/a.go.0" with checksum a\nFAIL "/tmp/go-mutesting-1/pkg/a.go.1" with checksum b\n`
  for (const text of [after, before, swapped]) {
    assert.deepEqual(parseReport('go-mutesting', text).map(x => [x.file, x.line, x.killed]), [['pkg/a.go', 5, true], ['pkg/a.go', 11, false]], text)
    const r = mutscoreReport('go-mutesting', text, 'pkg/a.go:11-12', MIN)
    assert.equal(r.exit, 1)
    assert.match(r.text, /mutation: 0\/1 killed on changed lines/)
    assert.equal(mutscoreReport('go-mutesting', text, 'pkg/a.go:5-5', MIN).exit, 0)
  }
})

test('go-mutesting: a mutant with no diff has no line and is never counted; a changed file whose mutants are all line-less fails closed', () => {
  const noDiff = `PASS "/tmp/go-mutesting-1/pkg/a.go.0" with checksum a\nFAIL "/tmp/go-mutesting-1/pkg/a.go.1" with checksum b\n${goDiff(2, 20, 0, '\tx', '\ty')}PASS "/tmp/go-mutesting-1/pkg/a.go.2" with checksum c\nPASS "/tmp/go-mutesting-1/pkg/b.go.0" with checksum d\n`
  const some = mutscoreReport('go-mutesting', noDiff, 'pkg/a.go:1-100', MIN)
  assert.equal(some.exit, 0)
  assert.match(some.text, /mutation: 1\/1 killed on changed lines/)
  const all = mutscoreReport('go-mutesting', noDiff, 'pkg/b.go:1-100', MIN)
  assert.equal(all.exit, 1)
  assert.match(all.text, /pkg\/b\.go/)
  assert.match(all.text, /carries a line number/)
})

test('go-mutesting: output with no PASS/FAIL line (a build failure, a crash) fails closed even with a score line', () => {
  for (const text of ['go: cannot find package\n', 'The mutation score is 0.000000 (0 passed, 0 failed, total is 0)\n', 'panic: boom\n']) {
    const r = mutscoreReport('go-mutesting', text, 'pkg/a.go:1-9', MIN)
    assert.equal(r.exit, 1, text)
    assert.match(r.text, /^mutation: cannot read the report/)
  }
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

test('cargo-mutants: a baseline that is not Success, or a report with no mutant scenario, fails closed', () => {
  for (const bad of ['Failure', 'Timeout']) {
    const r = mutscoreReport('cargo-mutants', JSON.stringify({ outcomes: [{ scenario: 'Baseline', summary: bad }, cm('a', 3, 'CaughtMutant')] }), 'src/lib.rs:3-3', MIN)
    assert.equal(r.exit, 1, bad)
    assert.match(r.text, /^mutation: cannot read the report.*baseline/, bad)
  }
  const none = mutscoreReport('cargo-mutants', JSON.stringify({ outcomes: [{ scenario: 'Baseline', summary: 'Success' }] }), 'src/lib.rs:3-3', MIN)
  assert.equal(none.exit, 1)
  assert.match(none.text, /no mutant scenarios/)
})

const mm = (cases: string, suite = 'testsuite') => `<?xml version="1.0" ?><testsuites><${suite} name="mutmut" tests="1">${cases}</${suite}></testsuites>`
test('mutmut: an empty testsuite fails closed; an error element is a timeout (killed) only when it says so, a skipped one has no verdict', () => {
  assert.equal(mutscoreReport('mutmut', mm('', 'testsuite'), undefined, MIN).exit, 1)
  assert.equal(mutscoreReport('mutmut', '<testsuites><testsuite name="mutmut" tests="0"/></testsuites>', undefined, MIN).exit, 1)
  const xml = mm(`${tc('app/a.py', 3, '<error message="Timeout: mutant made the tests hang"/>')}${tc('app/a.py', 4, '<error message="boom"/>')}${tc('app/a.py', 5, '<skipped/>')}`)
  assert.deepEqual(parseReport('mutmut', xml).map(x => [x.line, x.killed]), [[3, true], [4, false]])
})

test('mutmut: the junit line= is taken as 1-based (one constant, MUTMUT_LINE_BASE), a missing line= is line 0 and dropped', () => {
  assert.equal(mut.MUTMUT_LINE_BASE, 1)
  const r = mutscoreReport('mutmut', mm(`<testcase classname="app/a.py" file="app/a.py" name="mutmut 1"><failure message="x"/></testcase>${tc('app/a.py', 7, '')}`), 'app/a.py:7-7', MIN)
  assert.equal(r.exit, 0)
  assert.match(r.text, /1\/1 killed/)
})

test('stryker: Ignored on a changed line counts as survived (a PR must not ignore its way to a score)', () => {
  const ig = JSON.stringify({ files: { 'src/a.ts': { mutants: [m('Killed', 1), m('Ignored', 2, 'StringLiteral')] } } })
  const r = mutscoreReport('stryker', ig, 'src/a.ts:1-2', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /^src\/a\.ts:2 StringLiteral$/m)
  assert.equal(mutscoreReport('stryker-net', ig, 'src/a.ts:1-1', MIN).exit, 0)
})

test('pitest: MEMORY_ERROR counts as detected', () => {
  const r = mutscoreReport('pitest', pit([['true', 'MEMORY_ERROR', 'com.acme.Foo', 10, 'MathMutator']]), 'src/main/java/com/acme/Foo.java:10-10', MIN)
  assert.equal(r.exit, 0)
  assert.match(r.text, /1\/1 killed/)
})

test('pragmas that disable mutation on an added line fail the score and are listed; a pragma outside the changed lines is not this change\'s', () => {
  const files: Record<string, string> = { 'src/a.ts': 'a\n// Stryker disable next-line all\nb\nc // Stryker disable-line\nd\n', 'x.py': 'x = 1  # pragma: no mutate\ny\n', 'lib.rs': '#[mutants::skip]\nfn f() {}\n', 'Q.java': 'ok\n' }
  const read = (f: string) => files[f]
  const hits = mut.pragmaHits('src/a.ts:1-4,x.py:1-2,lib.rs:1-2,Q.java:1-1', read)
  assert.deepEqual(hits.map(h => h.split(' ')[0]), ['src/a.ts:2', 'src/a.ts:4', 'x.py:1', 'lib.rs:1'])
  assert.deepEqual(mut.pragmaHits('src/a.ts:5-5,src/a.ts:3-3', read), [])
  const all = JSON.stringify({ files: { 'src/a.ts': { mutants: [m('Killed', 1)] } } })
  const r = mutscoreReport('stryker', all, 'src/a.ts:1-4', MIN, read)
  assert.equal(r.exit, 1)
  assert.match(r.text, /^src\/a\.ts:2 .*Stryker disable next-line/m)
  assert.match(r.text, /disable mutation/)
  assert.equal(mutscoreReport('stryker', all, 'src/a.ts:1-1', MIN, read).exit, 0)
})

test('several reports are merged; any missing or broken one fails closed', () => {
  const one = JSON.stringify({ files: { 'a/x.ts': { mutants: [m('Killed', 1)] } } }), two = JSON.stringify({ files: { 'b/y.ts': { mutants: [m('Survived', 1)] } } })
  const r = mutscoreReport('stryker', [one, two], 'a/x.ts:1-1,b/y.ts:1-1', MIN)
  assert.match(r.text, /1\/2 killed/)
  assert.equal(mutscoreReport('stryker', [one, 'nope'], undefined, MIN).exit, 1)
})

test('a mutant file matches a changed file exactly, else by its longest unique suffix; two equally good matches fail closed naming both', () => {
  const pitFoo = pit([['false', 'SURVIVED', 'com.acme.Foo', 10, 'MathMutator']])
  assert.equal(mutscoreReport('pitest', pitFoo, 'a/src/main/java/com/acme/Foo.java:10-10', MIN).exit, 1)
  const amb = mutscoreReport('pitest', pitFoo, 'a/src/main/java/com/acme/Foo.java:10-10,b/src/main/java/com/acme/Foo.java:10-10', MIN)
  assert.equal(amb.exit, 1)
  assert.match(amb.text, /ambiguous.*a\/src\/main\/java\/com\/acme\/Foo\.java.*b\/src\/main\/java\/com\/acme\/Foo\.java/)
  const exact = JSON.stringify({ files: { 'src/a.ts': { mutants: [m('Survived', 1)] } } })
  assert.match(mutscoreReport('stryker', exact, 'src/a.ts:1-1,lib/src/a.ts:1-1', MIN).text, /^src\/a\.ts:1 /m)
})

test('--lines that cannot be parsed (a comma in a file name) fails closed instead of guessing', () => {
  const r = mutscoreReport('stryker', stryker, 'src/a,b.ts:3-4', MIN)
  assert.equal(r.exit, 1)
  assert.match(r.text, /cannot read --lines.*comma/)
})

test('the command: --report "" is a missing report, --min overrides the registry, extra reports follow as positionals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-mut-'))
  fs.writeFileSync(path.join(dir, 'r.json'), stryker)
  fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({ files: { 'src/c.ts': { mutants: [m('Survived', 1)] } } }))
  const run = (...a: string[]) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(import.meta.dirname, 'sdlc.ts'), 'mutscore', ...a], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' })
  const blank = run('--tool', 'stryker', '--report', '', '--lines', 'src/a.ts:3-5')
  assert.equal(blank.status, 1)
  assert.match(blank.stdout + blank.stderr, /mutation: cannot read the report/)
  assert.doesNotMatch(blank.stdout + blank.stderr, /EISDIR/)
  assert.equal(run('--tool', 'stryker', '--report', 'r.json', '--lines', 'src/a.ts:3-5', '--min', '0.5').status, 0)
  assert.equal(run('--tool', 'stryker', '--report', 'r.json', '--lines', 'src/a.ts:3-5', '--min', '0.9').status, 1)
  assert.equal(run('--tool', 'stryker', '--report', 'r.json', '--min', 'lots').status, 1)
  const both = run('--tool', 'stryker', '--report', 'r.json', 's.json', '--lines', 'src/a.ts:3-3,src/c.ts:1-1')
  assert.match(both.stdout, /1\/2 killed/)
  assert.equal(run('--tool', 'stryker', '--report', 'r.json', 'gone.json').status, 1)
})

test('the minimum comes from the registry at RIG_BASE (a PR cannot lower it in its own tree); without RIG_BASE, from the working copy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-mut-'))
  const git = (...a: string[]) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.x'); git('config', 'user.name', 'T')
  fs.mkdirSync(path.join(dir, '.rig'))
  fs.writeFileSync(path.join(dir, '.rig', 'sensors.json'), JSON.stringify({ sensors: [], mutation: { minScore: 0.9 } }))
  fs.writeFileSync(path.join(dir, 'r.json'), stryker)
  git('add', '.'); git('commit', '-qm', 'base')
  fs.writeFileSync(path.join(dir, '.rig', 'sensors.json'), JSON.stringify({ sensors: [], mutation: { minScore: 0.1 } }))
  const run = (env: Record<string, string>) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(import.meta.dirname, 'sdlc.ts'), 'mutscore', '--tool', 'stryker', '--report', 'r.json', '--lines', 'src/a.ts:3-5'], { cwd: dir, env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env }, encoding: 'utf8' })
  const based = run({ RIG_BASE: 'main' })
  assert.equal(based.status, 1)
  assert.match(based.stdout, /min 0\.9\)/)
  const local = run({ RIG_BASE: '' })
  assert.equal(local.status, 0)
  assert.match(local.stdout, /min 0\.1\)/)
})
