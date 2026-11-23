import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPacks, parsePack, detectStacks, packRegistry, PACKS_DIR } from './stackpacks.ts'
import { adaptPack } from './stackadapt.ts'

const STACKS = ['node', 'angular', 'python', 'go', 'rust', 'java-maven', 'java-gradle', 'dotnet']

test('every shipped pack parses and is a valid registry', () => {
  const { packs, errors } = loadPacks(PACKS_DIR)
  assert.deepEqual(errors, [])
  assert.deepEqual(packs.map(p => p.stack).sort(), [...STACKS].sort())
  for (const p of packs) assert.equal(packRegistry(p).stack, p.stack)
})

test('every pack covers types, lint and unit, has a nightly mutation sensor, and adds test globs', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const ids = packRegistry(p).sensors.filter(s => !s.builtin).map(s => s.id)
    for (const need of ['types', 'lint', 'unit', 'mutation']) assert.ok(ids.includes(need), `${p.stack} lacks ${need}`)
    assert.equal(packRegistry(p).sensors.find(s => s.id === 'mutation')?.cadence, 'nightly', p.stack)
    assert.ok((p.paths.tests ?? []).length > 0, `${p.stack} has no test globs`)
  }
})

test('duplication counts source only: a pack that scans the repo root names its language, and python lint takes only Python files', () => {
  // rig_v1_test, 2026-11-23: three contract YAML files sharing a schema failed the chart commit, and ruff read an edited .yaml as Python.
  for (const p of loadPacks(PACKS_DIR).packs) {
    const dup = packRegistry(p).sensors.find(x => x.id === 'duplication')?.cmd ?? ''
    if (/jscpd@\S+ \. /.test(dup)) assert.match(dup, / --format [a-z]+ /, `${p.stack} counts docs and contract files as duplicated code`)
  }
  const py = fs.readFileSync(path.join(PACKS_DIR, 'python.json'), 'utf8')
  assert.equal(py.includes('{files}'), false, 'python lint is handed every edited file')
  assert.match(py, /ruff check [^"]*\{files:py,pyi\}/)
})

test('every pack has a blocking ci mutation-diff sensor that scopes to the change and scores it with sdlc mutscore', () => {
  const TOOL: Record<string, string> = { node: 'stryker', angular: 'stryker', python: 'mutmut', go: 'go-mutesting', rust: 'cargo-mutants', dotnet: 'stryker-net', 'java-maven': 'pitest', 'java-gradle': 'pitest' }
  for (const p of loadPacks(PACKS_DIR).packs) {
    const s = packRegistry(p).sensors.find(x => x.id === 'mutation-diff')
    assert.equal(s?.cadence, 'ci', p.stack)
    assert.equal(s?.blocks, true, p.stack)
    assert.equal(s?.timeoutMs, 600000, p.stack)
    assert.match(s?.cmd ?? '', /\{changed(-lines)?:[a-z,]+\}|--in-diff|--since|scmMutationCoverage/, `${p.stack} mutates only the change`)
    assert.match(s?.cmd ?? '', /"\$S" mutscore --tool \S+ --report /, `${p.stack} scores with sdlc mutscore`)
    assert.ok((s?.cmd ?? '').startsWith('S="${RIG_SDLC:-.rig/bin/sdlc.ts}"; [ -f "$S" ] || { echo \'mutation-diff: sdlc not found; re-run sdlc.ts vendor\'; exit 1; }; '), `${p.stack} finds sdlc first, or says to vendor`)
    assert.ok((s?.cmd ?? '').includes(`--tool ${TOOL[p.stack]} `), `${p.stack} reads the ${TOOL[p.stack]} report`)
    assert.match(s?.cmd ?? '', /not installed[\s\S]*or the person waives mutation-diff[\s\S]*exit 1/, `${p.stack} fails loudly without the tool`)
    assert.ok(packRegistry(p).sensors.some(x => x.id === 'mutation' && x.cadence === 'nightly'), `${p.stack} keeps the nightly whole-repo run`)
  }
  const cmd = (stack: string): string => packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === stack)!).sensors.find(x => x.id === 'mutation-diff')?.cmd ?? ''
  const guide = (stack: string): string => packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === stack)!).sensors.find(x => x.id === 'mutation-diff')?.guide ?? ''
  assert.match(cmd('go'), /go-mutesting --debug /)
  assert.match(cmd('python'), /mutmut<3/)
  assert.match(cmd('python'), /mutmut junitxml --untested-policy=failure --suspicious-policy=failure/)
  assert.match(cmd('java-maven'), /mvn -q test-compile org\.pitest:pitest-maven:mutationCoverage /)
  assert.match(cmd('java-maven'), /mutations\.xml/)
  assert.match(guide('java-maven'), /pitest-junit5-plugin/)
  assert.match(cmd('java-gradle'), /targetClasses/)
  assert.match(cmd('java-gradle'), /\{changed:java\}|\$\(echo [^)]*java/)
  assert.match(guide('java-gradle'), /outputFormats=\['XML'\]/)
  assert.match(guide('java-gradle'), /timestampedReports=false/)
  for (const stack of ['node', 'angular']) assert.match(packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === stack)!).sensors.find(x => x.id === 'mutation-diff')?.cmd ?? '', /\{changed-lines:[a-z,]+\}/, stack)
})

