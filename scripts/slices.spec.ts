// Golden slices (harness readiness 1.4) and the generator tests that judge their output (1.6): a scaffolded feature must pass the repo's own
// checks, the layers it follows (1.1) and its own tests, and a cross-layer import in it must be rejected.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, gitIn } from './testkit.ts'
import { parseLayers, validateLayers, deriveLayering } from './arch.ts'
import { defaultRegistry } from './registry.ts'
import { layering } from './sensors.ts'
import { names, nameProblem } from './slice.ts'

const HUMAN = { SDLC_HUMAN: '1' }
const SLICES = path.resolve(import.meta.dirname, '../templates/slices')
const have = (cmd: string): boolean => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0
const STACKS = [
  { stack: 'node', feature: 'invoice', bad: "import { makeMemoryStore } from '../infra/memory-store.js'\n", domain: 'src/invoice/domain/invoice.js', test: (repo: string) => spawnSync('node', ['--test'], { cwd: repo, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: '' } }), ok: true },
  { stack: 'python', feature: 'invoice-line', bad: 'from invoice_line.infra.memory_store import MemoryStore\n', domain: 'src/invoice_line/domain/invoice_line.py', test: (repo: string) => spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests'], { cwd: repo, encoding: 'utf8' }), ok: have('python3') },
]

function repoFor(stack: string): string {
  const repo = makeRepo()
  sdlc(repo, ['init', '--stack', stack])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'rig')
  return repo
}
const read = (repo: string, rel: string): string => fs.readFileSync(path.join(repo, rel), 'utf8')

test('every slice is well formed: its layers validate, its stack is a pack, and it has files, rules and a test command', () => {
  for (const stack of fs.readdirSync(SLICES)) {
    const slice = JSON.parse(fs.readFileSync(path.join(SLICES, stack, 'slice.json'), 'utf8'))
    assert.equal(slice.stack, stack)
    assert.ok(fs.existsSync(path.resolve(import.meta.dirname, `../templates/stacks/${stack}.json`)), `${stack} is a pack`)
    const def = parseLayers(`\`\`\`rig-layers\n${slice.layers.join('\n')}\n\`\`\``).def
    assert.ok(def, stack)
    assert.deepEqual(validateLayers(def), [], `${stack} layers`)
    assert.ok(slice.test && slice.paths.length)
    assert.match(fs.readFileSync(path.join(SLICES, stack, 'RULES.md'), 'utf8'), /slice scaffold <name>/)
  }
})

test('names: kebab case in, three spellings out, and anything that could clash is refused', () => {
  assert.deepEqual(names('invoice-line'), { kebab: 'invoice-line', snake: 'invoice_line', pascal: 'InvoiceLine' })
  for (const bad of ['', 'ab', 'Invoice', '1abc', 'a--b', 'abc-', 'domain', 'app', 'tests', 'has space']) assert.match(nameProblem(bad) ?? '', /is not a usable feature name/, bad)
  assert.equal(nameProblem('invoice-line'), null)
})

