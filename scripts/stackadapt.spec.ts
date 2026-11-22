// `init --stack` fits the pack to what the repo has: a sensor whose tool the repo does not use is left out (and said so), so no model has to
// hand-edit the protected sensors.json afterwards; a tool that is missing but would block CI is named in the output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write } from './testkit.ts'
import { parsePack } from './stackpacks.ts'

const registry = (repo: string): { sensors: { id: string; cmd?: string }[] } => JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
const ids = (repo: string): string[] => registry(repo).sensors.map(s => s.id)
const stack = (files: Record<string, string>): { repo: string; out: string } => {
  const repo = makeRepo()
  for (const [rel, text] of Object.entries(files)) write(repo, rel, text)
  const r = sdlc(repo, ['init', '--stack'])
  assert.equal(r.code, 0, r.stderr)
  return { repo, out: r.stdout }
}
const pkg = (extra: object = {}): string => JSON.stringify({ name: 'x', scripts: { test: 'node --test' }, ...extra })

test('node, plain JavaScript: no tsconfig drops the types sensor, and the guides block does not promise it', () => {
  const { repo, out } = stack({ 'package.json': pkg({ scripts: { test: 'node --test', lint: 'eslint .' }, devDependencies: { eslint: '9' } }) })
  assert.ok(!ids(repo).includes('types'))
  assert.match(out, /types sensor left out: no tsconfig\.json/)
  assert.doesNotMatch(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), /\[sensor:types\]/)
})

test('node, TypeScript with eslint: the pack is kept as shipped', () => {
  const { repo, out } = stack({ 'package.json': pkg({ devDependencies: { eslint: '9', typescript: '5' } }), 'tsconfig.json': '{}' })
  assert.ok(ids(repo).includes('types'))
  assert.match(registry(repo).sensors.find(s => s.id === 'lint')?.cmd ?? '', /eslint \{files\}/)
  assert.doesNotMatch(out, /left out|syntax/)
})

test('node without eslint but with a lint script runs the script, and says when it only syntax-checks', () => {
  const { repo, out } = stack({ 'package.json': pkg({ scripts: { test: 'node --test', lint: 'node --check src/index.js' } }) })
  assert.equal(registry(repo).sensors.find(s => s.id === 'lint')?.cmd, 'npm run lint --silent')
  assert.match(out, /lint runs npm run lint/)
  assert.match(out, /only a syntax check/)
})

test('node with neither eslint nor a lint script drops lint and says how to add it', () => {
  const { repo, out } = stack({ 'package.json': pkg() })
  assert.ok(!ids(repo).includes('lint'))
  assert.match(out, /lint sensor left out: eslint is not a dependency and package\.json has no lint script/)
})

test('node names the CI blocker when the mutation tool is not a dependency, and stays quiet when it is', () => {
  assert.match(stack({ 'package.json': pkg() }).out, /mutation-diff blocks CI until Stryker is installed/)
  assert.doesNotMatch(stack({ 'package.json': pkg({ devDependencies: { '@stryker-mutator/core': '8' } }) }).out, /mutation-diff blocks CI/)
})

test('python keeps types when mypy is configured or listed, drops it when the repo never mentions mypy', () => {
  const py = (pyproject: string): ReturnType<typeof stack> => stack({ 'pyproject.toml': pyproject })
  assert.ok(ids(py('[project]\nname = "x"\n[tool.mypy]\nstrict = true\n').repo).includes('types'))
  assert.ok(ids(stack({ 'pyproject.toml': '[project]\nname = "x"\n', 'requirements-dev.txt': 'mypy\n' }).repo).includes('types'))
  const bare = py('[project]\nname = "x"\n')
  assert.ok(!ids(bare.repo).includes('types'))
  assert.match(bare.out, /types sensor left out: no mypy config or dependency/)
  assert.match(bare.out, /mutation-diff blocks CI until mutmut 2\.x is installed/)
})

test('a pack\'s fit rules are checked when it loads: a note is required, and a drop or swap names its sensor', () => {
  const base = { stack: 'x', markers: ['x.json'], sensors: [] }
  const errors = (fit: unknown): string[] => parsePack(JSON.stringify({ ...base, fit }), 'x.json').errors
  assert.deepEqual(errors([{ sensor: 'types', unless: ['a'], drop: true, note: 'n' }]), [])
  assert.match(errors([{ sensor: 'types', drop: true }]).join(), /fit rule 0 needs a note/)
  assert.match(errors([{ drop: true, note: 'n' }]).join(), /fit rule 0/)
  assert.match(errors([{ note: 'n', unless: [{ in: 'package.json', match: 'x' }] }]).join(), /fit rule 0/)
  assert.match(errors('nope').join(), /fit must be a list/)
})