test('every pack has a blocking sast sensor: Semgrep on the change\'s own source, no metrics, failing in CI when Semgrep does not run', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const s = packRegistry(p).sensors.find(x => x.id === 'sast')
    assert.equal(s?.cadence, 'commit', p.stack)
    assert.equal(s?.blocks, true, p.stack)
    assert.match(s?.cmd ?? '', /semgrep scan --config p\/default --error --metrics=off [^;]*\{changed\}/, `${p.stack} scans only the changed source and sends no metrics`)
    assert.match(s?.cmd ?? '', /if semgrep --version[\s\S]*\$CI[\s\S]*exit 1/, `${p.stack} treats a broken Semgrep as missing and fails in CI`)
    assert.match(s?.cmd ?? '', /s=\$\?; \[ \$s -le 1 \] \|\| \[ -n \\?"\$CI\\?" \] && exit \$s;/, `${p.stack} blocks on findings, and on a scan error only in CI (offline locally is not a finding)`)
  }
  const ci = fs.readFileSync(path.join(PACKS_DIR, '..', 'rig-check.yml'), 'utf8')
  assert.ok(ci.indexOf('pipx install semgrep==') > 0 && ci.indexOf('pipx install semgrep==') < ci.indexOf('- name: sdlc check'), 'CI installs a pinned Semgrep before the sensors run')
})

test('a pack may not declare built-ins, must name its file and must have markers', () => {
  const ok = { stack: 'x', markers: ['x.toml'], paths: {}, contracts: { files: [], validate: '', run: '' }, sensors: [] }
  assert.deepEqual(parsePack(JSON.stringify(ok), 'x.json').errors, [])
  assert.match(parsePack(JSON.stringify({ ...ok, stack: 'y' }), 'x.json').errors.join(), /stack "y" does not match file x.json/)
  assert.match(parsePack(JSON.stringify({ ...ok, markers: [] }), 'x.json').errors.join(), /markers must be a non-empty list/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'secrets', builtin: true }] }), 'x.json').errors.join(), /packs declare no built-in sensors/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'lint' }] }), 'x.json').errors.join(), /x.json: sensors\[0\]/)
})

test('detects stacks from marker files and globs, and returns all matches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-stacks-'))
  const { packs } = loadPacks(PACKS_DIR)
  assert.deepEqual(detectStacks(root, packs), [])
  fs.writeFileSync(path.join(root, 'Shop.sln'), '')
  assert.deepEqual(detectStacks(root, packs), ['dotnet'])
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  fs.writeFileSync(path.join(root, 'angular.json'), '{}')
  assert.deepEqual(detectStacks(root, packs).sort(), ['angular', 'dotnet', 'node'])
})

test('a layers command that targets one test class passes when the class does not exist yet', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const cmd = packRegistry(p).sensors.find(s => s.id === 'layers')?.cmd ?? ''
    if (!/ArchitectureTest/.test(cmd)) continue
    assert.ok(/failIfNoSpecifiedTests=false|grep -rqs ArchitectureTest/.test(cmd), `${p.stack} layers fails in a repo without ArchitectureTest: ${cmd}`)
  }
})

test('the dotnet audit counts only vulnerable package rows, not its header', () => {
  const audit = packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === 'dotnet')!).sensors.find(s => s.id === 'audit')
  assert.match(audit?.cmd ?? '', /\| grep '\^ \*>' \|\| true$/)
})

import { packContracts } from './stackinit.ts'

test('Specmatic contract commands are blanked when java is missing, and init says why', () => {
  const c = { files: ['api/openapi.yaml'], covers: [], validate: 'npx -y specmatic@2.55.3 examples validate', run: 'npx -y specmatic@2.55.3 test' }
  assert.deepEqual(packContracts(c, true), { contracts: c, note: '' })
  const off = packContracts(c, false)
  assert.equal(off.contracts.validate, '')
  assert.equal(off.contracts.run, '')
  assert.deepEqual(off.contracts.files, ['api/openapi.yaml'], 'the files still freeze')
  assert.match(off.note, /java is not on PATH/)
  const own = { files: [], covers: [], validate: 'make contracts', run: '' }
  assert.deepEqual(packContracts(own, false), { contracts: own, note: '' }, 'a non-Specmatic command needs no java')
})