for (const s of STACKS) {
  test(`${s.stack}: slice gen writes a path-scoped rule and proposes the layers, never enforcing them`, () => {
    const repo = repoFor(s.stack)
    const r = sdlc(repo, ['slice', 'gen'])
    assert.equal(r.code, 0, r.stderr)
    const rules = read(repo, '.claude/rules/rig-slice.md')
    assert.match(rules, /^---\npaths:\n  - "src\/\*\*"\n---\n<!-- rig:slice stack=/)
    assert.match(rules, /Start a new feature with `node \.rig\/bin\/sdlc\.ts slice scaffold <name>`/)
    assert.match(read(repo, '.rig/product/architecture.md'), /## Layers\n\n```rig-layers\nlayer domain src\/\*\/domain\/\*\*/)
    assert.match(sdlc(repo, ['sensors']).stdout, /layers: proposed, awaiting approval \(nothing enforced\)/)
    assert.equal(sdlc(repo, ['slice', 'gen']).code, 0, 'rerunning refreshes')
    assert.equal(read(repo, '.rig/product/architecture.md').match(/## Layers/g)?.length, 1, 'the layers are proposed once')
  })

  test(`${s.stack}: slice gen leaves a rules file or layers that are not rig's alone`, () => {
    const repo = repoFor(s.stack)
    fs.mkdirSync(path.join(repo, '.claude/rules'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.claude/rules/rig-slice.md'), '# my own rules\n')
    const r = sdlc(repo, ['slice', 'gen'])
    assert.equal(r.code, 1)
    assert.match(r.stderr, /was not written by rig: not overwriting/)
    assert.equal(read(repo, '.claude/rules/rig-slice.md'), '# my own rules\n')
    fs.rmSync(path.join(repo, '.claude/rules/rig-slice.md'))
    fs.mkdirSync(path.join(repo, '.rig/product'), { recursive: true })
    fs.writeFileSync(path.join(repo, '.rig/product/architecture.md'), '# Architecture\n\n## Layers\n\n```rig-layers\nlayer core src/core/**\nlayer edge src/edge/**\n```\n')
    assert.match(sdlc(repo, ['slice', 'gen']).stdout, /architecture\.md already declares layers: left as it is/)
    assert.doesNotMatch(read(repo, '.rig/product/architecture.md'), /layer domain/)
  })

  test(`${s.stack}: scaffold writes a feature, never overwrites, and refuses layers that contradict the repo's approved ones`, () => {
    const repo = repoFor(s.stack)
    const made = sdlc(repo, ['slice', 'scaffold', s.feature])
    assert.equal(made.code, 0, made.stderr)
    assert.ok(fs.existsSync(path.join(repo, s.domain)))
    assert.match(made.stdout, /Run the tests:/)
    const again = sdlc(repo, ['slice', 'scaffold', s.feature])
    assert.equal(again.code, 1)
    assert.match(again.stderr, /not overwriting: .* already exist/)
    assert.equal(sdlc(repo, ['slice', 'scaffold', 'Bad Name']).code, 1)
    const other = repoFor(s.stack)
    fs.mkdirSync(path.join(other, '.rig/product'), { recursive: true })
    fs.writeFileSync(path.join(other, '.rig/product/architecture.md'), '# Architecture\n\n## Layers\n\n```rig-layers\nlayer core src/core/**\nlayer edge src/edge/**\nallow edge -> core\n```\n')
    assert.equal(sdlc(other, ['arch', 'approve'], { env: HUMAN }).code, 0)
    const refused = sdlc(other, ['slice', 'scaffold', s.feature])
    assert.equal(refused.code, 1)
    assert.match(refused.stderr, /approved layers do not include the slice's/)
    assert.ok(!fs.existsSync(path.join(other, s.domain)), 'nothing was written')
  })

  // ---------- 1.6: the generator's output, judged by the repo's own checks ----------
  test(`${s.stack}: a scaffolded feature passes its own tests and conforms to the slice's layers, and a cross-layer import in it is caught`, { skip: !s.ok && 'toolchain not installed' }, () => {
    const repo = repoFor(s.stack)
    assert.equal(sdlc(repo, ['slice', 'scaffold', s.feature]).code, 0)
    const ran = s.test(repo)
    assert.equal(ran.status, 0, `${ran.stdout}${ran.stderr}`)
    // the layering sensor derived from the slice's own block: silent on every scaffolded source file, loud on a seeded violation
    const slice = JSON.parse(fs.readFileSync(path.join(SLICES, s.stack, 'slice.json'), 'utf8'))
    const def = parseLayers(`\`\`\`rig-layers\n${slice.layers.join('\n')}\n\`\`\``).def
    assert.ok(def)
    const reg = defaultRegistry()
    const lay = reg.sensors.find(x => x.id === 'layering')
    if (lay) lay.options = { layers: deriveLayering(def as NonNullable<typeof def>) }
    const walk = (d: string): string[] => fs.readdirSync(path.join(repo, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]))
    const diffs = walk('src').map(file => ({ file, status: 'A' as const, added: read(repo, file).split('\n').map((text, i) => ({ n: i + 1, text })), removed: [] }))
    assert.ok(diffs.length >= 4)
    assert.deepEqual(layering(diffs, reg), [], 'the exemplar follows its own layers')
    const seeded = diffs.map(d => (d.file === s.domain ? { ...d, added: [{ n: 1, text: s.bad.trim() }] } : d))
    const found = layering(seeded, reg)
    assert.equal(found.length, 1, 'the domain importing the infra layer is rejected')
    assert.equal(found[0]?.file, s.domain)
    assert.match(found[0]?.message ?? '', /must not import infra/)
  })

  test(`${s.stack}: end to end, once a person approves the proposed layers, an edit that crosses them blocks at Stop`, () => {
    const repo = repoFor(s.stack)
    assert.equal(sdlc(repo, ['slice', 'gen']).code, 0)
    const approved = sdlc(repo, ['arch', 'approve'], { env: HUMAN })
    assert.equal(approved.code, 0, approved.stderr)
    assert.equal(sdlc(repo, ['slice', 'scaffold', s.feature]).code, 0)
    gitIn(repo, 'add', '-A')
    gitIn(repo, 'commit', '-qm', 'scaffold')
    hook(repo, 'prompt-submit', {})
    fs.appendFileSync(path.join(repo, s.domain), `\n${s.bad}`)
    const stop = JSON.parse(hook(repo, 'stop', {}).stdout || '{}')
    assert.equal(stop.decision, 'block')
    assert.match(stop.reason, /layering[\s\S]*must not import infra/)
  })
}

test('a stack with no slice says so instead of failing in a confusing way', () => {
  const repo = repoFor('go')
  assert.match(sdlc(repo, ['slice', 'gen']).stdout, /no golden slice for the "go" stack/)
  assert.match(sdlc(repo, ['slice', 'status']).stdout, /stack: go[\s\S]*no golden slice/)
  assert.equal(sdlc(repo, ['slice', 'scaffold', 'invoice']).code, 1)
})