// shop_app 2026-10-27: the layers sensor exited 0 in silence with no .rig/gen config, and its committed evidence read as a pass.
test('a layers command guarded by a generated config says so when it enforces nothing', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const cmd = packRegistry(p).sensors.find(s => s.id === 'layers')?.cmd ?? ''
    if (!/^if \[ -f \.rig\/gen\//.test(cmd)) continue
    assert.match(cmd, /; else echo 'layers: not enforced here[^']*'; fi$/, `${p.stack} layers passes silently without its config: ${cmd}`)
  }
})

// pip-audit with no argument audits the machine's site-packages, not the project (shop_app 2026-10-27: unrelated local packages in the evidence).
test('the python audit names the project, never the whole environment', () => {
  const cmd = packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === 'python')!).sensors.find(s => s.id === 'audit')?.cmd ?? ''
  assert.match(cmd, /pip-audit -r requirements\.txt/)
  assert.match(cmd, /pip-audit \.;/)
  assert.doesNotMatch(cmd, /pip-audit(?! [-.])/, 'a bare pip-audit audits the environment')
  assert.match(cmd, /nothing to audit/)
})

test('every pack names the command that runs one holdout file, with the {file} placeholder', () => {
  for (const p of loadPacks(PACKS_DIR).packs) assert.match(packRegistry(p).holdout, /\{file\}/, p.stack)
  assert.equal(JSON.parse(fs.readFileSync(path.join(PACKS_DIR, 'node.json'), 'utf8')).holdout, 'node --test {file}')
  assert.equal(JSON.parse(fs.readFileSync(path.join(PACKS_DIR, 'python.json'), 'utf8')).holdout, "uv run pytest -q $(grep -qs '\\[tool\\.pytest' pyproject.toml && echo '-c pyproject.toml') {file}", 'the holdout file runs from a temp dir, so the project\'s pytest config (pythonpath) is named explicitly')
})

test('a holdout command without {file}, or not a string, is a registry error', () => {
  const pack = (holdout: unknown): string => JSON.stringify({ stack: 'x', markers: ['m'], sensors: [], holdout })
  assert.match(parsePack(pack('node --test'), 'x.json').errors.join(), /holdout/)
  assert.match(parsePack(pack(7), 'x.json').errors.join(), /holdout/)
  assert.deepEqual(parsePack(pack('node --test {file}'), 'x.json').errors, [])
})

test('compiled stacks run a holdout shell script with bash; node and angular run node --test', () => {
  const h = (n: string): string => JSON.parse(fs.readFileSync(path.join(PACKS_DIR, `${n}.json`), 'utf8')).holdout
  for (const n of ['go', 'rust', 'dotnet', 'java-maven', 'java-gradle']) assert.equal(h(n), 'bash {file}', n)
  assert.equal(h('angular'), 'node --test {file}')
})

test('a uv python project runs its tools through uv run, so they see the project\'s own dependencies; a plain one keeps the bare tools', () => {
  const py = loadPacks(PACKS_DIR).packs.find(p => p.stack === 'python')!
  const cmds = (toml: string): Record<string, string> & { unit: string; lint: string; types: string; mutation: string; 'mutation-diff': string; layers: string; audit: string } => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-uv-'))
    fs.writeFileSync(path.join(d, 'pyproject.toml'), toml)
    return Object.fromEntries((adaptPack(py, d).pack.sensors as { id: string; cmd: string }[]).map(s => [s.id, s.cmd])) as ReturnType<typeof cmds>
  }
  const uv = cmds('[project]\nname = "x"\n[tool.mypy]\nstrict = true\n[tool.uv]\npackage = false\n')
  assert.match(uv.lint, /^uv run ruff check /)
  assert.match(uv.types, /^uv run mypy /)
  assert.equal(uv.unit, 'uv run pytest -q')
  assert.match(uv['mutation-diff'], /uv run mutmut version[\s\S]*uv run mutmut run[\s\S]*uv run mutmut junitxml/)
  assert.equal(uv.mutation, 'uv run mutmut run')
  assert.match(uv.layers, /uv run lint-imports /)
  assert.match(uv.audit, /uv run pip-audit -r requirements\.txt[\s\S]*uv run pip-audit \./)
  // [dependency-groups] is PEP 735, not uv's: a brownfield repo on pdm or pip keeps its own commands.
  const plain = cmds('[project]\nname = "x"\n[tool.mypy]\nstrict = true\n[dependency-groups]\ndev = ["pytest"]\n')
  assert.equal(plain.unit, 'pytest -q')
  // mutmut 2.x has a `version` command and no --version option: the probe must not read an installed 2.5.1 as missing.
  assert.doesNotMatch(uv['mutation-diff'] + plain['mutation-diff'], /mutmut --version/)
  assert.match(plain.types, /^mypy /)
})
